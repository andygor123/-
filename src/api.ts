import type { AskThreadDetail, AskThreadSummary, PostItem, PostType, QuestionCategory, ResidentProfile } from './types'

const DEVICE_KEY = 'building-board-device-key'
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').trim()

function apiUrl(path: string) {
  if (!API_BASE_URL) return path
  return new URL(path, API_BASE_URL.endsWith('/') ? API_BASE_URL : `${API_BASE_URL}/`).toString()
}

function getHeaders() {
  const deviceIdentity = localStorage.getItem(DEVICE_KEY) ?? ''
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
  return localStorage.getItem(DEVICE_KEY) ?? ''
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
  return parseJson<{ profile: ResidentProfile | null }>(
    await fetch(apiUrl('/api/profile'), {
      headers: getHeaders(),
    }),
  )
}

export async function saveProfile(input: Omit<ResidentProfile, 'id'>) {
  return parseJson<{ profile: ResidentProfile }>(
    await fetch(apiUrl('/api/profile'), {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(input),
    }),
  )
}

export type TabKeyApi = 'available' | 'wanted' | 'history'

export async function loadPosts(type: TabKeyApi) {
  return parseJson<{ posts: PostItem[] }>(
    await fetch(apiUrl(`/api/posts?type=${type}`), {
      headers: getHeaders(),
    }),
  )
}

export async function loadPost(id: string) {
  return parseJson<{ post: PostItem }>(
    await fetch(apiUrl(`/api/posts/${id}`), {
      headers: getHeaders(),
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
      body: JSON.stringify(input),
    }),
  )
}

export async function createInterest(id: string) {
  return parseJson<{ interest: { id: string } }>(
    await fetch(apiUrl(`/api/posts/${id}/interests`), {
      method: 'POST',
      headers: getHeaders(),
    }),
  )
}

export async function claimPost(id: string, claimedByUserId: string) {
  return parseJson<{ post: PostItem }>(
    await fetch(apiUrl(`/api/posts/${id}/claim`), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ claimedByUserId }),
    }),
  )
}

export async function removePost(id: string) {
  return parseJson<{ post: PostItem }>(
    await fetch(apiUrl(`/api/posts/${id}/remove`), {
      method: 'POST',
      headers: getHeaders(),
    }),
  )
}

export async function uploadImage(file: File) {
  const signed = await parseJson<{ uploadUrl: string; publicBaseUrl: string }>(
    await fetch(apiUrl('/api/uploads/sign'), {
      method: 'POST',
      headers: getHeaders(),
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
    }),
  )
}

export async function loadAskThread(id: string) {
  return parseJson<{ thread: AskThreadDetail }>(
    await fetch(apiUrl(`/api/ask/threads/${id}`), {
      headers: getHeaders(),
    }),
  )
}

export async function createAskThread(input: { title: string; body?: string; imageUrl?: string; category: QuestionCategory }) {
  return parseJson<{ thread: AskThreadSummary }>(
    await fetch(apiUrl('/api/ask/threads'), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(input),
    }),
  )
}

export async function createAskReply(threadId: string, input: { body: string; parentReplyId?: string | null }) {
  return parseJson<{ reply: { id: string } }>(
    await fetch(apiUrl(`/api/ask/threads/${threadId}/replies`), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(input),
    }),
  )
}
