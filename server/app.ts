import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import multer from 'multer'
import {
  readStore,
  seedState,
  testSeedState,
  type SessionRecord,
  updateStore,
  writeStore,
  type PostItem,
  type QuestionCategory,
  type QuestionReply,
  type QuestionThread,
  type ResidentProfile,
} from './store.ts'

const BUILDING_CODE = process.env.BUILDING_CODE?.trim().toUpperCase() || 'SZHOME'
const API_PUBLIC_BASE_URL = process.env.API_PUBLIC_BASE_URL?.trim().replace(/\/$/, '') || ''
const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
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
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const CLAIM_ARCHIVE_AFTER_MS = 24 * 60 * 60 * 1000
const SESSION_COOKIE = 'resident_session'
const uploadTickets = new Map<string, { userId: string; expiresAt: number }>()
const entryTickets = new Map<string, number>()

fs.mkdirSync(UPLOAD_DIR, { recursive: true })
fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true })

function requestPublicBaseUrl(req: express.Request) {
  void req
  return API_PUBLIC_BASE_URL
}

function absoluteUploadUrl(req: express.Request, imageUrl?: string | null) {
  if (!imageUrl) return null
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl
  if (!imageUrl.startsWith('/uploads/')) return imageUrl
  const baseUrl = requestPublicBaseUrl(req)
  return baseUrl ? `${baseUrl}${imageUrl}` : imageUrl
}

function applyPostLifecycle(store: ReturnType<typeof readStore>) {
  const now = Date.now()
  let mutated = false
  const nextPosts = store.posts.map((post) => {
    if (post.status !== 'claimed' || !post.claimedAt) return post
    if (now - new Date(post.claimedAt).getTime() < CLAIM_ARCHIVE_AFTER_MS) return post
    mutated = true
    return {
      ...post,
      status: 'removed' as const,
      removedAt: post.removedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  })

  if (!mutated) return store
  const nextState = {
    ...store,
    posts: nextPosts,
  }
  writeStore(nextState)
  return nextState
}

function listView(req: express.Request, post: PostItem, users: ResidentProfile[], interestCount: number, viewerId?: string) {
  const owner = users.find((user) => user.id === post.userId)
  const store = readStore()
  const viewerInterest = viewerId
    ? store.postInterests.find((interest) => interest.postId === post.id && interest.userId === viewerId)
    : null
  const alreadyInterested = viewerId
    ? Boolean(viewerInterest)
    : false
  const needsAttention = Boolean(
    viewerId &&
      post.userId !== viewerId &&
      ((post.status === 'available' && alreadyInterested) || post.claimedByUserId === viewerId),
  )
  return {
    id: post.id,
    ownerId: post.userId,
    ownerNickname: owner?.nickname ?? '住户',
    ownerRoomFragment: owner?.roomFragment ?? '',
    postType: post.postType,
    status: post.status,
    title: post.title,
    category: post.category,
    priceType: post.priceType ?? 'free',
    priceCny: post.priceCny ?? null,
    description: post.description ?? null,
    pickupNote: post.pickupNote ?? null,
    imageUrl: absoluteUploadUrl(req, post.imageUrl),
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
          offerPriceCny: interest.offerPriceCny ?? null,
        }
      }),
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    claimedAt: post.claimedAt ?? null,
    removedAt: post.removedAt ?? null,
    interestCount,
    alreadyInterested,
    viewerOfferPriceCny: viewerInterest?.offerPriceCny ?? null,
    needsAttention,
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

function publicProfile(profile: ResidentProfile) {
  return {
    id: profile.id,
    nickname: profile.nickname,
    roomFragment: profile.roomFragment,
    wechatHandle: profile.wechatHandle,
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

function threadSummary(req: express.Request, thread: QuestionThread, replies: QuestionReply[], users: ResidentProfile[]) {
  return {
    id: thread.id,
    title: thread.title,
    body: thread.body ?? null,
    imageUrl: absoluteUploadUrl(req, thread.imageUrl),
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

function parseCookieValue(req: express.Request, key: string) {
  const cookieHeader = String(req.header('cookie') ?? '')
  if (!cookieHeader) return ''
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=')
    if (rawName === key) {
      return decodeURIComponent(rawValue.join('='))
    }
  }
  return ''
}

function requestIsSecure(req: express.Request) {
  return req.secure || String(req.header('x-forwarded-proto') ?? '').toLowerCase() === 'https'
}

function setSessionCookie(req: express.Request, res: express.Response, sessionId: string) {
  const secure = requestIsSecure(req)
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure ? '; Secure' : ''}`,
  )
}

function clearSessionCookie(req: express.Request, res: express.Response) {
  const secure = requestIsSecure(req)
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`,
  )
}

function normalizeCredential(value: unknown) {
  return String(value ?? '').trim()
}

function hashPin(pin: string) {
  const salt = crypto.randomBytes(16).toString('hex')
  const digest = crypto.scryptSync(pin, salt, 64).toString('hex')
  return `scrypt:${salt}:${digest}`
}

function verifyPin(pin: string, storedHash?: string) {
  if (!storedHash) return false
  const [algorithm, salt, digest] = storedHash.split(':')
  if (algorithm !== 'scrypt' || !salt || !digest) return false
  const candidate = crypto.scryptSync(pin, salt, 64)
  const expected = Buffer.from(digest, 'hex')
  if (candidate.length !== expected.length) return false
  return crypto.timingSafeEqual(candidate, expected)
}

function normalizeAuthLookup(roomFragment: string, wechatHandle: string) {
  return {
    roomFragment: roomFragment.trim().toUpperCase(),
    wechatHandle: wechatHandle.trim().toLowerCase(),
  }
}

function sessionUser(req: express.Request) {
  const sessionId = parseCookieValue(req, SESSION_COOKIE)
  if (!sessionId) return null

  const store = readStore()
  const session = store.sessions.find((item) => item.id === sessionId)
  if (!session) return null
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    updateStore((current) => ({
      ...current,
      sessions: current.sessions.filter((item) => item.id !== sessionId),
    }))
    return null
  }

  const user = store.users.find((item) => item.id === session.userId)
  if (!user) return null
  return { user, session, store }
}

function createSessionRecord(userId: string, deviceIdentityKey: string): SessionRecord {
  const now = new Date()
  return {
    id: `session-${crypto.randomUUID()}`,
    userId,
    deviceIdentityKey,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
  }
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

  app.use((req, res, next) => {
    const origin = req.header('origin')
    const allowOrigin =
      origin && CORS_ALLOWED_ORIGINS.includes(origin)
        ? origin
        : !origin && CORS_ALLOWED_ORIGINS.length === 0
          ? '*'
          : null

    if (allowOrigin) {
      res.header('Access-Control-Allow-Origin', allowOrigin)
      res.header('Vary', 'Origin')
      if (allowOrigin !== '*') {
        res.header('Access-Control-Allow-Credentials', 'true')
      }
      res.header('Access-Control-Allow-Headers', 'Content-Type, x-device-identity')
      res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS')
    }

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204)
    }

    return next()
  })

  app.use(express.json({ limit: '4mb' }))
  app.use('/.well-known', express.static(path.join(ROOT, 'public', '.well-known'), { dotfiles: 'allow' }))
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
      writeStore(JSON.parse(JSON.stringify(testSeedState)))
      res.json({ ok: true })
    })
  }

  function requireSession() {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const active = sessionUser(req)
      if (!active) {
        return res.status(401).json({ error: 'auth_required' })
      }

      req.user = active.user
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
    const active = sessionUser(req)
    if (active) {
      return res.json({
        profile: publicProfile(active.user),
        authState: 'logged_in',
        residentIdentity: {
          nickname: active.user.nickname,
          roomFragment: active.user.roomFragment,
          wechatHandle: active.user.wechatHandle,
        },
      })
    }

    const deviceIdentityKey = String(req.header('x-device-identity') ?? '').trim()
    if (!deviceIdentityKey) {
      return res.json({ profile: null, authState: 'anonymous', residentIdentity: null })
    }

    const store = applyPostLifecycle(readStore())
    const resident = store.users.find((user) => user.deviceIdentityKey === deviceIdentityKey) ?? null
    if (resident) {
      const session = createSessionRecord(resident.id, deviceIdentityKey)
      updateStore((current) => ({
        ...current,
        sessions: [
          session,
          ...current.sessions.filter((item) => item.userId !== resident.id || item.deviceIdentityKey !== deviceIdentityKey),
        ],
      }))
      setSessionCookie(req, res, session.id)
      return res.json({
        profile: publicProfile(resident),
        authState: 'logged_in',
        residentIdentity: {
          nickname: resident.nickname,
          roomFragment: resident.roomFragment,
          wechatHandle: resident.wechatHandle,
        },
      })
    }

    const entryExpiresAt = entryTickets.get(deviceIdentityKey)
    if (entryExpiresAt && entryExpiresAt >= Date.now()) {
      return res.json({ profile: null, authState: 'needs_signup', residentIdentity: null })
    }

    entryTickets.delete(deviceIdentityKey)
    return res.json({ profile: null, authState: 'anonymous', residentIdentity: null })
  })

  app.put('/api/profile', (req, res) => {
    const { nickname, roomFragment, wechatHandle, pin } = req.body ?? {}
    const deviceIdentityKey = String(req.header('x-device-identity') ?? '').trim()

    if (!deviceIdentityKey) {
      return res.status(400).json({ error: 'missing_device_identity' })
    }

    if (
      !String(nickname ?? '').trim() ||
      !String(roomFragment ?? '').trim() ||
      !String(wechatHandle ?? '').trim()
    ) {
      return res.status(400).json({ error: 'invalid_profile' })
    }

    const trimmedPin = normalizeCredential(pin)
    if (trimmedPin && !/^\d{6}$/.test(trimmedPin)) {
      return res.status(400).json({ error: 'invalid_pin' })
    }

    const active = sessionUser(req)
    const current = readStore()
    const existingProfile = active?.user ?? null
    const deviceBoundResident = current.users.find((user) => user.deviceIdentityKey === deviceIdentityKey)
    const entryExpiresAt = entryTickets.get(deviceIdentityKey)

    if (!existingProfile && deviceBoundResident) {
      return res.status(401).json({ error: 'login_required' })
    }

    if (!existingProfile && (!entryExpiresAt || entryExpiresAt < Date.now())) {
      entryTickets.delete(deviceIdentityKey)
      return res.status(401).json({ error: 'building_access_required' })
    }

    const normalizedLookup = normalizeAuthLookup(String(roomFragment), String(wechatHandle))
    const duplicateResident = current.users.find(
      (user) =>
        user.id !== existingProfile?.id &&
        normalizeAuthLookup(user.roomFragment, user.wechatHandle).roomFragment === normalizedLookup.roomFragment &&
        normalizeAuthLookup(user.roomFragment, user.wechatHandle).wechatHandle === normalizedLookup.wechatHandle,
    )
    if (duplicateResident) {
      return res.status(409).json({ error: 'resident_identity_taken' })
    }

    if (!existingProfile && !trimmedPin) {
      return res.status(400).json({ error: 'pin_required' })
    }

    const nextState = updateStore((store) => {
      const existing = existingProfile ? store.users.find((user) => user.id === existingProfile.id) : undefined
      if (existing) {
        existing.nickname = String(nickname).trim()
        existing.roomFragment = String(roomFragment).trim()
        existing.wechatHandle = String(wechatHandle).trim()
        existing.deviceIdentityKey = deviceIdentityKey
        if (trimmedPin) {
          existing.pinHash = hashPin(trimmedPin)
        }
        return { ...store, users: [...store.users] }
      }

      const newUser: ResidentProfile = {
        id: `resident-${crypto.randomUUID()}`,
        nickname: String(nickname).trim(),
        roomFragment: String(roomFragment).trim(),
        wechatHandle: String(wechatHandle).trim(),
        deviceIdentityKey,
        pinHash: hashPin(trimmedPin),
      }
      const session = createSessionRecord(newUser.id, deviceIdentityKey)
      return {
        ...store,
        users: [newUser, ...store.users],
        sessions: [session, ...store.sessions],
      }
    })

    entryTickets.delete(deviceIdentityKey)

    const profile = nextState.users.find((user) => user.deviceIdentityKey === deviceIdentityKey)!
    const createdSession = nextState.sessions.find((session) => session.userId === profile.id && session.deviceIdentityKey === deviceIdentityKey)
    if (createdSession) {
      setSessionCookie(req, res, createdSession.id)
    }
    return res.json({ profile: publicProfile(profile) })
  })

  app.post('/api/auth/login', (req, res) => {
    const roomFragment = normalizeCredential(req.body?.roomFragment)
    const wechatHandle = normalizeCredential(req.body?.wechatHandle)
    const pin = normalizeCredential(req.body?.pin)
    const deviceIdentityKey = String(req.header('x-device-identity') ?? '').trim() || `device-${crypto.randomUUID()}`
    const entryExpiresAt = entryTickets.get(deviceIdentityKey)

    if (!roomFragment || !wechatHandle || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ error: 'invalid_login' })
    }

    if (!entryExpiresAt || entryExpiresAt < Date.now()) {
      entryTickets.delete(deviceIdentityKey)
      return res.status(401).json({ error: 'building_access_required' })
    }

    const current = readStore()
    const normalizedLookup = normalizeAuthLookup(roomFragment, wechatHandle)
    const resident = current.users.find((user) => {
      const userLookup = normalizeAuthLookup(user.roomFragment, user.wechatHandle)
      return userLookup.roomFragment === normalizedLookup.roomFragment && userLookup.wechatHandle === normalizedLookup.wechatHandle
    })

    if (!resident || !verifyPin(pin, resident.pinHash)) {
      return res.status(401).json({ error: 'invalid_credentials' })
    }

    const session = createSessionRecord(resident.id, deviceIdentityKey)
    updateStore((store) => ({
      ...store,
      users: store.users.map((user) =>
        user.id === resident.id
          ? {
              ...user,
              deviceIdentityKey,
            }
          : user,
      ),
      sessions: [
        session,
        ...store.sessions.filter((item) => item.userId !== resident.id || item.deviceIdentityKey !== deviceIdentityKey),
      ],
    }))

    entryTickets.delete(deviceIdentityKey)
    setSessionCookie(req, res, session.id)
    return res.json({
      profile: publicProfile({
        ...resident,
        deviceIdentityKey,
      }),
    })
  })

  app.post('/api/auth/logout', (req, res) => {
    const sessionId = parseCookieValue(req, SESSION_COOKIE)
    if (sessionId) {
      updateStore((store) => ({
        ...store,
        sessions: store.sessions.filter((item) => item.id !== sessionId),
      }))
    }
    clearSessionCookie(req, res)
    return res.json({ ok: true })
  })

  app.get('/api/posts', requireSession(), (req, res) => {
    const type = String(req.query.type ?? 'available') as 'available' | 'wanted' | 'history'
    const store = applyPostLifecycle(readStore())
    const viewerId = req.user?.id

    const items = store.posts.filter((post) => {
      if (type === 'history') return post.status === 'removed'
      if (post.status === 'removed') return false
      return post.postType === type
    })

    const payload = items
      .map((post) =>
        listView(
          req,
          post,
          store.users,
          store.postInterests.filter((interest) => interest.postId === post.id).length,
          viewerId,
        ),
      )
      .sort((left, right) => {
        const attentionRank = (post: { needsAttention?: boolean; status: string }) =>
          post.needsAttention && post.status !== 'removed' ? 0 : 1
        if (attentionRank(left) !== attentionRank(right)) return attentionRank(left) - attentionRank(right)
        const rank = (status: string) => (status === 'available' ? 0 : status === 'claimed' ? 1 : 2)
        if (rank(left.status) !== rank(right.status)) return rank(left.status) - rank(right.status)
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      })

    return res.json({ posts: payload })
  })

  app.get('/api/posts/:id', requireSession(), (req, res) => {
    const store = applyPostLifecycle(readStore())
    const post = store.posts.find((item) => item.id === req.params.id)
    if (!post) {
      return res.status(404).json({ error: 'post_not_found' })
    }

    const owner = store.users.find((user) => user.id === post.userId)
    const viewer = req.user ?? null
    const alreadyInterested = viewer
      ? store.postInterests.some((interest) => interest.postId === post.id && interest.userId === viewer.id)
      : false
    const canViewOwnerWechatHandle = viewer
      ? viewer.id === post.userId || alreadyInterested || post.claimedByUserId === viewer.id
      : false

    return res.json({
      post: {
        ...listView(
          req,
          post,
          store.users,
          store.postInterests.filter((interest) => interest.postId === post.id).length,
          viewer?.id,
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
              offerPriceCny: interest.offerPriceCny ?? null,
            }
          }),
        ownerWechatHandle: canViewOwnerWechatHandle ? owner?.wechatHandle ?? null : null,
        alreadyInterested,
      },
    })
  })

  app.get('/api/ask/threads', requireSession(), (req, res) => {
    const store = readStore()
    const limit = Math.max(1, Math.min(20, Number(req.query.limit ?? 20) || 20))

    const threads = store.questionThreads
      .filter((thread) => !thread.removedAt)
      .sort((left, right) => new Date(right.lastActivityAt).getTime() - new Date(left.lastActivityAt).getTime())
      .slice(0, limit)
      .map((thread) => threadSummary(req, thread, store.questionReplies, store.users))

    return res.json({ threads })
  })

  app.get('/api/ask/threads/:id', requireSession(), (req, res) => {
    const store = readStore()
    const thread = store.questionThreads.find((item) => item.id === req.params.id)
    if (!thread) {
      return res.status(404).json({ error: 'thread_not_found' })
    }

    const replies = store.questionReplies
      .filter((reply) => reply.threadId === thread.id)
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
      .map((reply) => ({
        id: reply.id,
        threadId: reply.threadId,
        parentReplyId: reply.parentReplyId ?? null,
        depth: reply.depth,
        body: reply.removedAt ? '该内容已删除' : reply.body,
        imageUrl: reply.removedAt ? null : absoluteUploadUrl(req, reply.imageUrl),
        author: residentIdentity(reply.userId, store.users),
        createdAt: reply.createdAt,
        isDeleted: Boolean(reply.removedAt),
        canDelete: req.user?.id === reply.userId && !reply.removedAt,
        childReplyCount: store.questionReplies.filter(
          (candidate) => candidate.parentReplyId === reply.id && !candidate.removedAt,
        ).length,
      }))

    return res.json({
      thread: {
        ...threadSummary(req, thread, store.questionReplies, store.users),
        replies,
        body: thread.removedAt ? '该内容已删除' : thread.body ?? null,
        imageUrl: thread.removedAt ? null : absoluteUploadUrl(req, thread.imageUrl),
        canDelete: req.user?.id === thread.userId && !thread.removedAt,
        isDeleted: Boolean(thread.removedAt),
      },
    })
  })

  app.post('/api/ask/threads', requireSession(), (req, res) => {
    const user = req.user!
    const title = String(req.body?.title ?? '').trim()
    const body = String(req.body?.body ?? '').trim()
    const imageUrl = String(req.body?.imageUrl ?? '').trim()
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
      imageUrl: imageUrl || undefined,
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
      thread: threadSummary(req, thread, [], readStore().users),
    })
  })

  app.post('/api/ask/threads/:id/replies', requireSession(), (req, res) => {
    const user = req.user!
    const threadId = req.params.id
    const body = String(req.body?.body ?? '').trim()
    const imageUrl = String(req.body?.imageUrl ?? '').trim()
    const parentReplyId = String(req.body?.parentReplyId ?? '').trim() || undefined

    if (!body && !imageUrl) {
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
      imageUrl: imageUrl || undefined,
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

  app.post('/api/ask/threads/:id/remove', requireSession(), (req, res) => {
    const user = req.user!
    const threadId = req.params.id
    const current = readStore()
    const thread = current.questionThreads.find((item) => item.id === threadId)

    if (!thread) {
      return res.status(404).json({ error: 'thread_not_found' })
    }

    if (thread.userId !== user.id) {
      return res.status(403).json({ error: 'not_thread_owner' })
    }

    if (thread.removedAt) {
      return res.json({ ok: true })
    }

    const now = new Date().toISOString()
    updateStore((store) => ({
      ...store,
      questionThreads: store.questionThreads.map((item) =>
        item.id === threadId
          ? {
              ...item,
              removedAt: now,
              updatedAt: now,
            }
          : item,
      ),
    }))

    return res.json({ ok: true })
  })

  app.post('/api/ask/replies/:id/remove', requireSession(), (req, res) => {
    const user = req.user!
    const replyId = req.params.id
    const current = readStore()
    const reply = current.questionReplies.find((item) => item.id === replyId)

    if (!reply) {
      return res.status(404).json({ error: 'reply_not_found' })
    }

    if (reply.userId !== user.id) {
      return res.status(403).json({ error: 'not_reply_owner' })
    }

    if (reply.removedAt) {
      return res.json({ ok: true })
    }

    const now = new Date().toISOString()
    updateStore((store) => ({
      ...store,
      questionReplies: store.questionReplies.map((item) =>
        item.id === replyId
          ? {
              ...item,
              removedAt: now,
              updatedAt: now,
            }
          : item,
      ),
      questionThreads: store.questionThreads.map((thread) =>
        thread.id === reply.threadId
          ? {
              ...thread,
              replyCount: Math.max(
                0,
                store.questionReplies.filter((item) => item.threadId === reply.threadId && !item.removedAt && item.id !== replyId)
                  .length,
              ),
              lastActivityAt: now,
              updatedAt: now,
            }
          : thread,
      ),
    }))

    return res.json({ ok: true })
  })

  app.post('/api/posts', requireSession(), (req, res) => {
    const user = req.user!
    const { postType, title, category, priceType, priceCny, description, pickupNote, imageUrl, fitMetadata } = req.body ?? {}

    if (!String(title ?? '').trim() || !String(category ?? '').trim()) {
      return res.status(400).json({ error: 'missing_required_fields' })
    }

    if (postType !== 'available' && postType !== 'wanted') {
      return res.status(400).json({ error: 'invalid_post_type' })
    }

    if (postType === 'available' && !String(imageUrl ?? '').trim()) {
      return res.status(400).json({ error: 'image_required_for_available' })
    }

    const normalizedPriceType = priceType === 'paid' ? 'paid' : 'free'
    const normalizedPriceCny = normalizedPriceType === 'paid' ? Number(priceCny) : undefined
    if (normalizedPriceType === 'paid' && (!Number.isFinite(normalizedPriceCny) || normalizedPriceCny <= 0)) {
      return res.status(400).json({ error: 'invalid_price' })
    }

    const post: PostItem = {
      id: `post-${crypto.randomUUID()}`,
      userId: user.id,
      postType,
      status: 'available',
      title: String(title).trim(),
      category: String(category).trim(),
      priceType: normalizedPriceType,
      priceCny: normalizedPriceType === 'paid' ? Math.round(normalizedPriceCny as number) : undefined,
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

  app.patch('/api/posts/:id', requireSession(), (req, res) => {
    const user = req.user!
    const postId = req.params.id
    const current = readStore()
    const existing = current.posts.find((item) => item.id === postId)

    if (!existing) {
      return res.status(404).json({ error: 'post_not_found' })
    }

    if (existing.userId !== user.id) {
      return res.status(403).json({ error: 'not_post_owner' })
    }

    if (existing.status !== 'available') {
      return res.status(400).json({ error: 'post_not_editable' })
    }

    const { title, category, priceType, priceCny, description, pickupNote, imageUrl, fitMetadata } = req.body ?? {}

    if (!String(title ?? '').trim() || !String(category ?? '').trim()) {
      return res.status(400).json({ error: 'missing_required_fields' })
    }

    const normalizedPriceType = priceType === 'paid' ? 'paid' : 'free'
    const normalizedPriceCny = normalizedPriceType === 'paid' ? Number(priceCny) : undefined
    if (normalizedPriceType === 'paid' && (!Number.isFinite(normalizedPriceCny) || normalizedPriceCny <= 0)) {
      return res.status(400).json({ error: 'invalid_price' })
    }

    const normalizedImageUrl = String(imageUrl ?? '').trim() || undefined
    if (existing.postType === 'available' && !normalizedImageUrl) {
      return res.status(400).json({ error: 'image_required_for_available' })
    }

    const updatedAt = new Date().toISOString()
    const updated = updateStore((store) => ({
      ...store,
      posts: store.posts.map((item) =>
        item.id === postId
          ? {
              ...item,
              title: String(title).trim(),
              category: String(category).trim(),
              priceType: normalizedPriceType,
              priceCny: normalizedPriceType === 'paid' ? Math.round(normalizedPriceCny as number) : undefined,
              description: String(description ?? '').trim() || undefined,
              pickupNote: String(pickupNote ?? '').trim() || undefined,
              imageUrl: normalizedImageUrl,
              fitMetadataJson: fitMetadata ?? undefined,
              updatedAt,
            }
          : item,
      ),
    }))

    return res.json({ post: updated.posts.find((item) => item.id === postId) })
  })

  app.post('/api/posts/:id/interests', requireSession(), (req, res) => {
    const user = req.user!
    const postId = req.params.id
    const rawOfferPriceCny = req.body?.offerPriceCny

    const current = readStore()
    const post = current.posts.find((item) => item.id === postId)
    if (!post || post.status !== 'available') {
      return res.status(400).json({ error: 'post_not_available' })
    }

    const normalizedOfferPriceCny =
      rawOfferPriceCny === null || rawOfferPriceCny === undefined || rawOfferPriceCny === ''
        ? undefined
        : Math.round(Number(rawOfferPriceCny))

    if (
      normalizedOfferPriceCny !== undefined &&
      (!Number.isFinite(normalizedOfferPriceCny) || normalizedOfferPriceCny <= 0)
    ) {
      return res.status(400).json({ error: 'invalid_offer_price' })
    }

    if (
      normalizedOfferPriceCny !== undefined &&
      !(post.postType === 'available' && (post.priceType ?? 'free') === 'paid')
    ) {
      return res.status(400).json({ error: 'offer_not_supported' })
    }

    const existingInterest = current.postInterests.find((interest) => interest.postId === postId && interest.userId === user.id)
    if (existingInterest) {
      const updated = updateStore((store) => ({
        ...store,
        postInterests: store.postInterests.map((interest) =>
          interest.id === existingInterest.id
            ? {
                ...interest,
                offerPriceCny: normalizedOfferPriceCny,
              }
            : interest,
        ),
      }))

      const interest = updated.postInterests.find((item) => item.id === existingInterest.id)!
      return res.json({ interest })
    }

    const interest = {
      id: `interest-${crypto.randomUUID()}`,
      postId,
      userId: user.id,
      offerPriceCny: normalizedOfferPriceCny,
      createdAt: new Date().toISOString(),
    }

    updateStore((store) => ({
      ...store,
      postInterests: [interest, ...store.postInterests],
    }))

    return res.status(201).json({ interest })
  })

  app.post('/api/posts/:id/claim', requireSession(), (req, res) => {
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

  app.post('/api/posts/:id/remove', requireSession(), (req, res) => {
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

  app.post('/api/uploads/sign', requireSession(), (req, res) => {
    const user = req.user!
    const uploadToken = crypto.randomUUID()
    uploadTickets.set(uploadToken, {
      userId: user.id,
      expiresAt: Date.now() + UPLOAD_TOKEN_TTL_MS,
    })
    const baseUrl = requestPublicBaseUrl(req)
    res.json({
      uploadUrl: baseUrl ? `${baseUrl}/api/uploads/local/${uploadToken}` : `/api/uploads/local/${uploadToken}`,
      publicBaseUrl: baseUrl ? `${baseUrl}/uploads` : '/uploads',
      uploadToken,
    })
  })

  app.put('/api/uploads/local/:token', requireSession(), upload.single('file'), (req, res) => {
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
      publicUrl: absoluteUploadUrl(req, `/uploads/${safeName}`),
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
