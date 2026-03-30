import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { seedState, writeStore } from './store.ts'

describe('server app', () => {
  beforeEach(() => {
    writeStore(JSON.parse(JSON.stringify(seedState)))
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

  it('creates a lightweight profile after verify', async () => {
    const app = createApp()
    const verify = await request(app)
      .post('/api/entry/verify')
      .send({ buildingCode: 'SZHOME' })

    expect(verify.status).toBe(200)

    const deviceIdentityKey = verify.body.deviceIdentityKey as string

    const profile = await request(app)
      .put('/api/profile')
      .set('x-device-identity', deviceIdentityKey)
      .send({
        nickname: '阿May',
        roomFragment: '12A',
        wechatHandle: 'may12a',
      })

    expect(profile.status).toBe(200)
    expect(profile.body.profile.nickname).toBe('阿May')
    expect(profile.body.profile.wechatHandle).toBe('may12a')
  })

  it('rejects claim when selected resident never expressed interest', async () => {
    const app = createApp()

    const response = await request(app)
      .post('/api/posts/post-1/claim')
      .set('x-device-identity', 'seed-lin')
      .send({
        claimedByUserId: 'resident-ma',
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('claimer_not_interested')
  })

  it('rejects upload when token was never issued for this resident', async () => {
    const app = createApp()

    const response = await request(app)
      .put('/api/uploads/local/not-real')
      .set('x-device-identity', 'seed-lin')
      .attach('file', Buffer.from('fake-image'), 'chair.jpg')

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('invalid_upload_token')
  })

  it('accepts upload only after a signed token is issued', async () => {
    const app = createApp()

    const sign = await request(app)
      .post('/api/uploads/sign')
      .set('x-device-identity', 'seed-lin')

    expect(sign.status).toBe(200)

    const response = await request(app)
      .put(sign.body.uploadUrl)
      .set('x-device-identity', 'seed-lin')
      .attach('file', Buffer.from('fake-image'), 'chair.jpg')

    expect(response.status).toBe(200)
    expect(response.body.publicUrl).toMatch(/^\/uploads\//)
  })

  it('returns ask thread summaries ordered by latest activity', async () => {
    const app = createApp()

    const response = await request(app).get('/api/ask/threads?limit=2')

    expect(response.status).toBe(200)
    expect(response.body.threads).toHaveLength(2)
    expect(response.body.threads[0].id).toBe('thread-1')
    expect(response.body.threads[0].replyCount).toBeGreaterThan(0)
  })

  it('creates nested ask replies up to depth 3 and rejects depth 4', async () => {
    const app = createApp()

    const level1 = await request(app)
      .post('/api/ask/threads/thread-3/replies')
      .set('x-device-identity', 'seed-zhou')
      .send({ body: '我上次也是停在西侧。' })

    expect(level1.status).toBe(201)

    const level2 = await request(app)
      .post('/api/ask/threads/thread-3/replies')
      .set('x-device-identity', 'seed-he')
      .send({ body: '那边拐弯空间会不会太小？', parentReplyId: level1.body.reply.id })

    expect(level2.status).toBe(201)

    const level3 = await request(app)
      .post('/api/ask/threads/thread-3/replies')
      .set('x-device-identity', 'seed-lin')
      .send({ body: '早一点搬会更顺。', parentReplyId: level2.body.reply.id })

    expect(level3.status).toBe(201)

    const level4 = await request(app)
      .post('/api/ask/threads/thread-3/replies')
      .set('x-device-identity', 'seed-ma')
      .send({ body: '那我再问物业。', parentReplyId: level3.body.reply.id })

    expect(level4.status).toBe(400)
    expect(level4.body.error).toBe('reply_depth_exceeded')
  })
})
