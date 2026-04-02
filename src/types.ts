export type TabKey = 'available' | 'wanted' | 'history'

export type PostType = 'available' | 'wanted'

export type PostStatus = 'available' | 'claimed' | 'removed'

export type QuestionCategory = 'service' | 'appliance' | 'moving' | 'resident_experience' | 'other'

export interface ResidentProfile {
  id: string
  nickname: string
  roomFragment: string
  wechatHandle: string
}

export type AuthState = 'anonymous' | 'needs_signup' | 'needs_login' | 'logged_in'

export interface ResidentIdentityHint {
  nickname: string
  roomFragment: string
  wechatHandle: string
}

export interface FitMetadata {
  sizeNote?: string
  liftFit?: string
  twoPersonCarry?: boolean
}

export interface InterestRecord {
  userId: string
  createdAt: string
}

export interface InterestedResident {
  userId: string
  nickname: string
  roomFragment: string
  createdAt?: string
  offerPriceCny?: number | null
}

export interface PostItem {
  id: string
  ownerId: string
  ownerNickname: string
  ownerRoomFragment: string
  ownerWechatHandle?: string
  postType: PostType
  status: PostStatus
  title: string
  category: string
  priceType?: 'free' | 'paid'
  priceCny?: number
  description?: string
  pickupNote?: string
  imageUrl?: string
  fitMetadata?: FitMetadata
  interestUserIds: string[]
  interestedResidents?: InterestedResident[]
  alreadyInterested?: boolean
  viewerOfferPriceCny?: number | null
  needsAttention?: boolean
  claimedByUserId?: string
  claimedAt?: string
  createdAt: string
  updatedAt: string
  removedAt?: string
}

export interface AskAuthor {
  userId: string
  nickname: string
  roomFragment: string
}

export interface AskThreadSummary {
  id: string
  title: string
  body?: string
  imageUrl?: string
  category: QuestionCategory
  author: AskAuthor
  replyCount: number
  lastActivityAt: string
  createdAt: string
  latestReplyPreview?: {
    nickname: string
    body: string
  } | null
}

export interface AskReply {
  id: string
  threadId: string
  parentReplyId?: string | null
  depth: number
  body: string
  imageUrl?: string | null
  author: AskAuthor
  createdAt: string
  childReplyCount: number
  isDeleted?: boolean
  canDelete?: boolean
}

export interface AskThreadDetail extends AskThreadSummary {
  replies: AskReply[]
  canDelete?: boolean
  isDeleted?: boolean
}
