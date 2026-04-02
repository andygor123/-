import { expect, test } from '@playwright/test'

const TEST_BUILDING_CODE = 'SZHOME'

test.beforeEach(async ({ request }) => {
  const response = await request.post('http://127.0.0.1:8787/api/test/reset')
  expect(response.ok()).toBeTruthy()
})

async function loginSeedResident(
  page: import('@playwright/test').Page,
  roomFragment: string,
  wechatHandle: string,
  pin: string,
  deviceIdentityKey: string,
) {
  await page.addInitScript((key) => {
    window.localStorage.setItem('building-board-device-key', key)
  }, deviceIdentityKey)
  await page.goto('/')
  const autoLoggedIn = await page
    .locator('.lane-switcher')
    .waitFor({ state: 'visible', timeout: 2500 })
    .then(() => true)
    .catch(() => false)

  if (!autoLoggedIn) {
    await page.getByPlaceholder('例如：NS1C').fill(TEST_BUILDING_CODE)
    await page.getByRole('button', { name: '进入本楼' }).click()
    await expect(page.getByRole('heading', { name: '进入科技生态园1C栋' })).toBeVisible()
    await page.getByLabel('房号后缀').fill(roomFragment)
    await page.getByLabel('微信号').fill(wechatHandle)
    await page.getByLabel('6 位 PIN').fill(pin)
    await page.getByRole('button', { name: '登录' }).click()
  }
  await expect(page.locator('.lane-switcher')).toBeVisible()
}

async function openExchangeLane(page: import('@playwright/test').Page) {
  await page.locator('.lane-switcher').getByRole('button', { name: '换物' }).click()
  await expect(page.locator('.tabbar')).toBeVisible()
  await page.locator('.tabbar').getByRole('button', { name: '闲置' }).click()
}

async function openAskLane(page: import('@playwright/test').Page) {
  await page.locator('.lane-switcher').getByRole('button', { name: '问问' }).click()
  await expect(page.locator('.ask-home-list, .ask-empty-state')).toBeVisible()
}

test('mobile resident can enter, create available post, then see it in list', async ({ page }) => {
  await page.goto('/')

  await page.getByPlaceholder('例如：NS1C').fill(TEST_BUILDING_CODE)
  await page.getByRole('button', { name: '进入本楼' }).click()
  await expect(page.getByLabel('昵称')).toBeVisible()

  await page.getByLabel('昵称').fill('阿May')
  await page.getByLabel('房号后缀').fill('1609')
  await page.getByLabel('微信号').fill('may12a')
  await page.getByLabel('设置 6 位 PIN').fill('160912')
  await page.getByLabel('确认 PIN').fill('160912')
  await page.getByRole('button', { name: '创建身份并进入' }).click()

  await expect(page.getByText('科技生态园1C栋')).toBeVisible()
  await page.getByRole('button', { name: '发布' }).click()
  await page.locator('.composer-picker-grid').getByRole('button', { name: /发布闲置/ }).click()

  await page.getByPlaceholder('例如：九成新办公椅').fill('测试折叠椅')
  await page.locator('select').selectOption('家具')
  await page.getByLabel('上传图片').setInputFiles({
    name: 'chair.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnR6wAAAABJRU5ErkJggg==',
      'base64',
    ),
  })
  await page.getByRole('button', { name: '发布闲置' }).last().click()

  await expect(page.getByText('测试折叠椅')).toBeVisible()
})

test('owner can claim one interested resident and move item to history', async ({ page }) => {
  await loginSeedResident(page, '12A', 'linayi12a', '111111', 'seed-lin')
  await expect(page.getByText('科技生态园1C栋')).toBeVisible()
  await openExchangeLane(page)

  await page.getByText('九成新书架').click()
  const detailSheet = page.locator('.detail-sheet')
  await expect(detailSheet.getByText('选择要确认的邻居')).toBeVisible()
  await detailSheet.getByRole('button', { name: '周周 05C' }).click()
  await detailSheet.getByRole('button', { name: '确认认领' }).click()
  await expect(detailSheet.getByText('已认领')).toBeVisible()
  await detailSheet.getByRole('button', { name: '移入完成记录' }).click()
  await expect(page.locator('.tabbar .tab').filter({ hasText: '完成记录' })).toHaveClass(/active/)
  await expect(page.getByText('九成新书架')).toBeVisible()
})

test('resident can browse 邻居问问, open a thread, reply, and expand nested replies', async ({ page }) => {
  await loginSeedResident(page, '12A', 'linayi12a', '111111', 'seed-lin')

  await openAskLane(page)
  const askSheet = page.locator('.ask-sheet')
  await page.getByRole('button', { name: /阳台位能放多深的洗衣机/ }).click()

  await expect(askSheet.getByText('新搬来，怕买错尺寸，想问下有没有邻居实测过。')).toBeVisible()
  await expect(askSheet.getByText('展开 1 条回复')).toBeVisible()

  await askSheet.getByRole('button', { name: '展开 1 条回复' }).click()
  await expect(askSheet.getByText('谢谢，我看中的那台是 53.5cm，听起来还有机会。')).toBeVisible()

  await askSheet.getByRole('button', { name: '回复TA' }).first().click()
  await expect(askSheet.getByText('正在回复')).toBeVisible()
  await askSheet.getByPlaceholder('补充你对这条回复的看法…').fill('我家阳台位再往里缩一点，53cm 会更稳。')
  await askSheet.getByRole('button', { name: '我来补充' }).last().click()

  await expect(page.getByText('已補充到這條討論裡。')).toBeVisible()
  await expect(askSheet.getByText('我家阳台位再往里缩一点，53cm 会更稳。')).toBeVisible()
})
