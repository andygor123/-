import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const response = await request.post('http://127.0.0.1:8787/api/test/reset')
  expect(response.ok()).toBeTruthy()
})

test('mobile resident can enter, create available post, then see it in list', async ({ page }) => {
  await page.goto('/')

  await page.getByPlaceholder('例如：SZHOME').fill('SZHOME')
  await page.getByRole('button', { name: '进入本楼' }).click()

  await page.getByPlaceholder('例如：阿May').fill('阿May')
  await page.getByPlaceholder('例如：12A').fill('12A')
  await page.getByPlaceholder('例如：may12a').fill('may12a')
  await page.getByRole('button', { name: '保存并继续' }).click()

  await expect(page.getByText('楼里换物板')).toBeVisible()
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
  await page.addInitScript(() => {
    window.localStorage.setItem('building-board-device-key', 'seed-lin')
  })
  await page.goto('/')
  await expect(page.getByText('楼里换物板')).toBeVisible()

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
  await page.addInitScript(() => {
    window.localStorage.setItem('building-board-device-key', 'seed-lin')
  })
  await page.goto('/')

  await expect(page.getByText('楼里的问题，也别再沉到底下。')).toBeVisible()
  await page.getByRole('button', { name: '去问问' }).click()

  const askSheet = page.locator('.ask-sheet')
  await expect(askSheet.getByText('楼里最近在问什么')).toBeVisible()
  await askSheet.getByRole('button', { name: /阳台位能放多深的洗衣机/ }).click()

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
