'use client'

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchWithAuth } from '../../../lib/api-client'
import { Loader2, Eye, BookOpen, Save, MessageCircle, Plus, Trash2, Edit2, Upload, ImageIcon, Film, X as XIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface PortfolioItem {
  id: string
  title: string
  subtitle: string
  description: string
  image_url: string
  video_url?: string
  display_order: number
  /** client-only flag: true means admin explicitly cleared the video */
  _removeVideo?: boolean
}

type ActiveTab = 'ebook' | 'phygital' | 'portfolio'

const VALID_TABS: ActiveTab[] = ['ebook', 'phygital', 'portfolio']
const ITEMS_PER_PAGE = 6

function isSamePortfolio(a: PortfolioItem[], b: PortfolioItem[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const left = a[i]
    const right = b[i]
    if (
      left.id !== right.id ||
      left.image_url !== right.image_url ||
      left.display_order !== right.display_order ||
      left.title !== right.title ||
      left.subtitle !== right.subtitle ||
      left.description !== right.description
    ) {
      return false
    }
  }
  return true
}

/**
 * Lightweight image renderer.
 * - Native browser lazy-loading untuk gambar di luar 2 pertama (off-screen friendly).
 * - Tidak ada setTimeout/setState berantai → tidak memicu re-render saat tab switch.
 */
const PortfolioCardImage = memo(function PortfolioCardImage({
  src,
  alt,
  eager,
}: {
  src: string
  alt: string
  eager: boolean
}) {
  const [errored, setErrored] = useState(false)

  return (
    <div className="absolute inset-0 bg-slate-200 dark:bg-slate-800">
      {!errored && (
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={eager ? 'high' : 'low'}
          onError={() => setErrored(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {errored && (
        <div className="absolute inset-0 flex items-center justify-center">
          <ImageIcon className="w-8 h-8 text-slate-400" />
        </div>
      )}
    </div>
  )
})

const PortfolioCard = memo(function PortfolioCard({
  item,
  eager,
  onEdit,
  onDelete,
}: {
  item: PortfolioItem
  eager: boolean
  onEdit: (item: PortfolioItem) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="group relative rounded-3xl border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-[2px_2px_0_0_#334155] md:shadow-[6px_6px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] dark:md:shadow-[6px_6px_0_0_#1e293b] md:hover:translate-x-[-2px] md:hover:translate-y-[-2px] md:hover:shadow-[8px_8px_0_0_#334155] transition-transform [content-visibility:auto] [contain-intrinsic-size:280px_360px]">
      <div className="aspect-[4/5] relative bg-slate-100 dark:bg-slate-800">
        <PortfolioCardImage src={item.image_url} alt={item.title} eager={eager} />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent opacity-90 pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 p-3 md:p-6 pointer-events-none">
          <p className="text-[8px] md:text-[10px] font-black text-lime-400 uppercase tracking-[0.12em] md:tracking-[0.2em] mb-0.5 md:mb-1 truncate">{item.subtitle}</p>
          <h4 className="text-sm md:text-lg font-black text-white leading-tight overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">{item.title}</h4>
        </div>
        <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="p-3 bg-white text-slate-900 rounded-2xl shadow-xl hover:bg-violet-500 hover:text-white transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            className="p-3 bg-white text-rose-500 rounded-2xl shadow-xl hover:bg-rose-500 hover:text-white transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        <div className="absolute top-4 left-4 pointer-events-none">
          <div className="px-3 py-1 bg-slate-900/90 rounded-full border border-white/20 text-[10px] font-bold text-white">
            #{item.display_order}
          </div>
        </div>
      </div>
    </div>
  )
})

export default function AdminShowcasePage() {
  const [loading, setLoading] = useState(true)
  const [savingSection, setSavingSection] = useState<'flipbook' | 'album' | 'fonnte' | 'contact' | null>(null)
  const [albumCarouselLink, setAlbumCarouselLink] = useState('')
  const [flipbookPreviewUrl, setFlipbookPreviewUrl] = useState('')
  const [fonnteTarget, setFonnteTarget] = useState('')
  const [contactUrl, setContactUrl] = useState('')
  const [statusBanner, setStatusBanner] = useState<string | null>(null)
  const hasCacheRef = React.useRef(false)
  const albumInputRef = useRef<HTMLInputElement | null>(null)
  const flipbookInputRef = useRef<HTMLInputElement | null>(null)
  const fonnteInputRef = useRef<HTMLInputElement | null>(null)
  const contactInputRef = useRef<HTMLInputElement | null>(null)

  // Portfolio State
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([])
  const [loadingPortfolio, setLoadingPortfolio] = useState(true)
  const [editingItem, setEditingItem] = useState<Partial<PortfolioItem> | null>(null)
  const [isSavingPortfolio, setIsSavingPortfolio] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const videoFileInputRef = useRef<HTMLInputElement | null>(null)
  const pendingVideoFileRef = useRef<File | null>(null)

  // Portfolio Pagination
  const [currentPage, setCurrentPage] = useState(1)

  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (typeof window === 'undefined') return 'ebook'
    const hash = window.location.hash.replace('#', '') as ActiveTab
    return VALID_TABS.includes(hash) ? hash : 'ebook'
  })
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const isAnyModalOpen = !!editingItem || !!itemToDelete
  const totalPages = useMemo(() => Math.max(1, Math.ceil(portfolio.length / ITEMS_PER_PAGE)), [portfolio.length])
  const currentItems = useMemo(
    () => portfolio.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [portfolio, currentPage]
  )

  // Sync tab dari hash sebelum paint (useLayoutEffect) untuk navigasi langsung via URL hash.
  // (State initial sudah derive dari hash juga; ini untuk jaga-jaga bila hash berubah sebelum mount selesai.)
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash.replace('#', '') as ActiveTab
    if (VALID_TABS.includes(hash)) setActiveTab(hash)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const previousOverflow = document.body.style.overflow
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isAnyModalOpen])

  const switchTab = useCallback((tab: ActiveTab) => {
    setActiveTab((prev) => (prev === tab ? prev : tab))
  }, [])

  // Jangan panggil history.pushState di dalam updater setState (Strict Mode bisa memanggil
  // updater dua kali). Sinkronkan hash di effect agar switch tab tetap instant & deterministik.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const newHash = `#${activeTab}`
    if (window.location.hash !== newHash) {
      history.pushState(null, '', newHash)
    }
  }, [activeTab])

  const handleTabClick = useCallback(
    (tab: ActiveTab) => {
      switchTab(tab)
    },
    [switchTab]
  )

  const handleEditItem = useCallback((item: PortfolioItem) => {
    pendingVideoFileRef.current = null
    setEditingItem(item)
  }, [])

  const handleDeleteItem = useCallback((id: string) => {
    setItemToDelete(id)
  }, [])

  const cacheKey = 'admin_showcase_v1'
  const portfolioCacheKey = 'admin_portfolio_v1'
  const hasCachePortfolioRef = React.useRef(false)

  // Instant render from cache to avoid skeleton when switching sidebar (before paint).
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    // Showcase cache
    try {
      const raw = window.sessionStorage.getItem(cacheKey)
      if (raw) {
        const parsed = JSON.parse(raw) as { ts: number; data: { albumCarouselLink: string; flipbookPreviewUrl: string; target: string; contactUrl?: string } }
        if (parsed?.data) {
          setAlbumCarouselLink(parsed.data.albumCarouselLink || '')
          setFlipbookPreviewUrl(parsed.data.flipbookPreviewUrl || '')
          setFonnteTarget(parsed.data.target || '')
          setContactUrl(parsed.data.contactUrl || '')
          setLoading(false)
          hasCacheRef.current = true
        }
      }
    } catch { /* ignore */ }
    // Portfolio cache
    try {
      const raw = window.sessionStorage.getItem(portfolioCacheKey)
      if (raw) {
        const parsed = JSON.parse(raw) as PortfolioItem[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPortfolio(parsed)
          setLoadingPortfolio(false)
          hasCachePortfolioRef.current = true
        }
      }
    } catch { /* ignore */ }
  }, [])

  const fetchShowcase = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetchWithAuth('/api/admin/showcase')
      const data = (await res.json().catch(() => ({}))) as unknown
      if (res.ok) {
        const obj = (data && typeof data === 'object' && !Array.isArray(data) ? (data as any) : {}) as any
        const list = Array.isArray(obj.albumPreviews) ? obj.albumPreviews : []
        const albumLink = list[0]?.link ? String(list[0].link) : ''
        const flipbookLink = typeof obj.flipbookPreviewUrl === 'string' ? obj.flipbookPreviewUrl : ''
        const target = typeof obj.target === 'string' ? obj.target : ''
        const contact = typeof obj.contactUrl === 'string' ? obj.contactUrl : ''
        setAlbumCarouselLink(albumLink)
        setFlipbookPreviewUrl(flipbookLink)
        setFonnteTarget(target)
        setContactUrl(contact)
        if (typeof window !== 'undefined') {
          try {
            window.sessionStorage.setItem(
              cacheKey,
              JSON.stringify({ ts: Date.now(), data: { albumCarouselLink: albumLink, flipbookPreviewUrl: flipbookLink, target, contactUrl: contact } })
            )
          } catch {
            // ignore
          }
        }
      } else {
        const err = (data && typeof data === 'object' && !Array.isArray(data) ? (data as any).error : undefined) as string | undefined
        setStatusBanner(`error: ${err || 'Gagal memuat pengaturan preview'}`)
        setTimeout(() => setStatusBanner(null), 3000)
      }
    } catch {
      setStatusBanner('error: Gagal memuat pengaturan preview')
      setTimeout(() => setStatusBanner(null), 3000)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchShowcase(hasCacheRef.current)
  }, [fetchShowcase])

  const fetchPortfolio = useCallback(async (silent = false) => {
    if (!silent) setLoadingPortfolio(true)
    try {
      const res = await fetchWithAuth('/api/admin/portfolio')
      if (res.ok) {
        const data = await res.json()
        const list = Array.isArray(data) ? (data as PortfolioItem[]) : []
        setPortfolio((prev) => (isSamePortfolio(prev, list) ? prev : list))
        try {
          window.sessionStorage.setItem(portfolioCacheKey, JSON.stringify(list))
        } catch { /* ignore */ }
      }
    } catch (e) {
      console.error('Fetch portfolio error:', e)
    } finally {
      setLoadingPortfolio(false)
    }
  }, [])

  useEffect(() => {
    fetchPortfolio(hasCachePortfolioRef.current)
  }, [fetchPortfolio])

  // Realtime Sync Listener - Durable Objects & WebSocket
  useEffect(() => {
    const onRealtime = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; channel?: string; payload?: Record<string, unknown> }>).detail
      if (!detail?.type || detail.channel !== 'global') return

      const path = typeof detail.payload?.path === 'string' ? detail.payload.path : ''

      if (path.startsWith('/api/admin/portfolio') || path.startsWith('/api/portfolio')) {
        fetchPortfolio(true)
      }
      if (path.startsWith('/api/admin/showcase')) {
        fetchShowcase(true)
      }
    }

    window.addEventListener('fresh:realtime', onRealtime)
    return () => window.removeEventListener('fresh:realtime', onRealtime)
  }, [fetchPortfolio, fetchShowcase])

  const handleSaveSection = async (section: 'flipbook' | 'album' | 'fonnte' | 'contact') => {
    const latestAlbumLink = (albumInputRef.current?.value ?? albumCarouselLink).trim()
    const latestFlipbookLink = (flipbookInputRef.current?.value ?? flipbookPreviewUrl).trim()
    const latestFonnteTarget = (fonnteInputRef.current?.value ?? fonnteTarget).trim()
    const latestContactUrl = (contactInputRef.current?.value ?? contactUrl).trim()
    // Keep state synced with actual input DOM values before sending.
    setAlbumCarouselLink(latestAlbumLink)
    setFlipbookPreviewUrl(latestFlipbookLink)
    setFonnteTarget(latestFonnteTarget)
    setContactUrl(latestContactUrl)

    setSavingSection(section)
    setStatusBanner(`saving-${section}`)
    try {
      const res = await fetchWithAuth('/api/admin/showcase', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          albumPreviews: latestAlbumLink ? [{ title: '', imageUrl: '', link: latestAlbumLink }] : [],
          flipbookPreviewUrl: latestFlipbookLink,
          target: latestFonnteTarget,
          contactUrl: latestContactUrl,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as unknown
      if (res.ok) {
        setStatusBanner(`save-${section}-success`)
        await fetchShowcase(true)
        setTimeout(() => setStatusBanner(null), 3000)
      } else {
        const err = (data && typeof data === 'object' && !Array.isArray(data) ? (data as any).error : undefined) as string | undefined
        setStatusBanner(`error: ${err || 'Gagal menyimpan'}`)
        setTimeout(() => setStatusBanner(null), 3000)
      }
    } catch {
      setStatusBanner('error: Gagal menyimpan')
      setTimeout(() => setStatusBanner(null), 3000)
    } finally {
      setSavingSection(null)
    }
  }

  const handleSavePortfolioItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingItem) return

    setIsSavingPortfolio(true)
    try {
      const formData = new FormData()
      if (editingItem.id) formData.append('id', editingItem.id)
      formData.append('title', editingItem.title || '')
      formData.append('subtitle', editingItem.subtitle || '')
      formData.append('description', editingItem.description || '')
      formData.append('displayOrder', String(editingItem.display_order || 0))
      formData.append('imageUrl', editingItem.image_url || '')
      formData.append('videoUrl', editingItem.video_url || '')

      const imageFile = fileInputRef.current?.files?.[0]
      if (imageFile) {
        // fetchWithAuth mengonversi gambar di FormData ke WebP + resize long edge (lib/api-client + image-conversion).
        formData.append('image', imageFile)
      }

      // Handle video
      const videoFile = pendingVideoFileRef.current ?? videoFileInputRef.current?.files?.[0]
      if (videoFile) {
        formData.append('video', videoFile)
      }
      // If video_url was explicitly cleared (removeVideo)
      if (editingItem._removeVideo) {
        formData.append('removeVideo', 'true')
      }

      const url = editingItem.id ? `/api/admin/portfolio/${editingItem.id}` : '/api/admin/portfolio'
      const method = editingItem.id ? 'PUT' : 'POST'

      const res = await fetchWithAuth(url, {
        method,
        body: formData,
      })

      if (res.ok) {
        setStatusBanner(editingItem.id ? 'Portfolio updated-success' : 'Portfolio created-success')
        setEditingItem(null)
        await fetchPortfolio()
        setTimeout(() => setStatusBanner(null), 3000)
      } else {
        const data = await res.json()
        alert(data.error || 'Gagal menyimpan portfolio')
      }
    } catch (e) {
      alert('Error saving portfolio')
    } finally {
      setIsSavingPortfolio(false)
    }
  }

  const openAddPortfolio = () => {
    pendingVideoFileRef.current = null
    setEditingItem({ id: '', title: '', subtitle: '', description: '', display_order: portfolio.length, image_url: '', video_url: '' })
  }

  const confirmDelete = async () => {
    if (!itemToDelete) return
    setIsDeleting(true)
    try {
      const res = await fetchWithAuth(`/api/admin/portfolio/${itemToDelete}`, { method: 'DELETE' })
      if (res.ok) {
        setStatusBanner('Portfolio dihapus-success')
        setTimeout(() => setStatusBanner(null), 3000)
        await fetchPortfolio()
        setItemToDelete(null)
      }
    } catch (e) {
      setStatusBanner('error: Gagal menghapus portfolio')
      setTimeout(() => setStatusBanner(null), 3000)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="max-w-6xl pb-12">
      {statusBanner && (
        <div className={`fixed bottom-4 md:bottom-8 left-1/2 -translate-x-1/2 z-[200] max-w-[90%] md:max-w-md w-full px-4 py-3 md:px-6 md:py-4 rounded-2xl md:rounded-2xl border-2 border-slate-900 dark:border-slate-700 shadow-[#64748b] dark:shadow-[2px_2px_0_0_#1e293b] md:shadow-[2px_2px_0_0_#334155] dark:md:shadow-[2px_2px_0_0_#334155] transform transition-all animate-bounce-subtle ${statusBanner.startsWith('error:') ? 'bg-red-400 dark:bg-red-600 text-white' : statusBanner.endsWith('-success') ? 'bg-emerald-400 dark:bg-emerald-600 text-slate-900 dark:text-white' : 'bg-amber-300 dark:bg-amber-600 text-slate-900 dark:text-white'}`}>
          <div className="flex items-center gap-2 md:gap-3 font-bold text-xs md:text-sm">
            {statusBanner.startsWith('saving-') ? <Loader2 className="animate-spin w-4 h-4 md:w-5 md:h-5" /> : null}
            {statusBanner === 'saving-flipbook' ? 'Menyimpan View flipbook...' :
              statusBanner === 'saving-album' ? 'Menyimpan View album...' :
                statusBanner === 'saving-fonnte' ? 'Menyimpan target Fonnte...' :
                  statusBanner === 'save-flipbook-success' ? 'View flipbook berhasil disimpan.' :
                    statusBanner === 'save-album-success' ? 'View album berhasil disimpan.' :
                      statusBanner === 'save-fonnte-success' ? 'Target Fonnte berhasil disimpan.' :
                statusBanner.startsWith('error: ') ? `Error: ${statusBanner.replace('error: ', '')}` : statusBanner}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div className="space-y-1">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            View Settings
          </h1>
          <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 max-w-2xl">
            Atur elemen publik yang ditampilkan di landing page dan halaman user.
          </p>
        </div>

        {activeTab === 'portfolio' && !editingItem && (
          <div className="hidden sm:block shrink-0">
            <button
              type="button"
              onClick={openAddPortfolio}
              className="flex items-center gap-2 px-5 py-3 bg-violet-500 text-white rounded-2xl text-sm font-bold hover:bg-violet-600 transition-all shadow-[2px_2px_0_0_#2e1065] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none animate-in fade-in zoom-in-95 whitespace-nowrap"
            >
              <Plus className="w-4 h-4 shrink-0" />
              Tambah Portfolio
            </button>
          </div>
        )}
      </div>

      {/* Tab Switcher — mobile: satu baris penuh; tombol portfolio di bawah (mobile) supaya tab tidak naik-turun */}
      <div className="mb-8">
        <div className="flex w-full md:w-fit max-w-full flex-nowrap gap-1 p-1 bg-slate-100 dark:bg-slate-900/50 rounded-2xl border-2 border-slate-900 dark:border-slate-800 relative min-w-0">
          <div
            className="absolute top-1 bottom-1 rounded-xl bg-white dark:bg-slate-800 shadow-[2px_2px_0_0_#0f172a] border border-slate-900 transition-transform duration-200 ease-out"
            style={{
              width: 'calc(33.333333% - 6px)',
              transform:
                activeTab === 'ebook'
                  ? 'translateX(0)'
                  : activeTab === 'phygital'
                    ? 'translateX(100%)'
                    : 'translateX(200%)',
            }}
          />
          {(['ebook', 'phygital', 'portfolio'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => handleTabClick(tab)}
              className={`relative z-10 flex flex-1 md:flex-none min-w-0 items-center justify-center gap-1.5 md:gap-2 px-3 py-2 md:px-5 md:py-2.5 rounded-xl text-[10px] md:text-sm font-bold uppercase tracking-wider ${
                activeTab === tab
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <span className="relative z-20 flex min-w-0 items-center justify-center gap-1.5 md:gap-2">
                {tab === 'ebook' && <BookOpen className="w-3.5 h-3.5 md:w-5 md:h-5 shrink-0" />}
                {tab === 'phygital' && <MessageCircle className="w-3.5 h-3.5 md:w-5 md:h-5 shrink-0" />}
                {tab === 'portfolio' && <ImageIcon className="w-3.5 h-3.5 md:w-5 md:h-5 shrink-0" />}
                <span className="truncate">{tab === 'ebook' ? 'Ebook' : tab === 'phygital' ? 'Contact' : 'Portfolio'}</span>
              </span>
            </button>
          ))}
        </div>

        {activeTab === 'portfolio' && !editingItem && (
          <div className="mt-4 sm:hidden">
            <button
              type="button"
              onClick={openAddPortfolio}
              className="flex w-full items-center justify-center gap-2 px-5 py-3 bg-violet-500 text-white rounded-2xl text-sm font-bold hover:bg-violet-600 transition-all shadow-[2px_2px_0_0_#2e1065] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none animate-in fade-in zoom-in-95"
            >
              <Plus className="w-4 h-4 shrink-0" />
              Tambah Portfolio
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="animate-pulse space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            {[1, 2].map(i => (
              <div key={i} className="rounded-2xl border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 md:p-8 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b]">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-32 mb-4" />
                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-full mb-2" />
                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-full mb-4 max-w-[85%]" />
                <div className="h-14 bg-slate-100 dark:bg-slate-800 rounded-2xl w-full" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <div
            className={cn('grid grid-cols-1 md:grid-cols-2 gap-8 [contain:layout]', activeTab !== 'ebook' && 'hidden')}
            inert={activeTab !== 'ebook' ? true : undefined}
          >
          {/* Flipbook View */}
          <div className="rounded-2xl border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 md:p-8 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <BookOpen className="w-16 h-16 text-emerald-300 dark:text-emerald-900" />
            </div>
            <div className="relative">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                View Flipbook
              </h3>
              <p className="text-[13px] font-bold text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
                Link publik flipbook (tanpa login). Gunakan format: <br />
                <code className="text-emerald-700 dark:text-emerald-300 bg-white/60 dark:bg-slate-900/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-700">/album/[album-id]/flipbook</code>
              </p>
              <div className="relative">
                <input
                  ref={flipbookInputRef}
                  type="text"
                  value={flipbookPreviewUrl}
                  onChange={(e) => setFlipbookPreviewUrl(e.target.value)}
                  placeholder="/album/uuid/flipbook"
                  className="w-full px-5 py-4 text-sm font-bold rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-emerald-200 dark:focus:ring-emerald-900 transition-all shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] focus:shadow-none"
                />
              </div>
              <button
                type="button"
                onClick={() => handleSaveSection('flipbook')}
                disabled={savingSection !== null}
                className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-emerald-400 dark:bg-emerald-700 text-slate-900 dark:text-white border-2 border-slate-900 dark:border-slate-700 text-sm font-bold hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] transition-all disabled:opacity-50"
              >
                {savingSection === 'flipbook' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Simpan Flipbook
              </button>
            </div>
          </div>

          {/* Album Carousel View */}
          <div className="rounded-2xl border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 md:p-8 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Eye className="w-16 h-16 text-sky-300 dark:text-sky-900" />
            </div>
            <div className="relative">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <Eye className="w-4 h-4" />
                View Album
              </h3>
              <p className="text-[13px] font-bold text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
                Link View album (tanpa login). Gunakan format: <br />
                <code className="text-sky-700 dark:text-sky-300 bg-white/60 dark:bg-slate-900/60 px-1.5 py-0.5 rounded border border-sky-200 dark:border-sky-700">/album/[album-id]/view</code>
              </p>
              <div className="relative">
                <input
                  ref={albumInputRef}
                  type="text"
                  value={albumCarouselLink}
                  onChange={(e) => setAlbumCarouselLink(e.target.value)}
                  placeholder="/album/uuid/view"
                  className="w-full px-5 py-4 text-sm font-bold rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-sky-200 dark:focus:ring-sky-900 transition-all shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] focus:shadow-none"
                />
              </div>
              <button
                type="button"
                onClick={() => handleSaveSection('album')}
                disabled={savingSection !== null}
                className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-sky-400 dark:bg-sky-700 text-slate-900 dark:text-white border-2 border-slate-900 dark:border-slate-700 text-sm font-bold hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] transition-all disabled:opacity-50"
              >
                {savingSection === 'album' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Simpan Album
              </button>
            </div>
          </div>
          </div>

          <div
            className={cn('[contain:layout]', activeTab !== 'phygital' && 'hidden')}
            inert={activeTab !== 'phygital' ? true : undefined}
          >
            <div>
              {/* Contact URL */}
              <div className="rounded-2xl border-2 border-slate-900 dark:border-slate-700 bg-amber-50 dark:bg-slate-800 p-6 md:p-8 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] relative overflow-hidden group max-w-2xl mb-8">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <MessageCircle className="w-16 h-16 text-amber-300 dark:text-amber-900" />
                </div>
                <div className="relative">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                    <MessageCircle className="w-4 h-4" />
                    Contact Button URL
                  </h3>
                  <p className="text-[13px] font-bold text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
                    URL untuk tombol Contact di landing page (muncul terus di kanan bawah). Contoh: <br />
                    <code className="text-amber-700 dark:text-amber-300 bg-white/60 dark:bg-slate-900/60 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-700">
                      https://wa.me/628xxxxxxxxxx
                    </code>
                  </p>
                  <div className="relative">
                    <input
                      ref={contactInputRef}
                      type="text"
                      value={contactUrl}
                      onChange={(e) => setContactUrl(e.target.value)}
                      placeholder="https://wa.me/628xxxxxxxxxx"
                      className="w-full px-5 py-4 text-sm font-bold rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-amber-200 dark:focus:ring-amber-900 transition-all shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] focus:shadow-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveSection('contact')}
                    disabled={savingSection !== null}
                    className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-amber-400 dark:bg-amber-700 text-slate-900 dark:text-white border-2 border-slate-900 dark:border-slate-700 text-sm font-bold hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] transition-all disabled:opacity-50"
                  >
                    {savingSection === 'contact' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Simpan Contact URL
                  </button>
                </div>
              </div>

              {/* Fonnte WhatsApp Target */}
              <div className="rounded-2xl border-2 border-slate-900 dark:border-slate-700 bg-green-50 dark:bg-slate-800 p-6 md:p-8 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] relative overflow-hidden group max-w-2xl">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <MessageCircle className="w-16 h-16 text-green-300 dark:text-green-900" />
                </div>
                <div className="relative">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                    <MessageCircle className="w-4 h-4" />
                    Fonnte WhatsApp Target
                  </h3>
                  <p className="text-[13px] font-bold text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
                    Nomor WhatsApp penerima notifikasi saat user mengisi form Cetak Fisik. Format: <br />
                    <code className="text-green-700 dark:text-green-300 bg-white/60 dark:bg-slate-900/60 px-1.5 py-0.5 rounded border border-green-200 dark:border-green-700">62xxxxxxxxxx</code>
                  </p>
                  <div className="relative">
                    <input
                      ref={fonnteInputRef}
                      type="text"
                      value={fonnteTarget}
                      onChange={(e) => setFonnteTarget(e.target.value)}
                      placeholder="6285865913347"
                      className="w-full px-5 py-4 text-sm font-bold rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-green-200 dark:focus:ring-green-900 transition-all shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] focus:shadow-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveSection('fonnte')}
                    disabled={savingSection !== null}
                    className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-green-400 dark:bg-green-700 text-slate-900 dark:text-white border-2 border-slate-900 dark:border-slate-700 text-sm font-bold hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] transition-all disabled:opacity-50"
                  >
                    {savingSection === 'fonnte' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Simpan Target
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div
            className={cn('[contain:layout]', activeTab !== 'portfolio' && 'hidden')}
            inert={activeTab !== 'portfolio' ? true : undefined}
          >
            <div className="space-y-8">
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
                {currentItems.map((p, idx) => (
                  <PortfolioCard
                    key={p.id}
                    item={p}
                    eager={idx < 2}
                    onEdit={handleEditItem}
                    onDelete={handleDeleteItem}
                  />
                ))}

                {loadingPortfolio && portfolio.length === 0 && Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="aspect-[4/5] rounded-3xl border-2 border-slate-200 dark:border-slate-800 animate-pulse bg-slate-50 dark:bg-slate-900" />
                ))}
              </div>

              {/* Pagination Controls */}
              {portfolio.length > ITEMS_PER_PAGE && (
                <div className="flex justify-center items-center gap-4 mt-10">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                    className="px-4 py-2 rounded-xl border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold disabled:opacity-30 hover:bg-slate-50 transition-all"
                  >
                    Prev
                  </button>
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => p + 1)}
                    className="px-4 py-2 rounded-xl border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold disabled:opacity-30 hover:bg-slate-50 transition-all"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editingItem && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[260] flex min-h-dvh items-center justify-center overflow-y-auto overscroll-contain bg-slate-900/40 px-4 py-6 backdrop-blur-sm sm:px-5 sm:py-8"
              role="dialog"
              aria-modal="true"
              aria-labelledby="portfolio-edit-title"
              onClick={() => setEditingItem(null)}
            >
              <div
                className="w-full max-w-5xl max-h-[min(92dvh,920px)] overflow-y-auto rounded-3xl border-2 border-slate-900 bg-white p-6 shadow-[8px_8px_0_0_#2e1065] animate-in zoom-in-95 duration-200 dark:border-slate-700 dark:bg-slate-900 md:p-8"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="portfolio-edit-title" className="sr-only">
                  {editingItem.id ? 'Edit portfolio' : 'Tambah portfolio'}
                </h2>
                <form onSubmit={handleSavePortfolioItem} className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Judul Portfolio
                      </label>
                      <input
                        type="text"
                        required
                        value={editingItem.title || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                        placeholder="Contoh: American 90s"
                        className="w-full rounded-xl border-2 border-slate-900 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-900 transition-all focus:outline-none focus:ring-4 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-violet-900"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Sub-judul / Konsep
                      </label>
                      <input
                        type="text"
                        required
                        value={editingItem.subtitle || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, subtitle: e.target.value })}
                        placeholder="Contoh: Retro & Nostalgic"
                        className="w-full rounded-xl border-2 border-slate-900 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-900 transition-all focus:outline-none focus:ring-4 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-violet-900"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Deskripsi Singkat
                      </label>
                      <textarea
                        required
                        rows={3}
                        value={editingItem.description || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                        placeholder="Ceritakan tentang konsep portfolio ini..."
                        className="w-full resize-none rounded-xl border-2 border-slate-900 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-900 transition-all focus:outline-none focus:ring-4 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-violet-900 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Urutan Tampil
                        </label>
                        <input
                          type="number"
                          value={editingItem.display_order ?? 0}
                          onChange={(e) =>
                            setEditingItem({ ...editingItem, display_order: parseInt(e.target.value, 10) || 0 })
                          }
                          className="w-full rounded-xl border-2 border-slate-900 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-900 transition-all focus:outline-none focus:ring-4 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-violet-900"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Cover Photo
                      </label>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => fileInputRef.current?.click()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            fileInputRef.current?.click()
                          }
                        }}
                        className="group relative aspect-video w-full cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 transition-all hover:border-violet-400 dark:border-slate-700 dark:bg-slate-800"
                      >
                        {editingItem.image_url ? (
                          <>
                            <img
                              src={editingItem.image_url}
                              alt="Preview"
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                              <Upload className="h-8 w-8 text-white" />
                            </div>
                          </>
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                            <Upload className="mb-2 h-10 w-10" />
                            <p className="text-xs font-bold">Klik untuk upload foto</p>
                          </div>
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              const reader = new FileReader()
                              reader.onloadend = () =>
                                setEditingItem({ ...editingItem, image_url: reader.result as string })
                              reader.readAsDataURL(file)
                            }
                          }}
                          className="hidden"
                        />
                      </div>
                    </div>

                    {/* Video Upload (Opsional) */}
                    <div>
                      <label className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <Film className="w-3 h-3" />
                        Video
                        <span className="ml-1 rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[9px] font-bold text-slate-400 dark:text-slate-500 normal-case tracking-normal">
                          Opsional · Tampil saat Full View · Maks 20MB
                        </span>
                      </label>

                      {(() => {
                        const isNewBlob = !!editingItem.video_url?.startsWith('blob:')
                        const isExisting = !!editingItem.video_url && !isNewBlob && !editingItem._removeVideo

                        if (isNewBlob) {
                          // Video baru dipilih — tampilkan preview blob saja
                          return (
                            <div className="relative w-full rounded-2xl overflow-hidden border-2 border-violet-300 dark:border-violet-700 bg-slate-900">
                              <video
                                src={editingItem.video_url}
                                controls
                                className="w-full max-h-40 object-contain"
                              />
                              <div className="absolute top-2 left-2 rounded-lg bg-violet-500 px-2 py-0.5 text-[9px] font-black text-white uppercase tracking-widest">
                                Baru
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (videoFileInputRef.current) videoFileInputRef.current.value = ''
                                  pendingVideoFileRef.current = null
                                  setEditingItem({ ...editingItem, video_url: '' })
                                }}
                                className="absolute top-2 right-2 p-1.5 rounded-xl bg-rose-500 text-white hover:bg-rose-600 transition-colors shadow-md"
                                title="Batalkan pilihan video"
                              >
                                <XIcon className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )
                        }

                        if (isExisting) {
                          // Video lama dari server — tampilkan preview + tombol hapus
                          return (
                            <div className="relative w-full rounded-2xl overflow-hidden border-2 border-slate-200 dark:border-slate-700 bg-slate-900">
                              <video
                                src={editingItem.video_url}
                                controls
                                className="w-full max-h-40 object-contain"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  pendingVideoFileRef.current = null
                                  if (videoFileInputRef.current) videoFileInputRef.current.value = ''
                                  setEditingItem({ ...editingItem, _removeVideo: true, video_url: '' })
                                }}
                                className="absolute top-2 right-2 p-1.5 rounded-xl bg-rose-500 text-white hover:bg-rose-600 transition-colors shadow-md"
                                title="Hapus video"
                              >
                                <XIcon className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )
                        }

                        // Tidak ada video — tampilkan dropzone upload
                        return (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => videoFileInputRef.current?.click()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                videoFileInputRef.current?.click()
                              }
                            }}
                            className="group relative flex h-24 w-full cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 transition-all hover:border-violet-400 dark:border-slate-700 dark:bg-slate-800"
                          >
                            <Film className="h-7 w-7 text-slate-400 group-hover:text-violet-400 transition-colors" />
                            <p className="text-xs font-bold text-slate-400 group-hover:text-violet-400 transition-colors">
                              {editingItem._removeVideo ? 'Video dihapus — upload video baru (opsional)' : 'Klik untuk upload video'}
                            </p>
                            <input
                              ref={videoFileInputRef}
                              type="file"
                              accept="video/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) {
                                  if (file.size > 20 * 1024 * 1024) {
                                    alert('Video maksimal 20MB')
                                    e.target.value = ''
                                    return
                                  }
                                  const url = URL.createObjectURL(file)
                                  pendingVideoFileRef.current = file
                                  setEditingItem({ ...editingItem, video_url: url, _removeVideo: false })
                                }
                              }}
                              className="hidden"
                            />
                          </div>
                        )
                      })()}
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button
                        type="button"
                        onClick={() => setEditingItem(null)}
                        className="flex-1 rounded-2xl border-2 border-slate-900 px-5 py-3.5 font-bold text-slate-600 transition-all hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingPortfolio}
                        className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-slate-900 bg-violet-500 px-5 py-3.5 font-bold text-white shadow-[2px_2px_0_0_#2e1065] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-50 dark:border-slate-700"
                      >
                        {isSavingPortfolio ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Menyimpan...</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Save className="h-4 w-4" />
                            <span>{editingItem.id ? 'Simpan Perubahan' : 'Tambah Portfolio'}</span>
                          </div>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {itemToDelete && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setItemToDelete(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-2xl p-5 md:p-6 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b]"
            >
              <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-white">Hapus Portfolio?</h3>
              <p className="mt-2 text-xs md:text-sm text-slate-500 dark:text-slate-400 font-medium">
                Aksi ini tidak bisa dibatalkan. Data portfolio yang dipilih akan dihapus permanen.
              </p>
              
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setItemToDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] hover:shadow-none disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 bg-rose-400 text-rose-900 rounded-xl font-bold hover:bg-rose-300 transition-all shadow-[2px_2px_0_0_#e11d48] hover:shadow-none disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Hapus'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}








