'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, Loader2, X } from 'lucide-react'
import ManualFlipbookViewer from '@/components/yearbook/components/ManualFlipbookViewer'
import { apiUrl } from '@/lib/api-url'
import { asObject, asString, getErrorMessage } from '@/components/yearbook/utils/response-narrowing'

type VideoPopupMode = 'blob' | 'direct' | 'youtube'

function isStorageVideoUrl(url: string): boolean {
  return url.includes('/api/files/') || url.includes('/storage/')
}

function isDirectVideoFileUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url)
}

function getYoutubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    let videoId: string | null = null
    if (u.hostname.includes('youtu.be')) {
      videoId = u.pathname.replace(/^\//, '').split('/')[0] || null
    } else if (u.hostname.includes('youtube.com')) {
      videoId = u.searchParams.get('v')
    }
    if (!videoId) return null
    const params = new URLSearchParams({
      autoplay: '1',
      controls: '0',
      modestbranding: '1',
      rel: '0',
      playsinline: '1',
    })
    return `https://www.youtube.com/embed/${videoId}?${params}`
  } catch {
    return null
  }
}

type ManualFlipbookPage = {
  id: string
  page_number: number
  image_url: string
  width?: number
  height?: number
  flipbook_video_hotspots?: { id: string; page_id: string; video_url: string; x: number; y: number; width: number; height: number }[]
}

export default function PublicFlipbookPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const isEmbedded = searchParams?.get('embedded') === 'true'
  const id = params?.id as string
  const [pages, setPages] = useState<ManualFlipbookPage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [albumName, setAlbumName] = useState<string>('Preview Flipbook')
  const [videoPopupUrl, setVideoPopupUrl] = useState<string | null>(null)
  const [videoPopupError, setVideoPopupError] = useState<string | null>(null)
  const [videoPopupLoading, setVideoPopupLoading] = useState(false)
  const [videoPlaySrc, setVideoPlaySrc] = useState<string | null>(null)
  const [videoPopupMode, setVideoPopupMode] = useState<VideoPopupMode | null>(null)
  const videoPlayBlobUrlRef = useRef<string | null>(null)
  const fullscreenRootRef = useRef<HTMLDivElement>(null)

  const fetchPages = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiUrl(`/api/albums/${id}/flipbook/public`), { cache: 'no-store' })
      const data = asObject(await res.json().catch(() => ({})))
      if (!res.ok) {
        setError(getErrorMessage(data, 'Gagal memuat flipbook.'))
        setPages([])
        return
      }

      let fetchedPages = []
      if (Array.isArray(data)) {
        fetchedPages = data
      } else if (Array.isArray(data.pages)) {
        fetchedPages = data.pages
        const fetchedAlbumName = asString(data.albumName)
        if (fetchedAlbumName) setAlbumName(fetchedAlbumName)
      }

      setPages(fetchedPages)
    } catch {
      setError('Gagal memuat flipbook.')
      setPages([])
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchPages()
  }, [fetchPages])

  const closeVideoPopup = useCallback(() => {
    setVideoPopupUrl(null)
    setVideoPopupError(null)
    setVideoPopupLoading(false)
    setVideoPlaySrc(null)
    setVideoPopupMode(null)
    const blob = videoPlayBlobUrlRef.current
    videoPlayBlobUrlRef.current = null
    if (blob) URL.revokeObjectURL(blob)
  }, [])

  useEffect(() => {
    if (!videoPopupUrl || !id) return

    let cancelled = false
    setVideoPopupLoading(true)
    setVideoPopupError(null)
    setVideoPlaySrc(null)
    setVideoPopupMode(null)

    const blob = videoPlayBlobUrlRef.current
    videoPlayBlobUrlRef.current = null
    if (blob) URL.revokeObjectURL(blob)

    const youtubeEmbed = getYoutubeEmbedUrl(videoPopupUrl)
    if (youtubeEmbed) {
      setVideoPopupMode('youtube')
      setVideoPlaySrc(youtubeEmbed)
      setVideoPopupLoading(false)
      return () => { cancelled = true }
    }

    if (videoPopupUrl.startsWith('http') && !isStorageVideoUrl(videoPopupUrl)) {
      if (isDirectVideoFileUrl(videoPopupUrl)) {
        setVideoPopupMode('direct')
        setVideoPlaySrc(videoPopupUrl)
        setVideoPopupLoading(false)
        return () => { cancelled = true }
      }
      setVideoPopupLoading(false)
      setVideoPopupError('Video eksternal tidak dapat diputar di popup. Buka link di tab baru.')
      return () => { cancelled = true }
    }

    const load = async () => {
      try {
        const res = await fetch(
          apiUrl(`/api/albums/${id}/video-play/public?url=${encodeURIComponent(videoPopupUrl)}`),
          { cache: 'no-store' },
        )
        if (!res.ok) {
          const data = asObject(await res.json().catch(() => ({})))
          if (!cancelled) {
            setVideoPopupError(getErrorMessage(data, 'Video tidak dapat dimuat'))
          }
          return
        }
        const blobData = await res.blob()
        if (cancelled) return
        const objectUrl = URL.createObjectURL(blobData)
        videoPlayBlobUrlRef.current = objectUrl
        setVideoPopupMode('blob')
        setVideoPlaySrc(objectUrl)
      } catch {
        if (!cancelled) setVideoPopupError('Video tidak dapat dimuat')
      } finally {
        if (!cancelled) setVideoPopupLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
      const u = videoPlayBlobUrlRef.current
      videoPlayBlobUrlRef.current = null
      if (u) URL.revokeObjectURL(u)
    }
  }, [videoPopupUrl, id])

  const handlePlayVideo = (url: string) => {
    if (!url) return
    setVideoPopupError(null)
    setVideoPopupUrl(url)
  }

  const handleGoBack = () => {
    if (typeof window === 'undefined') return
    if (window.history.length > 1) {
      router.back()
      return
    }
    try {
      const ref = document.referrer
      if (ref) {
        const u = new URL(ref)
        if (u.origin === window.location.origin) {
          router.push(`${u.pathname}${u.search}${u.hash}`)
          return
        }
      }
    } catch {
      // ignore
    }
    router.back()
  }

  if (!id) {
    return (
      <div className="min-h-[100dvh] bg-amber-300 flex flex-col items-center justify-center p-4">
        <div className="bg-white border-4 border-slate-900 shadow-[8px_8px_0_0_#0f172a] rounded-2xl p-8 max-w-sm w-full text-center">
          <p className="text-slate-900 font-black text-lg uppercase tracking-tight mb-4">Album ID tidak valid</p>
          <button
            type="button"
            onClick={handleGoBack}
            className="inline-block px-6 py-3 bg-indigo-400 text-white font-black text-sm uppercase rounded-xl border-4 border-slate-900 shadow-[2px_2px_0_0_#0f172a] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
          >
            Kembali
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-amber-300 flex flex-col items-center justify-center p-4">
        <div className="bg-white border-4 border-slate-900 shadow-[8px_8px_0_0_#0f172a] rounded-2xl p-8 max-w-sm w-full flex flex-col items-center">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mb-4" />
          <p className="text-slate-900 font-black uppercase tracking-widest text-sm text-center">Memuat Flipbook...</p>
        </div>
      </div>
    )
  }

  if (error || pages.length === 0) {
    return (
      <div className="min-h-[100dvh] bg-amber-300 flex flex-col items-center justify-center p-4">
        <div className="bg-white border-4 border-slate-900 shadow-[8px_8px_0_0_#0f172a] rounded-2xl p-8 max-w-sm w-full text-center">
          <p className="text-slate-900 font-black text-lg uppercase tracking-tight mb-6">{error || 'Belum ada halaman.'}</p>
          <button
            type="button"
            onClick={handleGoBack}
            className="inline-block px-6 py-3 bg-indigo-400 text-white font-black text-sm uppercase rounded-xl border-4 border-slate-900 shadow-[2px_2px_0_0_#0f172a] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
          >
            Kembali
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={fullscreenRootRef}
      className="flipbook-fullscreen-shell h-[100dvh] bg-white dark:bg-slate-950 flex flex-col overflow-hidden transition-colors duration-500"
    >
      {/* Match admin preview header shell (mobile) */}
      <header className="shrink-0 flex items-center justify-between gap-3 px-3 bg-amber-300 dark:bg-slate-900 border-b-2 border-black dark:border-slate-700 z-10 relative h-14">
        {isEmbedded ? (
          <button
            type="button"
            onClick={() => window.parent.postMessage('CLOSE_YEARBOOK_PREVIEW', '*')}
            className="flex items-center justify-center w-8 h-8 bg-yellow-300 hover:bg-yellow-400 rounded-full border-2 border-slate-900 text-slate-900 transition-all active:scale-95"
          >
            <X className="w-4 h-4" strokeWidth={3} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => router.back()}
            className="flex flex-shrink-0 items-center justify-center w-7 h-7 lg:w-auto lg:h-auto lg:px-2.5 lg:py-1 gap-1 text-[11px] font-black text-slate-900 bg-white border-2 border-slate-900 rounded-lg shadow-[1.5px_1.5px_0_0_#0f172a] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all active:scale-95"
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={3} />
            <span className="hidden lg:inline uppercase tracking-widest">Kembali</span>
          </button>
        )}
        <span className="absolute left-1/2 -translate-x-1/2 text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-tight truncate text-center max-w-[70%] sm:max-w-[60%]">
          {albumName}
        </span>
        <div className="flex-shrink-0 flex items-center justify-end w-8 lg:w-10">
          <img src="/img/logo.webp" alt="Logo" className="w-6 h-6 object-contain opacity-80" />
        </div>
      </header>
      <main className="flex-1 min-h-0 flex flex-col p-0 bg-transparent">
        <ManualFlipbookViewer
          pages={pages}
          onPlayVideo={handlePlayVideo}
          className="h-full w-full"
          albumId={id}
          fullscreenRootRef={fullscreenRootRef}
          // Spacing preset (must match admin preview).
          chromePaddingYExtraMobile={10}
          chromePaddingYExtraDesktop={24}
          chromePaddingXExtraMobile={-8}
          chromePaddingXExtraDesktop={0}
          centerNudgeDownPxMobile={6}
          centerNudgeDownPxDesktop={8}
        />
      </main>

      {videoPopupUrl && (
        <div
          className="fixed inset-0 z-[100] bg-slate-900/80 dark:bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={closeVideoPopup}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); closeVideoPopup() }}
            className="absolute top-4 right-4 z-10 w-10 h-10 bg-white dark:bg-slate-800 border-2 border-black dark:border-slate-700 rounded-xl flex items-center justify-center shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all text-slate-900 dark:text-white"
            aria-label="Tutup video"
          >
            <X className="w-6 h-6" strokeWidth={3} />
          </button>
          <div
            className="relative inline-flex max-w-[min(100%,42rem)] max-h-[min(85vh,calc(100dvh-6rem))] flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative inline-block max-w-full max-h-[min(85vh,calc(100dvh-6rem))] rounded-[24px] overflow-hidden border-2 border-slate-900 dark:border-slate-700 bg-black shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b]">
              {videoPopupLoading && !videoPlaySrc && (
                <div className="flex min-h-[160px] min-w-[240px] flex-col items-center justify-center gap-3 px-8 py-10">
                  <Loader2 className="h-10 w-10 animate-spin text-white" aria-hidden />
                  <span className="text-xs font-black uppercase tracking-widest text-white/70">Memuat video…</span>
                </div>
              )}
              {videoPlaySrc && videoPopupMode === 'youtube' && (
                <iframe
                  src={videoPlaySrc}
                  title="Video hotspot"
                  className="block aspect-video w-[min(calc(100vw-2rem),42rem)] max-h-[min(85vh,calc(100dvh-6rem))] border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              )}
              {videoPlaySrc && (videoPopupMode === 'blob' || videoPopupMode === 'direct') && (
                <video
                  src={videoPlaySrc}
                  autoPlay
                  playsInline
                  className="block max-h-[min(85vh,calc(100dvh-6rem))] max-w-[min(calc(100vw-2rem),42rem)] w-auto h-auto"
                  onError={() => setVideoPopupError('Video tidak dapat dimuat')}
                  onEnded={closeVideoPopup}
                />
              )}
              {videoPopupError && (
                <div className="flex min-h-[160px] min-w-[240px] flex-col items-center justify-center gap-3 bg-white/95 dark:bg-slate-900/95 p-6 text-center">
                  <p className="text-sm font-black text-red-500 uppercase tracking-widest">{videoPopupError}</p>
                  {videoPopupUrl.startsWith('http') && !isStorageVideoUrl(videoPopupUrl) && (
                    <a
                      href={videoPopupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-black uppercase tracking-widest text-indigo-600 underline"
                    >
                      Buka di tab baru
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={closeVideoPopup}
                    className="px-6 py-3 bg-red-500 text-white border-2 border-black dark:border-slate-700 rounded-2xl font-black text-xs uppercase tracking-widest shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all"
                  >
                    Tutup
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
