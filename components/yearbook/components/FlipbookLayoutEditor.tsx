'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Play, Image as ImageIcon, ImagePlus, Trash2, Loader2, BookOpen, BookMarked, GripVertical } from 'lucide-react'
import { toast } from '@/lib/toast'
import { apiUrl } from '../../../lib/api-url'
import { fetchWithAuth } from '../../../lib/api-client'
import { asObject, asString, getErrorMessage } from '@/components/yearbook/utils/response-narrowing'

type FlipbookViewProps = {
    album: any
    onPlayVideo?: (url: string) => void
    onUpdateAlbum?: (updates: { flipbook_mode?: 'manual' }) => Promise<void>
    canManage?: boolean
}

type ManualFlipbookPage = {
    id: string
    page_number: number
    image_url: string
    width?: number
    height?: number
    page_slot?: 'front_cover' | 'body' | 'back_cover'
    flipbook_video_hotspots?: VideoHotspot[]
}

type VideoHotspot = {
    id: string
    page_id: string
    video_url: string
    label?: string
    x: number
    y: number
    width: number
    height: number
}

const TEMP_HOTSPOT_ID_PREFIX = 'temp-hotspot-'

const asHotspotId = (value: unknown): string | undefined => {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    return undefined
}
const PDF_RENDER_SCALE = 1.2
const PDF_UPLOAD_CONCURRENCY = 3

const getMiddlePages = (pages: ManualFlipbookPage[]) =>
    pages.length < 3 ? [] : pages.slice(1, -1)

const canReorderPageAt = (index: number, pages: ManualFlipbookPage[]) =>
    pages.length >= 3 && index > 0 && index < pages.length - 1

const getMiddlePageIndex = (pageId: string, pages: ManualFlipbookPage[]) =>
    getMiddlePages(pages).findIndex((p) => p.id === pageId)

const AUTO_SCROLL_EDGE_PX = 56
const AUTO_SCROLL_MAX_SPEED = 14

function runListAutoScroll(container: HTMLElement, clientX: number, clientY: number) {
    const rect = container.getBoundingClientRect()
    const vertical = window.matchMedia('(min-width: 1024px)').matches

    if (vertical) {
        const fromTop = clientY - rect.top
        const fromBottom = rect.bottom - clientY
        if (fromTop >= 0 && fromTop < AUTO_SCROLL_EDGE_PX) {
            const factor = 1 - fromTop / AUTO_SCROLL_EDGE_PX
            container.scrollTop -= Math.max(1, Math.round(AUTO_SCROLL_MAX_SPEED * factor))
        } else if (fromBottom >= 0 && fromBottom < AUTO_SCROLL_EDGE_PX) {
            const factor = 1 - fromBottom / AUTO_SCROLL_EDGE_PX
            container.scrollTop += Math.max(1, Math.round(AUTO_SCROLL_MAX_SPEED * factor))
        }
    } else {
        const fromLeft = clientX - rect.left
        const fromRight = rect.right - clientX
        if (fromLeft >= 0 && fromLeft < AUTO_SCROLL_EDGE_PX) {
            const factor = 1 - fromLeft / AUTO_SCROLL_EDGE_PX
            container.scrollLeft -= Math.max(1, Math.round(AUTO_SCROLL_MAX_SPEED * factor))
        } else if (fromRight >= 0 && fromRight < AUTO_SCROLL_EDGE_PX) {
            const factor = 1 - fromRight / AUTO_SCROLL_EDGE_PX
            container.scrollLeft += Math.max(1, Math.round(AUTO_SCROLL_MAX_SPEED * factor))
        }
    }
}

export default function FlipbookLayoutEditor({ album, onPlayVideo, onUpdateAlbum, canManage = false }: FlipbookViewProps) {
    // Manual Mode is now the only mode
    const isManualMode = true
    const [manualPages, setManualPages] = useState<ManualFlipbookPage[]>([])
    const [uploadingPdf, setUploadingPdf] = useState(false)
    const [selectedManualPageId, setSelectedManualPageId] = useState<string | null>(null)
    const [drawingHotspot, setDrawingHotspot] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null)
    const [deleteHotspotConfirm, setDeleteHotspotConfirm] = useState<string | null>(null)
    const [uploadingHotspotId, setUploadingHotspotId] = useState<string | null>(null)
    const [deleteAllPagesConfirm, setDeleteAllPagesConfirm] = useState(false)
    const [deletePageConfirm, setDeletePageConfirm] = useState<{ id: string; label: string } | null>(null)
    const [isDeletingAll, setIsDeletingAll] = useState(false)
    const [isDeletingPage, setIsDeletingPage] = useState(false)
    const [isPageReady, setIsPageReady] = useState(false)
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null)
    const [mobileTab, setMobileTab] = useState<'pages' | 'hotspots'>('pages')
    const [uploadingCover, setUploadingCover] = useState(false)
    const [uploadingBackCover, setUploadingBackCover] = useState(false)
    const [draggedPageId, setDraggedPageId] = useState<string | null>(null)
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
    const touchDragPageIdRef = useRef<string | null>(null)
    const touchDragOverIndexRef = useRef<number | null>(null)
    const touchDragPointerRef = useRef<{ x: number; y: number } | null>(null)
    const touchDragAutoScrollRafRef = useRef<number | null>(null)
    const pagesListScrollRef = useRef<HTMLDivElement>(null)
    const manualPagesRef = useRef<ManualFlipbookPage[]>([])
    const hotspotServerIdByTempIdRef = useRef<Map<string, string>>(new Map())
    const cancelledTempHotspotIdsRef = useRef<Set<string>>(new Set())

    useEffect(() => { manualPagesRef.current = manualPages }, [manualPages])

    useEffect(() => () => {
        if (touchDragAutoScrollRafRef.current != null) {
            cancelAnimationFrame(touchDragAutoScrollRafRef.current)
        }
    }, [])

    useEffect(() => {
        if (selectedManualPageId !== lastSelectedId) {
            // Remove forced 300ms delay; show selected page immediately.
            setIsPageReady(true)
            setLastSelectedId(selectedManualPageId)
        }
    }, [selectedManualPageId])

    const fetchManualPages = async () => {
        if (!album?.id) return
        try {
            const res = await fetchWithAuth(`/api/albums/${album.id}/flipbook`, {
                credentials: 'include',
                cache: 'no-store',
            })
            const pages = await res.json().catch(() => [])
            if (!res.ok) {
                console.error('Error fetching manual pages:', pages)
                return
            }
            if (Array.isArray(pages)) {
                setManualPages(pages as ManualFlipbookPage[])
                if (pages.length > 0 && !selectedManualPageId) {
                    setSelectedManualPageId((pages[0] as any).id)
                }
            }
        } catch (err) {
            console.error('Error fetching manual pages:', err)
        }
    }

    const uploadFlipbookAsset = async (file: File | Blob, target: 'pages' | 'hotspots'): Promise<string> => {
        if (!album?.id) throw new Error('Album ID tidak valid')
        const formData = new FormData()
        formData.append('file', file)
        formData.append('target', target)
        const res = await fetchWithAuth(`/api/albums/${album.id}/flipbook/upload`, {
            method: 'POST',
            body: formData,
        })
        const payload = asObject(await res.json().catch(() => ({})))
        const fileUrl = asString(payload.file_url)
        if (!res.ok || !fileUrl) {
            throw new Error(getErrorMessage(payload, 'Upload file gagal'))
        }
        return fileUrl
    }

    // Initial Fetch
    useEffect(() => {
        if (album?.id) {
            fetchManualPages()
        }
    }, [album?.id])
    // Supabase auth-only: no Realtime. We refetch pages after actions as needed.

    const handleDeletePage = async (pageId: string) => {
        if (!album?.id) return

        setIsDeletingPage(true)
        try {
            const res = await fetchWithAuth(
                `/api/albums/${album.id}/flipbook/pages/${encodeURIComponent(pageId)}`,
                { method: 'DELETE' },
            )
            if (!res.ok) {
                const err = asObject(await res.json().catch(() => ({})))
                throw new Error(getErrorMessage(err, 'Gagal menghapus halaman'))
            }

            setManualPages((prev) => {
                const next = prev.filter((p) => p.id !== pageId)
                setSelectedManualPageId((cur) => (cur === pageId ? (next[0]?.id ?? null) : cur))
                return next
            })
            await fetchManualPages()
            toast.success('Halaman berhasil dihapus')
        } catch (error: unknown) {
            console.error('Error deleting page:', error)
            toast.error(error instanceof Error ? error.message : 'Gagal menghapus halaman')
            await fetchManualPages()
        } finally {
            setIsDeletingPage(false)
            setDeletePageConfirm(null)
        }
    }

    const handleDeleteAllPages = async () => {
        if (!manualPages.length) return

        setIsDeletingAll(true)
        const toastId = toast.loading('Sedang membersihkan storage & database...')

        try {
            const res = await fetchWithAuth(`/api/albums/${album.id}/flipbook`, {
                method: 'POST',
            })

            if (!res.ok) {
                const error = asObject(await res.json().catch(() => ({})))
                throw new Error(getErrorMessage(error, 'Gagal membersihkan flipbook'))
            }

            setManualPages([])
            setSelectedManualPageId(null)
            toast.success('Flipbook berhasil dibersihkan total!', { id: toastId })

        } catch (error: any) {
            console.error('Error cleaning flipbook:', error)
            toast.error('Gagal membersihkan flipbook: ' + error.message, { id: toastId })
        } finally {
            setIsDeletingAll(false)
        }
    }

    const handleSaveHotspot = async (hotspotId: string, updates: Partial<VideoHotspot>) => {
        if (hotspotId.startsWith(TEMP_HOTSPOT_ID_PREFIX)) {
            setManualPages(prev => prev.map(p => ({
                ...p,
                flipbook_video_hotspots: p.flipbook_video_hotspots?.map(h => h.id === hotspotId ? { ...h, ...updates } : h)
            })))
            return
        }

        const res = await fetchWithAuth(`/api/albums/${album.id}/flipbook/hotspots/${hotspotId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        })
        if (res.ok) {
            setManualPages(prev => prev.map(p => ({
                ...p,
                flipbook_video_hotspots: p.flipbook_video_hotspots?.map(h => h.id === hotspotId ? { ...h, ...updates } : h)
            })))
            toast.success('Hotspot berhasil disimpan')
        } else {
            toast.error('Gagal menyimpan hotspot')
        }
    }

    const deleteHotspotOnServer = async (serverHotspotId: string) => {
        if (!album?.id) throw new Error('Album ID tidak valid')
        const res = await fetchWithAuth(
            `/api/albums/${album.id}/flipbook/hotspots/${encodeURIComponent(serverHotspotId)}`,
            { method: 'DELETE' },
        )
        if (!res.ok) {
            const err = asObject(await res.json().catch(() => ({})))
            throw new Error(getErrorMessage(err, 'Gagal menghapus hotspot'))
        }
    }

    const handleDeleteHotspot = async (hotspotId: string) => {
        if (!album?.id) return

        let deletedHotspot: VideoHotspot | null = null
        let deletedFromPageId: string | null = null
        for (const p of manualPages) {
            const found = (p.flipbook_video_hotspots || []).find((h) => String(h.id) === String(hotspotId))
            if (found) {
                deletedHotspot = found
                deletedFromPageId = p.id
                break
            }
        }
        if (!deletedHotspot || !deletedFromPageId) return

        const isTemp = hotspotId.startsWith(TEMP_HOTSPOT_ID_PREFIX)
        const serverHotspotId = isTemp
            ? hotspotServerIdByTempIdRef.current.get(hotspotId)
            : String(hotspotId)

        if (isTemp) {
            cancelledTempHotspotIdsRef.current.add(hotspotId)
        }

        setManualPages((prev) =>
            prev.map((p) => ({
                ...p,
                flipbook_video_hotspots: (p.flipbook_video_hotspots || []).filter(
                    (h) => String(h.id) !== String(hotspotId),
                ),
            })),
        )

        if (isTemp && !serverHotspotId) {
            toast.success('Hotspot berhasil dihapus')
            return
        }

        const idToDelete = serverHotspotId ?? String(hotspotId)
        if (idToDelete.startsWith(TEMP_HOTSPOT_ID_PREFIX)) {
            toast.success('Hotspot berhasil dihapus')
            return
        }

        try {
            await deleteHotspotOnServer(idToDelete)
            hotspotServerIdByTempIdRef.current.delete(hotspotId)
            cancelledTempHotspotIdsRef.current.delete(hotspotId)
            toast.success('Hotspot berhasil dihapus')
        } catch (error: unknown) {
            cancelledTempHotspotIdsRef.current.delete(hotspotId)
            setManualPages((prev) =>
                prev.map((p) => {
                    if (p.id !== deletedFromPageId) return p
                    const exists = (p.flipbook_video_hotspots || []).some(
                        (h) => String(h.id) === String(hotspotId),
                    )
                    if (exists) return p
                    return {
                        ...p,
                        flipbook_video_hotspots: [...(p.flipbook_video_hotspots || []), deletedHotspot as VideoHotspot],
                    }
                }),
            )
            toast.error(error instanceof Error ? error.message : 'Gagal menghapus hotspot')
        }
    }

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isManualMode || !selectedManualPageId || !canManage) return

        const rect = e.currentTarget.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100

        setDrawingHotspot({
            startX: x,
            startY: y,
            currentX: x,
            currentY: y
        })
    }

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!drawingHotspot) return

        const rect = e.currentTarget.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100

        setDrawingHotspot(prev => prev ? {
            ...prev,
            currentX: x,
            currentY: y
        } : null)
    }

    const handleMouseUp = async () => {
        if (!drawingHotspot || !selectedManualPageId) return

        const { startX, startY, currentX, currentY } = drawingHotspot
        const x = Math.min(startX, currentX)
        const y = Math.min(startY, currentY)
        const width = Math.abs(currentX - startX)
        const height = Math.abs(currentY - startY)

        setDrawingHotspot(null)

        if (width < 1 || height < 1) return

        const currentHotspotCount = manualPages.find(p => p.id === selectedManualPageId)?.flipbook_video_hotspots?.length || 0
        const optimisticHotspotId = `${TEMP_HOTSPOT_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const optimisticHotspot: VideoHotspot = {
            id: optimisticHotspotId,
            page_id: selectedManualPageId,
            video_url: '',
            label: `Hotspot #${currentHotspotCount + 1}`,
            x,
            y,
            width,
            height,
        }

        // Optimistic insert so form appears instantly after releasing hold.
        setManualPages(prev => prev.map(p =>
            p.id === selectedManualPageId
                ? { ...p, flipbook_video_hotspots: [...(p.flipbook_video_hotspots || []), optimisticHotspot] }
                : p
        ))

        const res = await fetchWithAuth(`/api/albums/${album.id}/flipbook/hotspots`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                page_id: selectedManualPageId,
                video_url: '',
                label: optimisticHotspot.label,
                x,
                y,
                width,
                height,
            }),
        })
        const data = asObject(await res.json().catch(() => ({})))
        const serverId = asHotspotId(data.id)
        if (res.ok && serverId) {
            hotspotServerIdByTempIdRef.current.set(optimisticHotspotId, serverId)

            if (cancelledTempHotspotIdsRef.current.has(optimisticHotspotId)) {
                cancelledTempHotspotIdsRef.current.delete(optimisticHotspotId)
                hotspotServerIdByTempIdRef.current.delete(optimisticHotspotId)
                try {
                    await deleteHotspotOnServer(serverId)
                } catch (err) {
                    console.error('Failed to delete cancelled hotspot:', err)
                    toast.error('Gagal menghapus hotspot dari server')
                }
                return
            }

            let localHotspotSnapshot: VideoHotspot | null = null
            setManualPages(prev => prev.map(p =>
                p.id === selectedManualPageId
                    ? {
                        ...p,
                        flipbook_video_hotspots: (p.flipbook_video_hotspots || []).map(h =>
                            h.id === optimisticHotspotId
                                ? (() => {
                                    localHotspotSnapshot = h
                                    return {
                                        ...(data as VideoHotspot),
                                        ...h,
                                        id: serverId,
                                        page_id: selectedManualPageId,
                                    }
                                })()
                                : h
                        )
                    }
                    : p
            ))
            hotspotServerIdByTempIdRef.current.delete(optimisticHotspotId)

            if (localHotspotSnapshot && (
                localHotspotSnapshot.label !== asString(data.label) ||
                localHotspotSnapshot.video_url !== asString(data.video_url)
            )) {
                fetchWithAuth(`/api/albums/${album.id}/flipbook/hotspots/${encodeURIComponent(serverId)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        label: localHotspotSnapshot.label,
                        video_url: localHotspotSnapshot.video_url,
                    }),
                }).catch(() => {
                    // Keep UI responsive; user can re-save manually if needed.
                })
            }
            toast.success('Hotspot berhasil ditambahkan')
            return
        }

        // Rollback optimistic hotspot if server create failed.
        setManualPages(prev => prev.map(p => ({
            ...p,
            flipbook_video_hotspots: (p.flipbook_video_hotspots || []).filter(h => h.id !== optimisticHotspotId)
        })))
        toast.error(getErrorMessage(data, 'Gagal menambah hotspot'))
    }

    const handleHotspotVideoUpload = async (hotspotId: string, e: React.ChangeEvent<HTMLInputElement>) => {
        if (hotspotId.startsWith(TEMP_HOTSPOT_ID_PREFIX)) {
            toast.info('Tunggu sebentar, hotspot masih disimpan...')
            if (e.target) e.target.value = ''
            return
        }

        const file = e.target.files?.[0]
        if (!file || !album?.id) return

        setUploadingHotspotId(hotspotId)
        const toastId = toast.loading('Mengunggah video...')

        try {
            const publicUrl = await uploadFlipbookAsset(file, 'hotspots')

            const updateRes = await fetchWithAuth(`/api/albums/${album.id}/flipbook/hotspots/${hotspotId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ video_url: publicUrl }),
            })
            if (!updateRes.ok) {
                const err = asObject(await updateRes.json().catch(() => ({})))
                throw new Error(getErrorMessage(err, 'Gagal menyimpan video hotspot'))
            }

            setManualPages(prev => prev.map(p => ({
                ...p,
                flipbook_video_hotspots: p.flipbook_video_hotspots?.map(h =>
                    h.id === hotspotId ? { ...h, video_url: publicUrl } : h
                )
            })))

            toast.success('Video berhasil diunggah!', { id: toastId })
        } catch (error: any) {
            console.error('Error uploading hotspot video:', error)
            toast.error('Gagal mengunggah video: ' + error.message, { id: toastId })
        } finally {
            setUploadingHotspotId(null)
            if (e.target) e.target.value = ''
        }
    }

    const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !album?.id) return

        try {
            setUploadingPdf(true)
            const toastId = toast.loading('Memproses PDF... (Ini mungkin memakan waktu)')

            const pdfjsLib = await new Promise<any>((resolve, reject) => {
                if ((window as any).pdfjsLib) {
                    resolve((window as any).pdfjsLib);
                    return;
                }
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                script.onload = () => {
                    const lib = (window as any)['pdfjs-dist/build/pdf'];
                    lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                    resolve(lib);
                };
                script.onerror = (err) => reject(new Error('Gagal memuat PDF library dari CDN'));
                document.head.appendChild(script);
            });

            const arrayBuffer = await file.arrayBuffer()
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
            const numPages = pdf.numPages
            const newPages: ManualFlipbookPage[] = []
            // Nomor halaman PDF dimulai setelah halaman yang sudah ada (supaya tidak bentrok dengan cover = 1)
            const startPageNumber = manualPages.length > 0
                ? Math.max(...manualPages.map(p => p.page_number)) + 1
                : 1

            let progress = 0
            const pageNumbers = Array.from({ length: numPages }, (_, idx) => idx + 1)
            const uploadPage = async (i: number) => {
                const page = await pdf.getPage(i)
                const viewport = page.getViewport({ scale: PDF_RENDER_SCALE })
                const canvas = document.createElement('canvas')
                const context = canvas.getContext('2d')
                if (!context) throw new Error(`Canvas context tidak tersedia (halaman ${i})`)

                canvas.height = viewport.height
                canvas.width = viewport.width

                await page.render({ canvasContext: context, viewport }).promise
                const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82))
                if (!blob) throw new Error(`Gagal encode halaman ${i}`)

                const publicUrl = await uploadFlipbookAsset(blob, 'pages')
                const pageNumber = startPageNumber + (i - 1)
                const pageRes = await fetchWithAuth(`/api/albums/${album.id}/flipbook/pages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        album_id: album.id,
                        page_number: pageNumber,
                        image_url: publicUrl,
                        width: Math.round(viewport.width),
                        height: Math.round(viewport.height),
                        page_slot: 'body',
                    }),
                })
                const pageData = asObject(await pageRes.json().catch(() => ({})))
                if (!pageRes.ok) {
                    throw new Error(`Gagal menyimpan halaman ${i}: ${getErrorMessage(pageData, 'Unknown error')}`)
                }

                newPages.push({ ...(pageData as ManualFlipbookPage), flipbook_video_hotspots: [] })
                progress += 1
                if (progress === 1 || progress % 3 === 0 || progress === numPages) {
                    toast.loading(`Memproses halaman ${progress} dari ${numPages}...`, { id: toastId })
                }
            }

            for (let start = 0; start < pageNumbers.length; start += PDF_UPLOAD_CONCURRENCY) {
                const batch = pageNumbers.slice(start, start + PDF_UPLOAD_CONCURRENCY)
                await Promise.all(batch.map(uploadPage))
            }

            if (newPages.length > 0) {
                const sortedNewPages = [...newPages].sort((a, b) => a.page_number - b.page_number)
                setManualPages(prev => [...prev, ...sortedNewPages])
                fetchManualPages()
                toast.success(`Berhasil mengunggah ${newPages.length} halaman!`, { id: toastId })
            } else {
                toast.error('Gagal memproses halaman PDF', { id: toastId })
            }

        } catch (error: any) {
            console.error('PDF Upload Error:', error)
            toast.error('Gagal memproses PDF: ' + error.message)
        } finally {
            setUploadingPdf(false)
            if (e.target) e.target.value = ''
        }
    }

    // Upload Cover (front cover)
    const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !album?.id) return

        setUploadingCover(true)
        const toastId = toast.loading('Mengunggah cover...')

        try {
            const publicUrl = await uploadFlipbookAsset(file, 'pages')
            const insertRes = await fetchWithAuth(`/api/albums/${album.id}/flipbook/pages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    album_id: album.id,
                    image_url: publicUrl,
                    page_slot: 'front_cover',
                }),
            })
            if (!insertRes.ok) {
                const err = asObject(await insertRes.json().catch(() => ({})))
                throw new Error(getErrorMessage(err, 'Gagal menambah cover'))
            }

            await fetchManualPages()
            toast.success('Cover berhasil diunggah!', { id: toastId })
        } catch (error: any) {
            console.error('Cover upload error:', error)
            toast.error('Gagal mengunggah cover: ' + error.message, { id: toastId })
        } finally {
            setUploadingCover(false)
            if (e.target) e.target.value = ''
        }
    }

    // Upload Back Cover
    const handleBackCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !album?.id) return

        setUploadingBackCover(true)
        const toastId = toast.loading('Mengunggah back cover...')

        try {
            const publicUrl = await uploadFlipbookAsset(file, 'pages')
            const insertRes = await fetchWithAuth(`/api/albums/${album.id}/flipbook/pages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    album_id: album.id,
                    image_url: publicUrl,
                    page_slot: 'back_cover',
                }),
            })
            if (!insertRes.ok) {
                const err = asObject(await insertRes.json().catch(() => ({})))
                throw new Error(getErrorMessage(err, 'Gagal menambah back cover'))
            }

            await fetchManualPages()
            toast.success('Back cover berhasil diunggah!', { id: toastId })
        } catch (error: any) {
            console.error('Back cover upload error:', error)
            toast.error('Gagal mengunggah back cover: ' + error.message, { id: toastId })
        } finally {
            setUploadingBackCover(false)
            if (e.target) e.target.value = ''
        }
    }

    const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        if (!isManualMode || !selectedManualPageId || !canManage) return

        const rect = e.currentTarget.getBoundingClientRect()
        const touch = e.touches[0]
        const x = ((touch.clientX - rect.left) / rect.width) * 100
        const y = ((touch.clientY - rect.top) / rect.height) * 100

        setDrawingHotspot({
            startX: x,
            startY: y,
            currentX: x,
            currentY: y
        })
    }

    const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
        if (!drawingHotspot) return

        const rect = e.currentTarget.getBoundingClientRect()
        const touch = e.touches[0]
        const x = ((touch.clientX - rect.left) / rect.width) * 100
        const y = ((touch.clientY - rect.top) / rect.height) * 100

        setDrawingHotspot(prev => prev ? {
            ...prev,
            currentX: x,
            currentY: y
        } : null)
    }

    const reorderPagesAndPersist = async (fromMiddleIndex: number, toMiddleIndex: number, pagesOverride?: ManualFlipbookPage[]) => {
        const pages = pagesOverride ?? manualPages
        if (fromMiddleIndex === toMiddleIndex || pages.length < 3 || !album?.id) return
        const first = pages[0]
        const last = pages[pages.length - 1]
        const middle = pages.slice(1, -1)
        const reorderedMiddle = [...middle]
        const [removed] = reorderedMiddle.splice(fromMiddleIndex, 1)
        reorderedMiddle.splice(toMiddleIndex, 0, removed)
        const reordered = [first, ...reorderedMiddle, last]
        setManualPages(reordered)
        setDragOverIndex(null)
        setDraggedPageId(null)
        touchDragPageIdRef.current = null
        touchDragOverIndexRef.current = null
        try {
            const res = await fetchWithAuth(`/api/albums/${album.id}/flipbook/pages/reorder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page_ids: reordered.map((p) => p.id) }),
            })
            if (!res.ok) throw new Error('Gagal mengubah urutan')
            toast.success('Urutan halaman diperbarui')
        } catch (err: any) {
            console.error(err)
            toast.error('Gagal mengubah urutan')
            fetchManualPages()
        }
    }

    const handlePageDragStart = (e: React.DragEvent, pageId: string) => {
        const listIndex = manualPages.findIndex((p) => p.id === pageId)
        if (!canReorderPageAt(listIndex, manualPages)) {
            e.preventDefault()
            return
        }
        setDraggedPageId(pageId)
        e.dataTransfer.setData('text/plain', pageId)
        e.dataTransfer.effectAllowed = 'move'
    }

    const handlePageDragOver = (e: React.DragEvent, middleIndex: number) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDragOverIndex(middleIndex)
    }

    const handlePageDrop = (e: React.DragEvent, toMiddleIndex: number) => {
        e.preventDefault()
        const pageId = e.dataTransfer.getData('text/plain')
        if (!pageId) return
        const fromMiddleIndex = getMiddlePageIndex(pageId, manualPages)
        if (fromMiddleIndex === -1) return
        reorderPagesAndPersist(fromMiddleIndex, toMiddleIndex)
    }

    const handlePageDragEnd = () => {
        setDraggedPageId(null)
        setDragOverIndex(null)
    }

    const handlePageDragLeave = (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverIndex(null)
    }

    const updateTouchDropTargetAt = (clientX: number, clientY: number) => {
        const el = document.elementFromPoint(clientX, clientY)
        const row = el?.closest('[data-drop-index]')
        if (!row) return
        const idx = parseInt(row.getAttribute('data-drop-index') ?? '', 10)
        if (Number.isNaN(idx)) return
        touchDragOverIndexRef.current = idx
        setDragOverIndex(idx)
    }

    const stopTouchDragAutoScroll = () => {
        if (touchDragAutoScrollRafRef.current != null) {
            cancelAnimationFrame(touchDragAutoScrollRafRef.current)
            touchDragAutoScrollRafRef.current = null
        }
        touchDragPointerRef.current = null
    }

    const startTouchDragAutoScroll = () => {
        if (touchDragAutoScrollRafRef.current != null) {
            cancelAnimationFrame(touchDragAutoScrollRafRef.current)
        }
        const tick = () => {
            const ptr = touchDragPointerRef.current
            const container = pagesListScrollRef.current
            if (ptr && container) {
                runListAutoScroll(container, ptr.x, ptr.y)
                updateTouchDropTargetAt(ptr.x, ptr.y)
            }
            touchDragAutoScrollRafRef.current = requestAnimationFrame(tick)
        }
        touchDragAutoScrollRafRef.current = requestAnimationFrame(tick)
    }

    const handlePageTouchStart = (e: React.TouchEvent, pageId: string) => {
        if (!canManage) return
        const listIndex = manualPages.findIndex((p) => p.id === pageId)
        if (!canReorderPageAt(listIndex, manualPages)) return
        touchDragPageIdRef.current = pageId
        setDraggedPageId(pageId)
        const startTouch = e.touches[0]
        if (startTouch) {
            touchDragPointerRef.current = { x: startTouch.clientX, y: startTouch.clientY }
            updateTouchDropTargetAt(startTouch.clientX, startTouch.clientY)
        }
        startTouchDragAutoScroll()

        const onTouchMove = (ev: TouchEvent) => {
            ev.preventDefault()
            const t = ev.touches[0]
            if (!t) return
            touchDragPointerRef.current = { x: t.clientX, y: t.clientY }
            updateTouchDropTargetAt(t.clientX, t.clientY)
        }
        const onTouchEnd = () => {
            stopTouchDragAutoScroll()
            const fromId = touchDragPageIdRef.current
            const toIndex = touchDragOverIndexRef.current
            document.removeEventListener('touchmove', onTouchMove, { capture: true })
            document.removeEventListener('touchend', onTouchEnd, { capture: true })
            document.removeEventListener('touchcancel', onTouchEnd, { capture: true })
            if (fromId != null && toIndex != null) {
                const pages = manualPagesRef.current
                const fromMiddleIndex = getMiddlePageIndex(fromId, pages)
                if (fromMiddleIndex !== -1 && fromMiddleIndex !== toIndex) {
                    reorderPagesAndPersist(fromMiddleIndex, toIndex, pages)
                    return
                }
            }
            setDraggedPageId(null)
            setDragOverIndex(null)
            touchDragPageIdRef.current = null
            touchDragOverIndexRef.current = null
        }
        document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })
        document.addEventListener('touchend', onTouchEnd, { capture: true })
        document.addEventListener('touchcancel', onTouchEnd, { capture: true })
    }

    const selectedPage = manualPages.find(p => p.id === selectedManualPageId)

    return (
        <div className="flex flex-col lg:flex-row min-h-[calc(100vh-140px)] lg:h-[calc(100vh-80px)] gap-4 lg:gap-6 w-full max-w-7xl mx-auto px-4 py-4 lg:py-6 overflow-x-hidden">
            {/* Mobile Tabs Toggle - Only show when we have pages */}
            {manualPages.length > 0 && (
                <div className="flex lg:hidden w-full bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl border-2 border-slate-900 dark:border-slate-700 order-2 flex-shrink-0">
                    <button
                        onClick={() => setMobileTab('pages')}
                        className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${mobileTab === 'pages' ? 'bg-white dark:bg-slate-700 border-2 border-slate-900 dark:border-slate-700 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 border-2 border-transparent hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                        Pages
                    </button>
                    <button
                        onClick={() => setMobileTab('hotspots')}
                        className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${mobileTab === 'hotspots' ? 'bg-white dark:bg-slate-700 border-2 border-slate-900 dark:border-slate-700 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 border-2 border-transparent hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                        Hotspots
                    </button>
                </div>
            )}

            {/* Layout Sidebar / Selector */}
            <div className={`${mobileTab === 'pages' || manualPages.length === 0 ? 'flex' : 'hidden'} lg:flex flex-col w-full lg:w-72 gap-4 lg:gap-6 flex-shrink-0 order-3 lg:order-1 lg:h-full`}>
                {canManage && (
                    <div className="order-0 w-full bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-900 dark:border-slate-700 p-4 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b]">
                        {/* Cover & Back Cover Upload */}
                        <div className="flex gap-2 mb-3">
                            <div className="flex-1">
                                <input
                                    type="file"
                                    id="cover-upload"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleCoverUpload}
                                    disabled={uploadingCover}
                                />
                                <label
                                    htmlFor="cover-upload"
                                    className={`flex items-center justify-center gap-2 w-full p-3 border-2 border-dashed border-slate-900 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:border-emerald-400 dark:hover:border-emerald-500 transition-all group ${uploadingCover ? 'opacity-50 pointer-events-none' : 'active:translate-x-0.5 active:translate-y-0.5'}`}
                                >
                                    <div className="w-8 h-8 rounded-lg bg-emerald-400 dark:bg-emerald-600 border-2 border-slate-900 dark:border-slate-700 flex items-center justify-center group-hover:rotate-3 transition-transform shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] flex-shrink-0">
                                        {uploadingCover ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <BookOpen className="w-4 h-4 text-white" />}
                                    </div>
                                    <span className="text-[9px] font-black text-slate-900 dark:text-white uppercase tracking-widest leading-tight">
                                        {uploadingCover ? 'Uploading...' : 'Cover'}
                                    </span>
                                </label>
                            </div>
                            <div className="flex-1">
                                <input
                                    type="file"
                                    id="backcover-upload"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleBackCoverUpload}
                                    disabled={uploadingBackCover}
                                />
                                <label
                                    htmlFor="backcover-upload"
                                    className={`flex items-center justify-center gap-2 w-full p-3 border-2 border-dashed border-slate-900 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-950/50 hover:border-orange-400 dark:hover:border-orange-500 transition-all group ${uploadingBackCover ? 'opacity-50 pointer-events-none' : 'active:translate-x-0.5 active:translate-y-0.5'}`}
                                >
                                    <div className="w-8 h-8 rounded-lg bg-orange-400 dark:bg-orange-600 border-2 border-slate-900 dark:border-slate-700 flex items-center justify-center group-hover:rotate-3 transition-transform shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] flex-shrink-0">
                                        {uploadingBackCover ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <BookMarked className="w-4 h-4 text-white" />}
                                    </div>
                                    <span className="text-[9px] font-black text-slate-900 dark:text-white uppercase tracking-widest leading-tight">
                                        {uploadingBackCover ? 'Uploading...' : 'Back Cover'}
                                    </span>
                                </label>
                            </div>
                        </div>

                        {/* PDF Upload */}
                        <div className="mb-0">
                            <input
                                type="file"
                                id="pdf-upload"
                                className="hidden"
                                accept="application/pdf"
                                onChange={handlePdfUpload}
                                disabled={uploadingPdf}
                            />
                            <label
                                htmlFor="pdf-upload"
                                className={`flex flex-row items-center justify-start gap-4 p-4 border-2 border-dashed border-slate-900 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 transition-all group ${uploadingPdf ? 'opacity-50 pointer-events-none' : 'active:translate-x-0.5 active:translate-y-0.5'}`}
                            >
                                <div className="w-10 h-10 rounded-xl bg-indigo-400 dark:bg-indigo-600 border-2 border-slate-900 dark:border-slate-700 flex items-center justify-center group-hover:rotate-3 transition-transform shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] flex-shrink-0">
                                    <ImagePlus className="w-5 h-5 text-white" />
                                </div>
                                <div className="text-left flex-1">
                                    <p className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest leading-tight">
                                        {uploadingPdf ? 'Memproses PDF...' : 'Upload PDF Baru'}
                                    </p>
                                    <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 mt-0.5 uppercase tracking-tight">Maks 50MB</p>
                                </div>
                            </label>
                        </div>
                    </div>
                )}

                <div className="w-full bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-900 dark:border-slate-700 p-4 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] h-auto lg:flex-1 flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-3 lg:mb-4">
                        <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                            Pages
                            <span className="bg-slate-900 dark:bg-slate-700 text-white px-1.5 py-0.5 rounded-lg text-[9px]">{manualPages.length}</span>
                        </h3>
                        {manualPages.length > 0 && (
                            <button
                                onClick={() => setDeleteAllPagesConfirm(true)}
                                disabled={isDeletingAll}
                                className="text-[9px] font-black text-red-500 dark:text-red-400 hover:text-white hover:bg-red-500 border-2 border-red-500 dark:border-red-500 px-2 py-1 rounded-lg transition-all flex items-center gap-1 active:translate-x-0.5 active:translate-y-0.5"
                                title="Hapus Semua Halaman"
                            >
                                <Trash2 className="w-3 h-3" strokeWidth={3} />
                                <span className="hidden sm:inline">{isDeletingAll ? 'CLEANING...' : 'CLEAN ALL'}</span>
                                <span className="sm:hidden">{isDeletingAll ? '...' : 'CLR'}</span>
                            </button>
                        )}
                    </div>

                    <div
                        ref={pagesListScrollRef}
                        className={`flex flex-row lg:flex-col overflow-x-auto lg:overflow-y-auto min-h-0 gap-3 pt-2 pb-3 px-1 lg:pt-0 lg:pb-0 lg:px-0 lg:space-y-3 pr-2 lg:pr-1 no-scrollbar ${draggedPageId ? 'snap-none' : 'snap-x snap-mandatory lg:snap-none'}`}
                    >
                        {manualPages.map((page, index) => {
                            const displayNum = index + 1
                            const isFront = page.page_slot === 'front_cover'
                            const isBack = page.page_slot === 'back_cover'
                            const canReorder = canReorderPageAt(index, manualPages)
                            const middleIndex = canReorder ? getMiddlePageIndex(page.id, manualPages) : -1
                            const label = isFront ? 'Cover' : isBack ? 'Back Cover' : `Hal ${page.page_number}`
                            const isDragging = draggedPageId === page.id
                            const isDropTarget = canReorder && dragOverIndex === middleIndex
                            return (
                            <div
                                key={page.id}
                                {...(canReorder ? { 'data-drop-index': middleIndex } : {})}
                                onDragOver={canManage && canReorder ? (e) => handlePageDragOver(e, middleIndex) : undefined}
                                onDrop={canManage && canReorder ? (e) => handlePageDrop(e, middleIndex) : undefined}
                                onDragLeave={canReorder ? handlePageDragLeave : undefined}
                                onDragEnd={canReorder ? handlePageDragEnd : undefined}
                                className={`flex-shrink-0 w-20 sm:w-24 lg:w-full flex flex-col items-center lg:flex-row lg:items-center gap-1 lg:gap-3 p-1.5 lg:p-2 rounded-xl border-2 lg:border-4 transition-all text-left group snap-start lg:snap-align-none ${selectedManualPageId === page.id
                                    ? 'bg-amber-400 dark:bg-amber-500 border-slate-900 dark:border-slate-700 shadow-[1.5px_1.5px_0_0_#334155] lg:shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] lg:dark:shadow-[1.5px_1.5px_0_0_#1e293b] -translate-y-0.5 lg:-translate-y-0'
                                    : 'bg-white dark:bg-slate-800 border-slate-900 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'} ${isDragging ? 'opacity-50' : ''} ${isDropTarget ? 'ring-2 ring-indigo-400 dark:ring-indigo-500 ring-offset-2 dark:ring-offset-slate-900' : ''}`}
                            >
                                {canManage && (
                                    <>
                                        {/* Mobile: drag kiri + hapus kanan (slot 28×28px simetris); cover/back hanya hapus di tengah */}
                                        <div
                                            className={`flex w-full items-center lg:hidden ${canReorder ? 'justify-between' : 'justify-center'}`}
                                        >
                                            {canReorder ? (
                                                <div
                                                    draggable
                                                    onDragStart={(e) => handlePageDragStart(e, page.id)}
                                                    onTouchStart={(e) => handlePageTouchStart(e, page.id)}
                                                    className="flex h-7 w-7 shrink-0 items-center justify-center cursor-grab active:cursor-grabbing text-slate-400 dark:text-slate-500 touch-none"
                                                    title="Drag untuk pindah urutan"
                                                >
                                                    <GripVertical className="w-3.5 h-3.5" strokeWidth={3} />
                                                </div>
                                            ) : null}
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setDeletePageConfirm({ id: page.id, label })
                                                }}
                                                disabled={isDeletingPage}
                                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-red-500 dark:text-red-400 hover:bg-red-500 hover:text-white border-2 border-transparent hover:border-slate-900 dark:hover:border-slate-600 transition-all active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-40"
                                                title="Hapus halaman"
                                            >
                                                <Trash2 className="w-3.5 h-3.5 shrink-0" strokeWidth={3} />
                                            </button>
                                        </div>
                                        {/* Desktop: grip di kiri baris */}
                                        {canReorder ? (
                                            <div
                                                draggable
                                                onDragStart={(e) => handlePageDragStart(e, page.id)}
                                                onTouchStart={(e) => handlePageTouchStart(e, page.id)}
                                                className="hidden lg:flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 touch-none h-full"
                                                title="Drag untuk pindah urutan"
                                            >
                                                <GripVertical className="w-3.5 h-3.5" strokeWidth={3} />
                                            </div>
                                        ) : (
                                            <div className="hidden lg:block w-3.5 shrink-0" aria-hidden />
                                        )}
                                    </>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setSelectedManualPageId(page.id)}
                                    className="flex w-full flex-1 min-w-0 flex-col items-center lg:flex-row lg:items-center gap-1 lg:gap-3 p-0 rounded-lg border-0 bg-transparent text-left"
                                >
                                    <div className="w-full lg:w-14 aspect-[3/4] lg:h-[76px] bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden flex-shrink-0 border-2 border-slate-900 dark:border-slate-700 relative lg:group-hover:shadow-[1.5px_1.5px_0_0_#334155] dark:group-hover:shadow-[2px_2px_0_0_#334155] transition-all">
                                        <img src={page.image_url} loading="lazy" decoding="async" className="w-full h-full object-cover" alt={label} />
                                        <div className="absolute top-0 right-0 bg-slate-900 dark:bg-slate-600 px-1 py-0.5 text-[7px] font-black text-white rounded-bl-md">
                                            {displayNum}
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col justify-center text-center lg:text-left pb-1 lg:pb-0">
                                        <p className={`text-[8px] lg:text-[10px] font-black uppercase tracking-widest truncate w-full ${selectedManualPageId === page.id ? 'text-slate-900 dark:text-white' : 'text-slate-900 dark:text-white'}`}>
                                            {label}
                                        </p>
                                        <p className={`hidden lg:block text-[9px] font-bold uppercase tracking-tight mt-0.5 ${selectedManualPageId === page.id ? 'text-slate-900/60 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}`}>
                                            {page.flipbook_video_hotspots?.length || 0} Hotspot
                                        </p>
                                        <div className={`lg:hidden mx-auto mt-1 flex items-center justify-center w-3 h-3 rounded-full ${page.flipbook_video_hotspots?.length ? (selectedManualPageId === page.id ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'bg-indigo-500 text-white') : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-400'}`}>
                                            <span className="text-[6px] font-black">{page.flipbook_video_hotspots?.length || 0}</span>
                                        </div>
                                    </div>
                                </button>
                                {canManage && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setDeletePageConfirm({ id: page.id, label })
                                        }}
                                        disabled={isDeletingPage}
                                        className="hidden lg:flex shrink-0 items-center justify-center p-1.5 h-full rounded-lg text-red-500 dark:text-red-400 hover:bg-red-500 hover:text-white border-2 border-transparent hover:border-slate-900 dark:hover:border-slate-600 transition-all active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-40"
                                        title="Hapus halaman"
                                    >
                                        <Trash2 className="w-3.5 h-3.5 shrink-0" strokeWidth={3} />
                                    </button>
                                )}
                            </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* Hotspot Configuration Sidebar */}
            <div className={`${mobileTab === 'hotspots' ? 'flex' : 'hidden'} lg:flex w-full lg:w-72 flex-col gap-4 flex-shrink-0 bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-900 dark:border-slate-700 p-4 order-4 lg:order-3 h-auto lg:h-full shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b]`}>
                <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2">
                    {canManage ? 'Hotspot Editor' : 'Hotspots'}
                </h3>
                <div className="p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl mb-2">
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase leading-relaxed">
                        {canManage
                            ? 'Klik pada halaman di area preview untuk menambahkan area interaktif (video popup).'
                            : 'Klik icon play pada halaman untuk menonton video terkait.'}
                    </p>
                </div>

                {selectedPage?.flipbook_video_hotspots && selectedPage.flipbook_video_hotspots.length > 0 ? (
                    <div className="flex-1 overflow-y-auto min-h-0 no-scrollbar pr-1 space-y-4">
                        {selectedPage.flipbook_video_hotspots.map((h, i) => {
                            return (
                            <div key={h.id} className={`p-4 bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-2xl space-y-4 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] ${!canManage ? 'opacity-80' : ''}`}>
                                <div className="flex items-center justify-between gap-2">
                                    {canManage ? (
                                        <input
                                            type="text"
                                            defaultValue={h.label || `Hotspot #${i + 1}`}
                                            onBlur={(e) => handleSaveHotspot(h.id, { label: e.target.value })}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault()
                                                    ;(e.currentTarget as HTMLInputElement).blur()
                                                }
                                            }}
                                            className="bg-transparent border-b-2 border-slate-100 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 focus:border-indigo-400 focus:outline-none text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-white w-full transition-all"
                                            placeholder="NAMA HOTSPOT"
                                        />
                                    ) : (
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-white truncate max-w-[140px]">{h.label || `Hotspot #${i + 1}`}</span>
                                    )}
                                    {canManage && (
                                        <button
                                            onClick={() => setDeleteHotspotConfirm(h.id)}
                                            className="p-1.5 bg-red-50 dark:bg-red-950/50 text-red-500 dark:text-red-400 rounded-lg hover:bg-red-500 hover:text-white transition-all border-2 border-transparent hover:border-slate-900 dark:hover:border-slate-600 active:translate-x-0.5 active:translate-y-0.5"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" strokeWidth={3} />
                                        </button>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                        {canManage ? 'URL Video (Youtube/MP4)' : 'Link Video'}
                                    </label>
                                    <div className="flex flex-col gap-2">
                                        {canManage ? (
                                            <>
                                                <input
                                                    type="text"
                                                    defaultValue={h.video_url}
                                                    placeholder="HTTPS://YOUTUBE.COM/WATCH?V=..."
                                                    onBlur={(e) => handleSaveHotspot(h.id, { video_url: e.target.value })}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault()
                                                            ;(e.currentTarget as HTMLInputElement).blur()
                                                        }
                                                    }}
                                                    className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl px-3 py-2 text-[10px] font-black text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-700 focus:outline-none placeholder:text-slate-300 dark:placeholder:text-slate-500 font-mono"
                                                />
                                                <div className="relative">
                                                    <input
                                                        type="file"
                                                        id={`video-upload-${h.id}`}
                                                        className="hidden"
                                                        accept="video/*"
                                                        onChange={(e) => handleHotspotVideoUpload(h.id, e)}
                                                        disabled={!!uploadingHotspotId}
                                                    />
                                                    <label
                                                        htmlFor={`video-upload-${h.id}`}
                                                        className={`flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-emerald-400 dark:hover:bg-emerald-600 border-2 border-slate-900 dark:border-slate-700 rounded-xl cursor-pointer transition-all text-[9px] font-black uppercase tracking-widest text-slate-900 dark:text-white shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 ${uploadingHotspotId === h.id ? 'opacity-50 pointer-events-none' : ''}`}
                                                    >
                                                        {uploadingHotspotId === h.id ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={3} /> : <Play className="w-3 h-3" strokeWidth={3} />}
                                                        <span>{uploadingHotspotId === h.id ? 'Uploading...' : 'Upload Video File'}</span>
                                                    </label>
                                                </div>
                                            </>
                                        ) : (
                                            <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 italic truncate bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border-2 border-slate-100 dark:border-slate-700">
                                                {h.video_url || 'Belum ada URL'}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {!canManage && h.video_url && (
                                    <button
                                        onClick={() => onPlayVideo?.(h.video_url)}
                                        className="w-full py-2 bg-indigo-400 dark:bg-indigo-600 text-white border-2 border-slate-900 dark:border-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:shadow-none hover:translate-x-1 hover:translate-y-1 active:translate-x-1.5 active:translate-y-1.5 transition-all"
                                    >
                                        Play Video
                                    </button>
                                )}
                            </div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50 dark:bg-slate-800 border-2 border-dashed border-slate-900 dark:border-slate-700 rounded-2xl">
                        <Play className="w-10 h-10 mb-3 text-slate-200 dark:text-slate-600" strokeWidth={3} />
                        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Belum ada hotspot di halaman ini.</p>
                    </div>
                )}
            </div>

            {/* Main Preview Area */}
            <div className={`w-full min-h-[55vh] lg:flex-1 lg:min-h-0 shrink-0 bg-white dark:bg-slate-900 rounded-[28px] lg:rounded-[36px] border-2 border-slate-900 dark:border-slate-700 overflow-hidden relative flex flex-col order-1 lg:order-2 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] ${manualPages.length === 0 ? 'hidden lg:flex' : ''}`}>
                <div className="flex-1 relative overflow-auto p-4 sm:p-12 flex no-scrollbar bg-white dark:bg-slate-900 min-h-[300px]">
                    {selectedPage ? (
                        <div
                            className={`relative m-auto rounded-sm overflow-hidden shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] border-2 lg:border-2 border-slate-900 dark:border-slate-700 group ${isPageReady ? 'transition-opacity duration-700 opacity-100' : 'opacity-0'}`}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onTouchStart={handleTouchStart}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleMouseUp}
                            // Konfigurasi container proporsional paling presisi & anti-pipih/letterboxing
                            style={{ 
                                touchAction: 'none',
                                aspectRatio: selectedPage.width && selectedPage.height ? `${selectedPage.width} / ${selectedPage.height}` : '3/4',
                                height: 'auto', // Berikan keleluasaan kalkulasi height ke browser berdasarkan aspectRatio
                                maxHeight: 'calc(55vh - 40px)', // Batas statis mutlak menghindari elemen "terpotong dari atas"
                                maxWidth: '100%',
                            }}
                        >
                            <img
                                src={selectedPage.image_url}
                                className="block w-full h-full object-cover select-none pointer-events-none"
                                alt={`Page ${selectedPage.page_number}`}
                            />

                            {/* Hotspot overlays */}
                            {selectedPage.flipbook_video_hotspots?.map((h, i) => (
                                <div
                                    key={h.id}
                                    className={`absolute group/hotspot transition-all duration-200 border-4 ${canManage ? 'border-amber-400/50 bg-amber-400/10 hover:bg-amber-400/20' : 'border-transparent'}`}
                                    style={{
                                        left: `${h.x}%`,
                                        top: `${h.y}%`,
                                        width: `${h.width}%`,
                                        height: `${h.height}%`
                                    }}
                                >
                                    {canManage && (
                                        <div className="absolute -top-6 left-0 bg-amber-400 dark:bg-amber-500 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 opacity-0 group-hover/hotspot:opacity-100 transition-opacity whitespace-nowrap shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b]">
                                            {h.label || `Hotspot #${i + 1}`}
                                        </div>
                                    )}
                                    {!canManage && h.video_url && (
                                        <button
                                            onClick={() => onPlayVideo?.(h.video_url)}
                                            className="absolute inset-0 flex items-center justify-center bg-white/20 opacity-0 hover:opacity-100 transition-opacity w-full h-full min-w-[24px] min-h-[24px]"
                                        >
                                            <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-indigo-400 dark:bg-indigo-600 border-2 sm:border-2 border-slate-900 dark:border-slate-700 flex items-center justify-center text-white shadow-[1.5px_1.5px_0_0_#334155] sm:shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] dark:sm:shadow-[1.5px_1.5px_0_0_#334155] transform hover:scale-110 active:scale-95 transition-all">
                                                <Play className="w-4 h-4 sm:w-6 sm:h-6 fill-current ml-0.5 sm:ml-1" />
                                            </div>
                                        </button>
                                    )}
                                </div>
                            ))}

                            {/* Drawing Preview */}
                            {drawingHotspot && (
                                <div
                                    className="absolute border-2 border-dashed border-emerald-400 bg-emerald-400/20 pointer-events-none z-50"
                                    style={{
                                        left: `${Math.min(drawingHotspot.startX, drawingHotspot.currentX)}%`,
                                        top: `${Math.min(drawingHotspot.startY, drawingHotspot.currentY)}%`,
                                        width: `${Math.abs(drawingHotspot.currentX - drawingHotspot.startX)}%`,
                                        height: `${Math.abs(drawingHotspot.currentY - drawingHotspot.startY)}%`
                                    }}
                                />
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 sm:p-12 bg-white dark:bg-slate-900 border-2 border-dashed border-slate-900 dark:border-slate-700 rounded-2xl m-auto w-full">
                            <ImageIcon className="w-16 h-16 mb-4 text-slate-200 dark:text-slate-600" strokeWidth={3} />
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Pilih atau upload halaman PDF untuk memulai.</p>
                        </div>
                    )}
                </div>
            </div>
            {/* Hotspot Delete Confirmation Modal */}
            {deleteHotspotConfirm && (
                <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-[32px] p-8 max-w-md w-full shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] animate-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 bg-red-100 dark:bg-red-950/50 border-2 border-slate-900 dark:border-slate-700 rounded-2xl flex items-center justify-center mb-6">
                            <Trash2 className="w-8 h-8 text-red-500 dark:text-red-400" strokeWidth={3} />
                        </div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">Hapus Hotspot</h3>
                        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-8 uppercase tracking-wide leading-relaxed">
                            Apakah Anda yakin ingin menghapus hotspot ini secara permanen?
                        </p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setDeleteHotspotConfirm(null)}
                                className="flex-1 py-4 px-6 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border-2 border-slate-900 dark:border-slate-700 font-black rounded-2xl uppercase tracking-widest text-xs shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:translate-x-0.5 active:translate-y-0.5"
                            >
                                Batal
                            </button>
                            <button
                                onClick={() => {
                                    if (deleteHotspotConfirm) {
                                        handleDeleteHotspot(deleteHotspotConfirm)
                                        setDeleteHotspotConfirm(null)
                                    }
                                }}
                                className="flex-1 py-4 px-6 bg-red-500 text-white border-2 border-slate-900 dark:border-slate-700 font-black rounded-2xl uppercase tracking-widest text-xs shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
                            >
                                Ya, Hapus
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Single Page Confirmation Modal */}
            {deletePageConfirm && (
                <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-[32px] p-8 max-w-md w-full shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] animate-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 bg-red-100 dark:bg-red-950/50 border-2 border-slate-900 dark:border-slate-700 rounded-2xl flex items-center justify-center mb-6">
                            <Trash2 className="w-8 h-8 text-red-500 dark:text-red-400" strokeWidth={3} />
                        </div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">Hapus Halaman</h3>
                        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-8 uppercase tracking-wide leading-relaxed">
                            Hapus <strong className="text-red-500 dark:text-red-400">{deletePageConfirm.label}</strong> beserta hotspot di halaman ini? Tindakan ini tidak dapat dibatalkan.
                        </p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setDeletePageConfirm(null)}
                                disabled={isDeletingPage}
                                className="flex-1 py-4 px-6 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border-2 border-slate-900 dark:border-slate-700 font-black rounded-2xl uppercase tracking-widest text-xs shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50"
                            >
                                Batal
                            </button>
                            <button
                                onClick={() => handleDeletePage(deletePageConfirm.id)}
                                disabled={isDeletingPage}
                                className="flex-1 py-4 px-6 bg-red-500 text-white border-2 border-slate-900 dark:border-slate-700 font-black rounded-2xl uppercase tracking-widest text-xs shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all disabled:opacity-50"
                            >
                                {isDeletingPage ? 'Menghapus...' : 'Ya, Hapus'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete All Pages Confirmation Modal */}
            {deleteAllPagesConfirm && (
                <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-[32px] p-8 max-w-md w-full shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] animate-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 bg-red-100 dark:bg-red-950/50 border-2 border-slate-900 dark:border-slate-700 rounded-2xl flex items-center justify-center mb-6">
                            <Trash2 className="w-8 h-8 text-red-500 dark:text-red-400" strokeWidth={3} />
                        </div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">Hapus Semua Halaman</h3>
                        <div className="space-y-4 mb-8">
                            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide leading-relaxed">
                                Apakah Anda yakin ingin menghapus <strong className="text-red-500 dark:text-red-400">SEMUA</strong> halaman flipbook?
                            </p>
                            <div className="bg-red-50 dark:bg-red-950/40 border-2 border-red-200 dark:border-red-800 p-3 rounded-xl">
                                <p className="text-[10px] font-black text-red-500 dark:text-red-400 uppercase tracking-tighter leading-tight">
                                    Tindakan ini akan menghapus semua gambar halaman dan hotspot secara permanen. Tindakan ini tidak dapat dibatalkan.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setDeleteAllPagesConfirm(false)}
                                className="flex-1 py-4 px-6 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border-2 border-slate-900 dark:border-slate-700 font-black rounded-2xl uppercase tracking-widest text-xs shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:translate-x-0.5 active:translate-y-0.5"
                            >
                                Batal
                            </button>
                            <button
                                onClick={() => {
                                    handleDeleteAllPages()
                                    setDeleteAllPagesConfirm(false)
                                }}
                                className="flex-1 py-4 px-6 bg-red-500 text-white border-2 border-slate-900 dark:border-slate-700 font-black rounded-2xl uppercase tracking-widest text-xs shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
                            >
                                {isDeletingAll ? 'CLEANING...' : 'Ya, Hapus Semua'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}










