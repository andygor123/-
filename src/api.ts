import type { AskThreadDetail, AskThreadSummary, PostItem, PostType, QuestionCategory, ResidentProfile } from './types'

const DEVICE_KEY = 'building-board-device-key'

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
    await fetch('/api/entry/verify', {
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
    await fetch('/api/profile', {
      headers: getHeaders(),
    }),
  )
}

export async function saveProfile(input: Omit<ResidentProfile, 'id'>) {
  return parseJson<{ profile: ResidentProfile }>(
    await fetch('/api/profile', {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(input),
    }),
  )
}

export async function loadPosts(type: TabKeyApi) {
  return parseJson<{ posts: PostItem[] }>(
    await fetch(`/api/posts?type=${type}`, {
      headers: getHeaders(),
    }),
  )
}

export async function loadPost(id: string) {
  return parseJson<{ post: PostItem }>(
    await fetch(`/api/posts/${id}`, {
      headers: getHeaders(),
    }),
  )
}

export async function createPost(input: {
  postType: PostType
  title: string
  category: string
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
    await fetch('/api/posts', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(input),
    }),
  )
}

export async function createInterest(id: string) {
  return parseJson<{ interest: { id: string } }>(
    await fetch(`/api/posts/${id}/interests`, {
      method: 'POST',
      headers: getHeaders(),
    }),
  )
}

export async function claimPost(id: string, claimedByUserId: string) {
  return parseJson<{ post: PostItem }>(
    await fetch(`/api/posts/${id}/claim`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ claimedByUserId }),
    }),
  )
}

export async function removePost(id: string) {
  return parseJson<{ post: PostItem }>(
    await fetch(`/api/posts/${id}/remove`, {
      method: 'POST',
      headers: getHeaders(),
    }),
  )
}

export async function uploadImage(file: File) {
  const signed = await parseJson<{ uploadUrl: string; publicBaseUrl: string }>(
    await fetch('/api/uploads/sign', {
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

export type TabKeyApi = 'available' | 'wanted' | 'history'

export async function loadAskThreads(limit = 20, preview = false) {
  const params = new URLSearchParams({
    limit: String(limit),
    preview: preview ? '1' : '0',
  })

  return parseJson<{ threads: AskThreadSummary[] }>(
    await fetch(`/api/ask/threads?${params.toString()}`, {
      headers: getHeaders(),
    }),
  )
}

export async function loadAskThread(id: string) {
  return parseJson<{ thread: AskThreadDetail }>(
    await fetch(`/api/ask/threads/${id}`, {
      headers: getHeaders(),
    }),
  )
}

export async function createAskThread(input: { title: string; body?: string; category: QuestionCategory }) {
  return parseJson<{ thread: AskThreadSummary }>(
    await fetch('/api/ask/threads', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(input),
    }),
  )
}

export async function createAskReply(threadId: string, input: { body: string; parentReplyId?: string | null }) {
  return parseJson<{ reply: { id: string } }>(
    await fetch(`/api/ask/threads/${threadId}/replies`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(input),
    }),
  )
}
