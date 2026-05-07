'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Check, X, Trash2, UserPlus, User, Loader2, ImagePlus, BookOpen, ChevronRight, Search, Edit, LayoutDashboard, MoreVertical, Calendar, ShieldCheck, CreditCard, Package, Eye, ClipboardPaste, LayoutGrid } from 'lucide-react'
import { getYearbookSectionQueryUrl } from '../yearbook/lib/yearbook-paths'
import { apiUrl } from '../../lib/api-url'
import { fetchWithAuth } from '../../lib/api-client'
import { asObject, asString, getErrorMessage } from '@/components/yearbook/utils/response-narrowing'
import FastImage from '@/components/ui/FastImage'
import { toast } from '@/lib/toast'

/** Extract token from URL atau kode (alphanumeric + - _, 6–80 char; support token lama yang panjang). */
function parseInviteToken(input: string): { token: string; type: 'join' | 'invite' | 'code' } | null {
  let trimmed = input.trim()
  // Buang prefix umum saat user copy-paste teks "Kode: xyz"
  trimmed = trimmed.replace(/^(kode|code)\s*[:\-]\s*/i, '').trim()
  if (!trimmed) return null
  try {
    // Terima kode 6–80 karakter (alphanumeric, base64url punya - dan _)
    if (/^[a-zA-Z0-9_-]{6,80}$/.test(trimmed)) return { token: trimmed, type: 'code' }
    const url = trimmed.startsWith('http') ? new URL(trimmed) : new URL(trimmed, 'https://x')
    const path = url.pathname
    const joinMatch = path.match(/\/join\/([^/]+)/i)
    if (joinMatch) return { token: joinMatch[1], type: 'join' }
    const inviteMatch = path.match(/\/invite\/([^/]+)/i)
    if (inviteMatch) return { token: inviteMatch[1], type: 'invite' }
    return null
  } catch {
    return null
  }
}

export type AlbumRow = {
  id: string
  name: string
  description?: string | null
  type: 'public' | 'yearbook'
  status?: 'pending' | 'approved' | 'declined'
  created_at?: string
  lead_id?: string
  album_id?: string | null
  leads?: { school_name: string } | null
  pricing_package_id?: string | null
  package_snapshot?: { name: string; price_per_student?: number; features?: string[] } | null; pricing_packages?: { name: string } | null
  isOwner?: boolean
  school_city?: string
  kab_kota?: string
  wa_e164?: string
  province_id?: string
  province_name?: string
  pic_name?: string
  students_count?: number
  source?: string
  total_estimated_price?: number
  collected_amount?: number
  individual_payments_enabled?: number | null;
  payment_status?: 'unpaid' | 'paid'
  member_payment_status?: 'unpaid' | 'paid'
  member_access_id?: string | null
  payment_url?: string | null
  cover_image_url?: string | null
  cover_image_position?: string | null
}

export type AlbumsViewProps = {
  variant: 'user' | 'admin'
  initialData?: AlbumRow[]
  fetchUrl?: string
  linkContext?: 'user' | 'admin'
  active?: boolean
}

function AlbumCard({
  album,
  variant,
  basePath,
  pathname,
  onApprove,
  onDecline,
  onDelete,
  onInvite,
  onPay,
  loadingId,
  navigatingAlbumId,
  setNavigatingAlbumId,
  onYearbookPublicChoice,
}: {
  album: AlbumRow
  variant: 'user' | 'admin'
  basePath: string
  onApprove?: (album: AlbumRow) => void
  onDecline?: (album: AlbumRow) => void
  onDelete?: (album: AlbumRow) => void
  onInvite?: (album: AlbumRow) => void
  onPay?: (album: AlbumRow) => void
  loadingId?: string | null
  navigatingAlbumId?: string | null
  setNavigatingAlbumId?: (id: string | null) => void
  pathname?: string | null
  onYearbookPublicChoice?: (album: AlbumRow) => void
}) {
  const router = useRouter()
  const [showInfo, setShowInfo] = useState(false)
  const isAdmin = variant === 'admin'
  const isIndividualPayment = album.individual_payments_enabled === 1
  const isPaid = (isIndividualPayment && album.isOwner === false)
    ? album.member_payment_status === 'paid'
    : album.payment_status === 'paid'
  const isApproved = album.status === 'approved'
  
  const isClickable = album.type === 'public' || (isApproved && (isPaid || isAdmin || isIndividualPayment))
  
  // For individual payment users who haven't paid, destination should be a checkout/info page if needed, 
  // but usually /view handles the redirection to payment.
  const destinationUrl = album.type === 'public'
      ? `${basePath}/album/public/${album.id}` 
    : `/album/${album.album_id ?? album.id}/view`

  const editorUrl = album.type === 'yearbook'
    ? getYearbookSectionQueryUrl(album.album_id ?? album.id, 'cover', pathname || null)
    : null

  const created = album.created_at ? new Date(album.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : null
  const statusLabel = album.type === 'yearbook' ? (album.status ?? 'pending') : 'public'
  const canSeeApproved = isAdmin || album.isOwner === true
  const shouldShowStatus = !(statusLabel === 'approved' && !canSeeApproved)
  const displayStatus = statusLabel as string
  const displayPaymentStatus = album.payment_status || 'unpaid'
  const isLoading = loadingId === album.id
  const isNavigatingToEditor = navigatingAlbumId === album.id

  const CardContent = () => (
    <div
      onClick={(e) => {
        if (isClickable && !isLoading) {
          try { router.prefetch(destinationUrl) } catch { }
          if (album.type === 'yearbook' && onYearbookPublicChoice) {
            onYearbookPublicChoice(album)
            return
          }
          router.push(destinationUrl, { scroll: false })
        }
      }}
      onMouseEnter={() => {
        if (!isClickable) return
        try { router.prefetch(destinationUrl) } catch { }
      }}
      onTouchStart={() => {
        if (!isClickable) return
        try { router.prefetch(destinationUrl) } catch { }
      }}
      className={`relative border-2 border-black dark:border-slate-700 rounded-3xl p-4 sm:p-5 flex flex-col h-full transition-all duration-200 min-h-[120px] shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] bg-white dark:bg-slate-900 ${isClickable ? 'cursor-pointer hover:translate-x-1 hover:translate-y-1' : 'cursor-default opacity-80'
        }`}>
      {/* Album Cover - Main Primary Visual */}
      <div className="aspect-[4/3] w-full bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-2xl mb-4 overflow-hidden relative shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155]">
        {album.cover_image_url ? (
          <FastImage
            src={album.cover_image_url}
            alt={album.name}
            className="w-full h-full object-cover"
            style={album.cover_image_position ? { objectPosition: album.cover_image_position } : undefined}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 opacity-30 text-slate-900 dark:text-slate-200">
            <BookOpen className="w-8 h-8" />
            <span className="text-[10px] font-black uppercase">No Cover Image</span>
          </div>
        )}
        {album.type === 'public' && (
          <div className="absolute top-2 left-2 px-2 py-0.5 bg-indigo-500 text-white text-[9px] font-black uppercase rounded border-2 border-slate-900">
            Public
          </div>
        )}
      </div>

      <div className="flex justify-between items-start gap-2">
        <div className="flex-grow min-w-0">
          <h2 className="text-base font-black text-slate-900 dark:text-slate-100 truncate" title={album.name}>{album.name}</h2>
          {album.description && (
            <p className="mt-1 text-xs font-bold text-slate-600 dark:text-slate-300 line-clamp-2">
              {album.description}
            </p>
          )}
        </div>
        {!isAdmin && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowInfo(!showInfo) }}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300 transition-colors shrink-0"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Info Detail Popup */}
      {showInfo && !isAdmin && (
        <div
          className="absolute top-12 right-4 z-50 w-64 bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] rounded-2xl p-4 animate-in fade-in zoom-in duration-200 cursor-default"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <div className="flex justify-between items-center mb-4 pb-2 border-b-2 border-slate-100 dark:border-slate-800">
            <h3 className="font-black text-slate-900 dark:text-slate-100 text-sm">Informasi Album</h3>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowInfo(false) }}
              className="text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900 border-2 border-slate-900 dark:border-slate-700 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-300" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase">Status</p>
                <p className={`text-xs font-black ${displayStatus === 'approved' ? 'text-emerald-600 dark:text-emerald-300' : 'text-orange-500 dark:text-orange-300'}`}> 
                  {displayStatus === 'approved' ? 'Approved' : displayStatus === 'pending' ? 'Pending' : 'Declined'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg border-2 border-slate-900 dark:border-slate-700 flex items-center justify-center shrink-0 ${isPaid ? 'bg-indigo-100 dark:bg-indigo-900' : 'bg-red-100 dark:bg-red-900'}`}> 
                <CreditCard className={`w-4 h-4 ${isPaid ? 'text-emerald-600 dark:text-emerald-400' : isIndividualPayment ? 'text-amber-500 dark:text-amber-400' : 'text-red-500 dark:text-red-300'}`} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase">Pembayaran</p>
                <p className={`text-xs font-black ${isPaid ? 'text-emerald-600 dark:text-emerald-400' : isIndividualPayment ? 'text-amber-500 dark:text-amber-400' : 'text-red-500 dark:text-red-300'}`}>
                  {isPaid ? 'Lunas' : isIndividualPayment ? 'Bayar Mandiri' : 'Belum Bayar'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900 border-2 border-slate-900 dark:border-slate-700 flex items-center justify-center shrink-0">
                <Package className="w-4 h-4 text-orange-600 dark:text-orange-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase">Paket Album</p>
                <p className="text-xs font-black text-slate-900 dark:text-slate-100 truncate">
                  {album.type === 'yearbook'
                    ? ((album.package_snapshot?.name || album.pricing_packages?.name) || 'Yearbook')
                    : 'Shared Gallery'
                  }
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase">Tanggal Masukan</p>
                <p className="text-xs font-black text-slate-900 dark:text-slate-100">{created || '-'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900 border-2 border-slate-900 dark:border-slate-700 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase">Pembuat Album</p>
                <p className="text-xs font-black text-slate-900 dark:text-slate-100 truncate">{album.pic_name || 'Tidak diketahui'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAdmin && album.type === 'yearbook' && (onApprove || onDecline || onDelete) && (
        <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
          {album.status !== 'approved' && onApprove && (
            <button
              type="button"
              disabled={!!loadingId}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onApprove(album) }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-black rounded-xl bg-emerald-400 border-2 border-slate-900 shadow-[2px_2px_0_0_#0f172a] text-slate-900 hover:translate-y-0.5 hover:translate-x-0.5 hover:shadow-none transition-all disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" /> Approve
            </button>
          )}
          {album.status !== 'declined' && onDecline && (
            <button
              type="button"
              disabled={!!loadingId}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDecline(album) }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-black rounded-xl bg-orange-400 border-2 border-slate-900 shadow-[2px_2px_0_0_#0f172a] text-slate-900 hover:translate-y-0.5 hover:translate-x-0.5 hover:shadow-none transition-all disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" /> Decline
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              disabled={!!loadingId}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(album) }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-black rounded-xl bg-red-500 border-2 border-slate-900 shadow-[2px_2px_0_0_#0f172a] text-white hover:translate-y-0.5 hover:translate-x-0.5 hover:shadow-none transition-all disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Hapus
            </button>
          )}
        </div>
      )}

      {!isAdmin && (
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800 flex flex-col gap-2">
          {(album.isOwner !== false || (isIndividualPayment && album.isOwner === false)) && isApproved && !isPaid && onPay && (
            <button
              type="button"
              disabled={!!loadingId}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPay(album) }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-black rounded-xl bg-orange-400 dark:bg-orange-600 border-2 border-slate-900 text-slate-900 dark:text-slate-100 shadow-[2px_2px_0_0_#0f172a] hover:translate-y-1 hover:translate-x-1 hover:shadow-none transition-all disabled:opacity-50"
            >
              <CreditCard className="w-3.5 h-3.5" /> Bayar Sekarang
            </button>
          )}
          {album.isOwner !== false && onInvite && (album.album_id ?? album.type === 'public') && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onInvite(album) }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-black rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 shadow-[2px_2px_0_0_#0f172a] text-slate-900 dark:text-slate-100 hover:translate-y-0.5 hover:translate-x-0.5 hover:shadow-none transition-all"
            >
              <UserPlus className="w-3.5 h-3.5" /> Undang Teman
            </button>
          )}
          {album.type === 'yearbook' && isApproved && (isPaid || isAdmin) && editorUrl && (
            <Link
              href={editorUrl}
              onClick={(e) => {
                e.stopPropagation()
                setNavigatingAlbumId?.(album.id)
              }}
              prefetch
              scroll={false}
              onMouseEnter={() => {
                try { router.prefetch(editorUrl) } catch { /* ignore */ }
              }}
              onMouseDown={() => {
                try { router.prefetch(editorUrl) } catch { /* ignore */ }
              }}
              onTouchStart={() => {
                try { router.prefetch(editorUrl) } catch { /* ignore */ }
              }}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-black rounded-xl border-2 border-slate-900 shadow-[2px_2px_0_0_#0f172a] transition-all ${
                isNavigatingToEditor
                  ? 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200 pointer-events-none'
                  : 'bg-indigo-300 dark:bg-indigo-900 text-slate-900 dark:text-slate-100 hover:translate-y-1 hover:translate-x-1 hover:shadow-none'
              }`}
            >
              {isNavigatingToEditor ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Membuka...
                </>
              ) : (
                <>
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  Edit Album
                </>
              )}
            </Link>
          )}
          <p className="text-xs text-muted text-center dark:text-slate-400">
            {isClickable
            ? album.type === 'yearbook' && onYearbookPublicChoice
              ? 'Klik untuk pilih tampilan'
              : !isPaid && isIndividualPayment
                ? 'Bayar untuk buka'
                : 'Klik untuk buka'
            : statusLabel === 'pending'
              ? 'Menunggu persetujuan admin'
              : isApproved && !isPaid
                ? 'Selesaikan pembayaran untuk akses'
                : statusLabel === 'declined'
                  ? 'Akses dibatasi, hubungi customer service'
                  : 'Klik untuk buka'}
          </p>
        </div>
      )}
    </div>
  )

  return <CardContent />
}

export default function AlbumsView({ variant, initialData, fetchUrl = '/api/albums', linkContext, active = true }: AlbumsViewProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [navigatingAlbumId, setNavigatingAlbumId] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState<string | null>(null)
  const [inviteModal, setInviteModal] = useState<{ link: string; code: string; albumName: string } | null>(null)
  const [inviteLinkInput, setInviteLinkInput] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<AlbumRow | null>(null)
  const [invoicePopupUrl, setInvoicePopupUrl] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [showJoinForm, setShowJoinForm] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showPreviewForm, setShowPreviewForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [previewInput, setPreviewInput] = useState('')
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [yearbookOpenChoice, setYearbookOpenChoice] = useState<AlbumRow | null>(null)
  /** True sampai GET unlock-feature selesai — hanya mengatur tombol Flipbook, bukan Kartu. */
  const [yearbookChoiceFlipbookPending, setYearbookChoiceFlipbookPending] = useState(false)
  const [yearbookChoiceFlipbook, setYearbookChoiceFlipbook] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const router = useRouter()
  const pathname = usePathname()
  const isAdmin = variant === 'admin'
  const resolvedLinkContext = linkContext ?? (isAdmin ? 'admin' : 'user')
  const linkBasePath = resolvedLinkContext === 'admin' ? '/admin' : '/user'
  const hasFetchedRef = useRef<boolean>((() => {
    if (initialData) return true
    if (typeof window === 'undefined') return false
    try {
      const raw = window.sessionStorage.getItem(`albums_v1:${variant}:${linkContext ?? (variant === 'admin' ? 'admin' : 'user')}:${fetchUrl}`)
      if (!raw) return false
      const parsed = JSON.parse(raw) as { ts: number; data: AlbumRow[] }
      return Array.isArray(parsed?.data)
    } catch { return false }
  })())
  const isFetchingRef = useRef(false)
  const lastRealtimeFetchRef = useRef(0)

  const cacheKey = `albums_v1:${variant}:${resolvedLinkContext}:${fetchUrl}`

  const [albums, setAlbums] = useState<AlbumRow[]>(() => {
    if (initialData) return initialData
    if (typeof window === 'undefined') return []
    try {
      const raw = window.sessionStorage.getItem(cacheKey)
      if (!raw) return []
      const parsed = JSON.parse(raw) as { ts: number; data: AlbumRow[] }
      return Array.isArray(parsed?.data) ? parsed.data : []
    } catch {
      return []
    }
  })
  const [loading, setLoading] = useState(() => {
    if (initialData) return false
    if (typeof window === 'undefined') return true
    try {
      const raw = window.sessionStorage.getItem(cacheKey)
      if (!raw) return true
      const parsed = JSON.parse(raw) as { ts: number; data: AlbumRow[] }
      return !Array.isArray(parsed?.data)
    } catch {
      return true
    }
  })

  // Cache is hydrated in state initializer (no skeleton flash).
  useEffect(() => {
    if (!initialData && albums.length > 0) {
      hasFetchedRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closeYearbookPublicChoice = useCallback(() => {
    setYearbookOpenChoice(null)
    setYearbookChoiceFlipbook(false)
    setYearbookChoiceFlipbookPending(false)
  }, [])

  const beginYearbookPublicChoice = useCallback((album: AlbumRow) => {
    const aid = album.album_id ?? album.id
    setYearbookOpenChoice(album)
    setYearbookChoiceFlipbookPending(true)
    setYearbookChoiceFlipbook(false)
    void (async () => {
      try {
        const res = await fetchWithAuth(`/api/albums/${aid}/unlock-feature`, {
          credentials: 'include',
          cache: 'no-store',
        })
        const data = (await res.json().catch(() => ({}))) as {
          flipbook_enabled_by_package?: boolean
          unlocked_features?: string[]
          flipbook_unlocked_on_album?: boolean
        }
        const pkg = data.flipbook_enabled_by_package === true
        const mine = Array.isArray(data.unlocked_features) && data.unlocked_features.includes('flipbook')
        const onAlbum = data.flipbook_unlocked_on_album === true
        setYearbookChoiceFlipbook(pkg || mine || onAlbum)
      } catch {
        setYearbookChoiceFlipbook(false)
      } finally {
        setYearbookChoiceFlipbookPending(false)
      }
    })()
  }, [])

  const filteredAlbums = useMemo(() => {
    if (!searchQuery.trim()) return albums
    const q = searchQuery.trim().toLowerCase()
    return albums.filter((a) =>
      a.name?.toLowerCase().includes(q) ||
      a.school_city?.toLowerCase().includes(q) ||
      a.pic_name?.toLowerCase().includes(q) ||
      (a.package_snapshot?.name || a.pricing_packages?.name)?.toLowerCase().includes(q) ||
      a.wa_e164?.includes(q)
    )
  }, [albums, searchQuery])

  const paginatedAlbums = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredAlbums.slice(start, start + itemsPerPage)
  }, [filteredAlbums, currentPage, itemsPerPage])
  const totalPages = Math.ceil(filteredAlbums.length / itemsPerPage)

  const fetchAlbums = useCallback(async (silent = false) => {
    if (isFetchingRef.current) return
    if (!silent) setLoading(true)
    try {
      isFetchingRef.current = true
      const res = await fetchWithAuth(fetchUrl, { credentials: 'include', cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch albums')
      const data = await res.json()
      setAlbums(Array.isArray(data) ? (data as AlbumRow[]) : [])
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }))
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      isFetchingRef.current = false
      setLoading(false)
    }
  }, [fetchUrl, cacheKey])

  useEffect(() => {
    if (initialData && initialData.length >= 0) {
      hasFetchedRef.current = true
    }
  }, [initialData])

  // Fetch data on mount or when tab becomes active
  useEffect(() => {
    if (initialData) return // SSR data provided, skip client fetch
    if (!active) {
      // Inactive tab: fetch silently if never fetched
      if (!hasFetchedRef.current) {
        fetchAlbums(true)
        hasFetchedRef.current = true
      }
      return
    }
    // Active: always fetch fresh data (handles navigation from pricing → albums)
    fetchAlbums(hasFetchedRef.current) // silent if already fetched once
    hasFetchedRef.current = true
  }, [active, fetchUrl, initialData, fetchAlbums])

  useEffect(() => {
    if (!active) return
    const onVisible = () => {
      const now = Date.now()
      if (now - lastRealtimeFetchRef.current < 500) return
      lastRealtimeFetchRef.current = now
      fetchAlbums(true)
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)

    // Realtime: refresh daftar album saat ada mutasi album dari device lain
    const onRealtime = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; channel?: string; payload?: Record<string, unknown> }>).detail
      if (!detail?.type || detail.channel !== 'global') return
      const path = typeof detail.payload?.path === 'string' ? detail.payload.path : ''
      if (!path.startsWith('/api/albums')) return
      const now = Date.now()
      if (now - lastRealtimeFetchRef.current < 2000) return // throttle 2s
      lastRealtimeFetchRef.current = now
      fetchAlbums(true)
    }
    window.addEventListener('fresh:realtime', onRealtime)

    return () => {
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('fresh:realtime', onRealtime)
    }
  }, [fetchAlbums, fetchUrl, resolvedLinkContext, variant, active])

  const handleApprove = async (e: React.MouseEvent, album: AlbumRow) => {
    e.stopPropagation()
    setLoadingId(album.id)
    try {
      const res = await fetchWithAuth(`/api/albums/${album.id}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) })
      if (!res.ok) {
        const err = asObject(await res.json().catch(() => ({})))
        toast.error(getErrorMessage(err, 'Gagal menyetujui album'))
        return
      }
      toast.success(`Album ${album.name} disetujui`)
      await fetchAlbums(true)
    } finally {
      setLoadingId(null)
    }
  }

  const handleDecline = async (e: React.MouseEvent, album: AlbumRow) => {
    e.stopPropagation()
    setLoadingId(album.id)
    try {
      const res = await fetchWithAuth(`/api/albums/${album.id}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'declined' }) })
      if (!res.ok) {
        const err = asObject(await res.json().catch(() => ({})))
        toast.error(getErrorMessage(err, 'Gagal menolak album'))
        return
      }
      toast.warning(`Album ${album.name} ditolak`)
      await fetchAlbums(true)
    } finally {
      setLoadingId(null)
    }
  }

  const handleInvite = async (album: AlbumRow) => {
    const albumId = album.id
    if (!albumId) return

    if (album.type === 'yearbook' && (album.status ?? 'pending') !== 'approved') {
      toast.error('Album yearbook harus disetujui dulu sebelum bisa mengundang teman.')
      return
    }

    setInviteLoading(albumId)
    try {
      const res = await fetchWithAuth(`/api/albums/${albumId}/invite`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = asObject(await res.json().catch(() => ({})))
      if (!res.ok) {
        toast.error(getErrorMessage(data, 'Gagal membuat link undangan'))
        return
      }
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const code = asString(data.token) ?? ''
      const link = asString(data.inviteLink) ?? `${origin}/join/${code}`
      setInviteModal({ link, code, albumName: album.name })
      toast.success(`Link undangan untuk ${album.name} berhasil dibuat`)
    } catch {
      toast.error('Gagal membuat link undangan')
    } finally {
      setInviteLoading(null)
    }
  }

  const handleDelete = async (e: React.MouseEvent, album: AlbumRow) => {
    e.stopPropagation()
    setDeleteConfirm(album)
  }

  const confirmDelete = async () => {
    if (!deleteConfirm) return
    const album = deleteConfirm
    setDeleteConfirm(null)
    setLoadingId(album.id)
    try {
      const res = await fetchWithAuth(`/api/albums/${album.id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) {
        const err = asObject(await res.json().catch(() => ({})))
        toast.error(getErrorMessage(err, 'Gagal menghapus album'))
        return
      }
      toast.info(`Album ${album.name} berhasil dihapus`)
      await fetchAlbums(true)
    } finally {
      setLoadingId(null)
    }
  }
  const handlePay = async (album: AlbumRow) => {
    setLoadingId(album.id)
    try {
      const isIndividual = album.individual_payments_enabled === 1 && album.isOwner === false
      const endpoint = isIndividual 
        ? `/api/albums/${album.id}/member-checkout` 
        : `/api/albums/${album.id}/checkout`
      
      const payload = isIndividual ? { access_id: album.member_access_id } : {}

      const res = await fetchWithAuth(endpoint, {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(payload)
      })
      const data = asObject(await res.json().catch(() => ({})))
      if (!res.ok) {
        toast.error(getErrorMessage(data, 'Gagal memproses pembayaran'))
        return
      }
      const invoiceUrl = asString(data.invoiceUrl)
      if (invoiceUrl) {
        setInvoicePopupUrl(invoiceUrl)
        fetchAlbums(true) // Refresh data untuk simpan payment_url
      }
    } catch {
      toast.error('Gagal memproses pembayaran')
    } finally {
      setLoadingId(null)
    }
  }

  const handleRowClick = (album: AlbumRow) => {
    const destinationUrl = album.type === 'public'
      ? `${linkBasePath}/album/public/${album.id}`
      : `${linkBasePath}/album/yearbook/${album.album_id ?? album.id}`
    router.push(destinationUrl)
  }

  // Pastikan tidak ada double scrollbar saat popup Xendit terbuka
  useEffect(() => {
    if (invoicePopupUrl) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [invoicePopupUrl])

  // Prefetch likely destinations so opening editor feels instant.
  useEffect(() => {
    if (!active || albums.length === 0) return
    const topAlbums = albums.slice(0, 24)
    for (const album of topAlbums) {
      const albumId = album.album_id ?? album.id
      const destinationUrl = album.type === 'public'
        ? `${linkBasePath}/album/public/${album.id}`
        : `${linkBasePath}/album/yearbook/${albumId}`
      try { router.prefetch(destinationUrl) } catch { }

      if (album.type === 'yearbook') {
        const editorUrl = getYearbookSectionQueryUrl(albumId, 'cover', pathname || null)
        try { router.prefetch(editorUrl) } catch { }
      }
    }
  }, [active, albums, linkBasePath, pathname, router])

  const handleOpenInviteLink = async () => {
    setJoinError(null)
    const parsed = parseInviteToken(inviteLinkInput)
    if (!parsed) {
      setJoinError('Masukkan kode undangan atau tempel link.')
      return
    }
    const { token, type } = parsed
    if (type === 'invite') {
      router.push(`/invite/${token}`)
      return
    }
    setJoinLoading(true)
    try {
      const res = await fetchWithAuth(`/api/albums/invite/${encodeURIComponent(token)}/join`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = asObject(await res.json().catch(() => ({})))
      if (res.ok) {
        const redirectTo = asString(data.redirectTo)
        if (redirectTo) {
          setJoinError('')
          router.push(redirectTo)
          return
        }
        const albumId = asString(data.albumId)
        if (albumId) {
          router.push(`${linkBasePath}/album/yearbook/${albumId}`)
        } else {
          fetchAlbums(true)
          setInviteLinkInput('')
        }
        return
      }
      if (type === 'code' && res.status === 404) {
        const redirectTo = asString(data.redirectTo)
        if (redirectTo) {
          setJoinError('')
          router.push(redirectTo)
          return
        }
        const checkRes = await fetchWithAuth(`/api/albums/invite/${encodeURIComponent(token)}`)
        if (checkRes.ok) {
          setJoinError('')
          router.push(`/invite/${token}`)
          return
        }
      }
      setJoinError(getErrorMessage(data, 'Gagal bergabung.'))
    } catch {
      setJoinError('Gagal bergabung. Coba lagi.')
    } finally {
      setJoinLoading(false)
    }
  }

  const handleOpenPreview = () => {
    setPreviewError(null)
    const albumId = ((): string | null => {
      const trimmed = previewInput.trim()
      if (!trimmed) return null
      const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
      try {
        if (trimmed.startsWith('http')) {
          const url = new URL(trimmed)
          const match = url.pathname.match(/\/album\/([^/]+)/)
          if (match) return match[1]
        }
      } catch { /* ignore */ }
      const uuidMatch = trimmed.match(uuidPattern)
      if (uuidMatch) return uuidMatch[0]
      return null
    })()

    if (!albumId) {
      setPreviewError('Masukkan link View atau Album ID yang valid.')
      return
    }
    const isFlipbook = previewInput.toLowerCase().includes('/flipbook')
    router.push(`/album/${albumId}/${isFlipbook ? 'flipbook' : 'preview'}`)
    setPreviewInput('')
  }

  const handlePastePreview = async () => {
    setPreviewError(null)
    try {
      const text = await navigator.clipboard.readText()
      if (text) setPreviewInput(text)
    } catch {
      setPreviewError('Gagal baca clipboard.')
    }
  }

  const title = isAdmin ? 'Manajemen Album' : 'Album Saya'
  const subtitle = isAdmin ? 'Kelola status dan data album.' : 'Daftar album Anda.'
  const showroomHref = resolvedLinkContext === 'admin' ? '/admin/showroom' : '/user/showroom'
  const publicCreateHref = resolvedLinkContext === 'admin' ? '/admin/album/public/create' : '/user/album/public/create'

  return (
    <div>
      
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div 
            className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] border-2 border-slate-900 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="bg-rose-100 dark:bg-rose-900/30 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6 text-rose-600 dark:text-rose-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Hapus Album?</h3>
            <p className="text-slate-600 dark:text-slate-300 mb-6 text-sm">
              Anda yakin ingin menghapus album <span className="font-bold">"{deleteConfirm.name}"</span>?
              Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 py-3 rounded-xl bg-rose-500 text-white text-sm font-bold hover:bg-rose-600 transition-colors shadow-[2px_2px_0_0_#0f172a] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {invoicePopupUrl && (
        <div className="fixed inset-0 z-[110] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="Selesaikan pembayaran">
          <div className="flex items-center justify-between px-4 py-3 border-b-4 border-slate-900 bg-slate-50 dark:bg-slate-800 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-white" strokeWidth={3} />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Selesaikan Pembayaran</h3>
            </div>
            <button
              type="button"
              onClick={() => setInvoicePopupUrl(null)}
              className="flex items-center justify-center w-10 h-10 rounded-xl border-2 border-slate-900 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-900 hover:text-red-500 shadow-[#64748b] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 min-h-0 relative">
            <iframe
              src={invoicePopupUrl}
              title="Invoice Xendit"
              className="absolute inset-0 w-full h-full border-0"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation"
              allow="payment"
            />
          </div>
        </div>
      )}

      {/* 1. Search Bar - Paling Atas */}
      {/* 1. Header: Title & Action Buttons Row */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{title}</h1>
          <p className="text-slate-600 dark:text-slate-300 font-medium text-xs md:text-sm">{subtitle}</p>
        </div>

        <div className="flex flex-nowrap items-center gap-2 w-full md:w-auto min-w-0">
          {/* View Toggle Button - flex-1 di mobile agar lebar sama dengan card */}
          <button
            type="button"
            onClick={() => {
              setShowPreviewForm(!showPreviewForm)
              if (showSearch) setShowSearch(false)
              if (showJoinForm) setShowJoinForm(false)
            }}
            className={`flex-1 min-w-0 md:flex-initial inline-flex items-center justify-center gap-1 sm:gap-2 px-2 py-2 sm:px-4 sm:py-2 text-[10px] sm:text-sm font-black rounded-lg sm:rounded-xl border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] transition-all active:scale-95 ${showPreviewForm ? 'bg-slate-200 text-slate-600 dark:bg-slate-800' : 'bg-emerald-400 text-slate-900 dark:bg-emerald-900/40 dark:text-emerald-200 hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none'}`}
          >
            <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="whitespace-nowrap truncate">{showPreviewForm ? 'Tutup' : 'View'}</span>
          </button>

          {/* Join Project Button */}
          <button
            type="button"
            onClick={() => {
              setShowJoinForm(!showJoinForm)
              if (showSearch) setShowSearch(false)
              if (showPreviewForm) setShowPreviewForm(false)
            }}
            className={`flex-1 min-w-0 md:flex-initial inline-flex items-center justify-center gap-1 sm:gap-2 px-2 py-2 sm:px-4 sm:py-2 text-[10px] sm:text-sm font-black rounded-lg sm:rounded-xl border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] transition-all active:scale-95 ${showJoinForm ? 'bg-slate-200 text-slate-600 dark:bg-slate-800' : 'bg-orange-400 text-slate-900 dark:bg-orange-900/40 dark:text-orange-200 hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none'}`}
          >
            <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="whitespace-nowrap truncate">{showJoinForm ? 'Tutup' : 'Join'}</span>
          </button>

          {/* Search Toggle Button */}
          <button
            type="button"
            onClick={() => {
              setShowSearch(!showSearch)
              if (showJoinForm) setShowJoinForm(false)
              if (showPreviewForm) setShowPreviewForm(false)
            }}
            className={`flex-1 min-w-0 md:flex-initial inline-flex items-center justify-center gap-1 sm:gap-2 px-2 py-2 sm:px-4 sm:py-2 text-[10px] sm:text-sm font-black rounded-lg sm:rounded-xl border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] transition-all active:scale-95 ${showSearch ? 'bg-slate-200 text-slate-600 dark:bg-slate-800' : 'bg-sky-400 text-slate-900 dark:bg-sky-900/40 dark:text-sky-200 hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none'}`}
          >
            <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="whitespace-nowrap truncate">{showSearch ? 'Tutup' : 'Search'}</span>
          </button>
        </div>
      </div>

      {/* 2. Revealable Forms (View, Search or Join) */}
      <div className="mb-8">
        {/* View Form */}
        {showPreviewForm && (
          <div className="flex flex-col sm:flex-row gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 border-2 border-slate-900 dark:border-slate-700 rounded-2xl animate-in slide-in-from-top-2 duration-200 shadow-inner max-w-2xl mx-auto w-full">
            <div className="flex-1 relative">
              <input
                type="text"
                autoFocus
                value={previewInput}
                onChange={(e) => { setPreviewInput(e.target.value); setPreviewError(null) }}
                onKeyDown={(e) => e.key === 'Enter' && handleOpenPreview()}
                placeholder="Tempel link View atau Album ID..."
                className="w-full px-4 py-2.5 text-sm font-bold rounded-xl bg-white border-2 border-slate-900 shadow-inner text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 transition-all"
              />
              {previewError && <p className="text-[10px] text-red-500 absolute -bottom-4 left-1 font-bold">{previewError}</p>}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePastePreview}
                className="px-3 py-2.5 rounded-xl bg-white border-2 border-slate-900 text-slate-600 shadow-[2px_2px_0_0_#0f172a] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
                title="Tempel"
              >
                <ClipboardPaste className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={handleOpenPreview}
                className="px-6 py-2.5 text-sm font-black rounded-xl bg-slate-900 text-white shadow-[2px_2px_0_0_#0f172a] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
              >
                Buka View
              </button>
            </div>
          </div>
        )}

        {/* Search Form */}
        {showSearch && (
          <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-2xl animate-in slide-in-from-top-2 duration-200 shadow-inner max-w-2xl mx-auto w-full">
            <Search className="w-5 h-5 text-slate-400 shrink-0" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
              placeholder="Cari nama project, sekolah, atau paket..."
              className="flex-1 min-w-0 bg-transparent text-base font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
          </div>
        )}

        {/* 3. Revealable Join Form - Muncul di bawah row header */}
        {showJoinForm && (
          <div className="flex flex-col sm:flex-row gap-3 p-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-2xl animate-in slide-in-from-top-2 duration-200 shadow-inner max-w-2xl mx-auto w-full">
            <div className="flex-1 relative">
              <input
                type="text"
                autoFocus
                value={inviteLinkInput}
                onChange={(e) => { setInviteLinkInput(e.target.value); setJoinError(null) }}
                onKeyDown={(e) => e.key === 'Enter' && handleOpenInviteLink()}
                placeholder="Masukan kode undangan..."
                className="w-full px-4 py-2.5 text-sm font-bold rounded-xl bg-white border-2 border-slate-900 shadow-inner text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all"
              />
              {joinError && <p className="text-[10px] text-red-500 absolute -bottom-4 left-1 font-bold">{joinError}</p>}
            </div>
            <button
              type="button"
              onClick={handleOpenInviteLink}
              disabled={joinLoading}
              className="px-6 py-2.5 text-sm font-black rounded-xl bg-slate-900 text-white shadow-[2px_2px_0_0_#0f172a] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all disabled:opacity-50"
            >
              {joinLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Gas Lanjut!'}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        isAdmin ? (
          <>
            <div className="md:hidden grid grid-cols-1 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="border-2 border-slate-900 dark:border-slate-700 rounded-3xl p-5 bg-white dark:bg-slate-900 shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] animate-pulse space-y-4">
                  <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                  <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-1/2" />
                  <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-full" />
                  <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded w-1/3 mt-2" />
                </div>
              ))}
            </div>
            <div className="hidden md:block bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-3xl overflow-hidden animate-pulse shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155]">
              <div className="h-14 bg-emerald-200 dark:bg-slate-800 border-b-2 border-slate-900 dark:border-slate-700 w-full" />
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex items-center px-5 py-5 border-b-2 border-slate-100 dark:border-slate-700 gap-4">
                  <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
                  <div className="h-5 bg-slate-100 dark:bg-slate-800 rounded w-1/6" />
                  <div className="h-5 bg-slate-100 dark:bg-slate-800 rounded w-1/6 hidden sm:block" />
                  <div className="h-5 bg-slate-100 dark:bg-slate-800 rounded w-1/6 hidden md:block" />
                  <div className="h-10 w-10 bg-slate-200 dark:bg-slate-700 border-2 border-slate-900 dark:border-slate-700 rounded-xl ml-auto" />
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="relative border-2 border-slate-900 dark:border-slate-700 rounded-3xl p-4 sm:p-5 flex flex-col h-full bg-white dark:bg-slate-900 animate-pulse min-h-[120px] shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155]">
                <div className="aspect-[4/3] w-full bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-2xl mb-4 overflow-hidden" />
                <div className="flex justify-between items-start gap-2 mb-2">
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-md flex-1 min-w-0" />
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex flex-col items-center gap-2">
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )
      ) : filteredAlbums.length === 0 ? (
        <div className="text-center py-12 sm:py-16 border-2 border-slate-900 dark:border-slate-700 rounded-3xl bg-white dark:bg-slate-900 shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155]">
          <h3 className="text-base font-black text-slate-900 dark:text-white sm:text-xl tracking-tight">
            {albums.length === 0 ? (isAdmin ? 'Belum ada data' : 'Belum ada album') : 'Tidak ada hasil'}
          </h3>
          <p className="text-slate-500 dark:text-slate-300 font-bold text-sm sm:text-base mt-2">
            {albums.length === 0 ? 'Order Yearbook dari Showroom untuk memulai.' : 'Coba kata kunci lain.'}
          </p>
        </div>
      ) : isAdmin ? (
        <>
          {/* Mobile: kartu dengan nama, paket, kota, WA, estimasi, status + tombol simetris */}
          <div className="md:hidden grid grid-cols-1 gap-3">
            {paginatedAlbums.map((album) => {
              const isProcessing = loadingId === album.id
              const destUrl = album.type === 'public'
                ? `/admin/album/public/${album.id}`
                : `/admin/album/yearbook/${album.album_id ?? album.id}`
              const addonTotal = (album.package_snapshot?.features || []).reduce((sum, f) => {
                try {
                  const parsed = typeof f === 'string' ? JSON.parse(f) : f
                  return sum + (parsed.price || 0)
                } catch {
                  return sum
                }
              }, 0)
              const pricePerStudent = (album.package_snapshot?.price_per_student || 0) + addonTotal
              const totalEstimasi = album.students_count && pricePerStudent ? album.students_count * pricePerStudent : (album.total_estimated_price || 0)
              const estimasiTotal = totalEstimasi > 0
                ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(totalEstimasi)
                : '-'
              const estimasiTerkumpul = album.collected_amount
                ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(album.collected_amount)
                : 'Rp 0'
              const estimasiText = totalEstimasi > 0 ? `${estimasiTerkumpul} / ${estimasiTotal}` : '-'
              return (
                <div key={album.id} className="rounded-3xl border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 flex flex-col gap-4 shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] hover:shadow-none hover:translate-y-0.5 hover:translate-x-0.5 transition-all">
                  <div className="space-y-1.5 text-[13px] sm:text-sm font-bold text-slate-600 dark:text-slate-400">
                    <p className="font-black text-slate-900 dark:text-white text-[15px] sm:text-base break-words mb-2">{album.name}</p>
                    {album.pic_name && (
                      <p><span className="text-slate-400 dark:text-slate-500">Nama:</span> <span className="text-slate-800 dark:text-slate-200">{album.pic_name}</span></p>
                    )}
                    <p><span className="text-slate-400 dark:text-slate-500">Paket:</span> <span className="text-slate-800 dark:text-slate-200">{(album.package_snapshot?.name || album.pricing_packages?.name) || '-'}</span></p>
                    <p><span className="text-slate-400 dark:text-slate-500">Kota:</span> <span className="text-slate-800 dark:text-slate-200">{album.school_city || '-'}</span></p>
                    <p><span className="text-slate-400 dark:text-slate-500">WA:</span> <span className="text-slate-800 dark:text-slate-200">{album.wa_e164 || '-'}</span></p>
                    {album.students_count != null && album.students_count > 0 && (
                      <p><span className="text-slate-400 dark:text-slate-500">Siswa:</span> <span className="text-slate-800 dark:text-slate-200">{album.students_count}</span></p>
                    )}
                    <p><span className="text-slate-400 dark:text-slate-500">Estimasi:</span> <span className="text-slate-800 dark:text-slate-200">{estimasiText}</span></p>
                    <div className="mt-2 pt-1 flex flex-wrap gap-2">
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] ${(album.status ?? 'pending') === 'approved' ? 'bg-emerald-300 dark:bg-emerald-700 text-slate-900 dark:text-white' :
                          (album.status ?? 'pending') === 'pending' ? 'bg-orange-300 dark:bg-orange-700 text-slate-900 dark:text-white' :
                            (album.status ?? 'pending') === 'declined' ? 'bg-red-400 dark:bg-red-700 text-white' :
                              'bg-indigo-300 dark:bg-indigo-700 text-slate-900 dark:text-white'
                          }`}>
                        {album.status ?? 'pending'}
                      </span>
                      {album.type === 'yearbook' && (album.status ?? 'pending') === 'approved' && (
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] ${album.payment_status === 'paid' ? 'bg-emerald-300 dark:bg-emerald-700 text-slate-900 dark:text-white' : 'bg-red-400 dark:bg-red-700 text-white'}`}>
                          {album.payment_status === 'paid' ? 'Lunas' : 'Belum Bayar'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-4 border-t-2 border-slate-900 dark:border-slate-700">
                    <Link
                      href={destUrl}
                      className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1 px-3 py-2.5 text-xs font-black rounded-xl bg-sky-400 dark:bg-sky-600 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
                    >
                      Details <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                    {album.type === 'yearbook' && (album.status ?? 'pending') !== 'approved' && (
                      <button
                        type="button"
                        disabled={!!loadingId}
                        onClick={(e) => { e.preventDefault(); handleApprove(e as any, album) }}
                        className="flex items-center justify-center gap-1 px-3 py-2.5 text-xs font-black rounded-xl bg-emerald-400 dark:bg-emerald-600 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all disabled:opacity-50"
                      >
                        {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
                      </button>
                    )}
                    {album.type === 'yearbook' && (album.status ?? 'pending') !== 'declined' && (
                      <button
                        type="button"
                        disabled={!!loadingId}
                        onClick={(e) => { e.preventDefault(); handleDecline(e as any, album) }}
                        className="flex items-center justify-center gap-1 px-3 py-2.5 text-xs font-black rounded-xl bg-orange-400 dark:bg-orange-600 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" /> Decline
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!!loadingId}
                      onClick={(e) => { e.preventDefault(); handleDelete(e as any, album) }}
                      className="flex items-center justify-center gap-1 px-3 py-2.5 text-xs font-black rounded-xl bg-red-500 dark:bg-red-700 border-2 border-slate-900 dark:border-slate-700 text-white shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Hapus
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {/* Desktop: tabel */}
          <div className="hidden md:block bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-3xl overflow-hidden shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155]">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-emerald-300 dark:bg-slate-900 border-b-2 border-slate-900 dark:border-slate-700">
                  <tr>
                    <th className="px-3 py-3 text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-wider">Nama Project</th>
                    <th className="px-3 py-3 text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-wider text-center">Paket</th>
                    <th className="px-3 py-3 text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-wider text-center">WA</th>
                    <th className="px-3 py-3 text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-wider text-center hidden lg:table-cell">Siswa</th>
                    <th className="px-3 py-3 text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-wider text-center hidden xl:table-cell">Estimasi</th>
                    <th className="px-3 py-3 text-center text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-wider">Status</th>
                    <th className="px-3 py-3 text-right text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-slate-100 dark:divide-slate-700">
                  {paginatedAlbums.map((album) => {
                    const isProcessing = loadingId === album.id
                    const addonTotal = (album.package_snapshot?.features || []).reduce((sum, f) => {
                      try {
                        const parsed = typeof f === 'string' ? JSON.parse(f) : f
                        return sum + (parsed.price || 0)
                      } catch {
                        return sum
                      }
                    }, 0)
                    const pricePerStudent = (album.package_snapshot?.price_per_student || 0) + addonTotal
                    const totalEstimasi = album.students_count && pricePerStudent ? album.students_count * pricePerStudent : (album.total_estimated_price || 0)
                    const estimasiTotal = totalEstimasi > 0
                      ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(totalEstimasi)
                      : '-'
                    const estimasiTerkumpul = album.collected_amount ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(album.collected_amount) : 'Rp 0'
                    const estimasiText = totalEstimasi > 0 ? `${estimasiTerkumpul} / ${estimasiTotal}` : '-'
                    return (
                      <tr
                        key={album.id}
                        onClick={() => handleRowClick(album)}
                        className="group hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer"
                      >
                        <td className="px-3 py-2.5 text-[14px] font-black text-slate-900 dark:text-white">
                          <div className="flex flex-col gap-0.5">
                            <span className="break-words line-clamp-1">{album.name}</span>
                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 dark:text-slate-300">
                              {album.school_city && <span>{album.school_city}</span>}
                              {album.pic_name && (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-500" />
                                  <span className="text-slate-400 dark:text-slate-400">{album.pic_name}</span>
                                </>
                              )}
                              {album.type === 'public' && (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-500" />
                                  <span className="text-sky-500 dark:text-sky-400 uppercase tracking-tighter">Personal</span>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 text-center whitespace-nowrap">
                          {(album.package_snapshot?.name || album.pricing_packages?.name) || '-'}
                        </td>
                        <td className="px-3 py-2.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 text-center whitespace-nowrap">
                          {album.wa_e164 || '-'}
                        </td>
                        <td className="px-3 py-2.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 text-center hidden lg:table-cell whitespace-nowrap">
                          {album.students_count || '-'}
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-slate-600 dark:text-slate-300 font-bold text-center hidden xl:table-cell whitespace-nowrap">
                          {estimasiText}
                        </td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          <div className="flex flex-col items-center gap-1">
                            <span
                              className={`inline-block px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] ${
                                (album.status ?? 'pending') === 'approved'
                                  ? 'bg-emerald-300 dark:bg-emerald-700 text-slate-900 dark:text-white'
                                  : (album.status ?? 'pending') === 'pending'
                                  ? 'bg-orange-300 dark:bg-orange-700 text-slate-900 dark:text-white'
                                  : (album.status ?? 'pending') === 'declined'
                                  ? 'bg-red-400 dark:bg-red-700 text-white'
                                  : 'bg-indigo-300 dark:bg-indigo-700 text-slate-900 dark:text-white'
                              }`}>
                              {album.status ?? 'pending'}
                            </span>
                            {album.type === 'yearbook' && (album.status ?? 'pending') === 'approved' && (
                              <span
                                className={`inline-block px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] ${
                                  album.payment_status === 'paid'
                                    ? 'bg-emerald-300 dark:bg-emerald-700 text-slate-900 dark:text-white'
                                    : 'bg-red-400 dark:bg-red-700 text-white'
                                }`}>
                                {album.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {album.type === 'yearbook' && (
                              <>
                                {(album.status ?? 'pending') !== 'approved' && (
                                  <button
                                    onClick={(e) => handleApprove(e, album)}
                                    disabled={!!loadingId}
                                    className="p-1 rounded-md bg-emerald-300 border-2 border-slate-900 text-slate-900 shadow-[1.5px_1.5px_0_0_#0f172a] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-50 transition-all"
                                    title="Approve"
                                  >
                                    {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                  </button>
                                )}
                                {(album.status ?? 'pending') !== 'declined' && (
                                  <button
                                    onClick={(e) => handleDecline(e, album)}
                                    disabled={!!loadingId}
                                    className="p-1 rounded-md bg-orange-300 border-2 border-slate-900 text-slate-900 shadow-[1.5px_1.5px_0_0_#0f172a] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-50 transition-all"
                                    title="Decline"
                                  >
                                    {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                                  </button>
                                )}
                              </>
                            )}
                            <button
                              onClick={(e) => handleDelete(e, album)}
                              disabled={!!loadingId}
                              className="p-1 rounded-md bg-red-400 border-2 border-slate-900 text-white shadow-[1.5px_1.5px_0_0_#0f172a] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-50 transition-all"
                              title="Hapus"
                            >
                              {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {paginatedAlbums.map((album) => (
            <AlbumCard
              key={album.id}
              album={album}
              variant={variant}
              basePath={linkBasePath}
              pathname={pathname}
              onApprove={isAdmin ? (e) => handleApprove(e as any, album) : undefined}
              onDecline={isAdmin ? (e) => handleDecline(e as any, album) : undefined}
              onDelete={isAdmin ? (e) => handleDelete(e as any, album) : undefined}
              onInvite={!isAdmin ? handleInvite : undefined}
              onPay={!isAdmin ? handlePay : undefined}
              loadingId={loadingId ?? inviteLoading}
              navigatingAlbumId={navigatingAlbumId}
              setNavigatingAlbumId={setNavigatingAlbumId}
              onYearbookPublicChoice={beginYearbookPublicChoice}
            />
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {!loading && filteredAlbums.length > itemsPerPage && (
        <div className="flex items-center justify-between mt-8 flex-wrap gap-4">
          <p className="text-[13px] font-bold text-slate-500">
            Menampilkan {((currentPage - 1) * itemsPerPage) + 1} hingga {Math.min(currentPage * itemsPerPage, filteredAlbums.length)} dari {filteredAlbums.length} entri
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              className="px-4 py-2 text-[13px] font-black rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-50 transition-all"
            >
              Sebelumnya
            </button>
            <div className="flex items-center px-4 py-2 text-[13px] font-black bg-indigo-200 dark:bg-indigo-900 border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] rounded-xl text-slate-900 dark:text-white">
              {currentPage} / {totalPages}
            </div>
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              className="px-4 py-2 text-[13px] font-black rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-50 transition-all"
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}

      {yearbookOpenChoice && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/55 backdrop-blur-md"
          onClick={closeYearbookPublicChoice}
          role="presentation"
        >
          <div
            className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-[1.5rem] p-6 sm:p-8 max-w-md w-full shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="yearbook-open-choice-title"
          >
            <h3 id="yearbook-open-choice-title" className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mb-1 uppercase tracking-tight">
              Buka album
            </h3>
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-6 line-clamp-2">
              {yearbookOpenChoice.name}
            </p>
            {yearbookChoiceFlipbookPending ? (
              <div
                className="flex flex-col items-center justify-center gap-3 py-10 min-h-[200px]"
                aria-live="polite"
                aria-busy="true"
              >
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" aria-hidden />
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Menyiapkan album…</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const id = yearbookOpenChoice.album_id ?? yearbookOpenChoice.id
                    router.push(`/album/${id}/view`)
                    closeYearbookPublicChoice()
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-violet-300 dark:bg-violet-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white text-sm font-black uppercase tracking-wider shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
                >
                  <LayoutGrid className="w-5 h-5 shrink-0" strokeWidth={2.5} />
                  Kartu
                </button>
                {yearbookChoiceFlipbook && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = yearbookOpenChoice.album_id ?? yearbookOpenChoice.id
                      router.push(`/album/${id}/flipbook`)
                      closeYearbookPublicChoice()
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-emerald-300 dark:bg-emerald-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white text-sm font-black uppercase tracking-wider shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
                  >
                    <BookOpen className="w-5 h-5 shrink-0" strokeWidth={2.5} />
                    Flipbook
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeYearbookPublicChoice}
                  className="w-full py-3 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white text-xs font-black uppercase tracking-widest shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
                >
                  Batal
                </button>
              </div>
            )}
          </div>
        </div>
      )}


      {inviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/60 backdrop-blur-sm" onClick={() => setInviteModal(null)}>
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[22px] font-black text-slate-900 dark:text-white mb-1 leading-tight">Undangan Album</h3>
            <p className="font-bold text-slate-600 dark:text-slate-300 mb-4">{inviteModal.albumName}</p>
            <p className="text-[13px] font-bold text-slate-500 dark:text-slate-400 mb-6">Bagikan kode ini; penerima bisa masukkan kode di halaman Album.</p>

            <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
              <span className="w-full sm:w-auto text-lg font-mono font-black text-slate-900 dark:text-white tracking-wider px-4 py-3 rounded-2xl bg-orange-100 dark:bg-orange-950/50 border-2 border-slate-900 dark:border-slate-600 shadow-inner flex-1 text-center sm:text-left">
                {inviteModal.code}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(inviteModal.code)
                  setCopyFeedback(true)
                  setTimeout(() => setCopyFeedback(false), 2000)
                }}
                className="w-full sm:w-auto px-5 py-3 text-[15px] font-black rounded-2xl bg-indigo-300 dark:bg-indigo-600 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
              >
                {copyFeedback ? 'Tersalin!' : 'Salin Kode'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setInviteModal(null)}
              className="w-full py-3 text-[15px] font-black rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
            >
              Tutup
            </button>
          </div>
        </div>
      )
      }
    </div >
  )
}






