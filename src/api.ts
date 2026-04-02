import type {
  AskThreadDetail,
  AskThreadSummary,
  AuthState,
  PostItem,
  PostType,
  QuestionCategory,
  ResidentIdentityHint,
  ResidentProfile,
} from './types'

const DEVICE_KEY = 'building-board-device-key'
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').trim()

function apiUrl(path: string) {
  if (!API_BASE_URL) return path
  return new URL(path, API_BASE_URL.endsWith('/') ? API_BASE_URL : `${API_BASE_URL}/`).toString()
}

function createClientDeviceIdentity() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `device-${crypto.randomUUID()}`
  }

  const fallback = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `device-${fallback}`
}

function ensureDeviceIdentity() {
  const existing = localStorage.getItem(DEVICE_KEY)
  if (existing) return existing
  const next = createClientDeviceIdentity()
  localStorage.setItem(DEVICE_KEY, next)
  return next
}

function getHeaders() {
  const deviceIdentity = ensureDeviceIdentity()
  return {
    'Content-Type': 'application/json',
    'x-device-identity': deviceIdentity,
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error ?? 'request_failed')
  }
  return (await response.json()) as T
}

export function getDeviceIdentity() {
  return ensureDeviceIdentity()
}

export async function verifyBuildingCode(buildingCode: string) {
  const payload = await parseJson<{ ok: boolean; deviceIdentityKey: string }>(
    await fetch(apiUrl('/api/entry/verify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buildingCode,
        deviceIdentityKey: getDeviceIdentity() || undefined,
      }),
    }),
  )
  localStorage.setItem(DEVICE_KEY, payload.deviceIdentityKey)
  return payload
}

export async function loadProfile() {
  return parseJson<{ profile: ResidentProfile | null; authState: AuthState; residentIdentity: ResidentIdentityHint | null }>(
    await fetch(apiUrl('/api/profile'), {
      headers: getHeaders(),
      credentials: 'include',
    }),
  )
}

export async function saveProfile(input: Omit<ResidentProfile, 'id'> & { pin: string }) {
  return parseJson<{ profile: ResidentProfile }>(
    await fetch(apiUrl('/api/profile'), {
      method: 'PUT',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify(input),
    }),
  )
}

export async function loginWithPin(input: { roomFragment: string; wechatHandle: string; pin: string }) {
  return parseJson<{ profile: ResidentProfile }>(
    await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify(input),
    }),
  )
}

export async function logoutSession() {
  return parseJson<{ ok: boolean }>(
    await fetch(apiUrl('/api/auth/logout'), {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
    }),
  )
}

export type TabKeyApi = 'available' | 'wanted' | 'history'

export async function loadPosts(type: TabKeyApi) {
  return parseJson<{ posts: PostItem[] }>(
    await fetch(apiUrl(`/api/posts?type=${type}`), {
      headers: getHeaders(),
      credentials: 'include',
    }),
  )
}

export async function loadPost(id: string) {
  return parseJson<{ post: PostItem }>(
    await fetch(apiUrl(`/api/posts/${id}`), {
      headers: getHeaders(),
      credentials: 'include',
    }),
  )
}

export async function createPost(input: {
  postType: PostType
  title: string
  category: string
  priceType?: 'free' | 'paid'
  priceCny?: number
  description?: string
  pickupNote?: string
  imageUrl?: string
  fitMetadata?: {
    sizeNote?: string
    liftFit?: string
    twoPersonCarry?: boolean
  }
}) {
  return parseJson<{ post: PostItem }>(
    await fetch(apiUrl('/api/posts'), {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify(input),
    }),
  )
}

export async function updatePost(id: string, input: {
  title: string
  category: string
  priceType?: 'free' | 'paid'
  priceCny?: number
  description?: string
  pickupNote?: string
  imageUrl?: string
  fitMetadata?: {
    sizeNote?: string
    liftFit?: string
    twoPersonCarry?: boolean
  }
}) {
  return parseJson<{ post: PostItem }>(
    await fetch(apiUrl(`/api/posts/${id}`), {
      method: 'PATCH',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify(input),
    }),
  )
}

export async function createInterest(id: string, input?: { offerPriceCny?: number }) {
  return parseJson<{ interest: { id: string; offerPriceCny?: number | null } }>(
    await fetch(apiUrl(`/api/posts/${id}/interests`), {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify(input ?? {}),
    }),
  )
}

export async function claimPost(id: string, claimedByUserId: string) {
  return parseJson<{ post: PostItem }>(
    await fetch(apiUrl(`/api/posts/${id}/claim`), {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify({ claimedByUserId }),
    }),
  )
}

export async function removePost(id: string) {
  return parseJson<{ post: PostItem }>(
    await fetch(apiUrl(`/api/posts/${id}/remove`), {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
    }),
  )
}

export async function uploadImage(file: File) {
  const signed = await parseJson<{ uploadUrl: string; publicBaseUrl: string }>(
    await fetch(apiUrl('/api/uploads/sign'), {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
    }),
  )

  const formData = new FormData()
  formData.append('file', file)

  const uploadResult = await parseJson<{ publicUrl: string }>(
    await fetch(signed.uploadUrl, {
      method: 'PUT',
      headers: {
        'x-device-identity': getDeviceIdentity(),
      },
      credentials: 'include',
      body: formData,
    }),
  )

  return uploadResult.publicUrl
}

export async function loadAskThreads(limit = 20, preview = false) {
  const params = new URLSearchParams({
    limit: String(limit),
    preview: preview ? '1' : '0',
  })

  return parseJson<{ threads: AskThreadSummary[] }>(
    await fetch(apiUrl(`/api/ask/threads?${params.toString()}`), {
      headers: getHeaders(),
      credentials: 'include',
    }),
  )
}

export async function loadAskThread(id: string) {
  return parseJson<{ thread: AskThreadDetail }>(
    await fetch(apiUrl(`/api/ask/threads/${id}`), {
      headers: getHeaders(),
      credentials: 'include',
    }),
  )
}

export async function createAskThread(input: { title: string; body?: string; imageUrl?: string; category: QuestionCategory }) {
  return parseJson<{ thread: AskThreadSummary }>(
    await fetch(apiUrl('/api/ask/threads'), {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify(input),
    }),
  )
}

export async function createAskReply(threadId: string, input: { body: string; imageUrl?: string; parentReplyId?: string | null }) {
  return parseJson<{ reply: { id: string } }>(
    await fetch(apiUrl(`/api/ask/threads/${threadId}/replies`), {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify(input),
    }),
  )
}

export async function removeAskThread(id: string) {
  return parseJson<{ ok: boolean }>(
    await fetch(apiUrl(`/api/ask/threads/${id}/remove`), {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
    }),
  )
}

export async function removeAskReply(id: string) {
  return parseJson<{ ok: boolean }>(
    await fetch(apiUrl(`/api/ask/replies/${id}/remove`), {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
    }),
  )
}
