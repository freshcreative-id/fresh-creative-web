import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { flushSync } from 'react-dom'
import HTMLFlipBook from 'react-pageflip'
import { Play, ChevronLeft, ChevronRight, Volume2, VolumeX, Music, BookOpen, Maximize2, Minimize2, FlipHorizontal2, Share2, Copy, X } from 'lucide-react'
import { toast } from '@/lib/toast'

const RESIZE_THROTTLE_MS = 150
const FLIP_UPDATE_DELAY_MS = 1200
const READY_DELAY_MS = 120
const DEFAULT_FLIPBOOK_BG_MUSIC = '/sounds/laskar.mp3'
const BG_MUSIC_VOLUME = 0.3

function readFlipbookSoundPref(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  try {
    const v = localStorage.getItem(key)
    return v !== null ? v === '1' : fallback
  } catch {
    return fallback
  }
}
/* Durasi flip 600ms seperti turn.js agar terasa mulus seperti referensi */

type VideoHotspot = {
  id: string
  page_id: string
  video_url: string
  x: number
  y: number
  width: number
  height: number
}

type ManualFlipbookPage = {
  id: string
  page_number: number
  image_url: string
  width?: number
  height?: number
  flipbook_video_hotspots?: VideoHotspot[]
}

type ManualFlipbookViewerProps = {
  pages: ManualFlipbookPage[]
  onPlayVideo?: (url: string) => void
  className?: string
  albumId?: string
  /** true = dipakai di halaman editor user (navbar lebih kecil & jarak longgar agar tidak mepet) */
  isEditorView?: boolean
  /** Dipakai parent saat panel preview hide/show agar ukuran flipbook selalu tersinkron. */
  isVisible?: boolean
  /** Fine-tune vertical centering when used inside different shells (admin/public). */
  centerNudgeDownPxMobile?: number
  centerNudgeDownPxDesktop?: number
  /** Extra vertical breathing room used by scale calculation in preview/public mode. */
  chromePaddingYExtra?: number
  /** Extra horizontal breathing room used by scale calculation in preview/public mode. */
  chromePaddingXExtra?: number
  /** Per-breakpoint padding overrides (preferred over single-value extras). */
  chromePaddingYExtraMobile?: number
  chromePaddingYExtraDesktop?: number
  chromePaddingXExtraMobile?: number
  chromePaddingXExtraDesktop?: number
  /** URL musik latar; null = tanpa musik; undefined = default /sounds/laskar.mp3 */
  backgroundMusicUrl?: string | null
  /** Elemen induk (header + flipbook); jika ada, fullscreen mencakup header atas */
  fullscreenRootRef?: React.RefObject<HTMLElement | null>
}

/* Efek tekukan buku (spine): garis vertikal + lekukan 3D di tepi jilid */
const SpineFoldEffect = ({ side }: { side: 'left' | 'right' }) => (
  <div
    className={`absolute inset-y-0 w-[5%] max-w-[24px] z-10 pointer-events-none page-spine-fold page-spine-fold--${side} ${side === 'right' ? 'right-0 left-auto' : 'left-0 right-auto'}`}
    aria-hidden
  />
)

/* Garis tekukan (hinge crease) lurus khas buku hardcover tebal */
const HardcoverHinge = ({ side }: { side: 'left' | 'right' }) => (
  <div
    className={`absolute inset-y-0 w-[3px] z-30 pointer-events-none bg-black/40 ${side === 'left' ? 'left-[1%] sm:left-[12px]' : 'right-[1%] sm:right-[12px]'} shadow-[0.5px_0_0_rgba(255,255,255,0.4),0_0_5px_rgba(0,0,0,0.3)]`}
    aria-hidden
  />
)

/* Durasi sinkron CSS ↔ JS (cover ↔ back cover) */
const SECTION_FLIP_DURATION_MS = 850
const SECTION_FLIP_MIDPOINT_MS = Math.round(SECTION_FLIP_DURATION_MS * 0.5)

/** Tepi / jilid buku — dipusatkan di poros putar, menghadap kamera saat rotator ±90° */
const SectionFlipSpineEdge = () => (
  <div className="section-flip-spine-scene" aria-hidden>
    <div className="section-flip-spine-block">
      <div className="section-flip-spine-block__pages" />
      <div className="section-flip-spine-block__shade section-flip-spine-block__shade--left" />
      <div className="section-flip-spine-block__shade section-flip-spine-block__shade--right" />
    </div>
  </div>
)

/* Tepi ketebalan cover/back cover (seperti buku asli dilihat dari samping) */
const BookEdgeEffect = ({ side }: { side: 'left' | 'right' }) => (
  <>
    {/* Main thickness edge */}
    <div
      className={`absolute inset-y-0 w-[2.2%] max-w-[12px] z-20 pointer-events-none book-edge book-edge--${side} ${side === 'right' ? 'right-0' : 'left-0'}`}
      aria-hidden
    />
    {/* Highlights for the very edge to give it a sharp corner look */}
    <div
      className={`absolute inset-y-0 w-[0.5%] max-w-[2px] z-30 pointer-events-none bg-white/20 ${side === 'right' ? 'right-0' : 'left-0'}`}
      aria-hidden
    />
  </>
)

const Page = React.memo(React.forwardRef<HTMLDivElement, {
  page: ManualFlipbookPage
  onPlay?: (url: string) => void
  isCover?: boolean
  isBackCover?: boolean
  isMobile?: boolean
}>((props, ref) => (
  <div
    className={`page-content bg-slate-50 dark:bg-slate-900 h-full w-full relative overflow-hidden transition-shadow duration-300 ${props.isCover ? 'page-content--cover ring-2 ring-black/10' : ''} ${props.isBackCover ? 'page-content--back-cover ring-2 ring-black/10' : ''}`}
    style={{ backfaceVisibility: 'hidden' }}
    ref={ref}
  >
    <div className="w-full h-full relative">
      <img
        src={props.page.image_url}
        alt={`Page ${props.page.page_number}`}
        // NOTE: object-cover crops on mismatched aspect ratios.
        // Use contain for most pages so the entire image is visible.
        // For pages with video hotspots we keep cover to preserve hotspot coordinate mapping (percent-based).
        // We prefer contain to avoid cropping. Any empty area uses the page background
        // so the center seam is not a bright white strip.
        className={`w-full h-full pointer-events-none select-none ${
          (props.page.flipbook_video_hotspots?.length ?? 0) > 0
            ? 'object-cover'
            : (props.isMobile ? 'object-contain' : 'object-fill')
        }`}
        draggable={false}
        loading="lazy"
      />
      {props.page.flipbook_video_hotspots?.map(h => (
        <Hotspot key={h.id} h={h} onPlay={props.onPlay} />
      ))}
      {!props.isCover && !props.isBackCover && (
        <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-black/20 to-transparent pointer-events-none opacity-30 z-10" />
      )}
      {props.isCover && (
        <>
          <SpineFoldEffect side="left" />
          <HardcoverHinge side="left" />
          <BookEdgeEffect side="right" />
        </>
      )}
      {props.isBackCover && (
        <>
          <SpineFoldEffect side="right" />
          <HardcoverHinge side="right" />
          <BookEdgeEffect side="left" />
        </>
      )}
    </div>
  </div>
)))
Page.displayName = 'Page'

// Decorative blank page (forwardRef required by react-pageflip) — putih ke abu-abuan tebal
const BLANK_PAGE_STYLE = {
  background: 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 50%, #e2e8f0 100%)',
  boxShadow: 'inset 0 0 40px rgba(0,0,0,0.08), inset 0 0 10px rgba(0,0,0,0.05)'
}
const BlankPage = React.memo(React.forwardRef<HTMLDivElement>(function BlankPage(_, ref) {
  return (
    <div ref={ref} data-blank-page className="page-content blank-page-content h-full w-full relative overflow-hidden border-2 border-slate-900" style={BLANK_PAGE_STYLE}>
      <div className="absolute top-6 left-6 w-12 h-12 border-t-4 border-l-4 border-slate-900/40 rounded-tl-md" />
      <div className="absolute top-6 right-6 w-12 h-12 border-t-4 border-r-4 border-slate-900/40 rounded-tr-md" />
      <div className="absolute bottom-6 left-6 w-12 h-12 border-b-4 border-l-4 border-slate-900/40 rounded-bl-md" />
      <div className="absolute bottom-6 right-6 w-12 h-12 border-b-4 border-r-4 border-slate-900/40 rounded-br-md" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex items-center gap-4 opacity-40">
          <div className="w-16 h-px bg-slate-600" />
          <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
          <div className="w-16 h-px bg-slate-600" />
        </div>
      </div>
      {/* Subtle paper texture overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/paper.png')]" />
    </div>
  )
}))
BlankPage.displayName = 'BlankPage'

// Ukuran "stage" buku (library render di sini, lalu di-scale ke layar)
const BOOK_STAGE_WIDTH = 1400
const BOOK_STAGE_HEIGHT = 900
// Mobile: satu halaman portrait agar usePortrait aktif (blockWidth < pageWidth*2)
const MOBILE_STAGE_WIDTH = 400
const MOBILE_STAGE_HEIGHT_DEFAULT = 600

const FlipBookInner = React.memo(({ flipbookKey, pageElements, isMobileScreen, bookRef, onFlip, onFlipInteract, triggerPrevWithAnimationRef, stageWidth, stageHeight, isCoverOnly, isBackCoverOnly, startPage }: {
  flipbookKey: string
  pageElements: React.ReactNode[]
  isMobileScreen: boolean
  bookRef: React.RefObject<any>
  onFlip: (pageNum: number) => void
  onFlipInteract?: () => void
  triggerPrevWithAnimationRef?: React.MutableRefObject<(() => void) | null>
  stageWidth: number
  stageHeight: number
  isCoverOnly: boolean
  isBackCoverOnly: boolean
  startPage: number
}) => {
  const containerRef = useRef<HTMLDivElement>(null)

  // Di mobile, prev dengan animasi flip: panggil flip(pos) dengan posisi sudut kiri buku (block-relative).
  // Library pakai disableFlipByClick=true jadi flip() hanya jalan kalau isPointOnCorners(pos) true.
  useEffect(() => {
    if (!triggerPrevWithAnimationRef || !isMobileScreen) return
    triggerPrevWithAnimationRef.current = () => {
      const api = bookRef.current?.pageFlip()
      const controller = api?.getFlipController?.()
      if (!api || !controller?.flip) return
      const rect = api.getBoundsRect?.() ?? api.getRender?.()?.getRect?.()
      if (!rect) return
      // Posisi block-relative agar convertToBook jadi kiri buku; operatingDistance ~ width/5
      const margin = Math.min(rect.pageWidth, rect.height) / 5
      const leftX = rect.left + margin
      const topY = rect.top + margin
      controller.flip({ x: leftX, y: topY })
    }
    return () => { triggerPrevWithAnimationRef.current = null }
  }, [triggerPrevWithAnimationRef, isMobileScreen, flipbookKey])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const patched = new WeakSet<Node>()
    const patch = (node: Node) => {
      if (patched.has(node)) return
      patched.add(node)
      const n = node as HTMLElement
      const origRC = n.removeChild?.bind(n)
      const origIB = n.insertBefore?.bind(n)
      if (origRC) n.removeChild = function <T extends Node>(child: T): T { try { return origRC(child) } catch { return child } } as typeof n.removeChild
      if (origIB) n.insertBefore = function <T extends Node>(newNode: T, ref: Node | null): T { try { return origIB(newNode, ref) } catch { return newNode } } as typeof n.insertBefore
    }
    patch(el)
    for (let i = 0; i < el.children.length; i++) patch(el.children[i])
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations)
        for (const node of m.addedNodes)
          if (node.nodeType === 1) {
            patch(node)
            for (let i = 0; i < (node as HTMLElement).children.length; i++) patch((node as HTMLElement).children[i])
          }
    })
    obs.observe(el, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [flipbookKey])

  // Track pointer movement to distinguish between click and swipe
  const startPos = useRef<{ x: number, y: number, side: 'left' | 'right' | null } | null>(null)
  const hasMoved = useRef(false)

  const handlePointerDown = (e: React.PointerEvent) => {
    onFlipInteract?.()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const relX = x / rect.width

    // Penentuan sisi secara absolut terhadap panggung 1400px
    const side = relX < 0.5 ? 'left' : 'right'

    startPos.current = { x: e.clientX, y: e.clientY, side }
    hasMoved.current = false
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startPos.current) return
    const dx = Math.abs(e.clientX - startPos.current.x)
    const dy = Math.abs(e.clientY - startPos.current.y)
    if (dx > 10 || dy > 10) {
      hasMoved.current = true
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!startPos.current) return
    const dx = e.clientX - startPos.current.x
    const dy = e.clientY - startPos.current.y

    // Swipe detection: Minimal movement for responsiveness
    if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
      const flip = bookRef.current?.pageFlip()
      if (flip) {
        // Logika Sisi: 
        // - Jika mulai di sisi kanan panggung dan swipe ke kiri -> Next
        // - Jika mulai di sisi kiri panggung dan swipe ke kanan -> Prev
        if (startPos.current.side === 'right' && dx < -20) {
          flip.flipNext()
        } else if (startPos.current.side === 'left' && dx > 20) {
          if (isMobileScreen && triggerPrevWithAnimationRef?.current) triggerPrevWithAnimationRef.current()
          else flip.flipPrev()
        }
      }
    }
    startPos.current = null
  }

  const handleClickCapture = (e: React.MouseEvent) => {
    // Jika ada pergerakan (swipe), blokir klik agar tidak mengganggu navigasi manual
    if (hasMoved.current) {
      e.stopPropagation()
      e.preventDefault()
    }
    startPos.current = null
  }

  return (
    <div
      ref={containerRef}
      className="flex-shrink-0 flex justify-center"
      style={{ width: stageWidth, height: stageHeight }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { startPos.current = null }}
      onClickCapture={handleClickCapture}
    >
      {/* @ts-ignore - key dengan isMobileScreen agar remount saat Inspect ganti device (library dapat ukuran baru) */}
      <HTMLFlipBook
        key={`${flipbookKey}-${isMobileScreen ? 'm' : 'd'}`}
        width={isMobileScreen ? stageWidth : stageWidth / 2}
        height={stageHeight}
        size="fixed"
        minWidth={isMobileScreen ? stageWidth : stageWidth / 2}
        maxWidth={isMobileScreen ? stageWidth : stageWidth / 2}
        minHeight={stageHeight}
        maxHeight={stageHeight}
        maxShadowOpacity={0.4}
        showCover={true}
        mobileScrollSupport={false}
        className="demo-book"
        ref={bookRef}
        startPage={startPage}
        drawShadow={true}
        flippingTime={600}
        usePortrait={isMobileScreen}
        startZIndex={0}
        autoSize={true}
        clickEventForward={true}
        useMouseEvents={false}
        swipeDistance={9999}
        showPageCorners={false}
        disableFlipByClick={!isMobileScreen}
        onFlip={(e: any) => onFlip(e.data)}
      >
        {pageElements}
      </HTMLFlipBook>
    </div>
  )
})
FlipBookInner.displayName = 'FlipBookInner'

export default function ManualFlipbookViewer({
  pages,
  onPlayVideo,
  className = '',
  albumId,
  isEditorView = false,
  isVisible = true,
  centerNudgeDownPxMobile,
  centerNudgeDownPxDesktop,
  chromePaddingYExtra,
  chromePaddingXExtra,
  chromePaddingYExtraMobile,
  chromePaddingYExtraDesktop,
  chromePaddingXExtraMobile,
  chromePaddingXExtraDesktop,
  backgroundMusicUrl,
  fullscreenRootRef,
}: ManualFlipbookViewerProps) {
  const book = useRef<any>(null)
  const stageContainerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const bottomBarRef = useRef<HTMLDivElement>(null)
  const onPlayVideoRef = useRef(onPlayVideo)
  const totalPageCountRef = useRef(0)
  onPlayVideoRef.current = onPlayVideo

  const [isReady, setIsReady] = useState(false)
  const [isMobileScreen, setIsMobileScreen] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [coverFlipStarted, setCoverFlipStarted] = useState(false)
  const [coverCloseStarted, setCoverCloseStarted] = useState(false)
  const [coverJustClosed, setCoverJustClosed] = useState(false) // paksa posisi tengah setelah tutup cover
  const [flipSoundEnabled, setFlipSoundEnabled] = useState(() =>
    albumId ? readFlipbookSoundPref(`flipbook-flip-sound-${albumId}`, true) : true,
  )
  const [bgMusicEnabled, setBgMusicEnabled] = useState(() =>
    albumId ? readFlipbookSoundPref(`flipbook-bg-music-${albumId}`, true) : true,
  )
  const [showSoundMenu, setShowSoundMenu] = useState(false)
  const [scale, setScale] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const isFullscreenRef = useRef(isFullscreen)
  isFullscreenRef.current = isFullscreen
  const [showPageInput, setShowPageInput] = useState(false)
  const [pageInputValue, setPageInputValue] = useState('')
  const [sectionFlipDir, setSectionFlipDir] = useState<'next' | 'prev' | null>(null)
  /** Kunci layout shifter saat animasi agar tidak loncat di tengah putaran */
  const [sectionFlipLayoutSide, setSectionFlipLayoutSide] = useState<'cover' | 'back' | null>(null)
  const [showSharePopup, setShowSharePopup] = useState(false)
  const [bottomBarHeight, setBottomBarHeight] = useState(56)
  const [mobileAspectRatio, setMobileAspectRatio] = useState<number>(MOBILE_STAGE_HEIGHT_DEFAULT / MOBILE_STAGE_WIDTH)

  const isMobileScreenRef = useRef(isMobileScreen)
  isMobileScreenRef.current = isMobileScreen

  // Mobile stage height should match image aspect ratio to avoid empty gaps.
  const mobileStageHeight = useMemo(() => {
    // Prefer explicit dimensions from API if provided.
    const firstWithDims = pages.find((p) => typeof p.width === 'number' && typeof p.height === 'number' && p.width! > 0 && p.height! > 0)
    const ratio = firstWithDims ? (firstWithDims.height! / firstWithDims.width!) : mobileAspectRatio
    const raw = Math.round(MOBILE_STAGE_WIDTH * ratio)
    // Clamp so UI stays usable across odd sizes.
    return Math.max(520, Math.min(720, raw || MOBILE_STAGE_HEIGHT_DEFAULT))
  }, [pages, mobileAspectRatio])

  // If width/height is missing from API (older data), measure the first image once.
  useEffect(() => {
    if (!isMobileScreen) return
    const first = pages.find((p) => typeof p.image_url === 'string' && p.image_url)
    if (!first) return
    const hasDims = pages.some((p) => typeof p.width === 'number' && typeof p.height === 'number' && p.width! > 0 && p.height! > 0)
    if (hasDims) return

    let cancelled = false
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      if (cancelled) return
      const w = (img as any).naturalWidth as number | undefined
      const h = (img as any).naturalHeight as number | undefined
      if (typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0) {
        setMobileAspectRatio(h / w)
      }
    }
    img.src = first.image_url
    return () => { cancelled = true }
  }, [isMobileScreen, pages])

  const stageWidth = isMobileScreen ? MOBILE_STAGE_WIDTH : BOOK_STAGE_WIDTH
  const stageHeight = isMobileScreen ? mobileStageHeight : BOOK_STAGE_HEIGHT

  const flipbookKey = useMemo(() => pages.map(p => p.id).join('-'), [pages])

  const pageElements = useMemo(() => {
    const elements: React.ReactNode[] = []
    const play = (url: string) => onPlayVideoRef.current?.(url)
    pages.forEach((page, index) => {
      if (index === pages.length - 1 && pages.length > 1) elements.push(<BlankPage key="blank-before-backcover" />)
      elements.push(
        <Page
          key={page.id || index}
          page={page}
          onPlay={play}
          isCover={index === 0}
          isBackCover={index === pages.length - 1}
          isMobile={isMobileScreen}
        />
      )
      if (index === 0) elements.push(<BlankPage key="blank-after-cover" />)
    })
    if (elements.length % 2 !== 0) elements.push(<BlankPage key="blank-end" />)
    return elements
  }, [pages, isMobileScreen])

  const totalPageCount = useMemo(() => {
    let n = 0
    pages.forEach((_, i) => {
      if (i === pages.length - 1 && pages.length > 1) n++
      n++
      if (i === 0) n++
    })
    if (n % 2 !== 0) n++
    return n
  }, [pages])
  totalPageCountRef.current = totalPageCount

  const flipSoundRef = useRef<HTMLAudioElement | null>(null)
  const bgMusicRef = useRef<HTMLAudioElement | null>(null)
  const flipSoundEnabledRef = useRef(flipSoundEnabled)
  const bgMusicEnabledRef = useRef(bgMusicEnabled)
  flipSoundEnabledRef.current = flipSoundEnabled
  bgMusicEnabledRef.current = bgMusicEnabled
  const soundMenuRef = useRef<HTMLDivElement>(null)
  const isVisibleRef = useRef(isVisible)
  isVisibleRef.current = isVisible

  const resolvedBgMusicUrl = backgroundMusicUrl === undefined ? DEFAULT_FLIPBOOK_BG_MUSIC : backgroundMusicUrl
  const lastFlipPageRef = useRef<number | null>(null)
  const lastFlipSoundAtRef = useRef(0)
  const flipAudioUnlockedRef = useRef(false)
  const suppressFlipSoundRef = useRef(false)
  const pointerDownRef = useRef<{ x: number; y: number; mode: 'open' | 'close' } | null>(null)
  const revertShiftTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flipUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const ensureFlipSound = useCallback(() => {
    if (!flipSoundRef.current) {
      flipSoundRef.current = new Audio('/sounds/page-flip.mp3')
      flipSoundRef.current.preload = 'auto'
    }
    return flipSoundRef.current
  }, [])

  const bgMusicSrcRef = useRef<string | null>(null)

  const ensureBgMusic = useCallback(() => {
    if (!resolvedBgMusicUrl) return null
    if (!bgMusicRef.current || bgMusicSrcRef.current !== resolvedBgMusicUrl) {
      bgMusicRef.current = new Audio(resolvedBgMusicUrl)
      bgMusicSrcRef.current = resolvedBgMusicUrl
      bgMusicRef.current.loop = true
      bgMusicRef.current.preload = 'auto'
      bgMusicRef.current.volume = BG_MUSIC_VOLUME
    }
    return bgMusicRef.current
  }, [resolvedBgMusicUrl])

  const syncBgMusic = useCallback(() => {
    if (!resolvedBgMusicUrl || typeof document === 'undefined') return
    const audio = ensureBgMusic()
    if (!audio) return
    if (bgMusicEnabledRef.current && isVisibleRef.current && !document.hidden) {
      void audio.play().catch(() => { /* autoplay diblokir browser — coba lagi saat interaksi */ })
    } else {
      audio.pause()
    }
  }, [ensureBgMusic, resolvedBgMusicUrl])

  const pauseBgMusic = useCallback(() => {
    bgMusicRef.current?.pause()
  }, [])

  const unlockFlipSound = useCallback(() => {
    if (flipAudioUnlockedRef.current || typeof document === 'undefined') return
    flipAudioUnlockedRef.current = true
    try {
      const audio = ensureFlipSound()
      audio.volume = 0.001
      const playPromise = audio.play()
      if (playPromise) {
        playPromise
          .then(() => {
            audio.pause()
            audio.currentTime = 0
            audio.volume = 0.5
          })
          .catch(() => {
            audio.volume = 0.5
          })
      }
    } catch {
      /* ignore */
    }
  }, [ensureFlipSound])

  const unlockAudio = useCallback(() => {
    unlockFlipSound()
    syncBgMusic()
  }, [unlockFlipSound, syncBgMusic])

  const playFlipSound = useCallback(() => {
    if (!flipSoundEnabledRef.current || typeof document === 'undefined' || document.hidden) return
    const now = Date.now()
    if (now - lastFlipSoundAtRef.current < 120) return
    lastFlipSoundAtRef.current = now
    try {
      const audio = ensureFlipSound()
      audio.volume = 0.5
      audio.currentTime = 0
      void audio.play().catch(() => { })
    } catch {
      /* ignore */
    }
  }, [ensureFlipSound])

  const handleFlip = useCallback((pageNum: number) => {
    const prevPage = lastFlipPageRef.current
    lastFlipPageRef.current = pageNum

    if (revertShiftTimeoutRef.current) {
      clearTimeout(revertShiftTimeoutRef.current)
      revertShiftTimeoutRef.current = null
    }
    if (flipUpdateTimeoutRef.current) {
      clearTimeout(flipUpdateTimeoutRef.current)
      flipUpdateTimeoutRef.current = null
    }
    setCurrentPage(pageNum)
    setCoverFlipStarted(false)
    setCoverCloseStarted(false)
    if (pageNum === 0) setCoverJustClosed(true)
    if (pageNum !== 0) setCoverJustClosed(false)
    if (pageNum === 0 || pageNum === 1) {
      const flip = book.current?.pageFlip()
      if (flip) {
        const doUpdate = () => {
          // Jangan update dimensi jika tab disembunyikan (mencegah loop/stuck render)
          if (typeof document !== 'undefined' && document.hidden) return
          flip.update()
        }
        requestAnimationFrame(() => requestAnimationFrame(doUpdate))
        flipUpdateTimeoutRef.current = setTimeout(doUpdate, FLIP_UPDATE_DELAY_MS)
      }
    }
    // Hanya saat indeks halaman benar-benar berubah (bukan event init / lompat cover↔back).
    if (prevPage !== null && prevPage !== pageNum && !suppressFlipSoundRef.current) {
      playFlipSound()
    }
  }, [playFlipSound])

  useEffect(() => {
    if (!isReady) return
    lastFlipPageRef.current = 0
    lastFlipSoundAtRef.current = 0
  }, [isReady, flipbookKey])

  const handleStagePointerDown = useCallback(() => {
    unlockAudio()
  }, [unlockAudio])

  useEffect(() => {
    if (!albumId || typeof window === 'undefined') return
    try {
      const flip = localStorage.getItem(`flipbook-flip-sound-${albumId}`)
      if (flip !== null) setFlipSoundEnabled(flip === '1')
      const bg = localStorage.getItem(`flipbook-bg-music-${albumId}`)
      if (bg !== null) setBgMusicEnabled(bg === '1')
    } catch {
      /* ignore */
    }
  }, [albumId])

  useEffect(() => {
    if (!albumId || typeof window === 'undefined') return
    try {
      localStorage.setItem(`flipbook-flip-sound-${albumId}`, flipSoundEnabled ? '1' : '0')
      localStorage.setItem(`flipbook-bg-music-${albumId}`, bgMusicEnabled ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [albumId, flipSoundEnabled, bgMusicEnabled])

  // Muat & coba putar musik latar segera saat flipbook dibuka (tanpa menunggu flip halaman).
  useEffect(() => {
    if (!resolvedBgMusicUrl) return
    ensureBgMusic()
    syncBgMusic()
  }, [resolvedBgMusicUrl, bgMusicEnabled, ensureBgMusic, syncBgMusic])

  useEffect(() => {
    if (!isReady) return
    syncBgMusic()
  }, [isReady, syncBgMusic])

  // Preview → editor: hentikan musik; kembali ke preview: lanjut jika masih On.
  useEffect(() => {
    if (!isVisible) {
      pauseBgMusic()
      const fsTarget = fullscreenRootRef?.current ?? wrapperRef.current
      if (fsTarget && document.fullscreenElement === fsTarget) {
        void document.exitFullscreen().catch(() => { })
      }
      return
    }
    syncBgMusic()
  }, [isVisible, syncBgMusic, pauseBgMusic, fullscreenRootRef])

  useEffect(() => {
    const onVisibility = () => syncBgMusic()
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [syncBgMusic])

  useEffect(() => {
    return () => {
      bgMusicRef.current?.pause()
      bgMusicRef.current = null
      bgMusicSrcRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!showSoundMenu) return
    const onPointerDown = (e: PointerEvent) => {
      if (soundMenuRef.current && !soundMenuRef.current.contains(e.target as Node)) {
        setShowSoundMenu(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [showSoundMenu])

  const MOBILE_BREAKPOINT = 768
  const checkMobile = useCallback(() => setIsMobileScreen(window.innerWidth < MOBILE_BREAKPOINT), [])

  useEffect(() => {
    checkMobile()
    window.addEventListener('resize', checkMobile)
    const readyTimer = setTimeout(() => setIsReady(true), READY_DELAY_MS)
    return () => {
      clearTimeout(readyTimer)
      window.removeEventListener('resize', checkMobile)
    }
  }, [pages, checkMobile])

  // Saat Inspect → toggle device: matchMedia, visualViewport, ResizeObserver, + poll fallback
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onMediaChange = (e: MediaQueryListEvent) => setIsMobileScreen(e.matches)
    mq.addEventListener('change', onMediaChange)
    return () => mq.removeEventListener('change', onMediaChange)
  }, [])

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onViewportResize = () => {
      const w = vv.width
      setIsMobileScreen((prev) => {
        const next = w < MOBILE_BREAKPOINT
        return prev !== next ? next : prev
      })
    }
    vv.addEventListener('resize', onViewportResize)
    vv.addEventListener('scroll', onViewportResize)
    return () => {
      vv.removeEventListener('resize', onViewportResize)
      vv.removeEventListener('scroll', onViewportResize)
    }
  }, [])

  useEffect(() => {
    const el = stageContainerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT
      setIsMobileScreen((prev) => (prev !== mobile ? mobile : prev))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [isReady])

  // Fallback: poll innerWidth saat tab visible (tangkap saat Inspect ganti device yang tidak emit event)
  useEffect(() => {
    let lastWidth = typeof window !== 'undefined' ? window.innerWidth : 0
    const id = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return
      const w = window.innerWidth
      if (w === lastWidth) return
      lastWidth = w
      setIsMobileScreen((prev) => {
        const next = w < MOBILE_BREAKPOINT
        return prev !== next ? next : prev
      })
    }, 400)
    return () => clearInterval(id)
  }, [])

  // Setelah ukuran/orientasi berubah (mobile ↔ desktop), paksa library recalc portrait/landscape
  useEffect(() => {
    if (!isReady || !pages?.length) return
    const t = setTimeout(() => {
      book.current?.pageFlip()?.update()
    }, RESIZE_THROTTLE_MS + 50)
    return () => clearTimeout(t)
  }, [isMobileScreen, isReady, pages?.length])

  // Saat panel preview baru terlihat, paksa recalc layout untuk cegah blank first-render.
  useEffect(() => {
    if (!isVisible || !isReady || !pages?.length) return
    const t1 = setTimeout(() => {
      updateScaleRef.current()
      book.current?.pageFlip()?.update()
    }, 0)
    const t2 = setTimeout(() => {
      updateScaleRef.current()
      book.current?.pageFlip()?.update()
    }, 120)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [isVisible, isReady, pages?.length])

  const updateScale = useCallback(() => {
    const container = stageContainerRef.current
    if (!container) return
    const { width: w, height: h } = container.getBoundingClientRect()
    if (w <= 0 || h <= 0) return

    const mobile = isMobileScreenRef.current
    const stageW = mobile ? MOBILE_STAGE_WIDTH : BOOK_STAGE_WIDTH
    const stageH = mobile ? mobileStageHeight : BOOK_STAGE_HEIGHT
    const chromePaddingX = isEditorView
      ? 0
      : (mobile ? (chromePaddingXExtraMobile ?? chromePaddingXExtra ?? 0) : (chromePaddingXExtraDesktop ?? chromePaddingXExtra ?? 0))
    let paddingX = (mobile ? 16 : 32) + chromePaddingX
    // Public/preview mode: leave a little breathing room from header & bottom nav.
    const chromePaddingY = isEditorView
      ? 0
      : (mobile ? (chromePaddingYExtraMobile ?? chromePaddingYExtra ?? 28) : (chromePaddingYExtraDesktop ?? chromePaddingYExtra ?? 28))
    let paddingY = (mobile ? 24 : 48) + chromePaddingY
    if (!isEditorView) {
      const barInset = Math.round(bottomBarHeight / 2)
      const gap = isFullscreenRef.current ? (mobile ? 14 : 20) : 0
      if (isFullscreenRef.current) {
        paddingX = (mobile ? 16 : 28) + chromePaddingX + gap
        paddingY = (mobile ? 20 : 36) + chromePaddingY + barInset + gap
      } else {
        paddingY += Math.round(bottomBarHeight * 0.45)
      }
    }

    setScale(Math.min(Math.max((w - paddingX) / stageW, 0), Math.max((h - paddingY) / stageH, 0)))
  }, [
    isEditorView,
    bottomBarHeight,
    mobileStageHeight,
    chromePaddingXExtra,
    chromePaddingXExtraMobile,
    chromePaddingXExtraDesktop,
    chromePaddingYExtra,
    chromePaddingYExtraMobile,
    chromePaddingYExtraDesktop,
  ])

  useEffect(() => {
    if (!isReady || !pages?.length) return
    let throttleId: ReturnType<typeof setTimeout> | null = null
    const throttledUpdate = () => {
      if (throttleId) return
      throttleId = setTimeout(() => {
        throttleId = null
        updateScale()
      }, RESIZE_THROTTLE_MS)
    }
    requestAnimationFrame(() => updateScale())
    window.addEventListener('resize', throttledUpdate)
    return () => {
      if (throttleId) clearTimeout(throttleId)
      window.removeEventListener('resize', throttledUpdate)
    }
  }, [isReady, pages?.length, updateScale, isMobileScreen])

  useEffect(() => {
    if (!isReady) return
    requestAnimationFrame(() => updateScale())
  }, [isFullscreen, isReady, updateScale])

  useEffect(() => {
    const wrapperEl = wrapperRef.current
    const stageEl = stageContainerRef.current
    if (!wrapperEl || !stageEl || typeof ResizeObserver === 'undefined') return

    let rafId: number | null = null
    const syncLayout = () => {
      if (rafId != null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        updateScale()
        book.current?.pageFlip()?.update()
      })
    }

    const ro = new ResizeObserver(() => {
      syncLayout()
    })

    ro.observe(wrapperEl)
    ro.observe(stageEl)

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId)
      ro.disconnect()
    }
  }, [updateScale, flipbookKey, isMobileScreen])

  // Refined Logic: isCoverOnly and isBackCoverOnly for Layout Centering
  const isCoverOnly = (currentPage === 0 && !coverFlipStarted) || (currentPage === 1 && coverCloseStarted) || coverJustClosed
  const isBackCoverOnly = currentPage >= totalPageCount - 2

  const layoutCoverOnly = sectionFlipLayoutSide === 'cover' || (sectionFlipLayoutSide === null && isCoverOnly)
  const layoutBackCoverOnly = sectionFlipLayoutSide === 'back' || (sectionFlipLayoutSide === null && isBackCoverOnly)

  const handleToggleCover = useCallback(() => {
    if (sectionFlipDir) return // Guard terhadap klik berkali-kali

    const lastPage = Math.max(0, totalPageCount - 1)
    const fromBack = isBackCoverOnly
    const target = fromBack ? 0 : lastPage
    const flip = book.current?.pageFlip()
    if (!flip) return
    if (flip.getCurrentPageIndex?.() === target) return

    const dir = fromBack ? 'prev' : 'next'
    const fromSide: 'cover' | 'back' = fromBack ? 'back' : 'cover'
    const toSide: 'cover' | 'back' = fromBack ? 'cover' : 'back'

    suppressFlipSoundRef.current = true
    setSectionFlipLayoutSide(fromSide)
    setSectionFlipDir(dir)

    window.setTimeout(() => {
      setSectionFlipLayoutSide(toSide)
      flip.turnToPage(target)
      lastFlipPageRef.current = target
      setCurrentPage(target)
      setCoverFlipStarted(false)
      setCoverCloseStarted(false)
      setCoverJustClosed(target === 0)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => flip.update())
      })
    }, SECTION_FLIP_MIDPOINT_MS)

    window.setTimeout(() => {
      setSectionFlipDir(null)
      setSectionFlipLayoutSide(null)
      suppressFlipSoundRef.current = false
    }, SECTION_FLIP_DURATION_MS)
  }, [totalPageCount, isBackCoverOnly, sectionFlipDir])
  const handleToggleCoverRef = useRef(handleToggleCover)
  handleToggleCoverRef.current = handleToggleCover

  const goToPage = useCallback((pageOneBased: number) => {
    const pageIndex = Math.max(0, Math.min(totalPageCount - 1, pageOneBased - 1))
    const flip = book.current?.pageFlip()
    if (!flip) return
    const prevPage = lastFlipPageRef.current
    unlockAudio()
    flip.turnToPage(pageIndex)
    lastFlipPageRef.current = pageIndex
    if (prevPage !== null && prevPage !== pageIndex) {
      playFlipSound()
    }
    setCurrentPage(pageIndex)
    setCoverFlipStarted(false)
    setCoverCloseStarted(false)
    setCoverJustClosed(pageIndex === 0)
    if (pageIndex === 0 || pageIndex === 1) {
      requestAnimationFrame(() => requestAnimationFrame(() => flip.update()))
      flipUpdateTimeoutRef.current = setTimeout(() => flip.update(), FLIP_UPDATE_DELAY_MS)
    }
    setShowPageInput(false)
  }, [totalPageCount, unlockAudio, playFlipSound])

  // Ref untuk trigger prev dengan animasi flip (mobile: flip di posisi kiri buku)
  const triggerPrevWithAnimationRef = useRef<(() => void) | null>(null)

  const handlePrev = useCallback(() => {
    if (currentPage === 0) return
    unlockAudio()
    const flip = book.current?.pageFlip()
    if (!flip) return
    if (isMobileScreen) {
      triggerPrevWithAnimationRef.current?.()
    } else {
      flip.flipPrev()
    }
  }, [currentPage, isMobileScreen])

  const handlePageInputSubmit = useCallback(() => {
    const num = parseInt(pageInputValue.trim(), 10)
    if (!Number.isNaN(num)) goToPage(num)
    else setShowPageInput(false)
  }, [pageInputValue, goToPage])

  const getFullscreenTarget = useCallback(() => {
    return fullscreenRootRef?.current ?? wrapperRef.current
  }, [fullscreenRootRef])

  const toggleFullscreen = useCallback(() => {
    const el = getFullscreenTarget()
    if (!el) return
    const isTargetFullscreen = document.fullscreenElement === el
    if (!isTargetFullscreen) {
      el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => { })
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => { })
    }
  }, [getFullscreenTarget])

  const updateScaleRef = useRef(updateScale)
  updateScaleRef.current = updateScale
  useEffect(() => {
    const onFullscreenChange = () => {
      const el = getFullscreenTarget()
      setIsFullscreen(!!el && document.fullscreenElement === el)
      setTimeout(() => updateScaleRef.current(), RESIZE_THROTTLE_MS)
      setTimeout(() => updateScaleRef.current(), RESIZE_THROTTLE_MS + 120)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [getFullscreenTarget])

  useEffect(() => {
    return () => {
      if (revertShiftTimeoutRef.current) clearTimeout(revertShiftTimeoutRef.current)
      if (flipUpdateTimeoutRef.current) clearTimeout(flipUpdateTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!coverJustClosed || currentPage !== 0) return
    const t = setTimeout(() => setCoverJustClosed(false), 600)
    return () => clearTimeout(t)
  }, [coverJustClosed, currentPage])

  // Keep a stable measurement of bottom bar height (used to center the book above it in preview mode).
  useEffect(() => {
    if (isEditorView) return
    const el = bottomBarRef.current
    if (!el) return

    const measure = () => {
      const h = Math.round(el.getBoundingClientRect().height)
      if (h > 0) setBottomBarHeight(h)
    }

    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [isEditorView])

  if (!pages || pages.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center p-8 sm:p-12 bg-white dark:bg-slate-900 rounded-[32px] border-2 border-slate-900 dark:border-slate-700 border-dashed text-slate-400 dark:text-slate-500 h-full w-full min-h-[300px] ${className}`}>
        <Play className="w-12 h-12 sm:w-16 sm:h-16 mb-4 opacity-20" strokeWidth={3} />
        <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-center px-4">Belum ada halaman yang diunggah.</p>
      </div>
    )
  }

  // Nomor halaman urut 1..N: HAL 1 = cover, 2 = kosong, 3..95 = isi, 96 = back. 94 page + 2 kosong = 96.
  // Library kirim indeks halaman kiri (0..N-1). Spread kiri=i → buku [i+1, i+2]. Jadi [currentPage+1, currentPage+2].
  const displayPages: number[] = (() => {
    const N = totalPageCount
    if (N <= 0) return []
    const clamp = (p: number) => Math.max(1, Math.min(N, p))

    if (currentPage === 0) {
      return isCoverOnly || isMobileScreen ? [1] : [2]
    }
    // Spread terakhir (blank + back cover): tampilkan hanya HAL N (sama seperti cover hanya HAL 1)
    if (currentPage === N - 1 || currentPage === N - 2) return [N]

    let raw: number[]
    if (isMobileScreen) {
      raw = [currentPage + 1]
    } else {
      raw = [currentPage + 1, currentPage + 2]
    }
    if (raw.some(p => p > N)) return [N]
    return raw.map(clamp)
  })()
  const pageText = displayPages.length > 0 ? displayPages.join(' - ') : '-'

  const stageTop = !isEditorView
    ? (() => {
        const extra = isFullscreen
          ? (isMobileScreen ? 12 : 16)
          : (isMobileScreen ? 8 : 16)
        const nudgeDown = isFullscreen
          ? (isMobileScreen ? 5 : 6)
          : isMobileScreen
            ? (centerNudgeDownPxMobile ?? 6)
            : (centerNudgeDownPxDesktop ?? 8)
        const shift = Math.round((bottomBarHeight + extra) / 2 - nudgeDown)
        return `calc(50% - ${Math.max(shift, 0)}px)`
      })()
    : '50%'

  return (
    <div
      ref={wrapperRef}
      className={`flip-book-wrapper relative overflow-hidden flex flex-col w-full h-full min-h-0 bg-white dark:bg-slate-950 ${className} transition-opacity duration-700 ${isReady ? 'opacity-100' : 'opacity-0'} ${layoutCoverOnly ? 'flip-book-wrapper--cover-only' : ''} ${layoutBackCoverOnly ? 'flip-book-wrapper--back-cover-only' : ''} ${isFullscreen ? 'flip-book-wrapper--fullscreen' : ''} ${sectionFlipDir ? `is-section-flipping is-flipping-${sectionFlipDir}` : ''}`}
    >
      <div
        ref={stageContainerRef}
        className={`relative flex-1 min-h-0 w-full flex items-center justify-center ${sectionFlipDir ? 'overflow-hidden' : 'overflow-visible'} ${isMobileScreen ? 'p-2' : 'p-4'}`}
        onPointerDown={handleStagePointerDown}
      >
        <div
          className="flip-book-stage"
          style={{
            position: 'absolute',
            left: '50%',
            top: stageTop,
            width: stageWidth,
            height: stageHeight,
            transform: `translate(-50%, -50%) scale(${scale})`,
            transformOrigin: 'center center',
            transition: sectionFlipDir ? 'none' : 'transform 0.2s ease-out',
            perspective: '1500px',
          }}
        >
          <div
            className={`flip-book-3d-rotator ${sectionFlipDir ? `is-flipping-${sectionFlipDir}` : ''}`}
            style={{
              willChange: sectionFlipDir ? 'transform' : 'auto',
              transformStyle: 'preserve-3d',
              backfaceVisibility: 'hidden',
            }}
          >


            {/* Shifter: mobile satu halaman selalu tengah; desktop geser untuk cover/back cover */}
            <div
              style={{
                width: '100%',
                height: '100%',
                transformStyle: 'preserve-3d',
                transform: isMobileScreen ? 'translateX(0)' : (layoutCoverOnly ? 'translateX(-25%)' : (layoutBackCoverOnly ? 'translateX(25%)' : 'translateX(0)')),
                transition: sectionFlipDir ? 'none' : 'transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)'
              }}
            >
              {/* Thickness Layers: Berada di dalam shifter agar lebarnya selaras dengan buku */}
              {sectionFlipDir && <SectionFlipSpineEdge />}

              <div className={sectionFlipDir ? 'section-flip-pages section-flip-pages--animating' : 'section-flip-pages'}>
              <FlipBookInner
                flipbookKey={flipbookKey}
                pageElements={pageElements}
                isMobileScreen={isMobileScreen}
                bookRef={book}
                onFlip={handleFlip}
                onFlipInteract={unlockAudio}
                triggerPrevWithAnimationRef={triggerPrevWithAnimationRef}
                stageWidth={stageWidth}
                stageHeight={stageHeight}
                isCoverOnly={layoutCoverOnly}
                isBackCoverOnly={layoutBackCoverOnly}
                startPage={currentPage}
              />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation Bar — preview: full-bleed and overlay; editor: stays in flow */}
      <div
        ref={bottomBarRef}
        className={`mt-auto shrink-0 w-full flex items-center bg-white dark:bg-slate-900 border-t-2 border-slate-900 dark:border-slate-700 shadow-[0_-1px_0_0_rgba(15,23,42,0.06)] dark:shadow-[0_-1px_0_0_rgba(51,65,85,0.4)] z-50 ${
          isEditorView
            ? 'sticky bottom-0 px-2 py-1 min-h-10 pb-[env(safe-area-inset-bottom)]'
            : 'fixed bottom-0 left-0 right-0 w-screen px-2 py-1.5 min-h-12 pb-[calc(env(safe-area-inset-bottom)+8px)]'
        }`}
      >
        {/* Kiri: sound + flip */}
        <div className={`flex-1 flex items-center justify-start ${isEditorView ? 'gap-1.5' : 'gap-1.5'}`}>
          <div ref={soundMenuRef} className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowSoundMenu((open) => !open)
              }}
              className={`p-0 flex items-center justify-center rounded-md bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border-2 border-slate-900 dark:border-slate-700 transition-all text-slate-900 dark:text-white active:scale-95 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] ${isEditorView ? '!size-[28px] !min-w-[28px] !min-h-[28px]' : '!size-8 !min-w-8 !min-h-8 sm:!size-9 sm:!min-w-9 sm:!min-h-9'}`}
              style={isEditorView ? { width: 28, height: 28, minWidth: 28, minHeight: 28 } : undefined}
              title="Pengaturan suara"
              aria-expanded={showSoundMenu}
              aria-haspopup="menu"
            >
              {!flipSoundEnabled && !bgMusicEnabled ? (
                <VolumeX className={`shrink-0 ${isEditorView ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} strokeWidth={2.5} />
              ) : (
                <Volume2 className={`shrink-0 ${isEditorView ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} strokeWidth={2.5} />
              )}
            </button>
            {showSoundMenu && (
              <div
                role="menu"
                className={`absolute bottom-full left-0 z-[70] mb-2 min-w-[188px] rounded-xl border-2 border-slate-900 dark:border-slate-600 bg-white dark:bg-slate-900 p-1 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] ${isEditorView ? 'min-w-[176px]' : ''}`}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={flipSoundEnabled}
                  onClick={() => {
                    unlockAudio()
                    setFlipSoundEnabled((on) => !on)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5 shrink-0 text-slate-600 dark:text-slate-300" strokeWidth={2.5} />
                  <span className={`flex-1 text-[10px] font-black uppercase tracking-wide ${isEditorView ? '' : 'sm:text-[11px]'}`}>
                    Suara flip
                  </span>
                  <span className={`text-[9px] font-black uppercase tracking-widest ${flipSoundEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                    {flipSoundEnabled ? 'On' : 'Mute'}
                  </span>
                </button>
                {resolvedBgMusicUrl ? (
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={bgMusicEnabled}
                    onClick={() => {
                      unlockAudio()
                      setBgMusicEnabled((on) => !on)
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Music className="w-3.5 h-3.5 shrink-0 text-slate-600 dark:text-slate-300" strokeWidth={2.5} />
                    <span className={`flex-1 text-[10px] font-black uppercase tracking-wide ${isEditorView ? '' : 'sm:text-[11px]'}`}>
                      Musik latar
                    </span>
                    <span className={`text-[9px] font-black uppercase tracking-widest ${bgMusicEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                      {bgMusicEnabled ? 'On' : 'Mute'}
                    </span>
                  </button>
                ) : null}
              </div>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); handleToggleCover(); }}
            className={`p-0 flex items-center justify-center rounded-md bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border-2 border-slate-900 dark:border-slate-700 transition-all text-slate-900 dark:text-white active:scale-95 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] ${isEditorView ? '!size-[28px] !min-w-[28px] !min-h-[28px]' : '!size-8 !min-w-8 !min-h-8 sm:!size-9 sm:!min-w-9 sm:!min-h-9'}`}
            style={isEditorView ? { width: 28, height: 28, minWidth: 28, minHeight: 28 } : undefined}
            title={isBackCoverOnly ? 'Ke cover depan' : 'Ke back cover'}
          >
            <FlipHorizontal2 className={`shrink-0 ${isEditorView ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} strokeWidth={2.5} />
          </button>
        </div>

        {/* Tengah: Prev + nomor halaman + Next */}
        <div className={`flex items-center justify-center shrink-0 ${isEditorView ? 'gap-2' : 'gap-1.5'}`}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handlePrev()
            }}
            disabled={currentPage === 0}
            className={`p-0 flex items-center justify-center rounded-md bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 border-2 border-slate-900 dark:border-slate-700 disabled:opacity-50 transition-all text-slate-900 dark:text-white active:scale-95 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] disabled:shadow-none disabled:translate-x-0.5 disabled:translate-y-0.5 touch-manipulation ${isEditorView ? '!size-[28px] !min-w-[28px] !min-h-[28px]' : '!size-8 !min-w-8 !min-h-8 sm:!size-9 sm:!min-w-9 sm:!min-h-9'}`}
            style={isEditorView ? { width: 28, height: 28, minWidth: 28, minHeight: 28 } : undefined}
          >
            <ChevronLeft className={`shrink-0 ${isEditorView ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} strokeWidth={3} />
          </button>
          <div
            className={`flex flex-col items-center justify-center cursor-pointer rounded-md border border-transparent hover:border-slate-900 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${isEditorView ? 'w-16 min-w-16 h-[28px]' : 'w-[72px] min-w-[72px] h-9 sm:h-10'}`}
            onClick={(e) => {
              e.stopPropagation()
              setPageInputValue(String(currentPage + 1))
              setShowPageInput(true)
            }}
            title="Klik untuk loncat ke halaman"
          >
            {showPageInput ? (
              <input
                type="number"
                min={1}
                max={totalPageCount}
                value={pageInputValue}
                onChange={(e) => setPageInputValue(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') handlePageInputSubmit()
                  if (e.key === 'Escape') setShowPageInput(false)
                }}
                onBlur={handlePageInputSubmit}
                onClick={(e) => e.stopPropagation()}
                className={`w-full text-center font-bold text-slate-900 dark:text-white tracking-widest bg-transparent border-none outline-none focus:ring-0 p-0 min-h-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isEditorView ? 'text-[9px] sm:text-[10px]' : 'text-[10px] sm:text-xs'}`}
                autoFocus
              />
            ) : (
              <span className={`font-bold text-slate-900 dark:text-white tracking-widest uppercase leading-none ${isEditorView ? 'text-[9px] sm:text-[10px]' : 'text-[10px] sm:text-xs'}`}>{pageText}</span>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              unlockAudio()
              if (currentPage === 0) {
                flushSync(() => { setCoverFlipStarted(true); setCoverJustClosed(false) })
              }
              book.current?.pageFlip()?.flipNext()
            }}
            disabled={currentPage >= totalPageCount - (isMobileScreen ? 1 : 2)}
            className={`p-0 flex items-center justify-center rounded-md bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 border-2 border-slate-900 dark:border-slate-700 disabled:opacity-50 transition-all text-slate-900 dark:text-white active:scale-95 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] disabled:shadow-none disabled:translate-x-0.5 disabled:translate-y-0.5 ${isEditorView ? '!size-[28px] !min-w-[28px] !min-h-[28px]' : '!size-8 !min-w-8 !min-h-8 sm:!size-9 sm:!min-w-9 sm:!min-h-9'}`}
            style={isEditorView ? { width: 28, height: 28, minWidth: 28, minHeight: 28 } : undefined}
          >
            <ChevronRight className={`shrink-0 ${isEditorView ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} strokeWidth={3} />
          </button>
        </div>

        {/* Kanan: share + fullscreen */}
        <div className={`flex-1 flex items-center justify-end ${isEditorView ? 'gap-1.5' : 'gap-1.5'}`}>
{albumId && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setShowSharePopup(true); }}
                className={`p-0 flex items-center justify-center rounded-md bg-emerald-400 dark:bg-emerald-600 hover:bg-emerald-300 dark:hover:bg-emerald-500 border-2 border-slate-900 dark:border-slate-700 transition-all text-slate-900 dark:text-white active:scale-95 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] ${isEditorView ? '!size-[28px] !min-w-[28px] !min-h-[28px]' : '!size-8 !min-w-8 !min-h-8 sm:!size-9 sm:!min-w-9 sm:!min-h-9'}`}
                style={isEditorView ? { width: 28, height: 28, minWidth: 28, minHeight: 28 } : undefined}
                title="Bagikan"
              >
                <Share2 className={`shrink-0 ${isEditorView ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} strokeWidth={2.5} />
              </button>
              {showSharePopup && (
                <div
                  className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 dark:bg-black/70"
                  onClick={(e) => { e.stopPropagation(); setShowSharePopup(false); }}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="share-popup-title"
                >
                  <div
                    className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-xl shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] max-w-sm w-full p-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 id="share-popup-title" className="font-black text-slate-900 dark:text-white uppercase tracking-tight text-sm">Bagikan flipbook</h3>
                      <button
                        type="button"
                        onClick={() => setShowSharePopup(false)}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
                        aria-label="Tutup"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 break-all">
                      {typeof window !== 'undefined' && `${window.location.origin}/album/${albumId}/flipbook`}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${window.location.origin}/album/${albumId}/flipbook`;
                          navigator.clipboard.writeText(url);
                          toast.success('Link disalin ke clipboard');
                          setShowSharePopup(false);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white font-bold text-sm uppercase tracking-wide hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.98] shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] transition-all"
                      >
                        <Copy className="w-4 h-4 shrink-0" />
                        Salin link
                      </button>
                      {typeof navigator !== 'undefined' && navigator.share && (
                        <button
                          type="button"
                          onClick={() => {
                            const url = `${window.location.origin}/album/${albumId}/flipbook`;
                            navigator.share({
                              title: 'Flipbook Yearbook',
                              text: 'Check out my yearbook flipbook!',
                              url,
                            }).then(() => setShowSharePopup(false)).catch(() => {})
                          }}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-emerald-400 dark:bg-emerald-600 hover:bg-emerald-300 dark:hover:bg-emerald-500 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white font-bold text-sm uppercase tracking-wide active:scale-[0.98] shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] transition-all"
                        >
                          <Share2 className="w-4 h-4 shrink-0" />
                          Bagikan
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
            className={`p-0 flex items-center justify-center rounded-md bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border-2 border-slate-900 dark:border-slate-700 transition-all text-slate-900 dark:text-white active:scale-95 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] ${isEditorView ? '!size-[28px] !min-w-[28px] !min-h-[28px]' : '!size-8 !min-w-8 !min-h-8 sm:!size-9 sm:!min-w-9 sm:!min-h-9'}`}
            style={isEditorView ? { width: 28, height: 28, minWidth: 28, minHeight: 28 } : undefined}
            title={isFullscreen ? 'Keluar fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className={`shrink-0 ${isEditorView ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} strokeWidth={2.5} /> : <Maximize2 className={`shrink-0 ${isEditorView ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} strokeWidth={2.5} />}
          </button>
        </div>
      </div>
    </div>
  )
}

const Hotspot = React.memo(function Hotspot({ h, onPlay }: { h: VideoHotspot; onPlay?: (url: string) => void }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onPlay?.(h.video_url) }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      className="absolute cursor-pointer z-[100] group/hotspot transition-all"
      style={{ left: `${h.x}%`, top: `${h.y}%`, width: `${h.width}%`, height: `${h.height}%` }}
    >
      <div className="absolute inset-0 border-2 border-transparent group-hover/hotspot:border-amber-400 group-hover/hotspot:bg-amber-400/10 transition-all rounded-sm">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-2 bg-indigo-400 border-2 border-slate-900 rounded-xl text-white opacity-0 group-hover/hotspot:opacity-100 shadow-[1.5px_1.5px_0_0_#334155] transition-all">
          <Play className="w-4 h-4 fill-current" />
        </div>
      </div>
    </div>
  )
})










