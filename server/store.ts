import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export type PostType = 'available' | 'wanted'
export type PostStatus = 'available' | 'claimed' | 'removed'
export type QuestionCategory = 'service' | 'appliance' | 'moving' | 'resident_experience' | 'other'

export interface ResidentProfile {
  id: string
  nickname: string
  roomFragment: string
  wechatHandle: string
  deviceIdentityKey: string
  pinHash?: string
}

export interface PostItem {
  id: string
  userId: string
  postType: PostType
  status: PostStatus
  title: string
  category: string
  priceType?: 'free' | 'paid'
  priceCny?: number
  description?: string
  pickupNote?: string
  imageUrl?: string
  fitMetadataJson?: {
    sizeNote?: string
    liftFit?: string
    twoPersonCarry?: boolean
  }
  claimedByUserId?: string
  claimedAt?: string
  removedAt?: string
  createdAt: string
  updatedAt: string
}

export interface PostInterest {
  id: string
  postId: string
  userId: string
  offerPriceCny?: number
  createdAt: string
}

export interface QuestionThread {
  id: string
  userId: string
  title: string
  body?: string
  imageUrl?: string
  category: QuestionCategory
  replyCount: number
  lastActivityAt: string
  createdAt: string
  updatedAt: string
  removedAt?: string
}

export interface QuestionReply {
  id: string
  threadId: string
  userId: string
  parentReplyId?: string
  depth: number
  body: string
  imageUrl?: string
  createdAt: string
  updatedAt: string
  removedAt?: string
}

export interface SessionRecord {
  id: string
  userId: string
  deviceIdentityKey: string
  expiresAt: string
  createdAt: string
}

export interface StoreShape {
  users: ResidentProfile[]
  posts: PostItem[]
  postInterests: PostInterest[]
  questionThreads: QuestionThread[]
  questionReplies: QuestionReply[]
  sessions: SessionRecord[]
}

function seedPinHash(pin: string, salt: string) {
  return `scrypt:${salt}:${crypto.scryptSync(pin, salt, 64).toString('hex')}`
}

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), '.context', 'data')
const DATA_FILE = path.join(DATA_DIR, 'app-state.json')

export const seedState: StoreShape = {
  users: [],
  posts: [],
  postInterests: [],
  questionThreads: [],
  questionReplies: [],
  sessions: [],
}

export const testSeedState: StoreShape = {
  users: [
    {
      id: 'resident-lin',
      nickname: '林阿姨',
      roomFragment: '12A',
      wechatHandle: 'linayi12a',
      deviceIdentityKey: 'seed-lin',
      pinHash: seedPinHash('111111', 'seed-lin'),
    },
    {
      id: 'resident-zhou',
      nickname: '周周',
      roomFragment: '05C',
      wechatHandle: 'zhouzhou05',
      deviceIdentityKey: 'seed-zhou',
      pinHash: seedPinHash('222222', 'seed-zhou'),
    },
    {
      id: 'resident-he',
      nickname: '何先生',
      roomFragment: '07B',
      wechatHandle: 'he07b',
      deviceIdentityKey: 'seed-he',
      pinHash: seedPinHash('333333', 'seed-he'),
    },
    {
      id: 'resident-ma',
      nickname: '马小姐',
      roomFragment: '16D',
      wechatHandle: 'may16d',
      deviceIdentityKey: 'seed-ma',
      pinHash: seedPinHash('444444', 'seed-ma'),
    },
    {
      id: 'resident-chen',
      nickname: '陈先生',
      roomFragment: '08F',
      wechatHandle: 'chen08f',
      deviceIdentityKey: 'seed-chen',
      pinHash: seedPinHash('555555', 'seed-chen'),
    },
  ],
  posts: [
    {
      id: 'post-1',
      userId: 'resident-lin',
      postType: 'available',
      status: 'available',
      title: '九成新书架',
      category: '家具',
      priceType: 'paid',
      priceCny: 80,
      description: '白色书架，拆开后可进电梯，今天晚上可自取。',
      pickupNote: '今晚 7 点后可取',
      imageUrl: '/sample-bookshelf.svg',
      fitMetadataJson: {
        sizeNote: '约 120cm x 80cm',
        liftFit: '可进电梯',
        twoPersonCarry: false,
      },
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'post-2',
      userId: 'resident-zhou',
      postType: 'wanted',
      status: 'available',
      title: '求 8kg 可入阳台的洗衣机',
      category: '家电',
      priceType: 'paid',
      priceCny: 600,
      description: '最好深度不要超过 55cm，本周内可搬。',
      createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'post-3',
      userId: 'resident-ma',
      postType: 'available',
      status: 'removed',
      title: '儿童学习椅',
      category: '家居',
      priceType: 'free',
      imageUrl: '/sample-chair.svg',
      claimedByUserId: 'resident-he',
      claimedAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
      removedAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 60 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    },
  ],
  postInterests: [
    {
      id: 'interest-1',
      postId: 'post-1',
      userId: 'resident-zhou',
      offerPriceCny: 70,
      createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
    {
      id: 'interest-2',
      postId: 'post-1',
      userId: 'resident-he',
      createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    },
  ],
  questionThreads: [
    {
      id: 'thread-1',
      userId: 'resident-zhou',
      title: '阳台位能放多深的洗衣机？',
      body: '新搬来，怕买错尺寸，想问下有没有邻居实测过。',
      imageUrl: '/sample-chair.svg',
      category: 'appliance',
      replyCount: 3,
      lastActivityAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    },
    {
      id: 'thread-2',
      userId: 'resident-chen',
      title: '最近有靠谱的保洁阿姨推荐吗？',
      body: '想找每周来一次的，最好是本楼有人用过的。',
      imageUrl: '/sample-bookshelf.svg',
      category: 'service',
      replyCount: 2,
      lastActivityAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    },
    {
      id: 'thread-3',
      userId: 'resident-lin',
      title: '搬家车能直接停到哪一侧门口？',
      body: '周末准备搬大件，怕停错位置堵住别人。',
      category: 'moving',
      replyCount: 1,
      lastActivityAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    },
  ],
  questionReplies: [
    {
      id: 'qreply-1',
      threadId: 'thread-1',
      userId: 'resident-he',
      depth: 1,
      body: '我家是 54cm 深，门还能正常开，55cm 以上就比较悬。',
      imageUrl: '/sample-chair.svg',
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'qreply-2',
      threadId: 'thread-1',
      userId: 'resident-zhou',
      parentReplyId: 'qreply-1',
      depth: 2,
      body: '谢谢，我看中的那台是 53.5cm，听起来还有机会。',
      createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
    {
      id: 'qreply-3',
      threadId: 'thread-1',
      userId: 'resident-ma',
      parentReplyId: 'qreply-2',
      depth: 3,
      body: '我们家也是 54cm 左右，建议预留水管位置，不然会更紧。',
      createdAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    },
    {
      id: 'qreply-4',
      threadId: 'thread-2',
      userId: 'resident-lin',
      depth: 1,
      body: '我用过陈阿姨，人比较稳，做完也会把台面收一遍。',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'qreply-5',
      threadId: 'thread-2',
      userId: 'resident-chen',
      parentReplyId: 'qreply-4',
      depth: 2,
      body: '方便的话能私信我一下微信吗？',
      createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    },
    {
      id: 'qreply-6',
      threadId: 'thread-3',
      userId: 'resident-he',
      depth: 1,
      body: '一般都是西侧门口短停，提前在群里说一声会更稳。',
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    },
  ],
  sessions: [],
}

function ensureDataFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(seedState, null, 2))
  }
}

function normalizeStore(raw: Partial<StoreShape>): { state: StoreShape; changed: boolean } {
  const state: StoreShape = {
    users: Array.isArray(raw.users) ? raw.users : [],
    posts: Array.isArray(raw.posts) ? raw.posts : [],
    postInterests: Array.isArray(raw.postInterests) ? raw.postInterests : [],
    questionThreads: Array.isArray(raw.questionThreads) ? raw.questionThreads : [],
    questionReplies: Array.isArray(raw.questionReplies) ? raw.questionReplies : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
  }

  const changed =
    !Array.isArray(raw.users) ||
    !Array.isArray(raw.posts) ||
    !Array.isArray(raw.postInterests) ||
    !Array.isArray(raw.questionThreads) ||
    !Array.isArray(raw.questionReplies) ||
    !Array.isArray(raw.sessions)

  return { state, changed }
}

export function readStore(): StoreShape {
  ensureDataFile()
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as Partial<StoreShape>
  const { state, changed } = normalizeStore(raw)
  if (changed) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2))
  }
  return state
}

export function writeStore(state: StoreShape) {
  ensureDataFile()
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2))
}

export function updateStore(updater: (state: StoreShape) => StoreShape): StoreShape {
  const current = readStore()
  const next = updater(current)
  writeStore(next)
  return next
}
