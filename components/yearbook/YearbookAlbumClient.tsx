'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import BackLink from '@/components/dashboard/BackLink'
import { ChevronLeft, ChevronRight, BookOpen, ImagePlus, Video, Play, Users, Layout, Eye, Menu, MessageSquare, Book, Lock, Link as LinkIcon, Search, SearchX, X, Loader2, UserCircle } from 'lucide-react'
import { toast } from '@/lib/toast'
import NotFound from '@/app/not-found'
import YearbookClassesView from './YearbookClassesView'
import YearbookLoader, { isValidYearbookSection } from './components/YearbookLoader'
import { getSectionModeFromUrl, getYearbookSectionQueryUrl } from './lib/yearbook-paths'
import CreditBadgeTop from './components/CreditBadgeTop'
import { fetchWithAuth } from '../../lib/api-client'
import type { Album, ClassAccess, ClassMember, ClassRequest, Photo } from './types'
import { asString, asObject, asStringArray, asNumberRecord, getErrorMessage } from './utils/response-narrowing'
import { useYearbookUIState } from './hooks/useYearbookUIState'
import { useYearbookAlbumData } from './hooks/useYearbookAlbumData'
import { useYearbookFeatures } from './hooks/useYearbookFeatures'
import { useYearbookAccess } from './hooks/useYearbookAccess'
import { useYearbookMembers } from './hooks/useYearbookMembers'
import { useYearbookCoverState, useYearbookProfileEditState, useYearbookGalleryState } from './hooks/useYearbookUI'
import { useCurrentUserId } from './hooks/useCurrentUserId'
import { useYearbookSearchState } from './hooks/useYearbookSearchState'
import { useYearbookSyncLifecycle } from './hooks/useYearbookSyncLifecycle'
import { useYearbookTeamCounts } from './hooks/useYearbookTeamCounts'
import FastImage from '@/components/ui/FastImage'

export type YearbookAlbumClientProps = {
  backHref?: string
  backLabel?: string
  initialAlbum?: Album | null
  initialMembers?: Record<string, ClassMember[]>
  initialAccess?: { access: Record<string, ClassAccess | null>, requests: Record<string, ClassRequest | null> }
}

const AI_LABS_TOOLS = ['tryon', 'pose', 'image-editor', 'photogroup', 'phototovideo'] as const

export default function YearbookAlbumClient({
  backHref = '/user/albums',
  backLabel = 'Ke Album',
  initialAlbum = null,
  initialMembers = {},
  initialAccess = { access: {}, requests: {} }
}: YearbookAlbumClientProps) {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const id = params?.id as string | undefined
  const toolParam = searchParams.get('tool')
  const aiLabsTool = (toolParam && AI_LABS_TOOLS.includes(toolParam as any)) ? toolParam : null
  
  // Album Data: album state, loading, error, and fetch callback
  const { album, setAlbum, loading, error, fetchAlbum, handleUpdateAlbum, albumRef } = useYearbookAlbumData(id, initialAlbum)
  
  // UI State: view, classIndex, sidebarMode, classViewMode, personalIndex, etc. with localStorage persistence
  const { view, setView, classIndex, setClassIndex, sidebarMode, setSidebarMode, classViewMode, setClassViewMode, personalIndex, setPersonalIndex, flipbookPreviewMode, setFlipbookPreviewMode, mobileMenuOpen, setMobileMenuOpen, mobileMenuMode, setMobileMenuMode, lastEditorSection, setLastEditorSection } = useYearbookUIState(id)

  // Features: feature unlocks, flipbook/ai-labs features by package
  const { featureUnlocks, setFeatureUnlocks, flipbookEnabledByPackage, setFlipbookEnabledByPackage, aiLabsFeaturesByPackage, setAiLabsFeaturesByPackage, featureCreditCosts, setFeatureCreditCosts, featureUseCosts, setFeatureUseCosts, featureUnlocksLoaded, setFeatureUnlocksLoaded, fetchFeatureUnlocks } = useYearbookFeatures(id)

  // Access: my access/request state and admin requests
  const {
    myAccessByClass,
    setMyAccessByClass,
    myRequestByClass,
    setMyRequestByClass,
    accessDataLoaded,
    setAccessDataLoaded,
    requestsByClass,
    setRequestsByClass,
    selectedRequestId,
    setSelectedRequestId,
    accessForbidden,
    fetchAllAccess: fetchAllAccessBase,
  } = useYearbookAccess(id, initialAccess)

  const {
    membersByClass,
    setMembersByClass,
    firstPhotoByStudentByClass,
    setFirstPhotoByStudentByClass,
    studentPhotosInCard,
    setStudentPhotosInCard,
    studentNameForPhotosInCard,
    setStudentNameForPhotosInCard,
    studentPhotoIndexInCard,
    setStudentPhotoIndexInCard,
  } = useYearbookMembers(id, initialMembers)

  const {
    photos,
    setPhotos,
    galleryPhotosLoading,
    setGalleryPhotosLoading,
    galleryStudent,
    setGalleryStudent,
    photoIndex,
    setPhotoIndex,
    touchStartX,
    setTouchStartX,
    personalCardExpanded,
    setPersonalCardExpanded,
  } = useYearbookGalleryState()

  const {
    editingProfileClassId,
    setEditingProfileClassId,
    editingMemberUserId,
    setEditingMemberUserId,
    editProfileName,
    setEditProfileName,
    editProfileEmail,
    setEditProfileEmail,
    editProfileTtl,
    setEditProfileTtl,
    editProfileInstagram,
    setEditProfileInstagram,
    editProfileTiktok,
    setEditProfileTiktok,
    editProfilePesan,
    setEditProfilePesan,
    editProfileVideoUrl,
    setEditProfileVideoUrl,
    editProfilePhone,
    setEditProfilePhone,
    savingProfile,
    setSavingProfile,
    lastUploadedVideoName,
    setLastUploadedVideoName,
  } = useYearbookProfileEditState()

  const {
    uploadingCover,
    setUploadingCover,
    coverPreview,
    setCoverPreview,
    coverPosition,
    setCoverPosition,
    uploadingCoverVideo,
    setUploadingCoverVideo,
    videoPopupUrl,
    setVideoPopupUrl,
    videoPopupError,
    setVideoPopupError,
    deleteCoverConfirm,
    setDeleteCoverConfirm,
  } = useYearbookCoverState()

  /** video-play membutuhkan Bearer; <video src> tidak bisa kirim header — ambil via fetchWithAuth + blob URL. */
  const [videoPlayBlobUrl, setVideoPlayBlobUrl] = useState<string | null>(null)
  const [videoPopupLoading, setVideoPopupLoading] = useState(false)
  const videoPlayBlobUrlRef = useRef<string | null>(null)

  const currentUserId = useCurrentUserId()
  const {
    teacherSearchQuery,
    classMemberSearchQuery,
    openSearch,
    closeSearch,
    isSearchOpen,
    getSearchValue,
    setSearchValue,
  } = useYearbookSearchState()

  const fetchAllAccess = useCallback(() => fetchAllAccessBase(albumRef), [fetchAllAccessBase, albumRef])

  const {
    teacherCount,
    setTeacherCount,
    teamMemberCount,
    setTeamMemberCount,
  } = useYearbookTeamCounts()

  const [addingClass, setAddingClass] = useState(false)
  const [newClassName, setNewClassName] = useState('')
  const [requestForm, setRequestForm] = useState<{ student_name: string; email: string }>({ student_name: '', email: '' })
  
  const galleryUploadInputRef = useRef<HTMLInputElement>(null)
  const coverUploadInputRef = useRef<HTMLInputElement>(null)
  const coverPreviewContainerRef = useRef<HTMLDivElement>(null)
  const coverDragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const coverVideoInputRef = useRef<HTMLInputElement>(null)
  const lastLocalUpdateRef = useRef<number>(0)
  const accessUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Use refs for stable access in callbacks without triggering recreations
  const [realtimeCounter, setRealtimeCounter] = useState(0)

  const isFetchingMembersRef = useRef(false)

  const isOwner = album?.isOwner === true
  const isAlbumAdmin = album?.isAlbumAdmin === true
  const isGlobalAdminUser = album?.isGlobalAdmin === true
  const canManage = isOwner || isAlbumAdmin || isGlobalAdminUser

  // NOTE: Jangan early-return sebelum semua hooks jalan.
  // Kalau akses dicabut (403 dari my-access-all), kita render NotFound di bawah (conditional)
  // supaya tidak memicu "Rendered fewer hooks than expected".
  const shouldShowNotFound = accessForbidden

  // Section dari URL: path segment atau query ?section=
  const rawSectionMode = getSectionModeFromUrl(pathname, searchParams.get('section'), id ?? '')
  // Regular users should not see Cover, Sambutan, Approval, or Management - redirect them to classes
  const sectionMode = (!canManage && ['cover', 'sambutan', 'approval', 'management'].includes(rawSectionMode)) ? 'classes' : rawSectionMode
  
  const isCoverView = sectionMode === 'cover'
  const sidebarModeFromPath = sectionMode === 'cover' ? 'classes' : sectionMode

  // Optimistic section: state-driven agar klik sidebar instan (tanpa tunggu router)
  const [activeSection, setActiveSection] = useState<typeof sectionMode>(sectionMode)

  const uiSection = activeSection === 'cover' ? 'classes' : activeSection
  const isFlipbookMode = uiSection === 'flipbook'
  const isFlipbookPreview = uiSection === 'flipbook' && (flipbookPreviewMode || !canManage)
  const isAiLabsToolActiveTop = uiSection === 'ai-labs' && !!aiLabsTool
  const latestClickedSectionRef = useRef<string | null>(null)
  const flipbookFullscreenRootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (latestClickedSectionRef.current) {
      if (latestClickedSectionRef.current === sectionMode) {
        // Router sudah berhasil catch up dengan klik terakhir
        latestClickedSectionRef.current = null
      } else {
        // URL telat (lagging) dari klik kita yang cepat.
        // Jangan timpa state optimis kita supaya tampilan tidak pindah-pindah (flip-flop).
        return
      }
    }
    setActiveSection(sectionMode)
  }, [sectionMode])


  const handleSectionChange = useCallback(
    (section: typeof sectionMode) => {
      latestClickedSectionRef.current = section
      setActiveSection(section)
      setView(section === 'cover' ? 'cover' : 'classes')
      setSidebarMode(section === 'cover' ? 'classes' : section)
      if (section !== 'preview' && section !== 'ai-labs') setLastEditorSection(section)
      if (id && typeof window !== 'undefined') {
        const newUrl = getYearbookSectionQueryUrl(id, section, pathname)
        // Bypass Next.js router patching to prevent RSC network roundtrip and loading states!
        const nativePushState = window.history.constructor.prototype.pushState
        nativePushState.call(window.history, null, '', newUrl)
      }
    },
    [id, pathname]
  )

  useEffect(() => {
    setView(activeSection === 'cover' ? 'cover' : 'classes')
    setSidebarMode(activeSection === 'cover' ? 'classes' : activeSection)
    if (activeSection !== 'preview' && activeSection !== 'ai-labs') {
      setLastEditorSection(activeSection)
    }

    // Auto-exit management overview on desktop resize
    const handleResize = () => {
      if (window.innerWidth >= 1024 && activeSection === 'management') {
        handleSectionChange('cover')
      }
    }
    window.addEventListener('resize', handleResize)
    handleResize() // Check immediately
    return () => window.removeEventListener('resize', handleResize)
  }, [activeSection, handleSectionChange])

  // Lock body scroll only for "full-canvas" experiences.
  // IMPORTANT: Flipbook editor needs page scroll on mobile (forms/panels), so we only lock during preview/viewer.
  useEffect(() => {
    if (isFlipbookPreview) {
      document.body.style.overflow = 'hidden'
      document.body.style.overscrollBehavior = 'none'
      document.documentElement.style.overflow = 'hidden'
      document.documentElement.style.overscrollBehavior = 'none'
      document.documentElement.style.height = '100%'
      document.body.style.height = '100%'
    } else {
      document.body.style.overflow = ''
      document.body.style.overscrollBehavior = ''
      document.documentElement.style.overflow = ''
      document.documentElement.style.overscrollBehavior = ''
      document.documentElement.style.height = ''
      document.body.style.height = ''
    }
    return () => {
      document.body.style.overflow = ''
      document.body.style.overscrollBehavior = ''
      document.documentElement.style.overflow = ''
      document.documentElement.style.overscrollBehavior = ''
      document.documentElement.style.height = ''
      document.body.style.height = ''
    }
  }, [isFlipbookPreview])

  // Popup video: endpoint video-play wajib Authorization Bearer — muat dengan fetchWithAuth lalu blob URL.
  useEffect(() => {
    if (!videoPopupUrl || !id) return

    let cancelled = false
    setVideoPopupLoading(true)
    setVideoPopupError(null)
    setVideoPlayBlobUrl(null)

    const load = async () => {
      try {
        const res = await fetchWithAuth(
          `/api/albums/${id}/video-play?url=${encodeURIComponent(videoPopupUrl)}`
        )
        if (!res.ok) {
          const data = asObject(await res.json().catch(() => ({})))
          if (!cancelled) {
            setVideoPopupError(getErrorMessage(data, 'Video tidak dapat dimuat'))
          }
          return
        }
        const blob = await res.blob()
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        videoPlayBlobUrlRef.current = url
        setVideoPlayBlobUrl(url)
      } catch {
        if (!cancelled) {
          setVideoPopupError('Video tidak dapat dimuat')
        }
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
      setVideoPlayBlobUrl(null)
      setVideoPopupLoading(false)
    }
  }, [videoPopupUrl, id])

  // Simpan sidebarMode ke localStorage (untuk fallback)
  useEffect(() => {
    if (typeof window !== 'undefined' && id) {
      localStorage.setItem(`yearbook-sidebarMode-${id}`, sidebarModeFromPath)
    }
  }, [sidebarModeFromPath, id])

  // Saat URL punya ?tool=..., redirect ke path ai-labs
  useEffect(() => {
    if (aiLabsTool && id && sectionMode !== 'ai-labs') {
      router.replace(getYearbookSectionQueryUrl(id, 'ai-labs', pathname) + (searchParams.toString() ? `&${searchParams.toString()}` : ''), { scroll: false })
    }
  }, [aiLabsTool, id, sectionMode, router, searchParams])

  const currentClassId = album?.classes?.[classIndex]?.id
  // Role admin (global): "Kembali" selalu ke dashboard admin (setelah album tersedia)
  const isAdminPath = typeof pathname === 'string' && pathname.startsWith('/admin/')
  const useAdminBack = isAdminPath || isGlobalAdminUser

  const originalBackHref = useAdminBack ? '/admin/albums' : backHref
  const originalBackLabel = useAdminBack ? 'Ke Manajemen Album' : backLabel

  // Force back destination to albums management/list for instant predictable exit flow.
  const effectiveBackHref = originalBackHref
  const effectiveBackLabel = originalBackLabel

  // Optimized: Fetch ALL class members in one request
  const fetchAllClassMembers = useCallback(async () => {
    if (!id || isFetchingMembersRef.current) return
    try {
      isFetchingMembersRef.current = true
      const res = await fetchWithAuth(`/api/albums/${id}/all-class-members`, { credentials: 'include', cache: 'no-store' })
      const data = await res.json().catch(() => [])

      const groupedMembers: Record<string, ClassMember[]> = {}

      // Initialize with empty arrays for all classes based on current album state
      const currentClasses = albumRef.current?.classes
      if (currentClasses) {
        currentClasses.forEach(c => {
          groupedMembers[c.id] = []
        })
      }

      if (res.ok && Array.isArray(data)) {
        data.forEach((m: any) => {
          const cid = m.class_id
          if (cid) {
            if (!groupedMembers[cid]) groupedMembers[cid] = []
            const { class_id, ...member } = m
            groupedMembers[cid].push(member)
          }
        })
      }

      // Merge: jangan timpa member is_me (baru daftar) kalau API belum mengembalikan row baru
      setMembersByClass((prev) => {
        const merged: Record<string, ClassMember[]> = {}
        for (const cid of Object.keys(groupedMembers)) {
          merged[cid] = [...(groupedMembers[cid] ?? [])]
        }
        for (const classId of Object.keys(prev)) {
          const list = prev[classId] ?? []
          const meMember = list.find((m) => m.is_me)
          if (!meMember) continue
          const fromApi = merged[classId] ?? []
          const hasMe = fromApi.some((m) => m.is_me || (meMember.user_id && m.user_id === meMember.user_id))
          if (!hasMe) {
            merged[classId] = [...fromApi, meMember]
          }
        }
        return merged
      })
      setAccessDataLoaded(true)
    } catch (e) {
      console.error('Error fetching members:', e)
    } finally {
      isFetchingMembersRef.current = false
    }
  }, [id])

  // Aliases for compatibility with existing handler logic (now optimized to fetch all)
  const fetchMembersForClass = useCallback((_classId: string) => fetchAllClassMembers(), [fetchAllClassMembers])
  const fetchMembersForAllClasses = useCallback((_classes: any) => fetchAllClassMembers(), [fetchAllClassMembers])



  useYearbookSyncLifecycle({
    id,
    view,
    initialAccess,
    initialMembers,
    albumClassesLength: album?.classes?.length,
    fetchAlbum,
    fetchAllAccess,
    fetchAllClassMembers,
  })

  useEffect(() => {
    if (!id) return
    void fetchFeatureUnlocks()
  }, [id, fetchFeatureUnlocks])

  useEffect(() => {
    if (!id) return

    const onRealtime = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; channel?: string; payload?: Record<string, unknown>; ts?: string }>).detail
      if (!detail?.type) return
      if (detail.channel !== 'global') return

      const path = typeof detail.payload?.path === 'string' ? detail.payload.path : ''
      const matchesAlbum = path.includes(`/api/albums/${id}`) || detail.payload?.albumId === id
      const matchesUser = path.startsWith('/api/user/')

      // Event type spesifik join request atau path mengandung join-requests
      const isJoinEvent = detail.type.startsWith('album.joinRequest.') || path.includes('/join-requests')

      if (!matchesAlbum && !matchesUser && !isJoinEvent) return

      // Handle khusus feature unlock
      if (path.includes('/unlock-feature')) {
        void fetchFeatureUnlocks()
        // Jangan return, biarkan refresh data album juga
      }

      // Handle khusus credits user
      if (matchesUser) {
        window.dispatchEvent(new Event('credits-updated'))
        // Jika path tidak mengandung album id, mungkin ini saja yang perlu diupdate
        if (!matchesAlbum) return
      }

      // Jika tipenya 'api.mutated' dan status >= 400, abaikan
      if (detail.type === 'api.mutated' && typeof detail.payload?.status === 'number' && detail.payload.status >= 400) return

      // Semua mutasi album → refresh data + naikkan counter agar child components refresh
      void fetchAlbum(true)
      setRealtimeCounter(prev => prev + 1)

      if (isJoinEvent || path.includes('/classes/') || path.includes('/my-access-all') || path.endsWith(`/api/albums/${id}`)) {
        void fetchAllAccess()
        void fetchAllClassMembers()
      }
    }

    window.addEventListener('fresh:realtime', onRealtime)
    return () => window.removeEventListener('fresh:realtime', onRealtime)
  }, [id, fetchAlbum, fetchAllAccess, fetchAllClassMembers, fetchFeatureUnlocks])

  // (Realtime removed)

  useEffect(() => {
    setPersonalIndex(0)
    setPersonalCardExpanded(false)
    setStudentPhotosInCard([])
    setStudentNameForPhotosInCard(null)
    setStudentPhotoIndexInCard(0)
  }, [currentClassId])

  // Auto-fetch members untuk kelas saat ini jika belum ada
  useEffect(() => {
    if (!currentClassId || !id) return

    const members = membersByClass[currentClassId] ?? []
    if (members.length === 0) {
      fetchMembersForClass(currentClassId)
    }
  }, [currentClassId, id, fetchMembersForClass])

  const fetchStudentPhotosForCard = useCallback(async (classId: string, studentName: string) => {
    if (!id) return
    try {
      // Get photos directly from membersByClass instead of fetching from album_photos
      const members = membersByClass[classId] || []
      const member = members.find(m => m.student_name === studentName)
      const photos = member?.photos || []

      // Convert photos array to Photo objects for compatibility
      const photoObjects = photos.map((url, index) => ({
        id: `${studentName}-${index}`,
        file_url: url,
        student_name: studentName,
      }))

      setStudentPhotosInCard(photoObjects)
      setStudentPhotoIndexInCard(0)
      setStudentNameForPhotosInCard(studentName)
    } catch {
      setStudentPhotosInCard([])
      setStudentNameForPhotosInCard(studentName)
    }
  }, [id, membersByClass])

  // Sync photos in card when members data changes (e.g. after delete/upload)
  useEffect(() => {
    if (studentNameForPhotosInCard && currentClassId) {
      fetchStudentPhotosForCard(currentClassId, studentNameForPhotosInCard)
    }
  }, [membersByClass, studentNameForPhotosInCard, currentClassId, fetchStudentPhotosForCard])

  useEffect(() => {
    if (!personalCardExpanded || !currentClassId || !id) return
    const members = membersByClass[currentClassId] ?? []
    const member = members[personalIndex]
    setStudentPhotosInCard([])
    setStudentPhotoIndexInCard(0)
    setStudentNameForPhotosInCard(null)
    if (member?.student_name) fetchStudentPhotosForCard(currentClassId, member.student_name)
    else setStudentNameForPhotosInCard(null)
  }, [personalCardExpanded, currentClassId, personalIndex, id, fetchStudentPhotosForCard])

  // Auto-fetch members untuk current class ketika pertama load atau switch class
  useEffect(() => {
    if (!currentClassId || !id) return
    const access = myAccessByClass[currentClassId]
    const canSeeMembers = isOwner || isAlbumAdmin || access?.status === 'approved'
    // Hanya fetch jika belum ada data members atau jika ada access tapi members belum di-fetch
    const members = membersByClass[currentClassId]
    if (canSeeMembers && !members) {
      fetchMembersForClass(currentClassId)
    }
  }, [currentClassId, id, isOwner, isAlbumAdmin, fetchMembersForClass, myAccessByClass, membersByClass])

  // Legacy: Fetch members untuk personal view mode (backup)
  useEffect(() => {
    if (classViewMode !== 'personal' || !currentClassId || !id) return
    const members = membersByClass[currentClassId] ?? []
    const access = myAccessByClass[currentClassId]
    const canSeeMembers = isOwner || isAlbumAdmin || isGlobalAdminUser || access?.status === 'approved'
    if (members.length === 0 && canSeeMembers) fetchMembersForClass(currentClassId)
  }, [classViewMode, currentClassId, id, isOwner, isAlbumAdmin, isGlobalAdminUser, fetchMembersForClass, myAccessByClass[currentClassId]])

  const fetchFirstPhotosForClass = useCallback(async (classId: string) => {
    if (!id) return
    // Optimistic class IDs (temp-*) belum ada di D1, jadi jangan fetch untuk menghindari 404 noise.
    if (classId.startsWith('temp-')) return
    // Endpoint ini (tanpa student_name) hanya untuk owner/admin.
    // Untuk user biasa akan 403, jadi jangan spam request di mobile load.
    if (!isOwner && !isAlbumAdmin && !isGlobalAdminUser) return
    const res = await fetchWithAuth(`/api/albums/${id}/photos?class_id=${encodeURIComponent(classId)}`, { credentials: 'include', cache: 'no-store' })
    if (res.status === 403) return
    if (!res.ok) return
    const list = await res.json().catch(() => []) as { student_name: string; file_url: string }[]
    if (!Array.isArray(list)) return
    const map: Record<string, string> = {}
    for (const p of list) {
      if (p.student_name && p.file_url && !map[p.student_name]) map[p.student_name] = p.file_url
    }
    setFirstPhotoByStudentByClass((prev) => ({ ...prev, [classId]: map }))
  }, [id, isOwner, isAlbumAdmin])

  useEffect(() => {
    if (currentClassId && id) fetchFirstPhotosForClass(currentClassId)
  }, [currentClassId, id, fetchFirstPhotosForClass])



  // Fetch members data for all classes when view is 'classes' or 'cover' to populate counts
  useEffect(() => {
    if ((view === 'classes' || view === 'cover') && album?.classes?.length) {
      // Only fetch if we don't have data yet
      const hasData = album.classes.some(c => membersByClass[c.id] !== undefined)
      if (!hasData) {
        fetchMembersForAllClasses(album.classes)
      }
    }
  }, [view, album?.classes, fetchMembersForAllClasses, membersByClass])

  const openClasses = useCallback(async () => {
    setView('classes')
    if (album?.classes?.length) {
      setClassIndex(0)
      // fetchAllClassMembers populates both members and students lists
      await fetchAllClassMembers()
      // fetchAllAccess populates access and requests
      await fetchAllAccess()
    }
  }, [album?.classes?.length, fetchAllClassMembers, fetchAllAccess])

  const buildOptimisticGalleryPhotos = useCallback(
    (classId: string, studentName: string): Photo[] => {
      const members = membersByClass[classId] ?? []
      const member = members.find((m) => m.student_name === studentName)
      const urls = member?.photos?.filter(Boolean) ?? []
      if (urls.length > 0) {
        return urls.map((file_url, i) => ({
          id: `optimistic-${classId}-${studentName}-${i}`,
          file_url,
          student_name: studentName,
        }))
      }
      const first = firstPhotoByStudentByClass[classId]?.[studentName]
      if (first) {
        return [
          {
            id: `optimistic-${classId}-${studentName}-0`,
            file_url: first,
            student_name: studentName,
          },
        ]
      }
      return []
    },
    [membersByClass, firstPhotoByStudentByClass]
  )

  const openGallery = useCallback(
    async (classId: string, studentName: string, className: string) => {
      const optimistic = buildOptimisticGalleryPhotos(classId, studentName)
      setGalleryStudent({ classId, studentName, className })
      setView('gallery')
      setPhotoIndex(0)
      setPhotos(optimistic)
      setGalleryPhotosLoading(true)
      try {
        const res = await fetchWithAuth(
          `/api/albums/${id}/photos?class_id=${encodeURIComponent(classId)}&student_name=${encodeURIComponent(studentName)}`,
          {
            credentials: 'include',
            cacheTtlMs: 12_000,
          }
        )
        const data = await res.json().catch(() => [])
        setPhotos(Array.isArray(data) ? data : [])
      } catch {
        if (optimistic.length === 0) setPhotos([])
      } finally {
        setGalleryPhotosLoading(false)
      }
    },
    [id, buildOptimisticGalleryPhotos, setGalleryPhotosLoading]
  )

  useEffect(() => {
    if (view !== 'gallery') return
    setPhotoIndex((i) => {
      if (photos.length === 0) return 0
      return Math.min(i, photos.length - 1)
    })
  }, [view, photos.length, setPhotoIndex])

  const goPrevClass = () => setClassIndex((i) => Math.max(0, i - 1))
  const goNextClass = () => setClassIndex((i) => Math.min((album?.classes?.length ?? 1) - 1, i + 1))

  const handleDeleteClass = async (classId: string, className?: string) => {
    if (!id) return
    const res = await fetchWithAuth(`/api/albums/${id}/classes/${classId}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert(getErrorMessage(data, 'Gagal menghapus kelas'))
      return
    }
    setAlbum((prev) => {
      if (!prev?.classes) return prev
      return { ...prev, classes: prev.classes.filter((c) => c.id !== classId) }
    })

    // Clean up members and access state for this class
    setMembersByClass((prev) => {
      const newState = { ...prev }
      delete newState[classId]
      return newState
    })
    setMyAccessByClass((prev) => {
      const newState = { ...prev }
      delete newState[classId]
      return newState
    })
    setMyRequestByClass((prev) => {
      const newState = { ...prev }
      delete newState[classId]
      return newState
    })

    setClassIndex((i) => {
      const len = (album?.classes?.length ?? 1) - 1
      if (len <= 0) return 0
      return Math.min(i, len - 1)
    })
  }

  const handleUpdateClass = async (classId: string, updates: { name?: string; sort_order?: number; batch_photo_url?: string }) => {
    if (!id) return null

    // Mark that we just did a local update
    lastLocalUpdateRef.current = Date.now()

    let affectedClasses: Array<{ id: string, sort_order: number }> = []

    // Optimistic update - update UI immediately without waiting for server
    const optimisticUpdate = { id: classId, name: '', sort_order: 0, batch_photo_url: null as string | null }
    setAlbum((prev) => {
      if (!prev?.classes) return prev
      const currentClassIndex = prev.classes.findIndex(c => c.id === classId)
      if (currentClassIndex === -1) return prev
      const currentClass = prev.classes[currentClassIndex]

      optimisticUpdate.name = updates.name !== undefined ? updates.name : currentClass.name
      // @ts-ignore
      optimisticUpdate.batch_photo_url = updates.batch_photo_url !== undefined ? updates.batch_photo_url : (currentClass.batch_photo_url ?? null)

      let newClasses = [...prev.classes]

      // Jika ada perubahan sort_order
      if (updates.sort_order !== undefined && updates.sort_order !== currentClass.sort_order) {
        const newOrder = updates.sort_order
        // hapus item dari index lama
        const [movedItem] = newClasses.splice(currentClassIndex, 1)
        // masukkan di index baru
        newClasses.splice(newOrder, 0, { ...movedItem, ...updates })

        // Perbaiki sort_order untuk semua item sesuai index
        newClasses = newClasses.map((c, idx) => ({ ...c, sort_order: idx }))

        // Lacak kelas mana saja yang berubah urutannya untuk diupdate ke backend
        affectedClasses = newClasses.map(c => ({ id: c.id, sort_order: c.sort_order! }))
        optimisticUpdate.sort_order = newOrder
      } else {
        optimisticUpdate.sort_order = currentClass.sort_order ?? 0
        newClasses[currentClassIndex] = { ...currentClass, ...updates }
      }

      // Jika ada perubahan sort_order, update classIndex ke posisi baru agar tetap menampilkan kelas yang sama
      if (updates.sort_order !== undefined) {
        const newIndex = newClasses.findIndex((c) => c.id === classId)
        if (newIndex !== -1 && newIndex !== classIndex) {
          setClassIndex(newIndex)
        }
      }

      return { ...prev, classes: newClasses }
    })

    try {
      const promises = []

      // 1. Update utama
      promises.push(
        fetchWithAuth(`/api/albums/${id}/classes/${classId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })
      )

      // 2. Jika ada pergeseran urutan, update kelas lainnya
      if (updates.sort_order !== undefined && affectedClasses.length > 0) {
        for (const c of affectedClasses) {
          if (c.id === classId) continue // Sudah diupdate di atas
          promises.push(
            fetchWithAuth(`/api/albums/${id}/classes/${c.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sort_order: c.sort_order }),
            })
          )
        }
      }

      const results = await Promise.all(promises)
      const hasError = results.some(res => !res.ok)

      if (hasError) {
        fetchAlbum(true)
        toast.error('Gagal menyimpan perubahan kelas')
        return null
      }

      toast.success('Kelas berhasil diperbarui')
      return optimisticUpdate
    } catch (err) {
      fetchAlbum(true)
      toast.error('Terjadi kesalahan saat menyimpan')
      return null
    }
  }

  const handleAddClass = async () => {
    if (!id || !newClassName.trim()) return

    const trimmedName = newClassName.trim()
    const tempId = `temp-${Date.now()}`
    const tempClass = {
      id: tempId,
      name: trimmedName,
      sort_order: album?.classes?.length ?? 0,
      student_count: 0
    }

    // Optimistic update - add class immediately
    setAlbum((prev) =>
      prev
        ? {
          ...prev,
          classes: [...(prev.classes ?? []), tempClass],
        }
        : prev
    )

    setRequestsByClass((prev) => ({ ...prev, [tempId]: [] }))

    // Close form
    setNewClassName('')
    setAddingClass(false)

    // Update last local update timestamp for realtime throttle
    lastLocalUpdateRef.current = Date.now()

    // Show success toast immediately
    toast.success(`Kelas "${trimmedName}" ditambahkan`)

    // Background API call
    try {
      const res = await fetchWithAuth(`/api/albums/${id}/classes`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        // Revert optimistic update on error
        toast.error(getErrorMessage(data, 'Gagal menambah kelas'))
        setAlbum((prev) =>
          prev
            ? {
              ...prev,
              classes: (prev.classes ?? []).filter(c => c.id !== tempId),
            }
            : prev
        )

        setRequestsByClass((prev) => {
          const newState = { ...prev }
          delete newState[tempId]
          return newState
        })
        return
      }

      const created = data as { id: string; name: string; sort_order?: number }

      // Replace temp class with real one
      setAlbum((prev) =>
        prev
          ? {
            ...prev,
            classes: (prev.classes ?? []).map(c =>
              c.id === tempId
                ? { id: created.id, name: created.name, sort_order: created.sort_order ?? c.sort_order, student_count: 0 }
                : c
            ),
          }
          : prev
      )

      // Update state with real ID

      setRequestsByClass((prev) => {
        const newState = { ...prev }
        newState[created.id] = newState[tempId] || []
        delete newState[tempId]
        return newState
      })

    } catch (error) {
      // Revert optimistic update on error
      toast.error('Gagal menambah kelas')
      setAlbum((prev) =>
        prev
          ? {
            ...prev,
            classes: (prev.classes ?? []).filter(c => c.id !== tempId),
          }
          : prev
      )

      setRequestsByClass((prev) => {
        const newState = { ...prev }
        delete newState[tempId]
        return newState
      })
    }
  }

  const handleRequestAccess = async (classId: string) => {
    if (!id || !requestForm.student_name.trim()) return
    
    // Snapshot values sebelum async call
    const studentName = requestForm.student_name.trim()
    const email = requestForm.email.trim() || undefined
    
    const res = await fetchWithAuth(`/api/albums/${id}/classes/${classId}/request`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_name: studentName, email }),
    })
    const data = asObject(await res.json().catch(() => ({})))
    if (!res.ok) {
      toast.error(getErrorMessage(data, 'Gagal mengajukan akses'))
      return
    }
    
    const status = asString(data.status)
    // Response bisa dari album_class_access (approved) atau album_class_requests (pending request)
    if (status === 'approved') {
      const idValue = asString(data.id) ?? ''
      const emailValue = asString(data.email) ?? null
      const dateOfBirth = asString(data.date_of_birth) ?? null
      const instagram = asString(data.instagram) ?? null
      const message = asString(data.message) ?? null
      const videoUrl = asString(data.video_url) ?? null
      const userId = asString(data.user_id) ?? ''
      
      setMyAccessByClass((prev) => ({
        ...prev,
        [classId]: {
          id: idValue,
          student_name: studentName,
          email: emailValue,
          status: 'approved',
          date_of_birth: dateOfBirth,
          instagram,
          message,
          video_url: videoUrl
        }
      }))
      setMyRequestByClass((prev) => ({ ...prev, [classId]: null }))
      
      // Optimistic: tambah diri ke daftar member agar profil card langsung muncul
      setMembersByClass((prev) => {
        const list = prev[classId] ?? []
        const alreadyIn = list.some((m) => m.is_me)
        if (alreadyIn) return prev
        return {
          ...prev,
          [classId]: [
            ...list,
            {
              user_id: userId,
              student_name: studentName,
              email: email ?? null,
              date_of_birth: dateOfBirth,
              instagram,
              message,
              video_url: videoUrl,
              is_me: true
            } as ClassMember
          ]
        }
      })
      toast.success('Anda terdaftar di kelas ini.')
    } else {
      // pending request
      const idValue = asString(data.id) ?? ''
      setMyRequestByClass((prev) => ({
        ...prev,
        [classId]: {
          id: idValue,
          student_name: studentName,
          email: email ?? null,
          status: 'pending'
        }
      }))
      toast.success('Permintaan pendaftaran dikirim. Menunggu persetujuan.')
    }
    setRequestForm({ student_name: '', email: '' })
  }

  const handleApproveReject = async (classId: string, requestId: string, status: 'approved' | 'rejected') => {
    if (!id) return
    const res = await fetchWithAuth(`/api/albums/${id}/classes/${classId}/requests/${requestId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const data = asObject(await res.json().catch(() => ({})))
    if (!res.ok) {
      toast.error(getErrorMessage(data, 'Gagal'))
      return
    }
    // Remove request dari pending list
    setRequestsByClass((prev) => ({
      ...prev,
      [classId]: (prev[classId] ?? []).filter((r) => r.id !== requestId),
    }))
    // Jika approved, refresh members list untuk kelas ini
    if (status === 'approved') {

      // Fetch ulang members yang sudah approved
      await fetchMembersForClass(classId)
      toast.success('Permintaan disetujui! Member berhasil ditambahkan.')
    } else {
      toast.success('Permintaan ditolak.')
    }
  }

  const handleJoinAsOwner = async (classId: string) => {
    if (!id) return

    const res = await fetchWithAuth(`/api/albums/${id}/classes/${classId}/join-as-owner`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_name: '', // Bisa kosong, nanti diisi via edit
        email: ''
      }),
    })

    const data = asObject(await res.json().catch(() => ({})))

    if (!res.ok) {
      toast.error(getErrorMessage(data, 'Gagal bergabung ke kelas'))
      return
    }

    const access = asObject(data.access)
    const accessId = asString(access.id) ?? ''
    const accessStudentName = asString(access.student_name) ?? ''
    const accessEmail = asString(access.email) ?? null

    // Update state: tambahkan owner ke myAccessByClass dengan status approved
    setMyAccessByClass((prev) => ({
      ...prev,
      [classId]: {
        id: accessId,
        student_name: accessStudentName,
        email: accessEmail,
        status: 'approved'
      },
    }))

    // Optimistic: tambah owner ke daftar member agar profil card langsung muncul
    setMembersByClass((prev) => {
      const list = prev[classId] ?? []
      const accessUserId = asString(access.user_id)
      const alreadyIn = list.some((m) => m.is_me || (accessUserId ? m.user_id === accessUserId : false))
      if (alreadyIn) return prev
      return {
        ...prev,
        [classId]: [
          ...list,
          {
            user_id: asString(access.user_id) ?? '',
            student_name: accessStudentName,
            email: accessEmail,
            date_of_birth: null,
            instagram: null,
            message: null,
            video_url: null,
            is_me: true
          } as ClassMember
        ]
      }
    })

    // Auto-open edit form dengan nama default dari API (user_metadata / email / user_id)
    setEditingProfileClassId(classId)
    setEditProfileName(accessStudentName)
    setEditProfileEmail(accessEmail ?? '')
    setEditProfileTtl('')
    setEditProfileInstagram('')
    setEditProfilePesan('')
    setEditProfileVideoUrl('')
    setEditProfilePhone('')

    // Jangan refetch di sini: API bisa belum mengembalikan row baru, sehingga list menimpa optimistic update dan card hilang. Realtime / navigasi akan sync nanti.
    toast.success('Berhasil! Silakan isi profil Anda.')
  }

  const handleSaveProfile = async (classId: string, deleteProfile: boolean = false, targetUserId?: string, overrideData?: any, skipCloseAndFetch?: boolean) => {
    if (!id) {
      toast.error('Album ID tidak ditemukan')
      return
    }
    if (!classId) {
      toast.error('Class ID tidak ditemukan')
      return
    }

    const isEditingOther = !!targetUserId
    const url = isEditingOther
      ? `/api/albums/${id}/classes/${classId}/members/${targetUserId}`
      : `/api/albums/${id}/classes/${classId}/my-access`

    if (deleteProfile) {
      setSavingProfile(true)
      try {
        const res = await fetchWithAuth(url, { method: 'DELETE', credentials: 'include' })
        const data = asObject(await res.json().catch(() => ({})))
        if (!res.ok) {
          toast.error(getErrorMessage(data, 'Gagal menghapus profil'))
          return
        }
        if (!isEditingOther) {
          setMyAccessByClass((prev) => ({ ...prev, [classId]: null }))
        }
        // Optimistic: hapus dari daftar agar card langsung hilang (hindari error akses tidak ditemukan)
        setMembersByClass((prev) => {
          const list = prev[classId] ?? []
          const next = isEditingOther && targetUserId
            ? list.filter((m) => m.user_id !== targetUserId)
            : list.filter((m) => !m.is_me)
          if (next.length === list.length) return prev
          return { ...prev, [classId]: next }
        })
        toast.success('Profil berhasil dihapus')
        setEditingProfileClassId(null)
        setEditingMemberUserId(null)
        await fetchMembersForClass(classId)
      } catch (error) {
        console.error('[handleSaveProfile] DELETE error:', error)
        toast.error('Gagal menghapus profil: ' + (error instanceof Error ? error.message : 'Network error'))
      } finally {
        setSavingProfile(false)
      }
      return
    }

    const dataToSave = overrideData ? {
      student_name: overrideData.student_name,
      email: overrideData.email,
      date_of_birth: overrideData.date_of_birth,
      instagram: overrideData.instagram,
      tiktok: overrideData.tiktok,
      phone: overrideData.phone,
      message: overrideData.message,
      video_url: overrideData.video_url
    } : {
      student_name: editProfileName,
      email: editProfileEmail,
      date_of_birth: editProfileTtl,
      instagram: editProfileInstagram,
      tiktok: editProfileTiktok,
      phone: editProfilePhone,
      message: editProfilePesan,
      video_url: editProfileVideoUrl
    }

    if (!dataToSave.student_name?.trim()) {
      toast.error('Nama siswa wajib diisi')
      return
    }

    setSavingProfile(true)
    try {
      const res = await fetchWithAuth(url, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_name: dataToSave.student_name.trim(),
          email: dataToSave.email?.trim() || null,
          date_of_birth: dataToSave.date_of_birth?.trim() || null,
          instagram: dataToSave.instagram?.trim() || null,
          tiktok: dataToSave.tiktok?.trim() || null,
          phone: dataToSave.phone?.trim() || null,
          message: dataToSave.message?.trim() || null,
          video_url: dataToSave.video_url?.trim() || null,
        }),
      })
      const data = asObject(await res.json().catch(() => ({})))
      if (!res.ok) {
        toast.error(getErrorMessage(data, 'Gagal menyimpan'))
        return
      }
      const d = data as ClassAccess
      const targetUid = isEditingOther ? targetUserId : currentUserId
      const isMe = targetUid === currentUserId

      if (isMe) {
        setMyAccessByClass((prev) => ({
          ...prev,
          [classId]: prev[classId] ? {
            ...prev[classId]!,
            student_name: d.student_name,
            email: d.email ?? null,
            date_of_birth: d.date_of_birth ?? null,
            instagram: d.instagram ?? null,
            tiktok: (d as any).tiktok ?? null,
            phone: (d as any).phone ?? null,
            message: d.message ?? null,
            video_url: d.video_url ?? null
          } : {
            id: d.id ?? '',
            student_name: d.student_name,
            email: d.email ?? null,
            status: d.status ?? 'approved'
          },
        }))
      }
      
      // Optimistic update: immediately reflect text changes in membersByClass
      if (targetUid) {
        setMembersByClass(prev => {
          const list = prev[classId]
          if (!list) return prev
          const updated = list.map(m =>
            m.user_id === targetUid ? {
              ...m,
              student_name: d.student_name ?? m.student_name,
              email: d.email ?? null,
              date_of_birth: d.date_of_birth ?? null,
              instagram: d.instagram ?? null,
              tiktok: (d as any).tiktok ?? null,
              phone: (d as any).phone ?? null,
              message: d.message ?? null,
              video_url: d.video_url ?? m.video_url,
            } : m
          )
          return { ...prev, [classId]: updated }
        })
      }
      toast.success('Profil berhasil disimpan')
      if (!skipCloseAndFetch) {
        if (album?.classes) await fetchMembersForAllClasses(album.classes)
        setEditingProfileClassId(null)
        setEditingMemberUserId(null)
      }
    } catch (error) {
      console.error('[handleSaveProfile] PATCH error:', error)
      toast.error('Gagal menyimpan profil: ' + (error instanceof Error ? error.message : 'Network error'))
    } finally {
      setSavingProfile(false)
    }
  }

  const onStartEditMember = useCallback((member: ClassMember, classId: string) => {
    setEditingProfileClassId(classId)
    setEditingMemberUserId(member.user_id)
    setEditProfileName(member.student_name || '')
    setEditProfileEmail(member.email || '')
    setEditProfileTtl(member.date_of_birth || '')
    setEditProfileInstagram(member.instagram || '')
    setEditProfileTiktok((member as any).tiktok || '')
    setEditProfilePhone((member as any).phone || '')
    setEditProfilePesan(member.message || '')
    setEditProfileVideoUrl(member.video_url || '')

    // Load photos for the member being edited
    if (member.student_name) {
      fetchStudentPhotosForCard(classId, member.student_name)
    }
  }, [fetchStudentPhotosForCard])

  const onStartEditMyProfile = useCallback((classId: string) => {
    setEditingMemberUserId(null)
    const access = myAccessByClass[classId]
    if (access) {
      setEditProfileName(access.student_name || '')
      setEditProfileEmail(access.email || '')
      setEditProfileTtl(access.date_of_birth || '')
      setEditProfileInstagram(access.instagram || '')
      setEditProfileTiktok((access as any).tiktok || '')
      setEditProfilePhone((access as any).phone || '')
      setEditProfilePesan(access.message || '')
      setEditProfileVideoUrl(access.video_url || '')
    }
  }, [myAccessByClass])

  const handleUpdateRole = useCallback(async (userId: string, role: 'admin' | 'member') => {
    if (!id) return
    try {
      const res = await fetchWithAuth(`/api/albums/${id}/members?user_id=${userId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      const data = asObject(await res.json().catch(() => ({})))
      if (!res.ok) {
        toast.error(getErrorMessage(data, 'Gagal mengubah role'))
        return
      }
      toast.success(`Role berhasil diubah menjadi ${role === 'admin' ? 'Admin' : 'Member'}`)
      // Refresh album to get updated member list (silent = no skeleton)
      await fetchAlbum(true)
    } catch (error) {
      console.error('Error updating role:', error)
      toast.error('Gagal mengubah role')
    }
  }, [id, fetchAlbum])

  const handleRemoveMember = useCallback(async (userId: string) => {
    if (!id) return
    try {
      const res = await fetchWithAuth(`/api/albums/${id}/members?user_id=${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = asObject(await res.json().catch(() => ({})))
      if (!res.ok) {
        toast.error(getErrorMessage(data, 'Gagal menghapus member'))
        return
      }
      toast.success('Member berhasil dihapus dari album')
      // Refresh album to get updated member list (silent = no skeleton)
      await fetchAlbum(true)
    } catch (error) {
      console.error('Error removing member:', error)
      toast.error('Gagal menghapus member')
    }
  }, [id, fetchAlbum])

  // Delete member from class with optimistic update (instant UI) + realtime for other devices
  const handleDeleteClassMember = useCallback(async (classId: string, userId: string) => {
    if (!id) return
    // Find the member's student_name before removal (for clearing photo cache)
    const memberToDelete = (membersByClass[classId] ?? []).find(m => m.user_id === userId)
    const deletedStudentName = memberToDelete?.student_name
    // Optimistic update: remove immediately from membersByClass
    setMembersByClass(prev => {
      const updated = { ...prev }
      if (updated[classId]) {
        updated[classId] = updated[classId].filter(m => m.user_id !== userId)
      }
      return updated
    })
    // Clear firstPhotoByStudentByClass for the deleted member so stale photos don't reappear
    if (deletedStudentName) {
      setFirstPhotoByStudentByClass(prev => {
        const classPhotos = prev[classId]
        if (!classPhotos || !(deletedStudentName in classPhotos)) return prev
        const updated = { ...classPhotos }
        delete updated[deletedStudentName]
        return { ...prev, [classId]: updated }
      })
    }
    // Also clear myAccessByClass for this class if it's the current user being removed
    if (userId === currentUserId) {
      setMyAccessByClass(prev => ({ ...prev, [classId]: null }))
    }
    try {
      const res = await fetchWithAuth(`/api/albums/${id}/classes/${classId}/members/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = asObject(await res.json().catch(() => ({})))
      if (!res.ok) {
        toast.error(getErrorMessage(data, 'Gagal menghapus anggota'))
        // Rollback: refetch to restore correct state
        await fetchAllClassMembers()
        await fetchAllAccess()
        // Also refetch photos to restore
        if (currentClassId) fetchFirstPhotosForClass(currentClassId)
        return
      }
      toast.success('Anggota berhasil dihapus dari kelas')
      // Refetch in background to sync with server (other devices get update via realtime)
      fetchAllClassMembers()
      fetchAllAccess()
      // Refetch first photos to ensure cache is fresh
      fetchFirstPhotosForClass(classId)
    } catch (err) {
      console.error('Error deleting class member:', err)
      toast.error('Gagal menghapus anggota')
      // Rollback on error
      await fetchAllClassMembers()
      await fetchAllAccess()
    }
  }, [id, currentUserId, fetchAllClassMembers, fetchAllAccess, membersByClass, currentClassId, fetchFirstPhotosForClass])

  const handleUploadPhoto = async (classId: string, studentName: string, className: string, file: File) => {
    if (!id) return
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error('Foto maksimal 10MB')
      return
    }
    const formData = new FormData()
    formData.append('file', file)
    formData.append('class_id', classId)
    formData.append('student_name', studentName)
    const res = await fetchWithAuth(`/api/albums/${id}/photos`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })
    const data = asObject(await res.json().catch(() => ({})))
    if (!res.ok) {
      toast.error(getErrorMessage(data, 'Gagal upload foto'))
      return
    }

    await fetchFirstPhotosForClass(classId)
    // Note: no fetchMembersForClass here — the caller (onSave flow) does a final fetch after all uploads complete.
    // Refresh preview: ambil daftar foto dari API agar langsung muncul (tanpa tunggu membersByClass)
    const resPhotos = await fetchWithAuth(`/api/albums/${id}/photos?class_id=${encodeURIComponent(classId)}&student_name=${encodeURIComponent(studentName)}`, { credentials: 'include', cache: 'no-store' })
    const photoList = await resPhotos.json().catch(() => [])
    if (currentClassId === classId && studentNameForPhotosInCard === studentName && Array.isArray(photoList)) {
      const photoObjects = photoList.map((p: { id?: string; file_url: string; student_name?: string }, index: number) => ({
        id: p.id ?? `${studentName}-${index}`,
        file_url: p.file_url,
        student_name: p.student_name ?? studentName
      }))
      setStudentPhotosInCard(photoObjects)
      setStudentPhotoIndexInCard(0)
    }
  }

  const handleUploadVideo = async (classId: string, studentName: string, _className: string, file: File) => {
    if (!id) return
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error(`Video maksimal ${MAX_VIDEO_MB}MB`)
      return
    }
    const formData = new FormData()
    formData.append('file', file)
    formData.append('student_name', studentName)
    const res = await fetchWithAuth(`/api/albums/${id}/classes/${classId}/video`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })
    const data = asObject(await res.json().catch(() => ({})))
    if (!res.ok) {
      toast.error(getErrorMessage(data, 'Gagal upload video'))
      return
    }
    setLastUploadedVideoName(file.name)
    setTimeout(() => setLastUploadedVideoName(null), 5000)
    // Update the form field with the new video URL so it appears in the edit form
    const videoUrl = asString(data.video_url)
    if (videoUrl) {
      setEditProfileVideoUrl(videoUrl)
      // Optimistic update: immediately reflect video_url in membersByClass so the play icon shows
      setMembersByClass(prev => {
        const list = prev[classId]
        if (!list) return prev
        const updated = list.map(m =>
          m.student_name === studentName ? { ...m, video_url: videoUrl } : m
        )
        return { ...prev, [classId]: updated }
      })
    }
    // Note: no fetchMembersForClass here — optimistic update above is sufficient.
    // The caller (onSave flow) does a final fetchMembersForClass after all uploads complete.

  }

  const performDeleteCover = async () => {
    if (!id || !album?.cover_image_url) return
    const res = await fetchWithAuth(`/api/albums/${id}/cover`, { method: 'DELETE', credentials: 'include' })
    const data = asObject(await res.json().catch(() => ({})))
    if (!res.ok) {
      toast.error(getErrorMessage(data, 'Gagal menghapus cover'))
      return
    }
    setAlbum((prev) => prev ? { ...prev, cover_image_url: null, cover_image_position: null } : null)
    toast.success('Cover berhasil dihapus')
  }

  const MAX_VIDEO_MB = 20
  const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024
  const MAX_PHOTO_BYTES = 10 * 1024 * 1024 // 10MB

  const handleUploadCoverVideo = async (file: File) => {
    if (!id) return
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error(`Video maksimal ${MAX_VIDEO_MB}MB`)
      return
    }
    setUploadingCoverVideo(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetchWithAuth(`/api/albums/${id}/cover-video`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      const data = asObject(await res.json().catch(() => ({})))
      if (!res.ok) {
        toast.error(getErrorMessage(data, 'Gagal upload video cover'))
        return
      }
      const coverVideoUrl = asString(data.cover_video_url) ?? null
      setAlbum((prev) => prev ? { ...prev, cover_video_url: coverVideoUrl } : null)
      toast.success('Video cover berhasil diunggah')
    } finally {
      setUploadingCoverVideo(false)
    }
  }

  const performDeleteCoverVideo = async () => {
    if (!id || !album?.cover_video_url) return
    const res = await fetchWithAuth(`/api/albums/${id}/cover-video`, { method: 'DELETE', credentials: 'include' })
    const data = asObject(await res.json().catch(() => ({})))
    if (!res.ok) {
      toast.error(getErrorMessage(data, 'Gagal menghapus video cover'))
      return
    }
    setAlbum((prev) => prev ? { ...prev, cover_video_url: null } : null)
    toast.success('Video cover berhasil dihapus')
  }

  const handleDeleteCover = async () => {
    setDeleteCoverConfirm('image')
  }
  const handleDeleteCoverVideo = async () => {
    setDeleteCoverConfirm('video')
  }

  const handleDeletePhoto = async (photoId: string, classId: string, studentName: string) => {
    if (!id) return
    // Extract index from photoId (format: studentName-index)
    const indexStr = photoId.split('-').pop()
    const index = parseInt(indexStr || '0', 10)

    if (isNaN(index)) {
      toast.error('Invalid photo ID')
      return
    }

    // Konfirmasi sudah dilakukan di UI component sebelum memanggil fungsi ini
    const res = await fetchWithAuth(`/api/albums/${id}/photos?class_id=${encodeURIComponent(classId)}&student_name=${encodeURIComponent(studentName)}&index=${index}`, { method: 'DELETE', credentials: 'include' })
    const data = asObject(await res.json().catch(() => ({})))
    if (!res.ok) {
      toast.error(getErrorMessage(data, 'Gagal menghapus foto'))
      return
    }
    toast.success('Foto berhasil dihapus')

    await fetchFirstPhotosForClass(classId)
    await fetchMembersForClass(classId)
    const members = membersByClass[currentClassId ?? ''] ?? []
    const viewingThisStudent = members[personalIndex]?.student_name === studentName
    if (viewingThisStudent) fetchStudentPhotosForCard(classId, studentName)
  }

  const handleUploadCover = async (
    file: File,
    position: { x: number; y: number },
    dataUrlToRevoke?: string
  ) => {
    if (!id) return
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error('Foto maksimal 10MB')
      return
    }
    setUploadingCover(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('position_x', String(position.x))
      formData.append('position_y', String(position.y))
      const res = await fetchWithAuth(`/api/albums/${id}/cover`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      const data = asObject(await res.json().catch(() => ({})))
      if (!res.ok) {
        toast.error(getErrorMessage(data, 'Gagal upload cover'))
        return
      }
      setAlbum((prev) =>
        prev
          ? {
            ...prev,
            cover_image_url: asString(data.cover_image_url) ?? '',
            cover_image_position: asString(data.cover_image_position) ?? prev.cover_image_position,
          }
          : null
      )
      if (dataUrlToRevoke) URL.revokeObjectURL(dataUrlToRevoke)
      setCoverPreview(null)
      toast.success('Cover berhasil diperbarui')
    } finally {
      setUploadingCover(false)
    }
  }

  const mobileFirstWrapperDefault = `w-full mx-auto bg-white dark:bg-slate-950 lg:max-w-full flex flex-col min-h-0`
  const contentWrapperDefault = 'max-w-[420px] md:max-w-full w-full mx-auto'

  if (!id) {
    return (
      <div className={mobileFirstWrapperDefault}>
        <div className={`${contentWrapperDefault} p-4`}>
          <p className="text-red-400 dark:text-red-300">ID album tidak valid.</p>
          <BackLink href={effectiveBackHref} />
        </div>
      </div>
    )
  }

  // If cached album already exists, keep UI visible and refresh silently in background.
  if (loading && !album) {
    const sectionParam = searchParams.get('section')
    const skeletonSection = isValidYearbookSection(sectionParam)
      ? sectionParam
      : sectionMode
    return <YearbookLoader section={skeletonSection} />
  }

  if (error || !album) {
    return (
      <div className={mobileFirstWrapperDefault}>
        <div className={`${contentWrapperDefault} p-4 pb-6`}>
          <BackLink href={effectiveBackHref} />
          <p className="text-red-400 dark:text-red-300 mt-4">{error ?? 'Album tidak ditemukan.'}</p>
          <p className="text-muted dark:text-slate-400 text-sm mt-2">Pastikan album sudah disetujui (approved) dan Anda memiliki akses.</p>
        </div>
      </div>
    )
  }

  if (view === 'cover' || view === 'classes') {
    const isCoverView = activeSection === 'cover'
    /** Sama dengan prop ke YearbookClassesView — dari activeSection, bukan sidebarMode state (yang di-sync lewat useEffect +1 frame). */
    const uiSection = activeSection === 'cover' ? 'classes' : activeSection
    const showBackLink = true
    const currentClass = album?.classes?.[classIndex]
    const aiLabsToolLabel: Record<string, string> = { tryon: 'V-Tryon', pose: 'Pose', 'image-editor': 'Image Editor', photogroup: 'Photo Group', phototovideo: 'Photo to Video' }
    const isAiLabsToolActive = uiSection === 'ai-labs' && !!aiLabsTool
    const isManagementSubSection = (['classes', 'sambutan'].includes(uiSection) || isCoverView) && canManage
    // Only force fixed/fullscreen shell for canvas-like preview modes.
    // Flipbook editor must be allowed to scroll on mobile.
    const mobileFirstWrapper = `w-full mx-auto bg-white dark:bg-slate-950 lg:max-w-full flex flex-col ${isFlipbookPreview ? 'fixed inset-0 overflow-hidden' : 'min-h-0'}`
    const isFlipbookPreviewShell = uiSection === 'flipbook' && (flipbookPreviewMode || !canManage)
    const contentWrapper = isFlipbookPreviewShell
      ? 'w-full max-w-none mx-0'
      : 'max-w-[420px] md:max-w-full w-full mx-auto'

    const aiLabsBackHref = album?.id ? (useAdminBack ? `/admin/album/yearbook/${album.id}?section=ai-labs` : `/user/album/yearbook/${album.id}?section=ai-labs`) : effectiveBackHref
    const sectionTitle =
      isCoverView ? 'Cover'
        : uiSection === 'ai-labs' ? (aiLabsTool ? (aiLabsToolLabel[aiLabsTool] ?? 'AI Labs') : 'AI Labs')
          : uiSection === 'management' ? 'Manajemen Album'
            : uiSection === 'sambutan' ? 'Sambutan'
              : uiSection === 'classes' ? (currentClass?.name ?? 'Kelas')
                : uiSection === 'approval' ? 'Approval'
                  : uiSection === 'flipbook' ? 'Flipbook'
                    : uiSection === 'preview' ? 'Preview'
                      : ''
    const sectionSubtitle =
      isCoverView ? 'Tampilan cover dan pengaturan cover album.'
        : uiSection === 'ai-labs' ? (aiLabsTool ? '' : 'Pilih fitur yang ingin digunakan. Semua fitur AI tersedia di sini.')
          : uiSection === 'management' ? ''
            : uiSection === 'sambutan' ? 'Kartu sambutan dan profil.'
              : uiSection === 'classes' ? (currentClass ? 'Profil dan foto anggota kelas.' : 'Daftar kelas dan anggota.')
                : uiSection === 'approval' ? 'Persetujuan siswa & manajemen tim album.'
                  : uiSection === 'flipbook' ? 'Editor dan preview flipbook.'
                    : uiSection === 'preview' ? 'Preview tampilan album yearbook.'
                      : ''

    const headerCount =
      uiSection === 'classes' && !isCoverView && currentClass
        ? (membersByClass[currentClass.id]?.length ?? currentClass.student_count ?? 0)
        : uiSection === 'sambutan'
          ? teacherCount
          : uiSection === 'team'
            ? teamMemberCount
            : null

    return (
      <div
        ref={isFlipbookPreviewShell ? flipbookFullscreenRootRef : undefined}
        className={`${mobileFirstWrapper}${isFlipbookPreviewShell ? ' flipbook-fullscreen-shell' : ''}`}
      >
        {/* Sticky Header - BackLink + judul section sejajar (mobile + desktop) */}
        {showBackLink && (
          <div className="flex sticky top-0 z-50 bg-amber-300 dark:bg-slate-900 border-b-2 border-black dark:border-slate-700 px-3 lg:px-4 h-14 items-center gap-3 lg:gap-4">
            {/* Back button for Mobile */}
            {canManage && ['cover', 'sambutan', 'classes'].includes(uiSection) && (
              <div className="lg:hidden flex items-center">
                <button
                  onClick={() => handleSectionChange('management')}
                  className="inline-flex items-center justify-center w-8 h-8 bg-white dark:bg-slate-800 border-2 border-black dark:border-slate-700 rounded-lg text-slate-900 dark:text-white active:translate-x-0.5 active:translate-y-0.5 transition-all"
                  title="Kembali ke Menu"
                >
                  <ChevronLeft className="w-4 h-4" strokeWidth={3} />
                </button>
              </div>
            )}
            
            {/* Menu icon for non-admins on the left (replaces absent back button) */}
            {!canManage && uiSection === 'classes' && !isCoverView && (
              <button
                onClick={() => {
                  setMobileMenuMode('navigation')
                  setMobileMenuOpen(true)
                }}
                className="lg:hidden inline-flex items-center justify-center w-8 h-8 bg-amber-400 dark:bg-amber-600 border-2 border-black dark:border-slate-700 rounded-lg text-slate-900 dark:text-white active:translate-x-0.5 active:translate-y-0.5 transition-all"
                title="Daftar Kelas"
              >
                <Menu className="w-4 h-4" strokeWidth={3} />
              </button>
            )}

            <Link 
              href={isAiLabsToolActive ? aiLabsBackHref : effectiveBackHref} 
              prefetch={true}
              scroll={false}
              onTouchStart={() => { try { router.prefetch(isAiLabsToolActive ? aiLabsBackHref : effectiveBackHref) } catch {} }}
              className={`${isAiLabsToolActive ? 'inline-flex' : 'hidden'} items-center justify-center w-9 h-9 lg:w-10 lg:h-10 bg-white dark:bg-slate-800 border-2 border-black dark:border-slate-700 rounded-xl text-slate-900 dark:text-white active:translate-x-0.5 active:translate-y-0.5 transition-all`}
            >
              <ChevronLeft className="w-5 h-5 lg:w-6 lg:h-6" strokeWidth={3} />
            </Link>

            {/* Back button for Flipbook Preview (Mobile + Desktop) */}
            {uiSection === 'flipbook' && !canManage && (
              <button
                onClick={() => handleSectionChange('classes')}
                className="inline-flex items-center justify-center w-9 h-9 lg:w-10 lg:h-10 bg-white dark:bg-slate-800 border-2 border-black dark:border-slate-700 rounded-xl text-slate-900 dark:text-white active:translate-x-0.5 active:translate-y-0.5 transition-all"
                title="Keluar Preview"
              >
                <ChevronLeft className="w-5 h-5 lg:w-6 lg:h-6" strokeWidth={3} />
              </button>
            )}

            {/* Desktop BackLink removed - moved to IconSidebar */}
            {sectionTitle && (
              <>
                {/* Mobile: title left-aligned */}
                <div className="lg:hidden flex-1 min-w-0 flex items-center gap-2">
                  <h1 className="text-[13px] font-black text-slate-900 dark:text-white truncate max-w-[160px] text-left uppercase tracking-tight leading-none">{sectionTitle}</h1>
                </div>
                {/* Desktop: title centered */}
                <div className="hidden lg:block absolute left-1/2 -translate-x-1/2 text-center min-w-0 max-w-[50%]">
                  <div className="flex items-center justify-center gap-3">
                    <h1 className="text-xl font-black text-slate-900 dark:text-white truncate uppercase tracking-tight">{sectionTitle}</h1>
                    {headerCount !== null && headerCount !== undefined && (
                      <span className="px-3 py-0.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-black">
                        {headerCount}
                      </span>
                    )}
                  </div>
                  {sectionSubtitle && <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300 mt-0.5 truncate uppercase tracking-wider">{sectionSubtitle}</p>}
                </div>
              </>
            )}

            {/* Header Actions (Right) */}
            <div className="ml-auto flex items-center gap-2 pr-1 lg:pr-2">
              {/* Credits badge: keep mounted to avoid resetting to 0 on tab switch */}
              <div className={(uiSection === 'ai-labs' || (uiSection === 'flipbook' && featureUnlocksLoaded && !(flipbookEnabledByPackage || featureUnlocks.includes('flipbook')))) ? '' : 'hidden'}>
                <CreditBadgeTop />
              </div>
              {/* Flipbook Controls (Mobile & Desktop) */}
              {uiSection === 'flipbook' && (isOwner || isAlbumAdmin) && (featureUnlocksLoaded ? (flipbookEnabledByPackage || featureUnlocks.includes('flipbook')) : true) && (
                <div className="relative flex p-[1.5px] sm:p-1 bg-white dark:bg-slate-800 rounded-lg sm:rounded-xl border-2 border-black dark:border-slate-700 shadow-[1px_1px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] w-24 sm:w-44">
                  <div
                    className="absolute top-[1.5px] bottom-[1.5px] sm:top-1 sm:bottom-1 rounded-md sm:rounded-lg bg-indigo-400 border-[1.5px] sm:border-2 border-black dark:border-slate-700 transition-all duration-300 ease-out z-0"
                    style={{
                      left: '1.5px',
                      transform: flipbookPreviewMode ? 'translateX(100%)' : 'translateX(0)',
                      width: 'calc(50% - 1.5px)',
                    }}
                  />
                  <div className="relative z-10 grid grid-cols-2 w-full">
                    <button
                      onClick={() => setFlipbookPreviewMode(false)}
                      className={`flex items-center justify-center gap-1 sm:gap-1.5 px-1 py-0 sm:py-1.5 rounded-md sm:rounded-lg text-[9px] sm:text-xs font-black uppercase transition-colors duration-200 ${!flipbookPreviewMode ? 'text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                    >
                      <Layout className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Editor</span>
                    </button>
                    <button
                      onClick={() => setFlipbookPreviewMode(true)}
                      className={`flex items-center justify-center gap-1 sm:gap-1.5 px-1 py-0 sm:py-1.5 rounded-md sm:rounded-lg text-[9px] sm:text-xs font-black uppercase transition-colors duration-200 ${flipbookPreviewMode ? 'text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                    >
                      <Eye className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Preview</span>
                    </button>
                  </div>
                </div>
              )}


              {/* Sambutan & Classes: Search Toggle */}
              {(uiSection === 'sambutan' || (uiSection === 'classes' && !isCoverView)) && (
                <>
                  {isSearchOpen(uiSection === 'sambutan' ? 'sambutan' : 'classes') ? (
                    <div className={`absolute left-[64px] ${uiSection === 'classes' ? 'right-[68px]' : 'right-[12px]'} top-[5px] bottom-[5px] bg-amber-50 dark:bg-slate-800 border-2 border-black dark:border-slate-700 rounded-xl pl-3 pr-8 flex items-center lg:static lg:w-auto lg:h-9 lg:px-2 lg:py-1 animate-in slide-in-from-right-2 duration-200 z-[60]`}>
                      <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 mr-2 flex-shrink-0" />
                      <input
                        type="text"
                        placeholder="Cari..."
                        value={getSearchValue(uiSection === 'sambutan' ? 'sambutan' : 'classes')}
                        onChange={(e) => setSearchValue(uiSection === 'sambutan' ? 'sambutan' : 'classes', e.target.value)}
                        className="flex-1 bg-transparent border-none outline-none text-[11px] font-black uppercase tracking-tight text-slate-900 dark:text-white min-w-0 dark:placeholder:text-slate-500"
                        autoFocus
                      />
                      <button
                        onClick={() => closeSearch(uiSection === 'sambutan' ? 'sambutan' : 'classes')}
                        className="absolute right-0 top-1/2 -translate-y-1/2 lg:static lg:translate-y-0 lg:ml-1 w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0"
                      >
                        <SearchX className="w-4 h-4 text-slate-500 dark:text-slate-400" strokeWidth={3} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => openSearch(uiSection === 'sambutan' ? 'sambutan' : 'classes')}
                      className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-amber-400 dark:bg-amber-600 border-2 border-black dark:border-slate-700 rounded-lg sm:rounded-xl text-slate-900 dark:text-white active:translate-x-0.5 active:translate-y-0.5 transition-all hover:translate-x-0.5 hover:translate-y-0.5"
                    >
                      <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={3} />
                    </button>
                  )}
                </>
              )}

              {/* Hamburger Strip 3 (Daftar Kelas) - Only on Right for Admins */}
              {canManage && uiSection === 'classes' && !isCoverView && (
                <button
                  onClick={() => {
                    setMobileMenuMode('navigation')
                    setMobileMenuOpen(true)
                  }}
                  className="lg:hidden flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 bg-amber-400 dark:bg-amber-600 border-2 border-black dark:border-slate-700 rounded-lg sm:rounded-xl text-slate-900 dark:text-white active:translate-x-0.5 active:translate-y-0.5 transition-all flex-shrink-0"
                  title="Daftar Kelas"
                >
                  <Menu className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} />
                </button>
              )}

              {/* Mobile Menu Trigger (Hamburger Profil/Luar) - Visible on main sections */}
              {(['management', 'approval', 'ai-labs', 'flipbook', 'preview'].includes(uiSection) || (uiSection === 'classes' && !canManage)) && !isCoverView && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMobileMenuMode('profile')
                    setMobileMenuOpen(true)
                  }}
                  className="lg:hidden flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 text-slate-900 dark:text-white active:scale-95 transition-all flex-shrink-0"
                >
                  <UserCircle className="w-9 h-9 sm:w-11 sm:h-11" strokeWidth={1} />
                </button>
              )}
            </div>

          </div>
        )}


        {/* Main Content */}
        <div className={`${contentWrapper} flex-1 min-h-0 flex flex-col`}>
          {shouldShowNotFound ? (
            <NotFound />
          ) : (
            <YearbookClassesView
              album={album}
              classIndex={classIndex}
              setClassIndex={setClassIndex}

            setView={setView}
            isOwner={isOwner}
            isAlbumAdmin={isAlbumAdmin}
            isGlobalAdmin={album?.isGlobalAdmin}
            addingClass={addingClass}
            setAddingClass={setAddingClass}
            newClassName={newClassName}
            setNewClassName={setNewClassName}
            handleAddClass={handleAddClass}
            handleDeleteClass={handleDeleteClass}
            goPrevClass={goPrevClass}
            goNextClass={goNextClass}
            realtimeCounter={realtimeCounter}
            requestsByClass={requestsByClass}
            myAccessByClass={myAccessByClass}
            myRequestByClass={myRequestByClass}
            accessDataLoaded={accessDataLoaded}
            selectedRequestId={selectedRequestId}
            setSelectedRequestId={setSelectedRequestId}
            sidebarMode={activeSection === 'cover' ? 'classes' : activeSection}
            setSidebarMode={setSidebarMode}
            onSectionChange={handleSectionChange}
            albumId={id ?? ''}
            flipbookPreviewMode={flipbookPreviewMode}
            setFlipbookPreviewMode={setFlipbookPreviewMode}
            fullscreenRootRef={isFlipbookPreviewShell ? flipbookFullscreenRootRef : undefined}
            mobileMenuOpen={mobileMenuOpen}
            setMobileMenuOpen={setMobileMenuOpen}
            drawerMode={mobileMenuMode}
            aiLabsTool={aiLabsTool}
            requestForm={requestForm}
            setRequestForm={setRequestForm}
            handleRequestAccess={handleRequestAccess}
            handleJoinAsOwner={handleJoinAsOwner}
            handleApproveReject={handleApproveReject}
            editingProfileClassId={editingProfileClassId}
            setEditingProfileClassId={setEditingProfileClassId}
            editingMemberUserId={editingMemberUserId}
            setEditingMemberUserId={setEditingMemberUserId}
            onStartEditMember={onStartEditMember}
            onStartEditMyProfile={onStartEditMyProfile}
            editProfileName={editProfileName}
            setEditProfileName={setEditProfileName}
            editProfileEmail={editProfileEmail}
            setEditProfileEmail={setEditProfileEmail}
            editProfileTtl={editProfileTtl}
            setEditProfileTtl={setEditProfileTtl}
            editProfileInstagram={editProfileInstagram}
            setEditProfileInstagram={setEditProfileInstagram}
            editProfileTiktok={editProfileTiktok}
            setEditProfileTiktok={setEditProfileTiktok}
            editProfilePesan={editProfilePesan}
            setEditProfilePesan={setEditProfilePesan}
            editProfileVideoUrl={editProfileVideoUrl}
            setEditProfileVideoUrl={setEditProfileVideoUrl}
            editProfilePhone={editProfilePhone}
            setEditProfilePhone={setEditProfilePhone}
            handleSaveProfile={handleSaveProfile}
            savingProfile={savingProfile}
            membersByClass={membersByClass}
            classViewMode={classViewMode}
            setClassViewMode={setClassViewMode}
            personalIndex={personalIndex}
            setPersonalIndex={setPersonalIndex}
            fetchMembersForClass={fetchMembersForClass}
            openGallery={openGallery}
            onUploadPhoto={handleUploadPhoto}
            onUploadVideo={handleUploadVideo}
            onDeletePhoto={handleDeletePhoto}
            touchStartX={touchStartX}
            setTouchStartX={setTouchStartX}
            personalCardExpanded={personalCardExpanded}
            setPersonalCardExpanded={setPersonalCardExpanded}
            firstPhotoByStudent={firstPhotoByStudentByClass[currentClassId ?? ''] ?? {}}
            studentPhotosInCard={studentPhotosInCard}
            studentNameForPhotosInCard={studentNameForPhotosInCard}
            studentPhotoIndexInCard={studentPhotoIndexInCard}
            setStudentPhotoIndexInCard={setStudentPhotoIndexInCard}
            lastUploadedVideoName={lastUploadedVideoName}
            onPlayVideo={(url) => {
              setVideoPopupError(null)
              setVideoPopupUrl(url)
            }}
            fetchStudentPhotosForCard={fetchStudentPhotosForCard}
            handleUpdateClass={handleUpdateClass}
            handleUpdateAlbum={handleUpdateAlbum}
            // Cover View Props (pakai state optimis agar langsung berubah tanpa delay URL)
            isCoverView={activeSection === 'cover'}
            uploadingCover={uploadingCover}
            coverPreview={coverPreview}
            setCoverPreview={setCoverPreview}
            coverPosition={coverPosition}
            setCoverPosition={setCoverPosition}
            handleUploadCover={handleUploadCover}
            handleDeleteCover={handleDeleteCover}
            handleUploadCoverVideo={handleUploadCoverVideo}
            handleDeleteCoverVideo={handleDeleteCoverVideo}
            uploadingCoverVideo={uploadingCoverVideo}
            currentUserId={currentUserId}
            handleUpdateRole={handleUpdateRole}
            handleRemoveMember={handleRemoveMember}
            handleDeleteClassMember={handleDeleteClassMember}
            fetchAlbum={fetchAlbum}
            onTeacherCountChange={setTeacherCount}
            onTeamMemberCountChange={setTeamMemberCount}
            featureUnlocks={featureUnlocks}
            flipbookEnabledByPackage={flipbookEnabledByPackage}
            featureUnlocksLoaded={featureUnlocksLoaded}
            aiLabsFeaturesByPackage={aiLabsFeaturesByPackage}
            featureCreditCosts={featureCreditCosts}
            featureUseCosts={featureUseCosts}
            onFeatureUnlocked={fetchFeatureUnlocks}
            effectiveBackHref={effectiveBackHref}
            backLabel={backLabel}
            teacherSearchQuery={teacherSearchQuery}
            classMemberSearchQuery={classMemberSearchQuery}
            />
          )}
        </div>
        {deleteCoverConfirm && (
          <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/50 backdrop-blur-md flex items-center justify-center z-[200] p-4">
            <div className="bg-white dark:bg-slate-900 border-2 border-black dark:border-slate-700 rounded-[32px] p-6 lg:p-8 max-w-sm w-full shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] text-center">
              <h3 className="text-xl lg:text-2xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">
                {deleteCoverConfirm === 'image' ? 'Hapus Foto Cover' : 'Hapus Video Cover'}
              </h3>
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-8 lowercase first-letter:uppercase">
                {deleteCoverConfirm === 'image' ? 'Yakin hapus foto cover?' : 'Yakin hapus video cover?'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteCoverConfirm(null)}
                  className="flex-1 py-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-black dark:border-slate-700 text-slate-900 dark:text-white text-xs font-black uppercase tracking-widest shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
                >
                  Batal
                </button>
                <button
                  onClick={async () => {
                    if (deleteCoverConfirm === 'image') await performDeleteCover()
                    else await performDeleteCoverVideo()
                    setDeleteCoverConfirm(null)
                  }}
                  className="flex-1 py-3.5 rounded-xl bg-red-500 border-2 border-black dark:border-slate-700 text-white text-xs font-black uppercase tracking-widest shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
                >
                  Ya, Hapus
                </button>
              </div>
            </div>
          </div>
        )}
        {videoPopupUrl && id && (
          <div className="fixed inset-0 z-[100] bg-slate-900/80 dark:bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => { setVideoPopupUrl(null); setVideoPopupError(null) }}>
            <button
              onClick={(e) => { e.stopPropagation(); setVideoPopupUrl(null); setVideoPopupError(null) }}
              className="absolute top-4 right-4 z-10 w-10 h-10 bg-white dark:bg-slate-800 border-2 border-black dark:border-slate-700 rounded-xl flex items-center justify-center shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all text-slate-900 dark:text-white"
            >
              <X className="w-6 h-6" strokeWidth={3} />
            </button>
            <div
              className="relative inline-flex max-w-[min(100%,42rem)] max-h-[min(85vh,calc(100dvh-6rem))] flex-col items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative inline-block max-w-full max-h-[min(85vh,calc(100dvh-6rem))] rounded-[24px] overflow-hidden border-2 border-slate-900 dark:border-slate-700 bg-black shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b]">
                {videoPopupLoading && !videoPlayBlobUrl && (
                  <div className="flex min-h-[160px] min-w-[240px] flex-col items-center justify-center gap-3 px-8 py-10">
                    <Loader2 className="h-10 w-10 animate-spin text-white" aria-hidden />
                    <span className="text-xs font-black uppercase tracking-widest text-white/70">Memuat video…</span>
                  </div>
                )}
                {videoPlayBlobUrl ? (
                  <>
                    <video
                      src={videoPlayBlobUrl}
                      autoPlay
                      playsInline
                      className="block max-h-[min(85vh,calc(100dvh-6rem))] max-w-[min(calc(100vw-2rem),42rem)] w-auto h-auto"
                      onError={() => setVideoPopupError('Video tidak dapat dimuat')}
                      onEnded={() => { setVideoPopupUrl(null); setVideoPopupError(null) }}
                    />
                    {videoPopupLoading && (
                      <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-3 bg-black/80">
                        <Loader2 className="h-10 w-10 animate-spin text-white" aria-hidden />
                      </div>
                    )}
                  </>
                ) : null}

                {videoPopupError && (
                  <div className="flex min-h-[160px] min-w-[240px] flex-col items-center justify-center bg-white/95 dark:bg-slate-900/95 p-6 text-center">
                    <p className="text-sm font-black text-red-500 uppercase tracking-widest mb-4">{videoPopupError}</p>
                    <button
                      type="button"
                      onClick={() => { setVideoPopupUrl(null); setVideoPopupError(null) }}
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

  if (view === 'gallery' && galleryStudent) {
    const hasPhotos = photos.length > 0
    const safeIdx = hasPhotos ? Math.min(photoIndex, photos.length - 1) : 0
    const currentPhoto = hasPhotos ? photos[safeIdx] : null
    const canUpload =
      myAccessByClass[galleryStudent.classId]?.student_name === galleryStudent.studentName || isOwner
    const showLoadingShell = galleryPhotosLoading && !hasPhotos
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        {canUpload && (
          <input
            ref={galleryUploadInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file && galleryStudent) {
                handleUploadPhoto(galleryStudent.classId, galleryStudent.studentName, galleryStudent.className, file)
              }
              e.target.value = ''
            }}
          />
        )}
        <div className="flex shrink-0 items-center gap-3 border-b-2 border-slate-900 bg-zinc-900/85 px-3 py-2.5 backdrop-blur-md">
          <button
            type="button"
            onClick={() => {
              setView('classes')
              setGalleryStudent(null)
              setPhotos([])
              setGalleryPhotosLoading(false)
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black uppercase text-white transition-colors hover:bg-white/10 tracking-widest"
          >
            <X className="h-4 w-4" /> tutup
          </button>
          <div className="flex-1" />
          <div className="flex shrink-0 items-center gap-2">
            <span className="tabular-nums text-xs font-black text-zinc-400 tracking-widest">
              {hasPhotos ? `${safeIdx + 1} / ${photos.length}` : galleryPhotosLoading ? '…' : '0'}
            </span>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 py-3 md:px-6">
            {showLoadingShell ? (
              <div className="flex w-full max-w-3xl flex-col items-center gap-4 px-6">
                <div className="aspect-[3/4] w-full max-h-[min(72vh,calc(100dvh-10rem))] animate-pulse rounded-2xl bg-zinc-800 ring-1 ring-white/10" />
                <p className="text-sm text-zinc-500">Memuat foto…</p>
              </div>
            ) : hasPhotos ? (
              <>
                <button
                  type="button"
                  onClick={() => setPhotoIndex((i) => Math.max(0, i - 1))}
                  disabled={safeIdx === 0}
                  className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/55 p-2.5 text-white shadow-lg backdrop-blur-sm transition-opacity disabled:opacity-25 md:left-4"
                  aria-label="Foto sebelumnya"
                >
                  <ChevronLeft className="h-7 w-7 md:h-8 md:w-8" />
                </button>
                <div className="flex max-h-[min(78vh,calc(100dvh-9rem))] w-full max-w-5xl items-center justify-center">
                  <div className="relative max-h-full max-w-full overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10">
                    <FastImage
                      src={currentPhoto?.file_url}
                      alt=""
                      className="max-h-[min(78vh,calc(100dvh-9rem))] w-auto max-w-full object-contain"
                      priority
                      fetchPriority="high"
                      decoding="async"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPhotoIndex((i) => Math.min(photos.length - 1, i + 1))}
                  disabled={safeIdx >= photos.length - 1}
                  className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/55 p-2.5 text-white shadow-lg backdrop-blur-sm transition-opacity disabled:opacity-25 md:right-4"
                  aria-label="Foto berikutnya"
                >
                  <ChevronRight className="h-7 w-7 md:h-8 md:w-8" />
                </button>
              </>
            ) : (
              <div className="max-w-sm px-6 text-center">
                <p className="text-sm text-zinc-400">Belum ada foto.</p>
              </div>
            )}
          </div>

          {hasPhotos && photos.length > 1 && (
            <div className="shrink-0 border-t-2 border-black bg-black/50 px-3 py-3 backdrop-blur-md">
              <div className="mx-auto flex max-w-5xl gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                {photos.map((p, i) => (
                  <button
                    key={p.id ?? `${p.file_url}-${i}`}
                    type="button"
                    onClick={() => setPhotoIndex(i)}
                    className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-xl ring-2 transition-all md:h-16 md:w-16 ${
                      i === safeIdx ? 'ring-violet-400 opacity-100' : 'ring-white/15 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <FastImage src={p.file_url} alt="" className="h-full w-full object-cover" loading={i === safeIdx ? 'eager' : 'lazy'} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}



























