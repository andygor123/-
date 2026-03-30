import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  createAskReply,
  createAskThread,
  claimPost as claimPostRequest,
  createInterest,
  createPost as createPostRequest,
  loadAskThread,
  loadAskThreads,
  loadPost,
  loadPosts,
  loadProfile,
  removePost,
  saveProfile,
  uploadImage,
  verifyBuildingCode,
} from './api'
import type { AskReply, AskThreadDetail, AskThreadSummary, FitMetadata, PostItem, PostType, QuestionCategory, ResidentProfile, TabKey } from './types'

type ComposerMode = PostType | null

const categoryOptions = ['家具', '家电', '家居', '母婴', '数码', '其他']
const askCategoryOptions: Array<{ value: QuestionCategory; label: string }> = [
  { value: 'appliance', label: '设备家电' },
  { value: 'moving', label: '搬家入住' },
  { value: 'service', label: '服务推荐' },
  { value: 'resident_experience', label: '住户经验' },
  { value: 'other', label: '其他' },
]

function isWeChatEmbedded() {
  if (typeof navigator === 'undefined') return false
  return /MicroMessenger/i.test(navigator.userAgent)
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function sortPosts(items: PostItem[]) {
  return [...items].sort((a, b) => {
    const statusRank = (post: PostItem) => (post.status === 'available' ? 0 : post.status === 'claimed' ? 1 : 2)
    if (statusRank(a) !== statusRank(b)) {
      return statusRank(a) - statusRank(b)
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

const emptyStateCopy: Record<TabKey, { title: string; body: string; cta: string }> = {
  available: {
    title: '本楼还没有闲置',
    body: '先发第一件闲置，让邻居知道这里不是聊天记录，而是真的能找到东西的板子。',
    cta: '发布第一件闲置',
  },
  wanted: {
    title: '还没人来求物',
    body: '如果你正在找洗衣机、书桌或小家电，可以先发一条求物，让楼里的人知道你需要什么。',
    cta: '发布求物',
  },
  history: {
    title: '完成记录会在这里出现',
    body: '有人成功交换后，会在这里留下精简记录，帮助新住户知道这个板子真的有人用。',
    cta: '去看看闲置',
  },
}

function askCategoryLabel(category: QuestionCategory) {
  return askCategoryOptions.find((option) => option.value === category)?.label ?? '其他'
}

function buildAskReplyChildren(replies: AskReply[], parentReplyId: string | null) {
  return replies.filter((reply) => (reply.parentReplyId ?? null) === parentReplyId)
}

function App() {
  const [verified, setVerified] = useState(false)
  const [profile, setProfile] = useState<ResidentProfile | null>(null)
  const [posts, setPosts] = useState<PostItem[]>([])
  const [askPreviewThreads, setAskPreviewThreads] = useState<AskThreadSummary[]>([])
  const [askThreads, setAskThreads] = useState<AskThreadSummary[]>([])
  const [showAskFeed, setShowAskFeed] = useState(false)
  const [selectedAskThread, setSelectedAskThread] = useState<AskThreadDetail | null>(null)
  const [expandedAskReplyIds, setExpandedAskReplyIds] = useState<string[]>([])
  const [replyingToReplyId, setReplyingToReplyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [buildingCode, setBuildingCode] = useState('')
  const [profileDraft, setProfileDraft] = useState<ResidentProfile>(() => ({
    id: '',
    nickname: '',
    roomFragment: '',
    wechatHandle: '',
  }))
  const [activeTab, setActiveTab] = useState<TabKey>('available')
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [showComposerPicker, setShowComposerPicker] = useState(false)
  const [composerMode, setComposerMode] = useState<ComposerMode>(null)
  const [selectedInterestedUserId, setSelectedInterestedUserId] = useState<string | null>(null)
  const [showOptionalFields, setShowOptionalFields] = useState(false)
  const [formError, setFormError] = useState('')
  const [contactNotice, setContactNotice] = useState('')
  const [detailNotice, setDetailNotice] = useState<{ tone: 'info' | 'success' | 'error'; message: string } | null>(
    null,
  )
  const [detailAction, setDetailAction] = useState<'interest' | 'claim' | 'archive' | null>(null)
  const [busy, setBusy] = useState(false)
  const [askBusy, setAskBusy] = useState(false)
  const [postDraft, setPostDraft] = useState({
    title: '',
    category: categoryOptions[0],
    description: '',
    pickupNote: '',
    imageUrl: '',
    imageFile: null as File | null,
    sizeNote: '',
    liftFit: '',
    twoPersonCarry: false,
  })
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [askThreadDraft, setAskThreadDraft] = useState({
    title: '',
    body: '',
    category: askCategoryOptions[0].value,
  })
  const [askReplyDraft, setAskReplyDraft] = useState('')

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const profileResult = await loadProfile()
        if (cancelled) return
        if (profileResult.profile) {
          setVerified(true)
          setProfile(profileResult.profile)
        }
      } catch {
        // ignore bootstrap failures; user can still enter building code
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!verified) return

    let cancelled = false
    async function fetchPosts() {
      const [postResult, askPreviewResult] = await Promise.all([
        loadPosts(activeTab),
        loadAskThreads(3, true),
      ])
      if (!cancelled) {
        setPosts(postResult.posts)
        setAskPreviewThreads(askPreviewResult.threads)
      }
    }

    void fetchPosts()
    return () => {
      cancelled = true
    }
  }, [activeTab, verified])

  const currentProfile = profile

  const visiblePosts = useMemo(() => {
    if (activeTab === 'history') {
      return sortPosts(posts.filter((post) => post.status === 'removed'))
    }

    return sortPosts(
      posts.filter((post) => {
        if (post.status === 'removed') return false
        return post.postType === activeTab
      }),
    )
  }, [activeTab, posts])

  const selectedPost = useMemo(
    () => posts.find((post) => post.id === selectedPostId) ?? null,
    [selectedPostId, posts],
  )
  const selectedAskTopReplies = useMemo(
    () => (selectedAskThread ? buildAskReplyChildren(selectedAskThread.replies, null) : []),
    [selectedAskThread],
  )
  const currentReplyTarget = useMemo(
    () =>
      replyingToReplyId && selectedAskThread
        ? selectedAskThread.replies.find((reply) => reply.id === replyingToReplyId) ?? null
        : null,
    [replyingToReplyId, selectedAskThread],
  )

  async function refreshPosts(nextTab = activeTab) {
    const [result, askPreviewResult] = await Promise.all([
      loadPosts(nextTab),
      loadAskThreads(3, true),
    ])
    setPosts(result.posts)
    setAskPreviewThreads(askPreviewResult.threads)
  }

  async function handleVerifyBuildingCode(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await verifyBuildingCode(buildingCode.trim())
      setFormError('')
      setVerified(true)
    } catch {
      setFormError('楼栋邀请码不正确，请向微信群里确认后再试。')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveProfile(event: FormEvent) {
    event.preventDefault()
    if (!profileDraft.nickname.trim() || !profileDraft.roomFragment.trim() || !profileDraft.wechatHandle.trim()) {
      setFormError('请先填写昵称、房号后缀和微信号。')
      return
    }

    setBusy(true)
    try {
      const result = await saveProfile({
        nickname: profileDraft.nickname.trim(),
        roomFragment: profileDraft.roomFragment.trim(),
        wechatHandle: profileDraft.wechatHandle.trim(),
      })
      setProfile(result.profile)
      await refreshPosts(activeTab)
      setFormError('')
    } catch {
      setFormError('资料保存失败，请稍后再试。')
    } finally {
      setBusy(false)
    }
  }

  function resetComposer() {
    setShowComposerPicker(false)
    setComposerMode(null)
    setShowOptionalFields(false)
    setFormError('')
    setPostDraft({
      title: '',
      category: categoryOptions[0],
      description: '',
      pickupNote: '',
      imageUrl: '',
      imageFile: null,
      sizeNote: '',
      liftFit: '',
      twoPersonCarry: false,
    })
    setImagePreviewUrl(null)
  }

  function openComposer(type: PostType) {
    setShowComposerPicker(false)
    setComposerMode(type)
    setFormError('')
  }

  async function createPost(event: FormEvent) {
    event.preventDefault()
    if (!currentProfile || !composerMode) return
    if (!postDraft.title.trim()) {
      setFormError('请填写标题。')
      return
    }
    if (!postDraft.category.trim()) {
      setFormError('请选择分类。')
      return
    }
    if (composerMode === 'available' && !postDraft.imageFile && !postDraft.imageUrl.trim()) {
      setFormError('发布闲置时需要一张图片。')
      return
    }

    const fitMetadata: FitMetadata = {}
    if (postDraft.sizeNote.trim()) fitMetadata.sizeNote = postDraft.sizeNote.trim()
    if (postDraft.liftFit.trim()) fitMetadata.liftFit = postDraft.liftFit.trim()
    if (postDraft.twoPersonCarry) fitMetadata.twoPersonCarry = true

    setBusy(true)
    try {
      let imageUrl = postDraft.imageUrl.trim() || undefined
      if (composerMode === 'available' && postDraft.imageFile) {
        imageUrl = await uploadImage(postDraft.imageFile)
      }

      await createPostRequest({
        postType: composerMode,
        title: postDraft.title.trim(),
        category: postDraft.category,
        description: postDraft.description.trim() || undefined,
        pickupNote: postDraft.pickupNote.trim() || undefined,
        imageUrl,
        fitMetadata: Object.keys(fitMetadata).length > 0 ? fitMetadata : undefined,
      })

      setActiveTab(composerMode)
      await refreshPosts(composerMode)
      resetComposer()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '发布失败，请稍后再试。')
    } finally {
      setBusy(false)
    }
  }

  async function markInterested(postId: string) {
    if (!currentProfile) return
    setDetailAction('interest')
    setDetailNotice({ tone: 'info', message: '正在提交你的意向…' })
    try {
      await createInterest(postId)
      await refreshPosts()
      if (selectedPostId === postId) {
        const result = await loadPost(postId)
        setPosts((current) => current.map((post) => (post.id === postId ? result.post : post)))
      }
      setDetailNotice({ tone: 'success', message: '已记录你的意向。现在可以继续用微信联系对方。' })
    } catch (error) {
      setDetailNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : '操作失败，请稍后再试。',
      })
    } finally {
      setDetailAction(null)
    }
  }

  async function claimPost(postId: string) {
    if (!currentProfile) return
    if (!selectedInterestedUserId) {
      setDetailNotice({ tone: 'error', message: '请先选择要确认的邻居。' })
      return
    }

    const selectedResident = selectedPost?.interestedResidents?.find((resident) => resident.userId === selectedInterestedUserId)
    setDetailAction('claim')
    setDetailNotice({ tone: 'info', message: '正在确认认领…' })
    try {
      await claimPostRequest(postId, selectedInterestedUserId)
      const [detail, list] = await Promise.all([loadPost(postId), loadPosts(activeTab)])
      setPosts(list.posts.map((post) => (post.id === postId ? detail.post : post)))
      setSelectedInterestedUserId(null)
      setDetailNotice({
        tone: 'success',
        message: selectedResident
          ? `已确认给 ${selectedResident.nickname}。下一步可以移入完成记录。`
          : '已确认认领。下一步可以移入完成记录。',
      })
    } catch (error) {
      setDetailNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : '确认认领失败，请稍后再试。',
      })
    } finally {
      setDetailAction(null)
    }
  }

  async function moveToHistory(postId: string) {
    if (!currentProfile) return
    setDetailAction('archive')
    setDetailNotice({ tone: 'info', message: '正在移入完成记录…' })
    try {
      await removePost(postId)
      setActiveTab('history')
      await refreshPosts('history')
      setSelectedPostId(null)
    } catch (error) {
      setDetailNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : '移入完成记录失败，请稍后再试。',
      })
    } finally {
      setDetailAction(null)
    }
  }

  async function openAskFeed() {
    setAskBusy(true)
    try {
      const result = await loadAskThreads()
      setAskThreads(result.threads)
      setShowAskFeed(true)
      setFormError('')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '邻居问问加载失败，请稍后再试。')
    } finally {
      setAskBusy(false)
    }
  }

  async function openAskThread(threadId: string) {
    setAskBusy(true)
    try {
      const result = await loadAskThread(threadId)
      setSelectedAskThread(result.thread)
      setReplyingToReplyId(null)
      setAskReplyDraft('')
      setExpandedAskReplyIds([])
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '帖子打开失败，请稍后再试。')
    } finally {
      setAskBusy(false)
    }
  }

  async function submitAskThread(event: FormEvent) {
    event.preventDefault()
    if (!askThreadDraft.title.trim()) {
      setFormError('请先写下你想问的问题。')
      return
    }

    setAskBusy(true)
    try {
      await createAskThread({
        title: askThreadDraft.title.trim(),
        body: askThreadDraft.body.trim() || undefined,
        category: askThreadDraft.category,
      })
      setAskThreadDraft({
        title: '',
        body: '',
        category: askCategoryOptions[0].value,
      })
      const [list, preview] = await Promise.all([loadAskThreads(), loadAskThreads(3, true)])
      setAskThreads(list.threads)
      setAskPreviewThreads(preview.threads)
      setDetailNotice({ tone: 'success', message: '问题已发出，楼里的邻居现在能看到了。' })
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '发起提问失败，请稍后再试。')
    } finally {
      setAskBusy(false)
    }
  }

  async function submitAskReply(event: FormEvent) {
    event.preventDefault()
    if (!selectedAskThread) return
    if (!askReplyDraft.trim()) {
      setFormError('请先写一点你想补充的内容。')
      return
    }

    setAskBusy(true)
    try {
      await createAskReply(selectedAskThread.id, {
        body: askReplyDraft.trim(),
        parentReplyId: replyingToReplyId,
      })
      const [detail, list, preview] = await Promise.all([
        loadAskThread(selectedAskThread.id),
        loadAskThreads(),
        loadAskThreads(3, true),
      ])
      setSelectedAskThread(detail.thread)
      setAskThreads(list.threads)
      setAskPreviewThreads(preview.threads)
      setAskReplyDraft('')
      setReplyingToReplyId(null)
      setDetailNotice({ tone: 'success', message: '已補充到這條討論裡。' })
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '补充失败，请稍后再试。')
    } finally {
      setAskBusy(false)
    }
  }

  function toggleAskReplyCollapse(replyId: string) {
    setExpandedAskReplyIds((current) =>
      current.includes(replyId) ? current.filter((item) => item !== replyId) : [...current, replyId],
    )
  }

  async function handleContactOwner(wechatHandle: string) {
    const trimmedHandle = wechatHandle.trim()
    if (!trimmedHandle) return

    const copied = typeof navigator !== 'undefined' && navigator.clipboard?.writeText
      ? await navigator.clipboard.writeText(trimmedHandle).then(() => true).catch(() => false)
      : false

    setContactNotice(
      isWeChatEmbedded()
        ? copied
          ? `已复制对方微信号：${trimmedHandle}。请回到微信主界面，搜索或添加对方。`
          : `请手动复制对方微信号：${trimmedHandle}，再回到微信主界面添加对方。`
        : copied
          ? `已复制对方微信号：${trimmedHandle}。现在可到微信里搜索或添加。`
          : `请手动复制对方微信号：${trimmedHandle}，再到微信里搜索或添加。`,
    )
  }

  useEffect(() => {
    if (!selectedPostId) return
    setContactNotice('')
    setDetailNotice(null)
    void loadPost(selectedPostId).then((result) => {
      setPosts((current) => current.map((post) => (post.id === selectedPostId ? result.post : post)))
    })
  }, [selectedPostId])

  useEffect(() => {
    if (!detailNotice) return

    const timeoutId = window.setTimeout(() => {
      setDetailNotice((current) => (current === detailNotice ? null : current))
    }, 2800)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [detailNotice])

  useEffect(() => {
    if (!postDraft.imageFile) {
      setImagePreviewUrl(null)
      return
    }

    const nextPreviewUrl = URL.createObjectURL(postDraft.imageFile)
    setImagePreviewUrl(nextPreviewUrl)

    return () => {
      URL.revokeObjectURL(nextPreviewUrl)
    }
  }, [postDraft.imageFile])

  useEffect(() => {
    if (!selectedPost?.interestedResidents?.length) {
      setSelectedInterestedUserId(null)
      return
    }

    if (
      selectedInterestedUserId &&
      selectedPost.interestedResidents.some((resident) => resident.userId === selectedInterestedUserId)
    ) {
      return
    }

    setSelectedInterestedUserId(selectedPost.interestedResidents[0].userId)
  }, [selectedInterestedUserId, selectedPost])

  function renderAskReply(reply: AskReply) {
    const children = selectedAskThread ? buildAskReplyChildren(selectedAskThread.replies, reply.id) : []
    const shouldCollapseChildren = reply.depth >= 2
    const childrenExpanded = expandedAskReplyIds.includes(reply.id)
    const firstChild = children[0]

    return (
      <div key={reply.id} className={`ask-reply depth-${reply.depth}`}>
        <div className="ask-reply-meta">
          <strong>{reply.author.nickname}</strong>
          <span>{reply.author.roomFragment}</span>
          <span>{formatTime(reply.createdAt)}</span>
        </div>
        <p>{reply.body}</p>
        <div className="ask-reply-actions">
          {reply.depth < 3 ? (
            <button
              type="button"
              className="ghost-button ask-inline-button"
              onClick={() => setReplyingToReplyId(reply.id)}
            >
              回复TA
            </button>
          ) : null}
          {children.length > 0 && shouldCollapseChildren ? (
            <button
              type="button"
              className="ghost-button ask-inline-button ask-collapse-button"
              onClick={() => toggleAskReplyCollapse(reply.id)}
            >
              <span>{childrenExpanded ? '收起回复' : `展开 ${children.length} 条回复`}</span>
              {!childrenExpanded && firstChild ? (
                <small>
                  {firstChild.author.nickname}：{firstChild.body}
                </small>
              ) : null}
            </button>
          ) : null}
        </div>
        {children.length > 0 ? (
          <div className="ask-reply-children">
            {(shouldCollapseChildren && !childrenExpanded ? children.slice(0, 1) : children).map((child) =>
              renderAskReply(child),
            )}
          </div>
        ) : null}
      </div>
    )
  }

  if (loading) {
    return (
      <main className="gate-shell">
        <section className="gate-card">
          <span className="eyebrow">加载中</span>
          <h1>正在打开楼里换物板</h1>
        </section>
      </main>
    )
  }

  if (!verified) {
    return (
      <main className="gate-shell">
        <section className="gate-card">
          <span className="eyebrow">深圳住户专用</span>
          <h1>楼里换物板</h1>
          <p>
            把微信群里会沉底的闲置、求物和完成记录，整理成一眼看清的楼内板子。
          </p>
          <form onSubmit={handleVerifyBuildingCode} className="stack">
            <label>
              <span>请输入楼栋邀请码</span>
              <input
                value={buildingCode}
                onChange={(event) => setBuildingCode(event.target.value)}
                placeholder="例如：SZHOME"
              />
            </label>
            {formError ? <p className="error-text">{formError}</p> : null}
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? '进入中…' : '进入本楼'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  if (!currentProfile) {
    return (
      <main className="gate-shell">
        <section className="gate-card">
          <span className="eyebrow">只需一次</span>
          <h1>先补一个轻量身份</h1>
          <p>我们不会做重验证，但至少需要让邻居知道怎么称呼你、怎么在微信里找到你。</p>
          <form onSubmit={handleSaveProfile} className="stack">
            <label>
              <span>昵称</span>
              <input
                value={profileDraft.nickname}
                onChange={(event) => setProfileDraft((current) => ({ ...current, nickname: event.target.value }))}
                placeholder="例如：阿May"
              />
            </label>
            <label>
              <span>房号后缀</span>
              <input
                value={profileDraft.roomFragment}
                onChange={(event) => setProfileDraft((current) => ({ ...current, roomFragment: event.target.value }))}
                placeholder="例如：12A"
              />
            </label>
            <label>
              <span>微信号</span>
              <input
                value={profileDraft.wechatHandle}
                onChange={(event) => setProfileDraft((current) => ({ ...current, wechatHandle: event.target.value }))}
                placeholder="例如：may12a"
              />
            </label>
            {formError ? <p className="error-text">{formError}</p> : null}
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? '保存中…' : '保存并继续'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-copy">
          <span className="eyebrow">同栋楼 · 微信内 H5</span>
          <h1>楼里换物板</h1>
          <p className="topbar-subtitle">把会沉底的闲置和求物，整理成一眼能扫完的楼内板。</p>
        </div>
        <button className="ghost-button profile-chip" onClick={() => setSelectedPostId(null)}>
          {currentProfile.nickname} · {currentProfile.roomFragment}
        </button>
      </header>

      <section className="hero-card">
        <div>
          <h2>先看现在有什么，再决定要不要发。</h2>
          <p>默认看闲置，求物单独一栏，完成记录轻量保留。</p>
        </div>
        <div className="hero-highlights" aria-label="楼内信息提示">
          <span>微信群会沉底</span>
          <span>这里能一眼看清</span>
          <span>适合手机内快速扫完</span>
        </div>
        <div className="hero-metrics">
          <div>
            <strong>{posts.filter((post) => post.postType === 'available' && post.status !== 'removed').length}</strong>
            <span>当前闲置</span>
          </div>
          <div>
            <strong>{posts.filter((post) => post.postType === 'wanted' && post.status !== 'removed').length}</strong>
            <span>求物中</span>
          </div>
          <div>
            <strong>{posts.filter((post) => post.status === 'removed').length}</strong>
            <span>已完成</span>
          </div>
        </div>
      </section>

      <nav className="tabbar">
        <button className={activeTab === 'available' ? 'tab active' : 'tab'} onClick={() => setActiveTab('available')}>
          闲置
        </button>
        <button className={activeTab === 'wanted' ? 'tab active' : 'tab'} onClick={() => setActiveTab('wanted')}>
          求物
        </button>
        <button className={activeTab === 'history' ? 'tab active' : 'tab'} onClick={() => setActiveTab('history')}>
          完成记录
        </button>
      </nav>

      {visiblePosts.length === 0 ? (
        <section className="empty-card">
          <h3>{emptyStateCopy[activeTab].title}</h3>
          <p>{emptyStateCopy[activeTab].body}</p>
          <button
            className="primary-button"
            onClick={() => {
              if (activeTab === 'history') {
                setActiveTab('available')
                return
              }
              openComposer(activeTab === 'available' ? 'available' : 'wanted')
            }}
          >
            {emptyStateCopy[activeTab].cta}
          </button>
        </section>
      ) : (
        <section className="post-list">
          <div className="section-hint">
            {activeTab === 'available'
              ? '优先看现在还能联系和拿走的东西'
              : activeTab === 'wanted'
                ? '这里是邻居正在找的东西'
                : '这里只保留轻量完成记录'}
          </div>
          {visiblePosts.map((post) => (
            <article
              key={post.id}
              className={post.postType === 'wanted' ? 'post-card wanted' : 'post-card'}
              onClick={() => setSelectedPostId(post.id)}
            >
              {post.postType === 'available' ? (
                <img className="post-image" src={post.imageUrl} alt={post.title} />
              ) : (
                <div className="wanted-badge-panel">
                  <span>求</span>
                  <strong>{post.category}</strong>
                  <small>看看谁能帮上忙</small>
                </div>
              )}
              <div className="post-content">
                <div className="post-topline">
                  <span className="category-pill">{post.category}</span>
                  <span className={`status-pill ${post.status}`}>{post.status === 'available' ? '可联系' : post.status === 'claimed' ? '已认领' : '已完成'}</span>
                </div>
                <h3>{post.title}</h3>
                <p className="muted-line">{post.pickupNote || post.description || '点击查看详情和联系信息'}</p>
                <div className="post-meta-strip">
                  <span>{formatTime(post.createdAt)}</span>
                  <span>{post.postType === 'available' ? '楼内可直接联系' : '让邻居先知道你的需求'}</span>
                </div>
                <div className="post-footer">
                  <span>{post.ownerNickname} · {post.ownerRoomFragment}</span>
                  {post.status !== 'removed' ? <span>{post.interestUserIds.length} 人感兴趣</span> : <span>{formatTime(post.removedAt || post.updatedAt)}</span>}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {activeTab === 'available' ? (
        <section className="ask-preview-section">
          <div className="ask-preview-head">
            <div>
              <span className="eyebrow">邻居问问</span>
              <h3>楼里的问题，也别再沉到底下。</h3>
              <p>洗衣机尺寸、搬家停车、保洁推荐，这里先看最近大家在问什么。</p>
            </div>
            <button className="ghost-button" onClick={() => void openAskFeed()}>
              去问问
            </button>
          </div>
          <div className="ask-preview-list">
            {askPreviewThreads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className="ask-preview-card"
                onClick={() => void openAskFeed().then(() => openAskThread(thread.id))}
              >
                <div className="ask-preview-topline">
                  <span className="category-pill ask-category-pill">{askCategoryLabel(thread.category)}</span>
                  <span>{thread.replyCount} 条回复</span>
                </div>
                <strong>{thread.title}</strong>
                <div className="ask-preview-meta">
                  <span>{thread.author.nickname}</span>
                  <span>{formatTime(thread.lastActivityAt)}</span>
                </div>
                <span className="ask-card-entry">点进看看</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <button className="fab" onClick={() => setShowComposerPicker(true)}>
        发布
      </button>

      {showComposerPicker && !composerMode ? (
        <div className="overlay" onClick={() => setShowComposerPicker(false)}>
          <section className="composer-picker-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" aria-hidden="true" />
            <div className="composer-picker-header">
              <span className="eyebrow">发布入口</span>
              <h3>你现在想发什么？</h3>
              <p>先选入口，后面表单会按场景调整语气和提示。</p>
            </div>
            <div className="composer-picker-grid">
              <button className="composer-choice available" onClick={() => openComposer('available')}>
                <span className="choice-badge">闲置</span>
                <strong>发布闲置</strong>
                <p>适合发家具、电器、家居用品。重点是图片、现况和取货时间。</p>
              </button>
              <button className="composer-choice wanted" onClick={() => openComposer('wanted')}>
                <span className="choice-badge">求物</span>
                <strong>发布求物</strong>
                <p>适合请邻居帮忙留意某件东西。重点是需求、条件和方便联系的时间。</p>
              </button>
            </div>
            <button className="ghost-button picker-close" onClick={() => setShowComposerPicker(false)}>
              先不发，继续看看
            </button>
          </section>
        </div>
      ) : null}

      {composerMode ? (
        <div className="overlay" onClick={resetComposer}>
          <section className="composer-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" aria-hidden="true" />
            <div className="composer-header">
              <h3>{composerMode === 'available' ? '发布闲置' : '发布求物'}</h3>
              <button className="ghost-button" onClick={resetComposer}>关闭</button>
            </div>
            <div className="composer-switch">
              <button className={composerMode === 'available' ? 'switch active' : 'switch'} onClick={() => setComposerMode('available')}>
                发布闲置
              </button>
              <button className={composerMode === 'wanted' ? 'switch active' : 'switch'} onClick={() => setComposerMode('wanted')}>
                发布求物
              </button>
            </div>
            <form onSubmit={createPost} className="stack">
              {composerMode === 'wanted' ? (
                <div className="composer-intro wanted-intro">
                  <strong>把需求写清楚一点，邻居才更容易接上你。</strong>
                  <p>重点说你在找什么、最好什么条件、什么时候方便联系，不用像发闲置那样先准备照片。</p>
                </div>
              ) : null}
              {composerMode === 'wanted' ? (
                <div className="wanted-form-rail">
                  <span>先写核心需求</span>
                  <span>再补条件</span>
                  <span>最后留好联系时间</span>
                </div>
              ) : null}
              <label>
                <span>{composerMode === 'available' ? '标题' : '你想找什么'}</span>
                <input
                  value={postDraft.title}
                  onChange={(event) => setPostDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder={composerMode === 'available' ? '例如：九成新办公椅' : '例如：求一台 8kg 洗衣机'}
                />
              </label>
              <label>
                <span>{composerMode === 'available' ? '分类' : '需求分类'}</span>
                <select
                  value={postDraft.category}
                  onChange={(event) => setPostDraft((current) => ({ ...current, category: event.target.value }))}
                >
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
              {composerMode === 'available' ? (
                <label className="upload-field">
                  <span>上传图片</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      setPostDraft((current) => ({
                        ...current,
                        imageFile: event.target.files?.[0] ?? null,
                        imageUrl: event.target.files?.[0]?.name ?? '',
                      }))
                    }
                  />
                  <span className="field-note">建议竖图或近方图，微信里浏览会更清楚。</span>
                  {imagePreviewUrl ? (
                    <div className="upload-preview-card">
                      <img src={imagePreviewUrl} alt="预览图片" className="upload-preview-image" />
                      <div className="upload-preview-meta">
                        <strong>{postDraft.imageFile?.name}</strong>
                        <span>
                          {postDraft.imageFile
                            ? `${Math.max(1, Math.round(postDraft.imageFile.size / 1024))} KB`
                            : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          setPostDraft((current) => ({
                            ...current,
                            imageFile: null,
                            imageUrl: '',
                          }))
                        }}
                      >
                        重新选择
                      </button>
                    </div>
                  ) : (
                    <div className="upload-placeholder">
                      <strong>先选一张清楚的实拍图</strong>
                      <span>住户在手机里会先看图，再决定要不要点进详情。</span>
                    </div>
                  )}
                </label>
              ) : null}
              <div className={composerMode === 'wanted' ? 'form-section wanted-form-section' : 'form-section'}>
                <div className="form-section-head">
                  <strong>{composerMode === 'available' ? '补充信息' : '把需求讲得更具体一点'}</strong>
                  <span>
                    {composerMode === 'available'
                      ? '让邻居少问几句就能决定要不要联系。'
                      : '例如尺寸、放置位置、希望的型号，越具体越容易有人回应。'}
                  </span>
                </div>
                <label>
                  <span>{composerMode === 'available' ? '补充说明' : '需求说明（选填）'}</span>
                  <textarea
                    value={postDraft.description}
                    onChange={(event) => setPostDraft((current) => ({ ...current, description: event.target.value }))}
                    placeholder={composerMode === 'available' ? '例如：有轻微划痕，今晚可取' : '例如：深度最好不要超过 55cm，最好能放进阳台位'}
                  />
                </label>
                <label>
                  <span>{composerMode === 'available' ? '取货备注（选填）' : '联系时间 / 搬运时间（选填）'}</span>
                  <input
                    value={postDraft.pickupNote}
                    onChange={(event) => setPostDraft((current) => ({ ...current, pickupNote: event.target.value }))}
                    placeholder={composerMode === 'available' ? '例如：今晚 7 点后' : '例如：这周下班后都可以聊，周末可搬'}
                  />
                </label>
              </div>
              <button
                className="ghost-button expand-button"
                type="button"
                onClick={() => setShowOptionalFields((current) => !current)}
              >
                {showOptionalFields
                  ? '收起可选细节'
                  : composerMode === 'available'
                    ? '补充尺寸 / 电梯 / 搬运信息'
                    : '补充尺寸 / 电梯 / 其他条件'}
              </button>
              {showOptionalFields ? (
                <div className={composerMode === 'wanted' ? 'optional-grid wanted-optional-grid' : 'optional-grid'}>
                  <label>
                    <span>{composerMode === 'available' ? '尺寸备注' : '尺寸条件'}</span>
                    <input
                      value={postDraft.sizeNote}
                      onChange={(event) => setPostDraft((current) => ({ ...current, sizeNote: event.target.value }))}
                      placeholder={composerMode === 'available' ? '例如：120 x 80cm' : '例如：深度最好不要超过 55cm'}
                    />
                  </label>
                  <label>
                    <span>{composerMode === 'available' ? '电梯适配' : '楼内条件'}</span>
                    <input
                      value={postDraft.liftFit}
                      onChange={(event) => setPostDraft((current) => ({ ...current, liftFit: event.target.value }))}
                      placeholder={composerMode === 'available' ? '例如：可进电梯' : '例如：最好能进阳台位'}
                    />
                  </label>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={postDraft.twoPersonCarry}
                      onChange={(event) => setPostDraft((current) => ({ ...current, twoPersonCarry: event.target.checked }))}
                    />
                    <span>{composerMode === 'available' ? '需要两个人搬' : '我这边搬运会比较吃力'}</span>
                  </label>
                </div>
              ) : null}
              {formError ? <p className="error-text">{formError}</p> : null}
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? '提交中…' : composerMode === 'available' ? '发布闲置' : '发布求物'}
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {showAskFeed ? (
        <div
          className="overlay"
          onClick={() => {
            setShowAskFeed(false)
            setSelectedAskThread(null)
            setReplyingToReplyId(null)
            setAskReplyDraft('')
          }}
        >
          <section className="detail-sheet ask-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" aria-hidden="true" />
            <div className="composer-header">
              <div>
                <span className="eyebrow">邻居问问</span>
                <h3>{selectedAskThread ? selectedAskThread.title : '楼里最近在问什么'}</h3>
              </div>
              <button
                className="ghost-button"
                onClick={() => {
                  if (selectedAskThread) {
                    setSelectedAskThread(null)
                    return
                  }
                  setShowAskFeed(false)
                }}
              >
                {selectedAskThread ? '返回' : '关闭'}
              </button>
            </div>

            {!selectedAskThread ? (
              <>
                <div className="ask-feed-intro">
                  <strong>比 FAQ 活一点，但只聊楼里真会反复问的事情。</strong>
                  <p>这里优先看最近有更新的话题，适合快速知道现在大家在讨论什么。</p>
                </div>
                <form className="stack ask-thread-form" onSubmit={submitAskThread}>
                  <label>
                    <span>我也想问</span>
                    <input
                      value={askThreadDraft.title}
                      onChange={(event) => setAskThreadDraft((current) => ({ ...current, title: event.target.value }))}
                      placeholder="例如：阳台位能放多深的洗衣机？"
                    />
                  </label>
                  <label>
                    <span>问题分类</span>
                    <select
                      value={askThreadDraft.category}
                      onChange={(event) =>
                        setAskThreadDraft((current) => ({
                          ...current,
                          category: event.target.value as QuestionCategory,
                        }))
                      }
                    >
                      {askCategoryOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>补充说明（选填）</span>
                    <textarea
                      value={askThreadDraft.body}
                      onChange={(event) => setAskThreadDraft((current) => ({ ...current, body: event.target.value }))}
                      placeholder="例如：新搬来，怕买错尺寸，也想知道有没有人实测过。"
                    />
                  </label>
                  <button className="primary-button" type="submit" disabled={askBusy}>
                    {askBusy ? '发出中…' : '我也想问'}
                  </button>
                </form>

                <div className="ask-feed-list">
                  {askThreads.map((thread) => (
                    <button
                      key={thread.id}
                      type="button"
                      className="ask-feed-card"
                      onClick={() => void openAskThread(thread.id)}
                    >
                      <div className="ask-preview-topline">
                        <span className="category-pill ask-category-pill">{askCategoryLabel(thread.category)}</span>
                        <span>{thread.replyCount} 条回复</span>
                      </div>
                      <strong>{thread.title}</strong>
                      {thread.body ? <p>{thread.body}</p> : null}
                      <div className="ask-preview-meta">
                        <span>{thread.author.nickname} · {thread.author.roomFragment}</span>
                        <span>{formatTime(thread.lastActivityAt)}</span>
                      </div>
                      <span className="ask-card-entry">查看讨论</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="ask-thread-detail">
                <div className="ask-thread-header">
                  <span className="category-pill ask-category-pill">{askCategoryLabel(selectedAskThread.category)}</span>
                  <div className="ask-thread-meta">
                    <span>{selectedAskThread.author.nickname} · {selectedAskThread.author.roomFragment}</span>
                    <span>{selectedAskThread.replyCount} 条回复</span>
                    <span>{formatTime(selectedAskThread.lastActivityAt)}</span>
                  </div>
                  {selectedAskThread.body ? <p>{selectedAskThread.body}</p> : null}
                </div>

                <div className="ask-reply-list">
                  {selectedAskTopReplies.map((reply) => renderAskReply(reply))}
                </div>

                <form className="stack ask-reply-form" onSubmit={submitAskReply}>
                  <div className="ask-reply-head">
                    <strong>{replyingToReplyId ? '我来补充这条回复' : '我来补充'}</strong>
                    {replyingToReplyId ? (
                      <button type="button" className="ghost-button ask-inline-button" onClick={() => setReplyingToReplyId(null)}>
                        改为回复主帖
                      </button>
                    ) : null}
                  </div>
                  {currentReplyTarget ? (
                    <div className="ask-reply-target">
                      <span>正在回复</span>
                      <strong>{currentReplyTarget.author.nickname}</strong>
                      <p>{currentReplyTarget.body}</p>
                    </div>
                  ) : null}
                  <textarea
                    value={askReplyDraft}
                    onChange={(event) => setAskReplyDraft(event.target.value)}
                    placeholder={replyingToReplyId ? '补充你对这条回复的看法…' : '把你的实测、经验或建议补进来…'}
                  />
                  <button className="primary-button" type="submit" disabled={askBusy}>
                    {askBusy ? '提交中…' : replyingToReplyId ? '我来补充' : '回复这个问题'}
                  </button>
                </form>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {selectedPost ? (
        <div className="overlay" onClick={() => setSelectedPostId(null)}>
          <section className="detail-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" aria-hidden="true" />
            <div className="composer-header">
              <div>
                <span className="eyebrow">{selectedPost.postType === 'available' ? '闲置详情' : '求物详情'}</span>
                <h3>{selectedPost.title}</h3>
              </div>
              <button className="ghost-button" onClick={() => setSelectedPostId(null)}>关闭</button>
            </div>
            {selectedPost.postType === 'wanted' ? (
              <div className="wanted-detail-hero">
                <div className="wanted-detail-mark">求</div>
                <div>
                  <strong>这位邻居正在找：{selectedPost.category}</strong>
                  <p>如果你家里正好有合适的东西，或者知道谁可能有，现在就是最适合搭话的时候。</p>
                </div>
              </div>
            ) : null}
            {selectedPost.imageUrl ? <img className="detail-image" src={selectedPost.imageUrl} alt={selectedPost.title} /> : null}
            <div className="detail-meta">
              <span className="category-pill">{selectedPost.category}</span>
              <span className={`status-pill ${selectedPost.status}`}>{selectedPost.status === 'available' ? '可联系' : selectedPost.status === 'claimed' ? '已认领' : '已完成'}</span>
              <span>{selectedPost.interestUserIds.length} 人感兴趣</span>
            </div>
            <div className="detail-summary-strip">
              <div>
                <span className="summary-label">当前状态</span>
                <strong>
                  {selectedPost.status === 'available'
                    ? selectedPost.postType === 'wanted'
                      ? '仍在等邻居回应'
                      : '还可联系'
                    : selectedPost.status === 'claimed'
                      ? selectedPost.postType === 'wanted'
                        ? '已经有人接上需求'
                        : '屋主已确认人选'
                      : '已进入完成记录'}
                </strong>
              </div>
              <div>
                <span className="summary-label">下一步</span>
                <strong>
                  {selectedPost.ownerId === currentProfile.id
                    ? selectedPost.status === 'available'
                      ? '选择一位邻居确认'
                      : selectedPost.status === 'claimed'
                        ? '移入完成记录'
                        : '已完成'
                    : selectedPost.status === 'available'
                      ? selectedPost.postType === 'wanted'
                        ? '先看看能不能帮上忙'
                        : '先表达兴趣再联系'
                      : selectedPost.status === 'claimed'
                        ? selectedPost.postType === 'wanted'
                          ? '等对方在微信里继续确认'
                          : '等待交接'
                        : '查看完成记录'}
                </strong>
              </div>
            </div>
            {selectedPost.description ? <p className="detail-copy">{selectedPost.description}</p> : null}
            {selectedPost.pickupNote ? <p className="detail-note">取货备注：{selectedPost.pickupNote}</p> : null}
            {selectedPost.fitMetadata ? (
              <div className="fit-panel">
                {selectedPost.fitMetadata.sizeNote ? <span>尺寸：{selectedPost.fitMetadata.sizeNote}</span> : null}
                {selectedPost.fitMetadata.liftFit ? <span>电梯：{selectedPost.fitMetadata.liftFit}</span> : null}
                {selectedPost.fitMetadata.twoPersonCarry ? <span>搬运：需两人</span> : null}
              </div>
            ) : null}
            <div className="contact-panel">
              <span className="panel-label">{selectedPost.postType === 'wanted' ? '回应这条求物' : '联系与认领'}</span>
              <strong>{selectedPost.ownerNickname} · {selectedPost.ownerRoomFragment}</strong>
              <p>
                {selectedPost.postType === 'wanted'
                  ? '如果你能提供合适的物品，先点一下表达意向，再去微信里继续聊细节。'
                  : '表达兴趣后，再去微信联系，更像楼里自己的交换秩序。'}
              </p>
              <div className="button-row detail-action-row">
                {selectedPost.status === 'available' && selectedPost.ownerId !== currentProfile.id ? (
                  <button
                    className="primary-button"
                    onClick={() => markInterested(selectedPost.id)}
                    disabled={busy || detailAction === 'interest' || selectedPost.alreadyInterested}
                  >
                    {selectedPost.alreadyInterested
                      ? selectedPost.postType === 'wanted'
                        ? '已表示可以帮忙'
                        : '已表达兴趣'
                      : detailAction === 'interest'
                        ? '提交中…'
                      : selectedPost.postType === 'wanted'
                        ? '我可以帮忙'
                        : '我感兴趣'}
                  </button>
                ) : null}
                {selectedPost.ownerWechatHandle ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void handleContactOwner(selectedPost.ownerWechatHandle!)}
                  >
                    复制TA微信号
                  </button>
                ) : null}
              </div>
              {contactNotice ? <p className="detail-note">{contactNotice}</p> : null}
              {detailNotice ? <p className={`feedback-banner ${detailNotice.tone}`}>{detailNotice.message}</p> : null}
              {selectedPost.ownerId === currentProfile.id && selectedPost.status === 'available' ? (
                <div className="owner-actions owner-zone">
                  <div className="owner-zone-header">
                    <strong>屋主确认区</strong>
                    <span>{selectedPost.interestUserIds.length} 人已表达兴趣</span>
                  </div>
                  {selectedPost.interestedResidents?.length ? (
                    <div className="interest-picker">
                      <span className="picker-label">选择要确认的邻居</span>
                      <div className="interest-list">
                        {selectedPost.interestedResidents.map((resident) => (
                          <button
                            key={resident.userId}
                            type="button"
                            className={
                              selectedInterestedUserId === resident.userId
                                ? 'interest-option active'
                                : 'interest-option'
                            }
                            onClick={() => setSelectedInterestedUserId(resident.userId)}
                          >
                            <strong>{resident.nickname}</strong>
                            <span>{resident.roomFragment}</span>
                          </button>
                        ))}
                      </div>
                      <button
                        className="secondary-button"
                        onClick={() => claimPost(selectedPost.id)}
                        disabled={busy || detailAction === 'claim'}
                      >
                        {detailAction === 'claim' ? '确认中…' : '确认认领'}
                      </button>
                    </div>
                  ) : (
                    <p className="detail-note">暂时还没人表达兴趣，等有人点“我感兴趣”后再确认。</p>
                  )}
                </div>
              ) : null}
              {selectedPost.ownerId === currentProfile.id && selectedPost.status === 'claimed' ? (
                <div className="owner-actions owner-zone">
                  <div className="owner-zone-header">
                    <strong>屋主确认区</strong>
                    <span>已确认，可以归档</span>
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() => moveToHistory(selectedPost.id)}
                    disabled={busy || detailAction === 'archive'}
                  >
                    {detailAction === 'archive' ? '移入中…' : '移入完成记录'}
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
      {detailNotice ? (
        <div className={`toast-banner ${detailNotice.tone}`} role="status" aria-live="polite">
          <span className="toast-dot" aria-hidden="true" />
          <div className="toast-copy">
            <strong>
              {detailNotice.tone === 'success'
                ? '操作成功'
                : detailNotice.tone === 'error'
                  ? '请处理一下'
                  : '正在处理中'}
            </strong>
            <span>{detailNotice.message}</span>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default App
