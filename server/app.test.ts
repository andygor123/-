import fs from 'node:fs'
import path from 'node:path'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { seedState, testSeedState, writeStore } from './store.ts'

const DATA_FILE = path.resolve(process.cwd(), '.context', 'data', 'app-state.json')

async function loginSeed(app: ReturnType<typeof createApp>, options: { roomFragment: string; wechatHandle: string; pin: string; deviceIdentityKey: string }) {
  await request(app)
    .post('/api/entry/verify')
    .send({
      buildingCode: 'SZHOME',
      deviceIdentityKey: options.deviceIdentityKey,
    })

  return request(app)
    .post('/api/auth/login')
    .set('x-device-identity', options.deviceIdentityKey)
    .send({
      roomFragment: options.roomFragment,
      wechatHandle: options.wechatHandle,
      pin: options.pin,
    })
}

async function loginSeedAgent(agent: ReturnType<typeof request.agent>, options: { roomFragment: string; wechatHandle: string; pin: string; deviceIdentityKey: string }) {
  await agent
    .post('/api/entry/verify')
    .send({
      buildingCode: 'SZHOME',
      deviceIdentityKey: options.deviceIdentityKey,
    })

  return agent
    .post('/api/auth/login')
    .set('x-device-identity', options.deviceIdentityKey)
    .send({
      roomFragment: options.roomFragment,
      wechatHandle: options.wechatHandle,
      pin: options.pin,
    })
}

async function signupResident(app: ReturnType<typeof createApp>, options: {
  buildingCode?: string
  deviceIdentityKey?: string
  nickname?: string
  roomFragment?: string
  wechatHandle?: string
  pin?: string
}) {
  const verify = await request(app)
    .post('/api/entry/verify')
    .send({
      buildingCode: options.buildingCode ?? 'SZHOME',
      deviceIdentityKey: options.deviceIdentityKey,
    })

  const deviceIdentityKey = verify.body.deviceIdentityKey as string

  const profile = await request(app)
    .put('/api/profile')
    .set('x-device-identity', deviceIdentityKey)
    .send({
      nickname: options.nickname ?? '阿May',
      roomFragment: options.roomFragment ?? '1609',
      wechatHandle: options.wechatHandle ?? 'may1609',
      pin: options.pin ?? '160912',
    })

  return { verify, profile, deviceIdentityKey }
}

describe('server app', () => {
  beforeEach(() => {
    writeStore(JSON.parse(JSON.stringify(testSeedState)))
  })

  it('rejects invalid building code', async () => {
    const app = createApp()
    const response = await request(app)
      .post('/api/entry/verify')
      .send({ buildingCode: 'wrong' })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('invalid_building_code')
  })

  it('serves a health endpoint for deployment checks', async () => {
    const app = createApp()
    const response = await request(app).get('/health')

    expect(response.status).toBe(200)
    expect(response.body.ok).toBe(true)
  })

  it('creates a resident profile with pin after verify and starts a session', async () => {
    const app = createApp()
    const { verify, profile } = await signupResident(app, {})

    expect(verify.status).toBe(200)
    expect(profile.status).toBe(200)
    expect(profile.body.profile.nickname).toBe('阿May')
    expect(profile.body.profile.wechatHandle).toBe('may1609')
    expect(profile.headers['set-cookie']).toBeTruthy()
  })

  it('auto restores a session for a known device without asking to log in again', async () => {
    const app = createApp()
    const response = await request(app)
      .get('/api/profile')
      .set('x-device-identity', 'seed-lin')

    expect(response.status).toBe(200)
    expect(response.body.profile.nickname).toBe('林阿姨')
    expect(response.body.authState).toBe('logged_in')
    expect(response.body.residentIdentity.roomFragment).toBe('12A')
    expect(response.headers['set-cookie']).toBeTruthy()
  })

  it('logs in with room fragment + wechat handle + pin and creates a session', async () => {
    const app = createApp()
    const response = await loginSeed(app, {
      roomFragment: '12A',
      wechatHandle: 'linayi12a',
      pin: '111111',
      deviceIdentityKey: 'device-login-lin',
    })

    expect(response.status).toBe(200)
    expect(response.body.profile.nickname).toBe('林阿姨')
    expect(response.headers['set-cookie']).toBeTruthy()
  })

  it('rejects login without verified building access', async () => {
    const app = createApp()
    const response = await request(app)
      .post('/api/auth/login')
      .set('x-device-identity', 'device-login-lin')
      .send({
        roomFragment: '12A',
        wechatHandle: 'linayi12a',
        pin: '111111',
      })

    expect(response.status).toBe(401)
    expect(response.body.error).toBe('building_access_required')
  })

  it('rejects profile creation without verified building access', async () => {
    const app = createApp()

    const profile = await request(app)
      .put('/api/profile')
      .set('x-device-identity', 'device-unverified')
      .send({
        nickname: '阿May',
        roomFragment: '1609',
        wechatHandle: 'may1609',
        pin: '160912',
      })

    expect(profile.status).toBe(401)
    expect(profile.body.error).toBe('building_access_required')
  })

  it('does not let an unauthed known device overwrite the existing resident profile', async () => {
    const app = createApp()

    const verify = await request(app)
      .post('/api/entry/verify')
      .send({
        buildingCode: 'SZHOME',
        deviceIdentityKey: 'seed-lin',
      })

    expect(verify.status).toBe(200)

    const profile = await request(app)
      .put('/api/profile')
      .set('x-device-identity', 'seed-lin')
      .send({
        nickname: '假林阿姨',
        roomFragment: '9999',
        wechatHandle: 'fake-lin',
        pin: '999999',
      })

    expect(profile.status).toBe(401)
    expect(profile.body.error).toBe('login_required')
  })

  it('rejects post list access without an authenticated session', async () => {
    const app = createApp()
    const response = await request(app).get('/api/posts?type=available')

    expect(response.status).toBe(401)
    expect(response.body.error).toBe('auth_required')
  })

  it('rejects claim when selected resident never expressed interest', async () => {
    const app = createApp()
    const agent = request.agent(app)

    await loginSeedAgent(agent, {
      roomFragment: '12A',
      wechatHandle: 'linayi12a',
      pin: '111111',
      deviceIdentityKey: 'seed-lin',
    })

    const response = await agent
      .post('/api/posts/post-1/claim')
      .send({
        claimedByUserId: 'resident-ma',
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('claimer_not_interested')
  })

  it('records an optional offer on interest for paid available posts and lets the viewer update it', async () => {
    const app = createApp()
    const agent = request.agent(app)

    await loginSeedAgent(agent, {
      roomFragment: '08F',
      wechatHandle: 'chen08f',
      pin: '555555',
      deviceIdentityKey: 'seed-chen',
    })

    const createResponse = await agent
      .post('/api/posts/post-1/interests')
      .send({
        offerPriceCny: 68,
      })

    expect(createResponse.status).toBe(201)
    expect(createResponse.body.interest.offerPriceCny).toBe(68)

    const updateResponse = await agent
      .post('/api/posts/post-1/interests')
      .send({
        offerPriceCny: 72,
      })

    expect(updateResponse.status).toBe(200)
    expect(updateResponse.body.interest.offerPriceCny).toBe(72)

    const detailResponse = await agent.get('/api/posts/post-1')

    expect(detailResponse.status).toBe(200)
    expect(detailResponse.body.post.viewerOfferPriceCny).toBe(72)
    expect(
      detailResponse.body.post.interestedResidents.find((resident: { userId: string }) => resident.userId === 'resident-chen')
        ?.offerPriceCny,
    ).toBe(72)
  })

  it('rejects offer prices on free giveaway posts', async () => {
    writeStore({
      ...JSON.parse(JSON.stringify(testSeedState)),
      posts: [
        ...JSON.parse(JSON.stringify(testSeedState)).posts,
        {
          id: 'post-free-offer',
          userId: 'resident-lin',
          postType: 'available',
          status: 'available',
          title: '免费折叠桌',
          category: '家具',
          priceType: 'free',
          imageUrl: '/sample-bookshelf.svg',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    })
    const app = createApp()
    const agent = request.agent(app)

    await loginSeedAgent(agent, {
      roomFragment: '08F',
      wechatHandle: 'chen08f',
      pin: '555555',
      deviceIdentityKey: 'seed-chen',
    })

    const response = await agent
      .post('/api/posts/post-free-offer/interests')
      .send({
        offerPriceCny: 20,
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('offer_not_supported')
  })

  it('lets the post owner edit their available post', async () => {
    const app = createApp()
    const agent = request.agent(app)

    await loginSeedAgent(agent, {
      roomFragment: '12A',
      wechatHandle: 'linayi12a',
      pin: '111111',
      deviceIdentityKey: 'seed-lin',
    })

    const response = await agent
      .patch('/api/posts/post-1')
      .send({
        title: '九成新书架，可小刀',
        category: '家具',
        priceType: 'paid',
        priceCny: 66,
        description: '重新整理过，今晚可看。',
        pickupNote: '今晚 8 点后',
        imageUrl: '/sample-bookshelf.svg',
        fitMetadata: {
          sizeNote: '约 120cm x 80cm',
          liftFit: '可进电梯',
        },
      })

    expect(response.status).toBe(200)
    expect(response.body.post.title).toBe('九成新书架，可小刀')
    expect(response.body.post.priceCny).toBe(66)
  })

  it('rejects post edits from non-owners', async () => {
    const app = createApp()
    const agent = request.agent(app)

    await loginSeedAgent(agent, {
      roomFragment: '05C',
      wechatHandle: 'zhouzhou05',
      pin: '222222',
      deviceIdentityKey: 'seed-zhou',
    })

    const response = await agent
      .patch('/api/posts/post-1')
      .send({
        title: '乱改标题',
        category: '家具',
        imageUrl: '/sample-bookshelf.svg',
      })

    expect(response.status).toBe(403)
    expect(response.body.error).toBe('not_post_owner')
  })

  it('does not expose owner wechat handle before the viewer interacts', async () => {
    const app = createApp()
    const agent = request.agent(app)

    await loginSeedAgent(agent, {
      roomFragment: '16D',
      wechatHandle: 'may16d',
      pin: '444444',
      deviceIdentityKey: 'seed-ma',
    })

    const response = await agent.get('/api/posts/post-1')

    expect(response.status).toBe(200)
    expect(response.body.post.ownerWechatHandle).toBeNull()
  })

  it('exposes owner wechat handle after the viewer expresses interest', async () => {
    const app = createApp()
    const agent = request.agent(app)

    await loginSeedAgent(agent, {
      roomFragment: '05C',
      wechatHandle: 'zhouzhou05',
      pin: '222222',
      deviceIdentityKey: 'seed-zhou',
    })

    const response = await agent.get('/api/posts/post-1')

    expect(response.status).toBe(200)
    expect(response.body.post.ownerWechatHandle).toBe('linayi12a')
  })

  it('auto archives claimed posts after 24 hours when loading posts', async () => {
    writeStore({
      ...JSON.parse(JSON.stringify(testSeedState)),
      posts: [
        ...JSON.parse(JSON.stringify(testSeedState)).posts,
        {
          id: 'post-old-claimed',
          userId: 'resident-lin',
          postType: 'available',
          status: 'claimed',
          title: '旧微波炉',
          category: '家电',
          priceType: 'free',
          claimedByUserId: 'resident-zhou',
          claimedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        },
      ],
    })
    const app = createApp()
    const agent = request.agent(app)

    const signup = await signupResident(app, {
      deviceIdentityKey: 'device-history-viewer',
      nickname: '历史查看',
      roomFragment: '2001',
      wechatHandle: 'history2001',
      pin: '200120',
    })
    const cookie = signup.profile.headers['set-cookie']
    if (cookie) {
      agent.jar.setCookie(cookie[0])
    }

    const response = await agent.get('/api/posts?type=history')

    expect(response.status).toBe(200)
    expect(response.body.posts.some((post: { id: string }) => post.id === 'post-old-claimed')).toBe(true)
  })

  it('rejects upload when token was never issued for this resident', async () => {
    const app = createApp()
    const agent = request.agent(app)
    const beforeFiles = new Set(fs.readdirSync(path.resolve(process.cwd(), '.context', 'data', 'tmp-uploads')))

    await loginSeedAgent(agent, {
      roomFragment: '12A',
      wechatHandle: 'linayi12a',
      pin: '111111',
      deviceIdentityKey: 'seed-lin',
    })

    const response = await agent
      .put('/api/uploads/local/not-real')
      .set('x-device-identity', 'seed-lin')
      .attach('file', Buffer.from('fake-image'), 'chair.jpg')

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('invalid_upload_token')
    const afterFiles = fs.readdirSync(path.resolve(process.cwd(), '.context', 'data', 'tmp-uploads'))
    expect(afterFiles.filter((name) => !beforeFiles.has(name))).toHaveLength(0)
  })

  it('accepts upload only after a signed token is issued', async () => {
    const app = createApp()
    const agent = request.agent(app)

    await loginSeedAgent(agent, {
      roomFragment: '12A',
      wechatHandle: 'linayi12a',
      pin: '111111',
      deviceIdentityKey: 'seed-lin',
    })

    const sign = await agent.post('/api/uploads/sign')
    expect(sign.status).toBe(200)

    const response = await agent
      .put(sign.body.uploadUrl)
      .set('x-device-identity', 'seed-lin')
      .attach('file', Buffer.from('fake-image'), 'chair.jpg')

    expect(response.status).toBe(200)
    expect(response.body.publicUrl).toMatch(/^\/uploads\//)
  })

  it('returns ask thread summaries ordered by latest activity', async () => {
    const app = createApp()
    const agent = request.agent(app)

    await loginSeedAgent(agent, {
      roomFragment: '12A',
      wechatHandle: 'linayi12a',
      pin: '111111',
      deviceIdentityKey: 'seed-lin',
    })

    const response = await agent.get('/api/ask/threads?limit=2')

    expect(response.status).toBe(200)
    expect(response.body.threads).toHaveLength(2)
    expect(response.body.threads[0].id).toBe('thread-1')
    expect(response.body.threads[0].replyCount).toBeGreaterThan(0)
  })

  it('creates ask thread with optional image url', async () => {
    const app = createApp()
    const agent = request.agent(app)

    await loginSeedAgent(agent, {
      roomFragment: '12A',
      wechatHandle: 'linayi12a',
      pin: '111111',
      deviceIdentityKey: 'seed-lin',
    })

    const response = await agent
      .post('/api/ask/threads')
      .send({
        title: '求问这个角落能放什么架子？',
        body: '想找邻居实测一下。',
        category: 'resident_experience',
        imageUrl: '/uploads/test-corner.jpg',
      })

    expect(response.status).toBe(201)
    expect(response.body.thread.imageUrl).toBe('/uploads/test-corner.jpg')
  })

  it('creates ask reply with optional image url and returns it from detail API', async () => {
    const app = createApp()
    const agent = request.agent(app)

    await loginSeedAgent(agent, {
      roomFragment: '12A',
      wechatHandle: 'linayi12a',
      pin: '111111',
      deviceIdentityKey: 'seed-lin',
    })

    const createResponse = await agent
      .post('/api/ask/threads/thread-1/replies')
      .send({
        body: '',
        imageUrl: '/uploads/reply-photo.jpg',
      })

    expect(createResponse.status).toBe(201)

    const detailResponse = await agent.get('/api/ask/threads/thread-1')
    const createdReply = detailResponse.body.thread.replies.find((reply: { id: string }) => reply.id === createResponse.body.reply.id)

    expect(detailResponse.status).toBe(200)
    expect(createdReply.imageUrl).toBe('/uploads/reply-photo.jpg')
  })

  it('soft deletes own ask reply and preserves the placeholder in detail', async () => {
    const app = createApp()
    const agent = request.agent(app)

    await loginSeedAgent(agent, {
      roomFragment: '16D',
      wechatHandle: 'may16d',
      pin: '444444',
      deviceIdentityKey: 'seed-ma',
    })

    const removeResponse = await agent.post('/api/ask/replies/qreply-3/remove')

    expect(removeResponse.status).toBe(200)

    const detailResponse = await agent.get('/api/ask/threads/thread-1')
    const removedReply = detailResponse.body.thread.replies.find((reply: { id: string }) => reply.id === 'qreply-3')

    expect(removedReply.body).toBe('该内容已删除')
    expect(removedReply.imageUrl).toBeNull()
    expect(removedReply.isDeleted).toBe(true)
  })

  it('soft deletes own ask thread so it disappears from the feed', async () => {
    const app = createApp()
    const agent = request.agent(app)

    await loginSeedAgent(agent, {
      roomFragment: '05C',
      wechatHandle: 'zhouzhou05',
      pin: '222222',
      deviceIdentityKey: 'seed-zhou',
    })

    const removeResponse = await agent.post('/api/ask/threads/thread-1/remove')
    expect(removeResponse.status).toBe(200)

    const listResponse = await agent.get('/api/ask/threads?limit=10')
    expect(listResponse.status).toBe(200)
    expect(listResponse.body.threads.some((thread: { id: string }) => thread.id === 'thread-1')).toBe(false)

    const detailResponse = await agent.get('/api/ask/threads/thread-1')
    expect(detailResponse.status).toBe(200)
    expect(detailResponse.body.thread.isDeleted).toBe(true)
  })

  it('rejects deleting another resident reply', async () => {
    const app = createApp()
    const agent = request.agent(app)

    await loginSeedAgent(agent, {
      roomFragment: '12A',
      wechatHandle: 'linayi12a',
      pin: '111111',
      deviceIdentityKey: 'seed-lin',
    })

    const response = await agent.post('/api/ask/replies/qreply-2/remove')

    expect(response.status).toBe(403)
    expect(response.body.error).toBe('not_reply_owner')
  })

  it('backfills older persisted stores that do not have ask arrays or sessions', async () => {
    const legacyState = {
      users: testSeedState.users,
      posts: testSeedState.posts,
      postInterests: testSeedState.postInterests,
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(legacyState, null, 2))

    const app = createApp()
    const agent = request.agent(app)

    await loginSeedAgent(agent, {
      roomFragment: '12A',
      wechatHandle: 'linayi12a',
      pin: '111111',
      deviceIdentityKey: 'seed-lin',
    })

    const response = await agent.get('/api/ask/threads?limit=3')

    expect(response.status).toBe(200)
    expect(response.body.threads).toEqual([])

    const normalized = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as Record<string, unknown>
    expect(normalized.questionThreads).toEqual([])
    expect(normalized.questionReplies).toEqual([])
    expect(normalized.sessions).toEqual(expect.any(Array))
  })

  it('creates nested ask replies up to depth 3 and rejects depth 4', async () => {
    const app = createApp()
    const agentA = request.agent(app)
    const agentB = request.agent(app)
    const agentC = request.agent(app)
    const agentD = request.agent(app)

    await loginSeedAgent(agentA, { roomFragment: '05C', wechatHandle: 'zhouzhou05', pin: '222222', deviceIdentityKey: 'seed-zhou' })
    await loginSeedAgent(agentB, { roomFragment: '07B', wechatHandle: 'he07b', pin: '333333', deviceIdentityKey: 'seed-he' })
    await loginSeedAgent(agentC, { roomFragment: '12A', wechatHandle: 'linayi12a', pin: '111111', deviceIdentityKey: 'seed-lin' })
    await loginSeedAgent(agentD, { roomFragment: '08F', wechatHandle: 'chen08f', pin: '555555', deviceIdentityKey: 'seed-chen' })

    const level1 = await agentA.post('/api/ask/threads/thread-3/replies').send({ body: '我上次也是停在西侧。' })
    expect(level1.status).toBe(201)

    const level2 = await agentB
      .post('/api/ask/threads/thread-3/replies')
      .send({ body: '那边拐弯空间会不会太小？', parentReplyId: level1.body.reply.id })
    expect(level2.status).toBe(201)

    const level3 = await agentC
      .post('/api/ask/threads/thread-3/replies')
      .send({ body: '早一点搬会更顺。', parentReplyId: level2.body.reply.id })
    expect(level3.status).toBe(201)

    const level4 = await agentD
      .post('/api/ask/threads/thread-3/replies')
      .send({ body: '那我再问物业。', parentReplyId: level3.body.reply.id })

    expect(level4.status).toBe(400)
    expect(level4.body.error).toBe('reply_depth_exceeded')
  })

  it('rejects paid post creation without a valid price', async () => {
    const app = createApp()
    const agent = request.agent(app)

    await loginSeedAgent(agent, {
      roomFragment: '12A',
      wechatHandle: 'linayi12a',
      pin: '111111',
      deviceIdentityKey: 'seed-lin',
    })

    const response = await agent
      .post('/api/posts')
      .send({
        postType: 'available',
        title: '办公椅',
        category: '家具',
        imageUrl: '/sample-chair.svg',
        priceType: 'paid',
        priceCny: 0,
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('invalid_price')
  })
})
