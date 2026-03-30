import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import multer from 'multer'
import {
  readStore,
  seedState,
  updateStore,
  writeStore,
  type PostItem,
  type QuestionCategory,
  type QuestionReply,
  type QuestionThread,
  type ResidentProfile,
} from './store.ts'

const BUILDING_CODE = process.env.BUILDING_CODE?.trim().toUpperCase() || 'SZHOME'
const ROOT = process.cwd()
const DATA_ROOT = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, '.context', 'data')
const UPLOAD_DIR = path.join(DATA_ROOT, 'uploads')
const TEMP_UPLOAD_DIR = path.join(DATA_ROOT, 'tmp-uploads')
const DIST_DIR = path.join(ROOT, 'dist')
const DIST_INDEX = path.join(DIST_DIR, 'index.html')
const UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000
const ENTRY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000
const uploadTickets = new Map<string, { userId: string; expiresAt: number }>()
const entryTickets = new Map<string, number>()

fs.mkdirSync(UPLOAD_DIR, { recursive: true })
fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true })

function listView(post: PostItem, users: ResidentProfile[], interestCount: number) {
  const owner = users.find((user) => user.id === post.userId)
  const store = readStore()
  return {
    id: post.id,
    ownerId: post.userId,
    ownerNickname: owner?.nickname ?? '住户',
    ownerRoomFragment: owner?.roomFragment ?? '',
    postType: post.postType,
    status: post.status,
    title: post.title,
    category: post.category,
    description: post.description ?? null,
    pickupNote: post.pickupNote ?? null,
    imageUrl: post.imageUrl ?? null,
    fitMetadata: post.fitMetadataJson ?? null,
    interestUserIds: store.postInterests
      .filter((interest) => interest.postId === post.id)
      .map((interest) => interest.userId),
    interestedResidents: store.postInterests
      .filter((interest) => interest.postId === post.id)
      .map((interest) => {
        const resident = users.find((user) => user.id === interest.userId)
        return {
          userId: interest.userId,
          nickname: resident?.nickname ?? '住户',
          roomFragment: resident?.roomFragment ?? '',
          createdAt: interest.createdAt,
        }
      }),
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    removedAt: post.removedAt ?? null,
    interestCount,
  }
}

const askCategories = new Set<QuestionCategory>(['service', 'appliance', 'moving', 'resident_experience', 'other'])

function residentIdentity(userId: string, users: ResidentProfile[]) {
  const resident = users.find((user) => user.id === userId)
  return {
    userId,
    nickname: resident?.nickname ?? '住户',
    roomFragment: resident?.roomFragment ?? '',
  }
}

function latestReplyPreview(threadId: string, replies: QuestionReply[], users: ResidentProfile[]) {
  const latest = [...replies]
    .filter((reply) => reply.threadId === threadId && !reply.removedAt)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0]

  if (!latest) return null

  return {
    nickname: residentIdentity(latest.userId, users).nickname,
    body: latest.body,
  }
}

function threadSummary(thread: QuestionThread, replies: QuestionReply[], users: ResidentProfile[]) {
  return {
    id: thread.id,
    title: thread.title,
    body: thread.body ?? null,
    category: thread.category,
    author: residentIdentity(thread.userId, users),
    replyCount: thread.replyCount,
    lastActivityAt: thread.lastActivityAt,
    createdAt: thread.createdAt,
    latestReplyPreview: latestReplyPreview(thread.id, replies, users),
  }
}

function cleanupTempUpload(file?: Express.Multer.File | null) {
  if (!file?.path) return
  if (!fs.existsSync(file.path)) return
  fs.unlinkSync(file.path)
}

declare global {
  namespace Express {
    interface Request {
      user?: ResidentProfile
    }
  }
}

export function createApp() {
  const app = express()
  const upload = multer({ dest: TEMP_UPLOAD_DIR })

  app.use(express.json({ limit: '4mb' }))
  app.use(express.static(path.join(ROOT, 'public')))
  app.use('/uploads', express.static(UPLOAD_DIR))

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      uptime: process.uptime(),
      storage: DATA_ROOT,
      uploads: UPLOAD_DIR,
    })
  })

  if (process.env.ENABLE_TEST_API === '1') {
    app.post('/api/test/reset', (_req, res) => {
      writeStore(JSON.parse(JSON.stringify(seedState)))
      res.json({ ok: true })
    })
  }

  function profileFromHeader() {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const deviceIdentityKey = req.header('x-device-identity')
      if (!deviceIdentityKey) {
        return res.status(401).json({ error: 'missing_device_identity' })
      }

      const store = readStore()
      const user = store.users.find((item) => item.deviceIdentityKey === deviceIdentityKey)
      if (!user) {
        return res.status(401).json({ error: 'unknown_device_identity' })
      }

      req.user = user
      return next()
    }
  }

  function buildingAccessFromHeader() {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const deviceIdentityKey = String(req.header('x-device-identity') ?? '').trim()
      if (!deviceIdentityKey) {
        return res.status(401).json({ error: 'missing_device_identity' })
      }

      const store = readStore()
      const user = store.users.find((item) => item.deviceIdentityKey === deviceIdentityKey)
      if (user) {
        req.user = user
        return next()
      }

      const entryExpiresAt = entryTickets.get(deviceIdentityKey)
      if (!entryExpiresAt || entryExpiresAt < Date.now()) {
        entryTickets.delete(deviceIdentityKey)
        return res.status(401).json({ error: 'building_access_required' })
      }

      return next()
    }
  }

  app.get('/api/bootstrap', (_req, res) => {
    const store = readStore()
    res.json({
      buildingCodeHint: '请输入楼栋邀请码',
      hasSeedData: store.posts.length > 0,
    })
  })

  app.post('/api/entry/verify', (req, res) => {
    const buildingCode = String(req.body?.buildingCode ?? '').trim().toUpperCase()
    if (buildingCode !== BUILDING_CODE) {
      return res.status(400).json({ error: 'invalid_building_code' })
    }

    const deviceIdentityKey = req.body?.deviceIdentityKey
      ? String(req.body.deviceIdentityKey)
      : `device-${crypto.randomUUID()}`

    entryTickets.set(deviceIdentityKey, Date.now() + ENTRY_TOKEN_TTL_MS)

    return res.json({
      ok: true,
      deviceIdentityKey,
    })
  })

  app.get('/api/profile', (req, res) => {
    const deviceIdentityKey = req.header('x-device-identity')
    if (!deviceIdentityKey) {
      return res.json({ profile: null })
    }

    const store = readStore()
    const profile = store.users.find((user) => user.deviceIdentityKey === deviceIdentityKey) ?? null
    return res.json({ profile })
  })

  app.put('/api/profile', (req, res) => {
    const { nickname, roomFragment, wechatHandle } = req.body ?? {}
    const deviceIdentityKey = String(req.header('x-device-identity') ?? '').trim()

    if (!deviceIdentityKey) {
      return res.status(400).json({ error: 'missing_device_identity' })
    }

    if (!String(nickname ?? '').trim() || !String(roomFragment ?? '').trim() || !String(wechatHandle ?? '').trim()) {
      return res.status(400).json({ error: 'invalid_profile' })
    }

    const current = readStore()
    const existingProfile = current.users.find((user) => user.deviceIdentityKey === deviceIdentityKey)
    const entryExpiresAt = entryTickets.get(deviceIdentityKey)

    if (!existingProfile && (!entryExpiresAt || entryExpiresAt < Date.now())) {
      entryTickets.delete(deviceIdentityKey)
      return res.status(401).json({ error: 'building_access_required' })
    }

    const nextState = updateStore((store) => {
      const existing = store.users.find((user) => user.deviceIdentityKey === deviceIdentityKey)
      if (existing) {
        existing.nickname = String(nickname).trim()
        existing.roomFragment = String(roomFragment).trim()
        existing.wechatHandle = String(wechatHandle).trim()
        return { ...store, users: [...store.users] }
      }

      const newUser: ResidentProfile = {
        id: `resident-${crypto.randomUUID()}`,
        nickname: String(nickname).trim(),
        roomFragment: String(roomFragment).trim(),
        wechatHandle: String(wechatHandle).trim(),
        deviceIdentityKey,
      }
      return {
        ...store,
        users: [newUser, ...store.users],
      }
    })

    entryTickets.delete(deviceIdentityKey)

    const profile = nextState.users.find((user) => user.deviceIdentityKey === deviceIdentityKey)!
    return res.json({ profile })
  })

  app.get('/api/posts', buildingAccessFromHeader(), (req, res) => {
    const type = String(req.query.type ?? 'available') as 'available' | 'wanted' | 'history'
    const store = readStore()

    const items = store.posts.filter((post) => {
      if (type === 'history') return post.status === 'removed'
      if (post.status === 'removed') return false
      return post.postType === type
    })

    const payload = items
      .map((post) =>
        listView(
          post,
          store.users,
          store.postInterests.filter((interest) => interest.postId === post.id).length,
        ),
      )
      .sort((left, right) => {
        const rank = (status: string) => (status === 'available' ? 0 : status === 'claimed' ? 1 : 2)
        if (rank(left.status) !== rank(right.status)) return rank(left.status) - rank(right.status)
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      })

    return res.json({ posts: payload })
  })

  app.get('/api/posts/:id', buildingAccessFromHeader(), (req, res) => {
    const store = readStore()
    const post = store.posts.find((item) => item.id === req.params.id)
    if (!post) {
      return res.status(404).json({ error: 'post_not_found' })
    }

    const owner = store.users.find((user) => user.id === post.userId)
    const viewer = req.header('x-device-identity')
      ? store.users.find((user) => user.deviceIdentityKey === req.header('x-device-identity'))
      : null

    return res.json({
      post: {
        ...listView(
          post,
          store.users,
          store.postInterests.filter((interest) => interest.postId === post.id).length,
        ),
        interestUserIds: store.postInterests
          .filter((interest) => interest.postId === post.id)
          .map((interest) => interest.userId),
        interestedResidents: store.postInterests
          .filter((interest) => interest.postId === post.id)
          .map((interest) => {
            const resident = store.users.find((user) => user.id === interest.userId)
            return {
              userId: interest.userId,
              nickname: resident?.nickname ?? '住户',
              roomFragment: resident?.roomFragment ?? '',
              createdAt: interest.createdAt,
            }
          }),
        ownerWechatHandle: owner?.wechatHandle ?? null,
        alreadyInterested: viewer
          ? store.postInterests.some((interest) => interest.postId === post.id && interest.userId === viewer.id)
          : false,
      },
    })
  })

  app.get('/api/ask/threads', buildingAccessFromHeader(), (_req, res) => {
    const store = readStore()
    const limit = Math.max(1, Math.min(20, Number(_req.query.limit ?? 20) || 20))

    const threads = store.questionThreads
      .filter((thread) => !thread.removedAt)
      .sort((left, right) => new Date(right.lastActivityAt).getTime() - new Date(left.lastActivityAt).getTime())
      .slice(0, limit)
      .map((thread) => threadSummary(thread, store.questionReplies, store.users))

    return res.json({ threads })
  })

  app.get('/api/ask/threads/:id', buildingAccessFromHeader(), (req, res) => {
    const store = readStore()
    const thread = store.questionThreads.find((item) => item.id === req.params.id && !item.removedAt)
    if (!thread) {
      return res.status(404).json({ error: 'thread_not_found' })
    }

    const replies = store.questionReplies
      .filter((reply) => reply.threadId === thread.id && !reply.removedAt)
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
      .map((reply) => ({
        id: reply.id,
        threadId: reply.threadId,
        parentReplyId: reply.parentReplyId ?? null,
        depth: reply.depth,
        body: reply.body,
        author: residentIdentity(reply.userId, store.users),
        createdAt: reply.createdAt,
        childReplyCount: store.questionReplies.filter(
          (candidate) => candidate.parentReplyId === reply.id && !candidate.removedAt,
        ).length,
      }))

    return res.json({
      thread: {
        ...threadSummary(thread, store.questionReplies, store.users),
        replies,
      },
    })
  })

  app.post('/api/ask/threads', profileFromHeader(), (req, res) => {
    const user = req.user!
    const title = String(req.body?.title ?? '').trim()
    const body = String(req.body?.body ?? '').trim()
    const category = String(req.body?.category ?? '').trim() as QuestionCategory

    if (!title || !category || !askCategories.has(category)) {
      return res.status(400).json({ error: 'invalid_thread' })
    }

    const now = new Date().toISOString()
    const thread: QuestionThread = {
      id: `thread-${crypto.randomUUID()}`,
      userId: user.id,
      title,
      body: body || undefined,
      category,
      replyCount: 0,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    }

    updateStore((store) => ({
      ...store,
      questionThreads: [thread, ...store.questionThreads],
    }))

    return res.status(201).json({
      thread: threadSummary(thread, [], readStore().users),
    })
  })

  app.post('/api/ask/threads/:id/replies', profileFromHeader(), (req, res) => {
    const user = req.user!
    const threadId = req.params.id
    const body = String(req.body?.body ?? '').trim()
    const parentReplyId = String(req.body?.parentReplyId ?? '').trim() || undefined

    if (!body) {
      return res.status(400).json({ error: 'reply_body_required' })
    }

    const store = readStore()
    const thread = store.questionThreads.find((item) => item.id === threadId && !item.removedAt)
    if (!thread) {
      return res.status(404).json({ error: 'thread_not_found' })
    }

    let depth = 1
    if (parentReplyId) {
      const parentReply = store.questionReplies.find((reply) => reply.id === parentReplyId && !reply.removedAt)
      if (!parentReply || parentReply.threadId !== threadId) {
        return res.status(400).json({ error: 'invalid_parent_reply' })
      }

      depth = parentReply.depth + 1
      if (depth > 3) {
        return res.status(400).json({ error: 'reply_depth_exceeded' })
      }
    }

    const now = new Date().toISOString()
    const reply: QuestionReply = {
      id: `reply-${crypto.randomUUID()}`,
      threadId,
      userId: user.id,
      parentReplyId,
      depth,
      body,
      createdAt: now,
      updatedAt: now,
    }

    updateStore((current) => ({
      ...current,
      questionReplies: [...current.questionReplies, reply],
      questionThreads: current.questionThreads.map((item) =>
        item.id === threadId
          ? {
              ...item,
              replyCount: item.replyCount + 1,
              lastActivityAt: now,
              updatedAt: now,
            }
          : item,
      ),
    }))

    return res.status(201).json({ reply: { id: reply.id } })
  })

  app.post('/api/posts', profileFromHeader(), (req, res) => {
    const user = req.user!
    const { postType, title, category, description, pickupNote, imageUrl, fitMetadata } = req.body ?? {}

    if (!String(title ?? '').trim() || !String(category ?? '').trim()) {
      return res.status(400).json({ error: 'missing_required_fields' })
    }

    if (postType !== 'available' && postType !== 'wanted') {
      return res.status(400).json({ error: 'invalid_post_type' })
    }

    if (postType === 'available' && !String(imageUrl ?? '').trim()) {
      return res.status(400).json({ error: 'image_required_for_available' })
    }

    const post: PostItem = {
      id: `post-${crypto.randomUUID()}`,
      userId: user.id,
      postType,
      status: 'available',
      title: String(title).trim(),
      category: String(category).trim(),
      description: String(description ?? '').trim() || undefined,
      pickupNote: String(pickupNote ?? '').trim() || undefined,
      imageUrl: String(imageUrl ?? '').trim() || undefined,
      fitMetadataJson: fitMetadata ?? undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    updateStore((store) => ({
      ...store,
      posts: [post, ...store.posts],
    }))

    return res.status(201).json({ post })
  })

  app.post('/api/posts/:id/interests', profileFromHeader(), (req, res) => {
    const user = req.user!
    const postId = req.params.id

    const current = readStore()
    const post = current.posts.find((item) => item.id === postId)
    if (!post || post.status !== 'available') {
      return res.status(400).json({ error: 'post_not_available' })
    }

    if (current.postInterests.some((interest) => interest.postId === postId && interest.userId === user.id)) {
      return res.status(409).json({ error: 'already_interested' })
    }

    const interest = {
      id: `interest-${crypto.randomUUID()}`,
      postId,
      userId: user.id,
      createdAt: new Date().toISOString(),
    }

    updateStore((store) => ({
      ...store,
      postInterests: [interest, ...store.postInterests],
    }))

    return res.status(201).json({ interest })
  })

  app.post('/api/posts/:id/claim', profileFromHeader(), (req, res) => {
    const user = req.user!
    const claimedByUserId = String(req.body?.claimedByUserId ?? '').trim()
    const postId = req.params.id

    const current = readStore()
    const post = current.posts.find((item) => item.id === postId)
    if (!post) {
      return res.status(404).json({ error: 'post_not_found' })
    }

    if (post.userId !== user.id) {
      return res.status(403).json({ error: 'not_post_owner' })
    }

    if (post.status !== 'available') {
      return res.status(400).json({ error: 'post_not_available' })
    }

    const hasInterest = current.postInterests.some(
      (interest) => interest.postId === postId && interest.userId === claimedByUserId,
    )
    if (!hasInterest) {
      return res.status(400).json({ error: 'claimer_not_interested' })
    }

    const updated = updateStore((store) => ({
      ...store,
      posts: store.posts.map((item) =>
        item.id === postId
          ? {
              ...item,
              status: 'claimed',
              claimedByUserId,
              claimedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    }))

    return res.json({ post: updated.posts.find((item) => item.id === postId) })
  })

  app.post('/api/posts/:id/remove', profileFromHeader(), (req, res) => {
    const user = req.user!
    const postId = req.params.id

    const current = readStore()
    const post = current.posts.find((item) => item.id === postId)
    if (!post) {
      return res.status(404).json({ error: 'post_not_found' })
    }

    if (post.userId !== user.id) {
      return res.status(403).json({ error: 'not_post_owner' })
    }

    const updated = updateStore((store) => ({
      ...store,
      posts: store.posts.map((item) =>
        item.id === postId
          ? {
              ...item,
              status: 'removed',
              removedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    }))

    return res.json({ post: updated.posts.find((item) => item.id === postId) })
  })

  app.post('/api/uploads/sign', profileFromHeader(), (_req, res) => {
    const user = _req.user!
    const uploadToken = crypto.randomUUID()
    uploadTickets.set(uploadToken, {
      userId: user.id,
      expiresAt: Date.now() + UPLOAD_TOKEN_TTL_MS,
    })
    res.json({
      uploadUrl: `/api/uploads/local/${uploadToken}`,
      publicBaseUrl: `/uploads`,
      uploadToken,
    })
  })

  app.put('/api/uploads/local/:token', profileFromHeader(), upload.single('file'), (req, res) => {
    const user = req.user!
    const token = String(req.params.token)
    const ticket = uploadTickets.get(token)
    if (!ticket || ticket.userId !== user.id || ticket.expiresAt < Date.now()) {
      cleanupTempUpload(req.file)
      uploadTickets.delete(token)
      return res.status(400).json({ error: 'invalid_upload_token' })
    }

    const file = req.file
    if (!file) {
      return res.status(400).json({ error: 'file_required' })
    }

    const safeName = `${req.params.token}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '-')}`
    const target = path.join(UPLOAD_DIR, safeName)
    fs.renameSync(file.path, target)
    uploadTickets.delete(token)

    return res.json({
      publicUrl: `/uploads/${safeName}`,
    })
  })

  if (fs.existsSync(DIST_INDEX)) {
    app.use(express.static(DIST_DIR))
    app.get(/^(?!\/api\/|\/uploads\/|\/health$).*/, (_req, res) => {
      res.sendFile(DIST_INDEX)
    })
  }

  return app
}
