'use client'

import React, { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2, Check, X, Edit3, ImagePlus, Video, Play, Minus, Instagram, Users, ClipboardList, Menu, Cake, Copy, Link, Clock, BookOpen, MessageSquare, Search, Shirt, UserCircle, ImageIcon, Images, Link as LinkIcon, Sparkles, Book, Layout, Eye, UserCog, LayoutGrid, Zap, ShieldCheck, Lock } from 'lucide-react'
import { toast } from '@/lib/toast'
import NextLink from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { getYearbookSectionQueryUrl } from './lib/yearbook-paths'
import TeacherCard from '@/components/TeacherCard'
import MemberCard from '@/components/MemberCard'
import { TryOn, Pose, ImageEditor, PhotoGroup, PhotoToVideo } from '@/components/features'
import { AI_LABS_FEATURES_USER } from '@/lib/dashboard-nav'
import IconSidebar from './components/IconSidebar'
import AILabsView from './components/AILabsView'
import PreviewView from './components/PreviewView'
import SambutanView from './components/SambutanView'
import ApprovalView from './components/ApprovalView'
import InlineClassEditor from './components/InlineClassEditor'
import FlipbookView from './components/FlipbookView'
import FlipbookLockedView from './components/FlipbookLockedView'
import ClassesEmptyView from './components/ClassesEmptyView'
import YearbookMobileNav from './components/YearbookMobileNav'
import YearbookSkeleton from './components/YearbookSkeleton'
import { apiUrl } from '../../lib/api-url'
import { fetchWithAuth } from '../../lib/api-client'
import type { AlbumClass, ClassAccess, ClassMember, ClassRequest, Photo, Teacher, TeacherPhoto } from './types'

type StudentInClass = { student_name: string; photo_count: number }

const asApiObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}

const getApiErrorMessage = (payload: unknown, fallback: string): string => {
  const data = asApiObject(payload)
  return typeof data.error === 'string' ? data.error : fallback
}

export default function YearbookClassesViewUI(props: any) {
  // YearbookClassesView component - displays member grid with photos and profiles
  const {
    albumId: albumIdProp = '',
    album = null,
    classes = [],
    currentClass = null,
    students = [],
    classIndex = 0,
    setClassIndex,
    setView,
    isOwner = false,
    isAlbumAdmin = false,
    isGlobalAdmin = false,
    addingClass = false,
    setAddingClass,
    newClassName = '',
    setNewClassName,
    handleAddClass,
    handleDeleteClass,
    handleUpdateClass,
    goPrevClass,
    goNextClass,
    requestsByClass = {},
    myAccessByClass = {},
    myRequestByClass = {},
    accessDataLoaded = false,
    selectedRequestId = null,
    setSelectedRequestId,
    sidebarMode = 'classes' as 'classes' | 'approval' | 'team' | 'sambutan' | 'ai-labs' | 'flipbook' | 'preview',
    setSidebarMode,
    onSectionChange,
    requestForm = { student_name: '', email: '' },
    setRequestForm,
    handleRequestAccess,
    handleJoinAsOwner,
    handleApproveReject,
    editingProfileClassId = null,
    setEditingProfileClassId,
    editingMemberUserId = null,
    setEditingMemberUserId,
    onStartEditMember,
    onStartEditMyProfile,
    editProfileName = '',
    setEditProfileName,
    editProfileEmail = '',
    setEditProfileEmail,
    editProfileTtl = '',
    setEditProfileTtl,
    editProfileInstagram = '',
    setEditProfileInstagram,
    editProfileTiktok = '',
    setEditProfileTiktok,
    editProfilePesan = '',
    setEditProfilePesan,
    editProfileVideoUrl = '',
    setEditProfileVideoUrl,
    handleSaveProfile,
    savingProfile = false,
    membersByClass = {},
    classViewMode = 'personal',
    setClassViewMode,
    personalIndex = 0,
    setPersonalIndex,
    fetchMembersForClass,
    openGallery,
    onUploadPhoto,
    onUploadVideo,
    onDeletePhoto,
    personalCardExpanded = false,
    setPersonalCardExpanded,
    firstPhotoByStudent = {},
    studentPhotosInCard = [],
    studentNameForPhotosInCard = null,
    studentPhotoIndexInCard = 0,
    setStudentPhotoIndexInCard,
    lastUploadedVideoName = null,
    onPlayVideo,
    fetchStudentPhotosForCard,
    studentsByClass = {},
    isCoverView = false,
    uploadingCover = false,
    coverPreview = null,
    setCoverPreview,
    coverPosition = { x: 50, y: 50 },
    setCoverPosition,
    handleUploadCover,
    handleDeleteCover,
    handleUploadCoverVideo,
    handleDeleteCoverVideo,
    uploadingCoverVideo = false,
    currentUserId = null,
    handleUpdateRole,
    handleRemoveMember,
    handleDeleteClassMember: handleDeleteClassMemberProp,
    fetchAlbum,
    flipbookPreviewMode = false,
    setFlipbookPreviewMode = () => { },
    mobileMenuOpen = false,
    setMobileMenuOpen = () => { },
    featureUnlocks = [] as string[],
    flipbookEnabledByPackage = false,
    featureUnlocksLoaded = false,
    aiLabsFeaturesByPackage = [] as string[],
    featureCreditCosts = {} as Record<string, number>,
    featureUseCosts = {} as Record<string, number>,
    onFeatureUnlocked,
    teacherSearchQuery = '',
    classMemberSearchQuery = '',
    realtimeCounter = 0,
  } = props

  const router = useRouter()
  const pathname = usePathname()
  const effectiveAlbumId = albumIdProp || album?.id || ''

  // Flipbook is accessible if: enabled by pricing package OR unlocked by owner via credits
  // While feature unlock data hasn't loaded yet, treat as accessible to avoid flash of locked state
  const flipbookAccessible = !featureUnlocksLoaded || flipbookEnabledByPackage || featureUnlocks.includes('flipbook')

  // AI Labs is accessible if: at least one feature enabled by package OR at least one AI feature unlocked individually
  // While feature unlock data hasn't loaded yet, treat as accessible to avoid flash of locked state
  const aiLabsAccessible = !featureUnlocksLoaded || aiLabsFeaturesByPackage.length > 0 || featureUnlocks.some(f => ['tryon', 'pose', 'photogroup', 'phototovideo', 'image_remove_bg'].includes(f))
  const coverPreviewContainerRef = useRef<HTMLDivElement>(null)
  const coverDragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const coverUploadInputRef = useRef<HTMLInputElement>(null)
  const coverVideoInputRef = useRef<HTMLInputElement>(null)
  // Section terakhir sebelum Preview — dipakai saat tombol X di Preview diklik
  const lastSectionBeforePreviewRef = useRef<'classes' | 'approval' | 'team' | 'sambutan' | 'ai-labs' | 'flipbook' | 'preview'>('classes')
  useEffect(() => {
    if (sidebarMode !== 'preview') lastSectionBeforePreviewRef.current = sidebarMode
  }, [sidebarMode])
  const [members, setMembers] = useState<{ user_id: string; email: string; name?: string; role: string }[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  // Batch Photo additions
  const batchPhotoInputRef = useRef<HTMLInputElement>(null)
  const [uploadingBatchPhotoClassId, setUploadingBatchPhotoClassId] = useState<string | null>(null)
  const [viewingBatchPhotoClass, setViewingBatchPhotoClass] = useState<AlbumClass | null>(null)


  // Join requests state: cache per tab, only refetch on realtime (no refetch on tab switch)
  const [pendingList, setPendingList] = useState<any[]>([])
  const [approvedList, setApprovedList] = useState<any[]>([])
  const [pendingLoaded, setPendingLoaded] = useState(false)
  const [approvedLoaded, setApprovedLoaded] = useState(false)
  const [teamLoaded, setTeamLoaded] = useState(false)
  const [joinStats, setJoinStats] = useState<any>(null)
  const [savingLimit, setSavingLimit] = useState(false)
  const [approvalTab, setApprovalTab] = useState<'pending' | 'approved' | 'team'>('pending')
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [inviteExpiresAt, setInviteExpiresAt] = useState<string | null>(null)
  const [generatingInvite, setGeneratingInvite] = useState(false)
  const [deleteClassConfirm, setDeleteClassConfirm] = useState<{ classId: string; className: string } | null>(null)
  const [deleteMemberConfirm, setDeleteMemberConfirm] = useState<{ classId: string; userId?: string; memberName: string } | null>(null)
  const [joinConfirmClassId, setJoinConfirmClassId] = useState<string | null>(null)

  // Manual Flipbook Pages state
  const [manualPages, setManualPages] = useState<any[]>([])

  const [coverShortDescription, setCoverShortDescription] = useState<string>(() =>
    typeof album?.description === 'string' ? album.description : ''
  )
  const [savingCoverShortDescription, setSavingCoverShortDescription] = useState(false)
  const coverDescDirtyRef = useRef(false)

  useEffect(() => {
    if (coverDescDirtyRef.current) return
    setCoverShortDescription(typeof album?.description === 'string' ? album.description : '')
  }, [album?.description])


  const searchParams = useSearchParams()
  const aiLabsTool = searchParams.get('tool')
  const isAiLabsToolActive = sidebarMode === 'ai-labs' && !!aiLabsTool

  const stripOriginForDisplay = (url: string) => {
    if (!url) return ''
    try {
      if (!url.startsWith('http')) return url
      const u = new URL(url)
      return u.pathname + u.search
    } catch {
      return url
    }
  }

  const canManage = isOwner || isAlbumAdmin || isGlobalAdmin

  const fetchMembers = async () => {
    if (!album?.id) return
    const res = await fetchWithAuth(`/api/albums/${album.id}/members`, { credentials: 'include' })
    const data = await res.json().catch(() => [])
    if (res.ok && Array.isArray(data)) {
      setMembers(data)
      props.onTeamMemberCountChange?.(data.length)
    }
  }

  // Wrap handlers to refresh members after success
  const handleUpdateRoleWrapper = async (userId: string, role: 'admin' | 'member') => {
    if (!handleUpdateRole) return
    await handleUpdateRole(userId, role)
    // Refresh members list after role update
    await fetchMembers()
  }

  const handleRemoveMemberWrapper = async (userId: string) => {
    if (!handleRemoveMember) return
    await handleRemoveMember(userId)
    // Refresh members list after removal
    await fetchMembers()
  }

  // Delete member from class - delegates to parent for optimistic update + realtime sync
  const handleDeleteClassMember = async (classId: string, userId: string) => {
    if (handleDeleteClassMemberProp) {
      await handleDeleteClassMemberProp(classId, userId)
      // Refresh team list so removed member disappears from section "tim" if they had no other class
      await fetchMembers()
    }
  }



  // Fetch teachers
  const fetchTeachers = async () => {
    if (!album?.id) return
    try {
      const res = await fetchWithAuth(`/api/albums/${album.id}/teachers`, { credentials: 'include' })
      const data = await res.json().catch(() => [])
      if (res.ok && Array.isArray(data)) {
        setTeachers(data)
        props.onTeacherCountChange?.(data.length)
      }
    } catch (error) {
      console.error('Error fetching teachers:', error)
    }
  }

  useEffect(() => {
    if ((sidebarMode === 'sambutan' || sidebarMode === 'flipbook' || sidebarMode === 'preview') && album?.id) {
      fetchTeachers()
    }
  }, [sidebarMode, album?.id])

  // Fetch Manual Pages
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
        setManualPages(pages)
      }
    } catch (error) {
      console.error('Error fetching manual pages:', error)
    }
  }

  useEffect(() => {
    if (sidebarMode === 'flipbook' && album?.id) {
      fetchManualPages()
    }
  }, [sidebarMode, flipbookPreviewMode, album?.id])

  // Supabase auth-only: no Realtime. View is refreshed on demand (after actions) and when the user revisits the tab.

  // Fetch invite token
  const fetchInviteToken = async () => {
    if (!album?.id) return
    try {
      const res = await fetchWithAuth(`/api/albums/${album.id}/invite-token`, { credentials: 'include' })
      if (res.ok) {
        const data = asApiObject(await res.json().catch(() => ({})))
        setInviteToken(typeof data.token === 'string' ? data.token : null)
        setInviteExpiresAt(typeof data.expiresAt === 'string' ? data.expiresAt : null)
      }
    } catch (error) {
      console.error('Error fetching invite token:', error)
    }
  }

  // Generate new invite token
  const handleGenerateInviteToken = async () => {
    if (!album?.id || generatingInvite) return
    setGeneratingInvite(true)
    try {
      const res = await fetchWithAuth(`/api/albums/${album.id}/invite-token`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresInDays: 7 })
      })
      if (res.ok) {
        const data = asApiObject(await res.json().catch(() => ({})))
        setInviteToken(typeof data.token === 'string' ? data.token : null)
        setInviteExpiresAt(typeof data.expiresAt === 'string' ? data.expiresAt : null)
        toast.success('Link undangan berhasil dibuat!')
      } else {
        toast.error('Gagal membuat link undangan')
      }
    } catch (error) {
      console.error('Error generating invite token:', error)
      toast.error('Terjadi kesalahan')
    } finally {
      setGeneratingInvite(false)
    }
  }

  // Fetch join requests for one status only (backend: pending from album_join_requests, approved from album_class_access)
  const fetchJoinRequests = async (status: 'pending' | 'approved') => {
    if (!album?.id || !canManage) return
    try {
      const res = await fetchWithAuth(`/api/albums/${album.id}/join-requests?status=${status}`, { credentials: 'include', cache: 'no-store' })
      const data = await res.json().catch(() => [])
      if (res.ok && Array.isArray(data)) {
        if (status === 'pending') setPendingList(data)
        else setApprovedList(data)
      }
    } catch (error) {
      console.error('Error fetching join requests:', error)
      if (status === 'pending') setPendingList([])
      else setApprovedList([])
    }
  }

  const fetchJoinStats = async () => {
    if (!album?.id) return
    try {
      const res = await fetchWithAuth(`/api/albums/${album.id}/join-stats`, { credentials: 'include', cache: 'no-store' })
      const data = await res.json()
      if (res.ok) {
        setJoinStats(data)
      }
    } catch (error) {
      console.error('Error fetching join stats:', error)
    }
  }

  // Prefetch join-stats + token undangan begitu album & hak kelola diketahui (jangan tunggu buka tab Approval/Cover selesai navigasi)
  useEffect(() => {
    if (!album?.id || !canManage) return
    void fetchJoinStats()
    void fetchInviteToken()
  }, [album?.id, canManage])

  // Prefetch semua tab approval saat masuk section "approval"
  // Agar jumlah & isi tab langsung muncul dan switching tab terasa instan.
  useEffect(() => {
    if (sidebarMode !== 'approval' || !canManage || !album?.id) return
    if (!pendingLoaded) {
      setPendingLoaded(true)
      fetchJoinRequests('pending')
    }
    if (!approvedLoaded) {
      setApprovedLoaded(true)
      fetchJoinRequests('approved')
    }
    if (!teamLoaded) {
      setTeamLoaded(true)
      fetchMembers()
    }
  }, [sidebarMode, canManage, album?.id, pendingLoaded, approvedLoaded, teamLoaded])

  // Fetch tab data only on first view of that tab (no refetch on switch, no spinner)
  useEffect(() => {
    if (sidebarMode !== 'approval' || !canManage || !album?.id) return
    if (approvalTab === 'pending' && !pendingLoaded) {
      fetchJoinRequests('pending')
      setPendingLoaded(true)
    } else if (approvalTab === 'approved' && !approvedLoaded) {
      fetchJoinRequests('approved')
      setApprovedLoaded(true)
    } else if (approvalTab === 'team' && !teamLoaded) {
      fetchMembers()
      setTeamLoaded(true)
    }
  }, [sidebarMode, canManage, album?.id, approvalTab, pendingLoaded, approvedLoaded, teamLoaded])

  // Realtime: semua mutasi album dari device lain → refresh semua data lokal komponen ini
  useEffect(() => {
    if (!album?.id) return

    const onRealtime = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; channel?: string; payload?: Record<string, unknown>; ts?: string }>).detail
      if (!detail?.type) return

      const payload = detail.payload || {}
      const path = typeof payload.path === 'string' ? payload.path : ''
      const eventAlbumId = typeof payload.albumId === 'string' ? payload.albumId : ''

      const isMatch = eventAlbumId === album.id || path.includes(`/api/albums/${album.id}`)
      const isJoinEvent = detail.type.startsWith('album.joinRequest.') || path.includes('/join-requests')
      const isClassAccessEvent = detail.type === 'album.classAccess.updated' && eventAlbumId === album.id

      if (!isMatch && !isJoinEvent && !isClassAccessEvent) return

      // Refresh data yang di-manage lokal oleh komponen ini
      void fetchJoinStats()
      void fetchTeachers()
      void fetchManualPages()

      if (canManage) {
        void fetchJoinRequests('pending')
        void fetchJoinRequests('approved')
        void fetchMembers()
      }
    }

    window.addEventListener('fresh:realtime', onRealtime)
    return () => window.removeEventListener('fresh:realtime', onRealtime)
  }, [album?.id, canManage])

  // Reset loaded flags when leaving approval section so next time we fetch fresh
  useEffect(() => {
    if (sidebarMode !== 'approval') {
      setPendingLoaded(false)
      setApprovedLoaded(false)
      setTeamLoaded(false)
    }
  }, [sidebarMode])

  // Supabase auth-only: no Realtime, no polling.
  // Lists are refreshed after actions (approve/reject/add/remove) and when the user revisits the tab.

  // Handle approve join request
  const handleApproveJoinRequest = async (requestId: string, assigned_class_id: string) => {
    if (!album?.id || !assigned_class_id) return
    try {
      const res = await fetchWithAuth(`/api/albums/${album.id}/join-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', assigned_class_id }),
      })
      const data = await res.json().catch(() => ({} as unknown))
      if (res.ok) {
        toast.success('Request disetujui! Member berhasil ditambahkan.')
        fetchJoinStats()
        fetchJoinRequests('pending')
        fetchJoinRequests('approved')
        if (fetchMembersForClass) await fetchMembersForClass(assigned_class_id)
      } else {
        toast.error(getApiErrorMessage(data, 'Gagal menyetujui request'))
      }
    } catch (error) {
      console.error('Error approving request:', error)
      toast.error('Terjadi kesalahan')
    }
  }

  const handleSaveLimit = async (val: number) => {
    const currentLimit = joinStats?.approved_count || 0
    if (!val || val < 1) {
      toast.error('Jumlah harus minimal 1')
      return
    }
    if (val < currentLimit) {
      toast.error(`Tidak bisa dikurangi. Batas saat ini: ${currentLimit}`)
      return
    }
    setSavingLimit(true)
    try {
      const res = await fetchWithAuth(`/api/albums/${album?.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students_count: val }),
      })
      if (res.ok) {
        toast.success(`Batas diubah menjadi ${val}`)
        fetchJoinStats()
      } else {
        const data = await res.json().catch(() => ({} as unknown))
        toast.error(getApiErrorMessage(data, 'Gagal mengubah batas'))
      }
    } catch {
      toast.error('Gagal mengubah batas')
    } finally {
      setSavingLimit(false)
    }
  }

  // Handle reject join request
  const handleRejectJoinRequest = async (requestId: string, reason?: string) => {
    if (!album?.id) return
    try {
      const res = await fetchWithAuth(`/api/albums/${album.id}/join-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', rejected_reason: reason }),
      })
      const data = await res.json().catch(() => ({} as unknown))
      if (res.ok) {
        toast.success('Request ditolak')
        fetchJoinStats()
        fetchJoinRequests('pending')
      } else {
        toast.error(getApiErrorMessage(data, 'Gagal menolak request'))
      }
    } catch (error) {
      console.error('Error rejecting request:', error)
      toast.error('Terjadi kesalahan')
    }
  }

  // Teacher handlers
  const handleAddTeacher = async (name: string, title: string) => {
    if (!album?.id) return
    try {
      const res = await fetchWithAuth(`/api/albums/${album.id}/teachers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, title }),
      })
      const data = asApiObject(await res.json().catch(() => ({})))
      if (res.ok && typeof data.id === 'string') {
        setTeachers(prev => [...prev, data as unknown as Teacher])
        props.onTeacherCountChange?.(teachers.length + 1)
        toast.success('Berhasil ditambahkan')
      } else {
        toast.error(getApiErrorMessage(data, 'Gagal menambahkan'))
      }
    } catch (error) {
      console.error('Error adding teacher:', error)
      toast.error('Terjadi kesalahan')
    }
  }

  const handleUpdateTeacher = async (teacherId: string, updates: { name?: string; title?: string; message?: string; video_url?: string; pendingPhotos?: File[]; pendingVideo?: File | null }) => {
    if (!album?.id) return

    const { pendingPhotos, pendingVideo, ...textUpdates } = updates

    try {
      // 1. Save text fields
      const res = await fetchWithAuth(`/api/albums/${album.id}/teachers/${teacherId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(textUpdates),
      })
      const data = asApiObject(await res.json().catch(() => ({})))
      if (res.ok && typeof data.id === 'string') {
        setTeachers(prev => prev.map(t => t.id === teacherId ? { ...(data as unknown as Teacher), photos: t.photos } : t))
      } else {
        toast.error(getApiErrorMessage(data, 'Gagal memperbarui guru'))
        return
      }

      // 2. Upload pending photos
      if (pendingPhotos && pendingPhotos.length > 0) {
        for (const file of pendingPhotos) {
          await handleUploadTeacherPhoto(teacherId, file)
        }
      }

      // 3. Upload pending video
      if (pendingVideo) {
        await handleUploadTeacherVideo(teacherId, pendingVideo)
      }

      toast.success('Data profil berhasil diperbarui')
    } catch (error) {
      console.error('Error updating teacher:', error)
      toast.error('Terjadi kesalahan')
    }
  }

  const handleDeleteTeacher = async (teacherId: string, teacherName: string) => {
    if (!album?.id) return
    try {
      const res = await fetchWithAuth(`/api/albums/${album.id}/teachers/${teacherId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setTeachers(prev => prev.filter(t => t.id !== teacherId))
        props.onTeacherCountChange?.(teachers.length - 1)
        toast.success('Data profil berhasil dihapus')
      } else {
        const data = await res.json().catch(() => ({} as unknown))
        toast.error(getApiErrorMessage(data, 'Gagal menghapus guru'))
      }
    } catch (error) {
      console.error('Error deleting teacher:', error)
      toast.error('Terjadi kesalahan')
    }
  }

  const handleUploadTeacherPhoto = async (teacherId: string, file: File) => {
    if (!album?.id) return
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error('Foto maksimal 10MB')
      return
    }
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetchWithAuth(`/api/albums/${album.id}/teachers/${teacherId}/photos`, {
        method: 'POST',
        body: formData,
      })
      const data = asApiObject(await res.json().catch(() => ({})))
      if (res.ok && typeof data.id === 'string') {
        const teacherPhoto = data as unknown as TeacherPhoto
        // Add new photo to teacher's photos array
        setTeachers(prev => prev.map(t => {
          if (t.id === teacherId) {
            const photos = t.photos || []
            return { ...t, photos: [...photos, teacherPhoto] }
          }
          return t
        }))
      } else {
        toast.error(getApiErrorMessage(data, 'Gagal upload foto'))
      }
    } catch (error) {
      console.error('Error uploading photo:', error)
      toast.error('Terjadi kesalahan')
    }
  }

  const handleDeleteTeacherPhoto = async (teacherId: string, photoId: string) => {
    if (!album?.id) return
    try {
      const res = await fetchWithAuth(`/api/albums/${album.id}/teachers/${teacherId}/photos/${photoId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        // Remove photo from teacher's photos array
        setTeachers(prev => prev.map(t => {
          if (t.id === teacherId) {
            const photos = (t.photos || []).filter(p => p.id !== photoId)
            return { ...t, photos }
          }
          return t
        }))
        toast.success('Foto berhasil dihapus')
      } else {
        const data = await res.json().catch(() => ({} as unknown))
        toast.error(getApiErrorMessage(data, 'Gagal menghapus foto'))
      }
    } catch (error) {
      console.error('Error deleting photo:', error)
      toast.error('Terjadi kesalahan')
    }
  }

  const handleDeleteTeacherPhotoOld = async (teacherId: string) => {
    if (!album?.id) return
    if (!confirm('Hapus foto guru?')) return
    try {
      const res = await fetchWithAuth(`/api/albums/${album.id}/teachers/${teacherId}/photo`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setTeachers(prev => prev.map(t =>
          t.id === teacherId ? { ...t, photo_url: undefined } : t
        ))
        toast.success('Foto berhasil dihapus')
      } else {
        const data = await res.json().catch(() => ({} as unknown))
        toast.error(getApiErrorMessage(data, 'Gagal menghapus foto'))
      }
    } catch (error) {
      console.error('Error deleting photo:', error)
      toast.error('Terjadi kesalahan')
    }
  }

  const MAX_VIDEO_BYTES = 20 * 1024 * 1024 // 20MB
  const MAX_PHOTO_BYTES = 10 * 1024 * 1024 // 10MB

  const handleUploadTeacherVideo = async (teacherId: string, file: File) => {
    if (!album?.id) return
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error('Video maksimal 20MB')
      return
    }
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetchWithAuth(`/api/albums/${album.id}/teachers/${teacherId}/video`, {
        method: 'POST',
        body: formData,
      })
      const data = asApiObject(await res.json().catch(() => ({})))
      if (res.ok && typeof data.video_url === 'string') {
        const videoUrl = data.video_url
        setTeachers(prev => prev.map(t =>
          t.id === teacherId ? { ...t, video_url: videoUrl } : t
        ))
      } else {
        toast.error(getApiErrorMessage(data, 'Gagal upload video'))
      }
    } catch (error) {
      console.error('Error uploading video:', error)
      toast.error('Terjadi kesalahan')
    }
  }

  // Batch photo handlers
  const handleUploadBatchPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !uploadingBatchPhotoClassId || !album?.id) return
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error('Foto maksimal 10MB')
      e.target.value = ''
      return
    }

    const classId = uploadingBatchPhotoClassId
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetchWithAuth(`/api/albums/${album.id}/classes/${classId}/photo`, {
        method: 'POST',
        body: formData,
      })

      const data = asApiObject(await res.json().catch(() => ({})))

      if (res.ok && typeof data.batch_photo_url === 'string') {
        toast.success('Foto angkatan berhasil diupload')
        // Optimistic update via parent — also triggers realtime for other devices
        if (handleUpdateClass) {
          await handleUpdateClass(classId, { batch_photo_url: data.batch_photo_url as string })
        }
      } else {
        toast.error(getApiErrorMessage(data, 'Gagal upload foto'))
      }
    } catch (error) {
      console.error('Error uploading batch photo:', error)
      toast.error('Terjadi kesalahan')
    } finally {
      if (batchPhotoInputRef.current) batchPhotoInputRef.current.value = ''
      setUploadingBatchPhotoClassId(null)
    }
  }

  const handleDeleteBatchPhoto = async (classId: string) => {
    if (!album?.id || !confirm('Hapus foto angkatan ini?')) return

    // Optimistic update: clear immediately in local state
    if (handleUpdateClass) {
      handleUpdateClass(classId, { batch_photo_url: '' })
    }

    try {
      const res = await fetchWithAuth(`/api/albums/${album.id}/classes/${classId}/photo`, {
        method: 'DELETE',
      })

      if (res.ok) {
        toast.success('Foto angkatan dihapus')
        // Confirm the null state (optimistic already applied)
        if (handleUpdateClass) {
          handleUpdateClass(classId, { batch_photo_url: '' })
        }
      } else {
        const data = await res.json().catch(() => ({} as unknown))
        toast.error(getApiErrorMessage(data, 'Gagal menghapus foto'))
        // Rollback: refetch album to restore correct state (silent = no skeleton)
        if (fetchAlbum) fetchAlbum(true)
      }
    } catch (error) {
      console.error('Error deleting batch photo:', error)
      toast.error('Terjadi kesalahan')
      if (fetchAlbum) fetchAlbum(true)
    }
  }

  if (!accessDataLoaded) {
    return <YearbookSkeleton section={sidebarMode} />
  }

  return (
    <div className={`flex flex-col w-full lg:max-w-full ${((sidebarMode === 'flipbook' && flipbookPreviewMode) || isAiLabsToolActive) ? 'h-full overflow-hidden' : 'min-h-screen'}`}>
      <YearbookMobileNav
        pathname={pathname}
        effectiveAlbumId={effectiveAlbumId ?? ''}
        isCoverView={isCoverView}
        sidebarMode={sidebarMode}
        canManage={canManage}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        joinStats={joinStats}
        classes={classes}
        classIndex={classIndex}
        setClassIndex={setClassIndex}
        myRequestByClass={myRequestByClass}
        membersByClass={membersByClass}
        myAccessByClass={myAccessByClass}
        currentClass={currentClass}
        addingClass={addingClass}
        setAddingClass={setAddingClass}
        handleUpdateClass={handleUpdateClass}
        setDeleteClassConfirm={setDeleteClassConfirm}
        isOwner={isOwner}
        handleJoinAsOwner={handleJoinAsOwner}
        newClassName={newClassName}
        setNewClassName={setNewClassName}
        handleAddClass={handleAddClass}
        flipbookAccessible={flipbookAccessible}
        aiLabsAccessible={aiLabsAccessible}
        flipbookPreviewMode={flipbookPreviewMode}
        onSectionChange={props.onSectionChange}
      />
      {/* Main Content - Header already sticky in parent (page.tsx) */}
      <div className={`flex-1 flex flex-col ${((sidebarMode === 'flipbook' && (flipbookPreviewMode || !canManage)) || isAiLabsToolActive) ? 'p-0 overflow-hidden' : 'p-4 pb-8'}`}>



        <div className={`flex flex-col lg:flex-row gap-0 flex-1 ${((sidebarMode === 'flipbook' && (flipbookPreviewMode || !canManage)) || isAiLabsToolActive) ? 'lg:pl-0' : 'lg:pl-16'} lg:px-0 lg:py-0`}>
          {/* Icon Sidebar untuk desktop - Fixed di kiri (disembunyikan saat fitur AI Labs aktif atau flipbook preview aktif) */}
          {!isAiLabsToolActive && !(sidebarMode === 'flipbook' && (flipbookPreviewMode || !canManage)) && (
            <IconSidebar
              pathname={pathname}
              albumId={effectiveAlbumId}
              isCoverView={isCoverView}
              sidebarMode={sidebarMode}
              onSectionChange={onSectionChange}
              canManage={canManage}
              requestsByClass={requestsByClass}
              flipbookAccessible={flipbookAccessible}
              aiLabsAccessible={aiLabsAccessible}
              loading={!accessDataLoaded}
            />
          )}

          {/* Secondary Sidebar Panel - Hanya untuk Edit (Cover, Sambutan, Kelas); Flipbook ada di sidebar utama */}
          {((['classes', 'sambutan'].includes(sidebarMode) || isCoverView)) && (
            <div className="hidden lg:fixed lg:left-16 lg:top-14 lg:w-64 lg:h-[calc(100vh-3.5rem)] lg:flex flex-col lg:z-35 lg:bg-white lg:dark:bg-slate-900 lg:border-r-2 lg:border-slate-900 lg:dark:border-slate-700 shadow-[4px_0_10px_0_rgba(0,0,0,0.05)] dark:shadow-[4px_0_10px_0_rgba(0,0,0,0.2)]">
              {/* Main "Edit" Switcher - Cover, Sambutan, Kelas saja */}
              {canManage && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border-b-2 border-slate-100 dark:border-slate-700 flex flex-col gap-1.5 shrink-0 animate-in fade-in duration-300">
                  <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-1">Menu Edit</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => onSectionChange?.('cover')}
                      className={`flex items-center gap-2 p-2 rounded-xl border-2 transition-all ${isCoverView ? 'bg-amber-400 dark:bg-amber-600 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] -translate-y-0.5' : 'bg-transparent border-transparent text-slate-400 dark:text-slate-500 hover:bg-white dark:hover:bg-slate-800 hover:border-slate-900 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-white'}`}
                    >
                      <Book className={`w-3.5 h-3.5 ${isCoverView ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`} />
                      <span className="text-[9px] font-black uppercase tracking-tight">Cover</span>
                    </button>
                    <button
                      onClick={() => onSectionChange?.('sambutan')}
                      className={`flex items-center gap-2 p-2 rounded-xl border-2 transition-all ${sidebarMode === 'sambutan' ? 'bg-amber-400 dark:bg-amber-600 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] -translate-y-0.5' : 'bg-transparent border-transparent text-slate-400 dark:text-slate-500 hover:bg-white dark:hover:bg-slate-800 hover:border-slate-900 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-white'}`}
                    >
                      <MessageSquare className={`w-3.5 h-3.5 ${sidebarMode === 'sambutan' ? 'text-violet-500 dark:text-violet-400' : 'text-slate-400 dark:text-slate-500'}`} />
                      <span className="text-[9px] font-black uppercase tracking-tight">Sambutan</span>
                    </button>
                    <button
                      onClick={() => onSectionChange?.('classes')}
                      className={`flex items-center gap-2 p-2 rounded-xl border-2 transition-all col-span-2 ${sidebarMode === 'classes' && !isCoverView ? 'bg-amber-400 dark:bg-amber-600 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] -translate-y-0.5' : 'bg-transparent border-transparent text-slate-400 dark:text-slate-500 hover:bg-white dark:hover:bg-slate-800 hover:border-slate-900 dark:hover:border-slate-700 hover:text-slate-900 dark:hover:text-white'}`}
                    >
                      <Users className={`w-3.5 h-3.5 ${sidebarMode === 'classes' && !isCoverView ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`} />
                      <span className="text-[9px] font-black uppercase tracking-tight">Kelas</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Header Sidebar Generik */}
              {(sidebarMode === 'classes' || sidebarMode === 'sambutan') && !isCoverView && (
                <div className="px-6 py-5 border-b-2 border-slate-100 dark:border-slate-700 shrink-0">
                  <div className="flex items-center gap-2 mb-1">
                    {sidebarMode === 'classes' && <LayoutGrid className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />}
                    {sidebarMode === 'sambutan' && <MessageSquare className="w-4 h-4 text-violet-500 dark:text-violet-400" />}
                    <h2 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-[0.2em]">
                      {sidebarMode === 'classes' && 'Daftar Kelas'}
                      {sidebarMode === 'sambutan' && 'Daftar Sambutan'}
                    </h2>
                  </div>
                  {sidebarMode === 'classes' && (
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight">
                      {`${classes.length} Kelas Terdaftar`}
                    </p>
                  )}
                  {sidebarMode === 'sambutan' && (
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight">
                      {teachers.length === 1 ? '1 orang' : `${teachers.length} orang`}
                    </p>
                  )}
                </div>
              )}

              {/* Sidebar Content Based on Mode */}
              <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
                {sidebarMode === 'classes' && !isCoverView && (
                  <div className="space-y-6">
                    {/* Inline Editor for Current Class */}
                    {currentClass && (
                      <div className="mb-4">
                        <InlineClassEditor
                          classObj={currentClass}
                          isOwner={canManage}
                          onDelete={(classId, className) => setDeleteClassConfirm({ classId, className: className ?? currentClass?.name ?? '' })}
                          onUpdate={handleUpdateClass}
                          classIndex={classIndex}
                          classesCount={classes.length}
                        />
                      </div>
                    )}

                    {/* Registration Status for User */}
                    {currentClass && (
                      <div className="px-1 mb-4">
                        {(() => {
                          const access = myAccessByClass[currentClass.id]
                          const request = myRequestByClass[currentClass.id] as ClassRequest | null | undefined
                          const isPendingRequest = request?.status === 'pending'
                          const isLoadingThisClass = !accessDataLoaded && !access && !request

                          if (isLoadingThisClass) {
                            return (
                              <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl">
                                <div className="animate-spin rounded-full h-3 w-3 border-2 border-indigo-500 dark:border-indigo-400 border-t-transparent" />
                                <span className="text-[9px] font-black text-slate-400 dark:text-slate-500">Loading...</span>
                              </div>
                            )
                          }

                          if (access?.status === 'approved') {
                            return (
                              <div className="flex items-center gap-2 p-2 bg-indigo-50 dark:bg-indigo-950/50 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl">
                                <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" strokeWidth={3} />
                                <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-300 uppercase truncate">{access.student_name}</span>
                              </div>
                            )
                          }

                          if (isPendingRequest) {
                            return (
                              <div className="p-2 bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-200 dark:border-amber-700 rounded-xl text-center">
                                <p className="text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase">Menunggu Persetujuan</p>
                              </div>
                            )
                          }

                          if (isOwner && !access) {
                            const accessEntries = Object.entries(myAccessByClass) as [string, ClassAccess | null][]
                            const hasAccessInOtherClass = accessEntries.some(
                              ([classId, a]) => classId !== currentClass.id && a?.status === 'approved'
                            )
                            if (hasAccessInOtherClass) {
                              const otherEntry = accessEntries.find(
                                ([classId, a]) => classId !== currentClass.id && a?.status === 'approved'
                              )
                              const otherClassName = otherEntry ? classes.find((c) => c.id === otherEntry[0])?.name ?? '' : ''
                              return (
                                <div className="p-2 bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-200 dark:border-amber-700 rounded-xl text-center">
                                  <p className="text-[9px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-tight">
                                    Anda sudah terdaftar di kelas lain{otherClassName ? `: ${otherClassName}` : ''}. Hanya bisa daftar di 1 kelas.
                                  </p>
                                </div>
                              )
                            }
                            return (
                              <div className="space-y-2">
                                <p className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-tight text-center">
                                  Anda owner album. Daftar di kelas ini.
                                </p>
                                <button
                                  onClick={() => setJoinConfirmClassId(currentClass.id)}
                                  className="w-full py-1.5 sm:py-2 bg-indigo-500 text-white border-2 border-slate-900 dark:border-slate-700 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase shadow-[2.5px_2.5px_0_0_#0f172a] dark:shadow-[2.5px_2.5px_0_0_#334155] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 active:shadow-none transition-all"
                                >
                                  Daftar di Kelas
                                </button>
                              </div>
                            )
                          }
                          return null
                        })()}
                      </div>
                    )}

                    {/* Compact Class List */}
                    <div className="flex flex-col gap-2">
                      {classes.map((c, idx) => {
                        const access = myAccessByClass[c.id]
                        if (!canManage && access?.status !== 'approved') return null
                        const isActive = idx === classIndex && !isCoverView
                        const ownerRegisteredIn = isOwner
                          ? (Object.entries(myAccessByClass) as [string, ClassAccess | null][]).find(
                            ([, a]) => a?.status === 'approved'
                          )?.[0]
                          : null
                        const ownerRegisteredClassName =
                          ownerRegisteredIn != null ? classes.find((x) => x.id === ownerRegisteredIn)?.name ?? '' : ''
                        return (
                          <button
                            key={c.id}
                            onClick={() => {
                              setClassIndex(idx)
                              const url = getYearbookSectionQueryUrl(effectiveAlbumId!, 'classes', pathname)
                              if (typeof window !== 'undefined') {
                                const nativePushState = window.history.constructor.prototype.pushState
                                nativePushState.call(window.history, null, '', url)
                              }
                            }}
                            className={`flex items-center justify-between w-full px-4 py-3.5 rounded-2xl border-2 transition-all duration-300 font-black uppercase text-[10px] tracking-widest ${isActive
                              ? 'bg-amber-400 dark:bg-amber-600 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] -translate-x-1 -translate-y-1'
                              : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:text-indigo-600 dark:hover:text-indigo-400'
                              }`}
                          >
                            <span className="truncate">{c.name}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {c.batch_photo_url && (
                                <div className="w-2 h-2 bg-emerald-400 dark:bg-emerald-500 rounded-full border border-slate-900 dark:border-slate-700" />
                              )}
                              {isActive && <Check className="w-3.5 h-3.5 text-slate-900 dark:text-white" strokeWidth={3} />}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    {canManage && (
                      <div className="pt-2">
                        {!addingClass ? (
                          <button
                            type="button"
                            onClick={() => setAddingClass(true)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-2 border-dashed border-slate-900 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-500 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-all font-black text-[10px] uppercase tracking-widest"
                          >
                            <Plus className="w-4 h-4" /> Tambah Kelas
                          </button>
                        ) : (
                          <div className="p-3 bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b]">
                            <input
                              type="text"
                              autoFocus
                              value={newClassName}
                              onChange={(e) => setNewClassName(e.target.value)}
                              placeholder="Nama Kelas..."
                              className="w-full px-3 py-2 text-xs font-bold rounded-lg border-2 border-slate-900 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white mb-2 focus:outline-none dark:placeholder:text-slate-500"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddClass()
                                if (e.key === 'Escape') setAddingClass(false)
                              }}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={handleAddClass}
                                className="flex-1 py-1.5 bg-indigo-500 text-white text-[9px] font-black uppercase rounded-lg border-2 border-slate-900 dark:border-slate-700 shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b]"
                              >
                                Simpan
                              </button>
                              <button
                                onClick={() => setAddingClass(false)}
                                className="flex-1 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-[9px] font-black uppercase rounded-lg border-2 border-slate-900 dark:border-slate-700"
                              >
                                Batal
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}



          <div className={`flex-1 flex flex-col gap-0 min-h-0 ${(!isCoverView && (sidebarMode === 'classes' || sidebarMode === 'sambutan')) ? 'pt-14 lg:pt-0' : 'pt-0'}`}>
            {/* Mobile class header - Fixed - Only for classes mode */}
            {/* Mobile class header removed - now in Global Header */}



            {/* Form request access dihapus - sistem menggunakan link registrasi universal */}

            {/* Mobile Sambutan View - Removed, using grid layout */}

            {/* Main content - scrollable container */}
            <main
              className={`flex-1 ${(sidebarMode === 'flipbook' || isAiLabsToolActive) ? 'overflow-hidden pb-0' : 'overflow-y-auto pb-40 lg:pb-0'} rounded-t-none relative
              ${(['classes', 'sambutan'].includes(sidebarMode) || isCoverView) ? 'lg:ml-[20rem]' : (sidebarMode === 'flipbook' || isAiLabsToolActive) ? (flipbookPreviewMode || !canManage || isAiLabsToolActive ? 'lg:ml-0' : 'lg:ml-16') : 'lg:ml-0'}
              bg-white dark:bg-slate-950
            `}
            >
              {/* Show different content based on sidebarMode - Pre-rendered components to avoid re-mounting via hidden class */}
              <div className={isCoverView ? 'block w-full h-full' : 'hidden'}>
                <div className="max-w-4xl mx-auto px-4 pt-0 pb-4 lg:py-12 relative">
                  <div className="flex flex-col gap-0 lg:gap-10">


                    {/* Hero Section - Cover Preview & Info */}
                    <div className="flex flex-col lg:flex-row items-center lg:items-stretch gap-8 lg:gap-10 w-full relative">
                      {/* Left: Preview Container */}
                      <div className="w-full max-w-[240px] sm:max-w-xs shrink-0">
                        <div className="relative aspect-[3/4] bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-[32px] overflow-hidden shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] lg:shadow-[4px_4px_0_0_#334155] lg:dark:shadow-[4px_4px_0_0_#1e293b] group rotate-1">
                          {album?.cover_image_url ? (
                            <img
                              src={(() => {
                                const u = String(album.cover_image_url || '')
                                // Jika URL tersimpan absolute (origin worker), pakai path saja agar lewat Next rewrites.
                                return u.includes('/api/files/') ? u.replace(/^https?:\/\/[^/]+/i, '') : u
                              })()}
                              alt={album.name}
                              className="w-full h-full object-cover"
                              style={album.cover_image_position ? { objectPosition: `${album.cover_image_position}` } : undefined}
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center w-full h-full bg-slate-50 dark:bg-slate-800 gap-4">
                              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center border-2 border-dashed border-slate-900 dark:border-slate-700">
                                <ImageIcon className="w-8 h-8 text-slate-300 dark:text-slate-500" />
                              </div>
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Belum ada cover</span>
                            </div>
                          )}

                          {/* Play Button (Always Visible) */}
                          {album?.cover_video_url && (
                            <button
                              type="button"
                              onClick={() => onPlayVideo && onPlayVideo(album.cover_video_url!)}
                              className="absolute bottom-3 right-3 z-10 w-10 h-10 lg:w-12 lg:h-12 rounded-2xl bg-amber-400 dark:bg-amber-600 border-2 border-slate-900 dark:border-slate-700 flex items-center justify-center shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all active:scale-95"
                            >
                              <Play className="w-5 h-5 lg:w-6 lg:h-6 text-slate-900 dark:text-white ml-0.5 lg:ml-1" fill="currentColor" />
                            </button>
                          )}

                          {/* Controls Overlay */}
                          {isOwner && (
                            <div className="absolute inset-0 bg-slate-900/10 dark:bg-slate-950/30 lg:opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-between p-3 lg:p-4">
                              {/* Top controls: Image */}
                              <div className="flex justify-end items-start gap-2">
                                {!album?.cover_image_url ? (
                                  <button
                                    type="button"
                                    onClick={() => coverUploadInputRef.current?.click()}
                                    disabled={uploadingCover}
                                    className="h-9 lg:h-10 px-3 lg:px-4 rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] text-slate-900 dark:text-white font-black text-[9px] lg:text-[10px] uppercase tracking-widest flex items-center gap-2 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
                                  >
                                    <ImagePlus className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                                    Upload Cover
                                  </button>
                                ) : (
                                  <div className="relative group/btn">
                                    <button
                                      type="button"
                                      onClick={handleDeleteCover}
                                      className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-red-500 border-2 border-slate-900 dark:border-slate-700 shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] text-white flex items-center justify-center active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
                                    >
                                      <Trash2 className="w-4 h-4" strokeWidth={3} />
                                    </button>
                                    <div className="absolute -bottom-1 -right-1 w-4 h-4 lg:w-5 lg:h-5 bg-slate-900 dark:bg-slate-700 flex items-center justify-center border border-white rounded lg:rounded-lg shadow-sm">
                                      <ImageIcon className="w-2 h-2 lg:w-2.5 lg:h-2.5 text-white" />
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Bottom controls: Video */}
                              <div className="flex justify-between items-end gap-2">
                                <div className="flex gap-2">
                                  {!album?.cover_video_url ? (
                                    <button
                                      type="button"
                                      onClick={() => coverVideoInputRef.current?.click()}
                                      disabled={uploadingCoverVideo}
                                      className="h-9 lg:h-10 px-3 lg:px-4 rounded-xl bg-slate-900 dark:bg-slate-700 border-2 border-slate-900 dark:border-slate-700 text-white font-black text-[9px] lg:text-[10px] uppercase tracking-widest flex items-center gap-2 active:translate-x-0.5 active:translate-y-0.5 transition-all"
                                    >
                                      <Video className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                                      Video
                                    </button>
                                  ) : (
                                    <div className="relative group/btn">
                                      <button
                                        type="button"
                                        onClick={handleDeleteCoverVideo}
                                        className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-red-500 border-2 border-slate-900 dark:border-slate-700 shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] text-white flex items-center justify-center active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
                                      >
                                        <Trash2 className="w-4 h-4" strokeWidth={3} />
                                      </button>
                                      <div className="absolute -bottom-1 -right-1 w-4 h-4 lg:w-5 lg:h-5 bg-slate-900 dark:bg-slate-700 flex items-center justify-center border border-white rounded lg:rounded-lg shadow-sm">
                                        <Video className="w-2 h-2 lg:w-2.5 lg:h-2.5 text-white" />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Info Container */}
                      <div className="flex-1 flex flex-col justify-between self-stretch text-center lg:text-left pt-0 lg:pt-2">
                        <div className="mb-6 lg:mb-0">
                          <h1 className="text-2xl lg:text-5xl font-black text-slate-900 dark:text-white mb-2 lg:mb-6 tracking-tight leading-none uppercase">{album?.name}</h1>
                          <p className="text-slate-500 dark:text-slate-400 text-[10px] lg:text-lg font-bold leading-relaxed max-w-xl">
                            {album?.description || "Selamat datang di yearbook digital Anda. Kelola sampul dan media utama album di sini."}
                          </p>

                          {canManage && (
                            <div className="mt-4 lg:mt-6 max-w-xl">
                              <div className="flex items-center justify-between gap-3 mb-2">
                                <p className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                                  Deskripsi singkat
                                </p>
                                <button
                                  type="button"
                                  disabled={savingCoverShortDescription}
                                  onClick={async () => {
                                    if (!props.handleUpdateAlbum) return
                                    try {
                                      setSavingCoverShortDescription(true)
                                      coverDescDirtyRef.current = false
                                      await props.handleUpdateAlbum({ description: coverShortDescription.trim() })
                                      toast.success('Deskripsi disimpan')
                                    } catch (e) {
                                      toast.error((e as Error)?.message || 'Gagal menyimpan deskripsi')
                                    } finally {
                                      setSavingCoverShortDescription(false)
                                    }
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white text-[10px] font-black uppercase tracking-widest shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all disabled:opacity-60"
                                >
                                  {savingCoverShortDescription ? 'Menyimpan…' : 'Simpan'}
                                </button>
                              </div>
                              <textarea
                                value={coverShortDescription}
                                onChange={(e) => {
                                  coverDescDirtyRef.current = true
                                  setCoverShortDescription(e.target.value)
                                }}
                                rows={3}
                                placeholder="Contoh: Angkatan 2026 — kenangan terbaik kita."
                                className="w-full rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 px-4 py-3 text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] focus:outline-none focus:ring-0"
                              />
                            </div>
                          )}
                        </div>

                        {/* Desktop Controls (Aligned with Bottom of Image) */}
                        {canManage && (
                          <div className="hidden lg:flex items-center gap-4 mt-auto">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                const url = `${window.location.origin}/album/${album?.id}/view`;
                                navigator.clipboard.writeText(url);
                                toast.success('Link public berhasil disalin');
                              }}
                              className="px-8 py-4 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white font-black text-sm uppercase tracking-widest shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all active:scale-95 flex items-center justify-center gap-3"
                            >
                              <LinkIcon className="w-5 h-5" strokeWidth={3} />
                              Salin Link
                            </button>
                            {/* Preview Album button removed as requested */}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Hidden inputs for file upload */}
                    <div className="hidden">
                      <input
                        ref={coverUploadInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file && setCoverPreview) {
                            const MAX_PHOTO_BYTES = 10 * 1024 * 1024
                            if (file.size > MAX_PHOTO_BYTES) {
                              toast.error('Foto maksimal 10MB')
                              e.target.value = ''
                              return
                            }
                            const dataUrl = URL.createObjectURL(file)
                            setCoverPreview({ file, dataUrl })
                            setCoverPosition && setCoverPosition({ x: 50, y: 50 })
                          }
                          e.target.value = ''
                        }}
                      />
                      <input
                        ref={coverVideoInputRef}
                        type="file"
                        accept="video/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          e.target.value = ''
                          if (file && handleUploadCoverVideo) {
                            if (file.size > 20 * 1024 * 1024) {
                              toast.error('Video maksimal 20MB')
                              return
                            }
                            await handleUploadCoverVideo(file)
                          }
                        }}
                      />
                    </div>

                    {/* Cover Preview Modal */}
                    {coverPreview && (
                      <div className="fixed inset-0 z-[100] bg-slate-900/90 dark:bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4">
                        <div className="flex flex-col items-center gap-6 w-full max-w-lg">
                          <div className="text-center space-y-2">
                            <h3 className="text-xl font-black text-white uppercase tracking-tight">Atur Posisi Cover</h3>
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Geser gambar untuk menyesuaikan tampilan</p>
                          </div>

                          <div
                            ref={coverPreviewContainerRef}
                            className="w-full aspect-[3/4] bg-white dark:bg-slate-900 border-8 border-slate-900 dark:border-slate-700 rounded-[40px] overflow-hidden shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] relative touch-none select-none cursor-move group"
                            onPointerDown={(e) => {
                              if (e.button !== 0) return
                              coverDragRef.current = {
                                startX: e.clientX,
                                startY: e.clientY,
                                startPosX: coverPosition.x,
                                startPosY: coverPosition.y,
                              };
                              (e.target as HTMLElement).setPointerCapture(e.pointerId)
                            }}
                            onPointerMove={(e) => {
                              if (!coverDragRef.current || !setCoverPosition) return
                              const el = coverPreviewContainerRef.current
                              if (!el) return
                              const rect = el.getBoundingClientRect()
                              const dx = (e.clientX - coverDragRef.current.startX) / rect.width * 100
                              const dy = (e.clientY - coverDragRef.current.startY) / rect.height * 100
                              setCoverPosition({
                                x: Math.min(100, Math.max(0, coverDragRef.current.startPosX - dx)),
                                y: Math.min(100, Math.max(0, coverDragRef.current.startPosY - dy)),
                              })
                            }}
                            onPointerUp={(e) => {
                              if (coverDragRef.current) {
                                (e.target as HTMLElement).releasePointerCapture(e.pointerId)
                                coverDragRef.current = null
                              }
                            }}
                          >
                            <img
                              src={coverPreview.dataUrl}
                              alt="Preview cover"
                              className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-transform duration-75"
                              style={{ objectPosition: `${coverPosition.x}% ${coverPosition.y}%` }}
                            />
                            <div className="absolute inset-0 border-[16px] border-slate-900/10 pointer-events-none" />
                          </div>

                          <div className="flex gap-4 w-full">
                            <button
                              type="button"
                              onClick={() => {
                                if (coverPreview?.dataUrl) URL.revokeObjectURL(coverPreview.dataUrl)
                                setCoverPreview && setCoverPreview(null)
                              }}
                              className="flex-1 py-4 rounded-2xl bg-slate-800 dark:bg-slate-700 text-slate-400 dark:text-slate-300 font-black text-xs uppercase tracking-widest border-2 border-slate-700 dark:border-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 transition-all"
                            >
                              Batal
                            </button>
                            <button
                              type="button"
                              disabled={uploadingCover}
                              onClick={() => handleUploadCover && handleUploadCover(coverPreview.file, coverPosition, coverPreview.dataUrl)}
                              className="flex-[2] py-4 rounded-2xl bg-emerald-400 dark:bg-emerald-600 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white font-black text-xs uppercase tracking-widest shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-50"
                            >
                              {uploadingCover ? 'Mengunggah...' : 'Simpan & Terapkan'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className={!isCoverView && sidebarMode === 'ai-labs' ? 'block w-full h-full' : 'hidden'}>
                {/* AI Labs - Fitur (Try On, Pose, dll.) tetap di album, URL ?tool=... */}
                <AILabsView
                  album={album}
                  aiLabsTool={aiLabsTool ?? null}
                  aiLabsFeaturesByPackage={aiLabsFeaturesByPackage}
                  featureUnlocks={featureUnlocks}
                  featureCreditCosts={featureCreditCosts}
                  featureUseCosts={featureUseCosts}
                  onFeatureUnlocked={onFeatureUnlocked}
                  featureUnlocksLoaded={featureUnlocksLoaded}
                />
              </div>

              <div className={!isCoverView && sidebarMode === 'approval' ? 'block w-full h-full' : 'hidden'}>
                <ApprovalView
                  joinStats={joinStats}
                  canManage={canManage}
                  approvalTab={approvalTab}
                  setApprovalTab={setApprovalTab}
                  joinRequests={approvalTab === 'pending' ? pendingList : approvalTab === 'approved' ? approvedList : []}
                  classes={classes}
                  inviteToken={inviteToken}
                  inviteExpiresAt={inviteExpiresAt}
                  generatingInvite={generatingInvite}
                  onGenerateInvite={handleGenerateInviteToken}
                  savingLimit={savingLimit}
                  onSaveLimit={handleSaveLimit}
                  onApproveRequest={handleApproveJoinRequest}
                  onRejectRequest={handleRejectJoinRequest}
                  albumId={album?.id}
                  paymentStatus={album?.payment_status}
                  members={members}
                  isOwner={isOwner}
                  isGlobalAdmin={isGlobalAdmin}
                  currentUserId={currentUserId}
                  onUpdateRole={handleUpdateRoleWrapper}
                  onRemoveMember={handleRemoveMemberWrapper}
                  onRefresh={async () => {
                    if (canManage) {
                      await Promise.all([
                        fetchJoinRequests('approved'),
                        fetchMembers(),
                        fetchJoinStats(),
                      ])
                    }
                  }}
                />
              </div>

              <div className={!isCoverView && sidebarMode === 'sambutan' ? 'block w-full h-full' : 'hidden'}>
                <SambutanView
                  teachers={teachers.filter(t => t.name.toLowerCase().includes(teacherSearchQuery.toLowerCase()))}
                  canManage={canManage}
                  onAddTeacher={handleAddTeacher}
                  onUpdateTeacher={handleUpdateTeacher}
                  onDeleteTeacher={handleDeleteTeacher}
                  onDeletePhoto={handleDeleteTeacherPhoto}
                  onPlayVideo={onPlayVideo}
                />
              </div>

              {classes.length === 0 && (
                <div className={!isCoverView && sidebarMode === 'classes' ? 'block w-full h-full' : 'hidden'}>
                  <ClassesEmptyView
                    canManage={canManage}
                    addingClass={addingClass}
                    setAddingClass={setAddingClass}
                    newClassName={newClassName}
                    setNewClassName={setNewClassName}
                    onAddClass={handleAddClass}
                  />
                </div>
              )}

              {!isCoverView && sidebarMode === 'preview' ? (
                <PreviewView
                  album={album}
                  classes={classes}
                  teachers={teachers}
                  membersByClass={membersByClass}
                  firstPhotoByStudent={firstPhotoByStudent}
                  onPlayVideo={onPlayVideo}
                  onClose={() => {
                    if (props.onSectionChange) {
                      props.onSectionChange(lastSectionBeforePreviewRef.current || 'cover');
                    } else if (effectiveAlbumId) {
                      setSidebarMode && setSidebarMode(lastSectionBeforePreviewRef.current || 'cover');
                      router.push(getYearbookSectionQueryUrl(effectiveAlbumId, lastSectionBeforePreviewRef.current, pathname), { scroll: false });
                    }
                  }}
                />
              ) : null}

              <div
                className={
                  !isCoverView && sidebarMode === 'flipbook'
                    ? `block w-full min-h-0 ${flipbookPreviewMode || !canManage ? 'h-[calc(100dvh-3.5rem)]' : 'h-full'}`
                    : 'hidden'
                }
              >
                {flipbookAccessible ? (
                  <FlipbookView
                    album={album}
                    manualPages={manualPages}
                    canManage={canManage}
                    flipbookPreviewMode={flipbookPreviewMode}
                    onPlayVideo={onPlayVideo}
                    onUpdateAlbum={props.handleUpdateAlbum}
                  />
                ) : (
                  <FlipbookLockedView
                    albumId={album?.id}
                    isOwner={isOwner}
                    creditCost={featureCreditCosts['flipbook_unlock'] ?? 0}
                    onUnlocked={onFeatureUnlocked}
                  />
                )}
              </div>

              {classes.length > 0 && (
                <div className={!isCoverView && sidebarMode === 'classes' ? 'block w-full h-full' : 'hidden'}>
                  {/* Classes Content - Original grid view */
                    (() => {
                      const access = myAccessByClass[currentClass.id]
                      const hasApprovedAccess = access?.status === 'approved'
                      const rawClassMembers = membersByClass[currentClass.id] ?? []
                      const classMembers = (() => {
                        const base = classMemberSearchQuery
                          ? rawClassMembers.filter(m => m.student_name.toLowerCase().includes(classMemberSearchQuery.toLowerCase()))
                          : rawClassMembers

                        // Filter members logic
                        const filtered = canManage ? base : base.filter(m => m.is_me)

                        return [...filtered].sort((a, b) =>
                          a.student_name.localeCompare(b.student_name, 'id', { sensitivity: 'base' })
                        )
                      })()

                      return (
                        <div className="flex flex-col gap-4 pt-0 pb-6 lg:gap-8">
                          {/* Floating Action Buttons Area for Ordinary Users */}
                          {!canManage && (
                            <div className="fixed top-16 right-4 lg:right-8 space-x-2 z-[45] flex items-center justify-end pointer-events-none">
                              <button
                                onClick={() => {
                                  const url = `${window.location.origin}/album/${album?.id}/view`;
                                  navigator.clipboard.writeText(url);
                                  toast.success('Link public berhasil disalin');
                                }}
                                className="pointer-events-auto flex items-center justify-center h-9 sm:h-10 px-3 sm:px-4 bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-[10px] sm:text-[11px] font-black uppercase text-slate-900 dark:text-white shadow-[2.5px_2.5px_0_0_#0f172a] dark:shadow-[2.5px_2.5px_0_0_#334155] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all text-nowrap"
                                title="Salin Link Public Album"
                              >
                                <LinkIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" strokeWidth={3} /> Salin Link
                              </button>
                              <button
                                onClick={() => {
                                  if (onSectionChange) {
                                    onSectionChange('preview');
                                  } else if (album?.id) {
                                    router.push(getYearbookSectionQueryUrl(album.id, 'preview', pathname), { scroll: false });
                                  }
                                }}
                                className="pointer-events-auto flex items-center justify-center h-9 sm:h-10 px-3 sm:px-4 bg-emerald-400 dark:bg-emerald-600 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-[10px] sm:text-[11px] font-black uppercase text-slate-900 dark:text-white shadow-[2.5px_2.5px_0_0_#0f172a] dark:shadow-[2.5px_2.5px_0_0_#334155] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all text-nowrap"
                                title="Preview Album"
                              >
                                <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" strokeWidth={3} /> Preview
                              </button>
                            </div>
                          )}
                          {/* Floating Action Button for Adding Class */}
                          {canManage && !isCoverView && !addingClass && (
                            <button
                              type="button"
                              onClick={() => setAddingClass(true)}
                              className="fixed bottom-24 right-6 lg:bottom-10 lg:right-10 z-[60] flex items-center justify-center w-14 h-14 lg:w-16 lg:h-16 rounded-full bg-amber-400 dark:bg-amber-600 border-2 border-slate-900 dark:border-slate-700 shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] active:scale-90 transition-all group"
                              title="Tambah Kelas"
                            >
                              <Plus className="w-8 h-8 text-slate-900 dark:text-white transition-transform group-hover:rotate-90" strokeWidth={2.5} />
                            </button>
                          )}

                          {/* Add Class Modal/Overlay (Responsive) */}
                          {addingClass && (
                            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                              <div
                                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                                onClick={() => { setAddingClass(false); setNewClassName('') }}
                              />
                              <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-[32px] shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] overflow-hidden animate-in zoom-in-95 duration-200">
                                <div className="p-6">
                                  <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Tambah Kelas Baru</h3>
                                    <button
                                      onClick={() => { setAddingClass(false); setNewClassName('') }}
                                      className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                                    >
                                      <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                                    </button>
                                  </div>

                                  <div className="flex flex-col gap-6">
                                    <div>
                                      <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 block">Nama Kelas</label>
                                      <input
                                        type="text"
                                        value={newClassName}
                                        onChange={(e) => setNewClassName(e.target.value)}
                                        placeholder="Contoh: XII IPA 1"
                                        className="w-full px-5 py-4 rounded-xl bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 text-base font-black text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 transition-all shadow-[4px_4px_0_0_#f1f5f9] dark:shadow-[4px_4px_0_0_#1e293b]"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') handleAddClass()
                                          if (e.key === 'Escape') { setAddingClass(false); setNewClassName('') }
                                        }}
                                      />
                                    </div>

                                    <div className="flex gap-3">
                                      <button
                                        type="button"
                                        onClick={() => { setAddingClass(false); setNewClassName('') }}
                                        className="flex-1 py-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-black uppercase tracking-widest border-2 border-slate-900 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all shadow-[2px_2px_0_0_#e2e8f0] dark:shadow-[4px_4px_0_0_#1e293b]"
                                      >
                                        Batal
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handleAddClass}
                                        disabled={!newClassName.trim()}
                                        className="flex-[2] py-4 rounded-2xl bg-emerald-400 dark:bg-emerald-600 text-slate-900 dark:text-white text-xs font-black uppercase tracking-widest border-2 border-slate-900 dark:border-slate-700 shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all disabled:opacity-50"
                                      >
                                        Simpan Kelas
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Class Info */}
                          <div className="px-4">
                            {/* Group Photo Section */}
                            <div className="mb-14">
                              <div className="flex items-center justify-between mb-6 gap-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-2 h-8 bg-indigo-500 dark:bg-indigo-600 rounded-full border-2 border-slate-900 dark:border-slate-700 shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b]"></div>
                                  <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-[0.2em]">Foto Angkatan</h3>
                                </div>
                              </div>
                              <div className="relative">
                                {currentClass.batch_photo_url ? (
                                  <div
                                    className="relative group aspect-[3/4] lg:max-w-md lg:mx-auto rounded-[40px] border-2 border-slate-900 dark:border-slate-700 overflow-hidden bg-slate-100 dark:bg-slate-800 shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all duration-500"
                                    onClick={() => setViewingBatchPhotoClass(currentClass)}
                                  >
                                    <img
                                      src={currentClass.batch_photo_url}
                                      alt={`Foto Angkatan ${currentClass.name}`}
                                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                    />
                                    <div className="absolute inset-0 bg-slate-900/40 dark:bg-slate-950/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                      <div className="px-8 py-4 bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-2xl shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] flex items-center gap-3 active:scale-95 transition-all">
                                        <Eye className="w-6 h-6 text-slate-900 dark:text-white" strokeWidth={3} />
                                        <span className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Lihat Layar Penuh</span>
                                      </div>
                                    </div>
                                    {canManage && (
                                      <div className="absolute top-6 right-6 flex gap-3 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleDeleteBatchPhoto(currentClass.id)
                                          }}
                                          className="w-14 h-14 flex items-center justify-center bg-red-500 rounded-2xl text-white hover:bg-red-600 transition-all border-2 border-slate-900 dark:border-slate-700 shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
                                          title="Hapus Foto"
                                        >
                                          <Trash2 className="w-7 h-7" strokeWidth={2.5} />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  canManage ? (
                                    <button
                                      onClick={() => {
                                        setUploadingBatchPhotoClassId(currentClass.id)
                                        batchPhotoInputRef.current?.click()
                                      }}
                                      className="w-full aspect-[3/4] lg:max-w-md lg:mx-auto flex flex-col items-center justify-center rounded-[48px] border-2 border-dashed border-slate-900 dark:border-slate-900 bg-slate-50/50 dark:bg-slate-900/10 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-300 group/batch-add"
                                    >
                                      <div className="relative mb-8">
                                        <div className="absolute inset-0 bg-indigo-500/15 blur-2xl rounded-full scale-150 opacity-0 group-hover/batch-add:opacity-100 transition-opacity duration-500" />
                                        <div className="relative w-24 h-24 rounded-[32px] bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] flex items-center justify-center transform group-hover/batch-add:-rotate-6 transition-transform duration-500">
                                          <ImageIcon className="w-12 h-12 text-indigo-500 dark:text-indigo-400" strokeWidth={2.5} />
                                          <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-emerald-400 dark:bg-emerald-600 border-2 border-slate-900 dark:border-slate-700 flex items-center justify-center shadow-[4px_4px_0_0_#334155] group-hover/batch-add:scale-110 transition-transform">
                                            <Plus className="w-5 h-5 text-slate-900 dark:text-white" strokeWidth={3} />
                                          </div>
                                        </div>
                                      </div>
                                      <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight text-center px-8 leading-tight">Upload Foto Angkatan</h3>
                                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-600 mt-4 uppercase tracking-widest text-center px-10 leading-relaxed">Pilih file gambar grup atau kelas (Maks. 10MB)</p>
                                    </button>
                                  ) : (
                                    <div className="w-full aspect-[3/4] lg:max-w-md lg:mx-auto flex flex-col items-center justify-center rounded-[48px] border-2 border-dashed border-slate-900 dark:border-slate-900 bg-slate-50/50 dark:bg-slate-900/10 transition-all duration-300 group/batch-empty">
                                      <div className="relative mb-8">
                                        <div className="absolute inset-0 bg-indigo-500/10 blur-2xl rounded-full scale-110 opacity-0 group-hover/batch-empty:opacity-100 transition-opacity duration-500" />
                                        <div className="relative w-20 h-20 rounded-[28px] bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] flex items-center justify-center transform group-hover/batch-empty:-rotate-6 transition-transform duration-500">
                                          <ImageIcon className="w-10 h-10 text-slate-300 dark:text-slate-600 group-hover/batch-empty:text-indigo-400 transition-colors" strokeWidth={1.5} />
                                        </div>
                                      </div>
                                      <span className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight text-center px-8 leading-tight">Foto Angkatan Belum Tersedia</span>
                                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-600 mt-4 uppercase tracking-widest text-center px-10 leading-relaxed">Admin akan mengunggah foto grup kelas segera</p>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>

                            {/* Members Grid/List */}
                            {/* Members Grid/List */}
                            <div className="flex items-center gap-3 mb-8">
                              <div className="w-2 h-8 bg-amber-400 dark:bg-amber-600 rounded-full border-2 border-slate-900 dark:border-slate-700 shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b]"></div>
                              <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-[0.2em]">{canManage ? 'Daftar Anggota' : 'Profil Anda'}</h3>
                            </div>

                            {classMembers.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-16 sm:py-24 min-h-[45vh] w-full bg-slate-50/50 dark:bg-slate-900/10 rounded-[48px] border-2 border-dashed border-slate-900 dark:border-slate-900 transition-all duration-300 group/empty">
                                <div className="relative mb-8">
                                  <div className="absolute inset-0 bg-indigo-500/20 dark:bg-indigo-500/10 blur-2xl rounded-full scale-150 opacity-0 group-hover/empty:opacity-100 transition-opacity duration-500" />
                                  <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-[28px] sm:rounded-[32px] bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] flex items-center justify-center transform group-hover/empty:-rotate-6 transition-transform duration-500">
                                    <Users className="w-10 h-10 sm:w-12 sm:h-12 text-slate-300 dark:text-slate-600 group-hover/empty:text-indigo-400 dark:group-hover/empty:text-indigo-500 transition-colors" strokeWidth={1.5} />
                                  </div>
                                </div>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-[0.1em] mb-2 text-center px-6">Belum Ada Anggota</h3>
                                <p className="text-slate-400 dark:text-slate-600 text-[10px] sm:text-xs font-black uppercase tracking-widest text-center max-w-[280px] leading-relaxed px-6">
                                  Pastikan teman-teman anda sudah bergabung ke kelas ini melalui link undangan album
                                </p>
                              </div>
                            ) : classViewMode === 'list' ? (
                              <div className="space-y-4">
                                {classMembers.map((m, idx) => (
                                  <div key={idx} className="flex items-center justify-between p-5 rounded-[24px] border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-base font-black text-slate-900 dark:text-white uppercase tracking-tight truncate">{m.student_name}{m.is_me ? ' (Anda)' : ''}</p>
                                      {m.email && <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 truncate lowercase">{m.email}</p>}
                                    </div>
                                    <div className="flex gap-3 flex-shrink-0 ml-6">
                                      <button
                                        type="button"
                                        onClick={() => openGallery(currentClass.id, m.student_name, currentClass.name)}
                                        className="px-5 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-xl border-2 border-slate-900 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700 shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all"
                                      >
                                        Lihat
                                      </button>
                                      {(isGlobalAdmin || (m.is_me && hasApprovedAccess)) && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            if (isGlobalAdmin && !m.is_me && onStartEditMember) {
                                              setEditingProfileClassId(currentClass.id)
                                              setEditingMemberUserId?.(m.user_id)
                                              onStartEditMember(m, currentClass.id)
                                            } else if (m.is_me && onStartEditMyProfile) {
                                              setEditingProfileClassId(currentClass.id)
                                              setEditingMemberUserId?.(null)
                                              onStartEditMyProfile(currentClass.id)
                                              if (fetchStudentPhotosForCard) {
                                                fetchStudentPhotosForCard(currentClass.id, m.student_name)
                                              }
                                            }
                                          }}
                                          className="px-5 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-xl border-2 border-slate-900 dark:border-slate-700 bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-700 hover:text-white shadow-[3px_3px_0_0_#4338ca] dark:shadow-[4px_4px_0_0_#1e293b] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all flex items-center gap-2"
                                        >
                                          <Edit3 className="w-4 h-4" strokeWidth={3} />
                                          <span>Edit</span>
                                        </button>
                                      )}
                                      {isGlobalAdmin && (
                                        <button
                                          type="button"
                                          onClick={() => setDeleteMemberConfirm({ classId: currentClass.id, userId: m.is_me ? undefined : m.user_id, memberName: m.student_name })}
                                          className="w-12 h-12 flex items-center justify-center rounded-xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 border-2 border-red-600 dark:border-red-700 hover:bg-red-600 hover:text-white transition-all shadow-[3px_3px_0_0_#dc2626] dark:shadow-[4px_4px_0_0_#1e293b] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
                                        >
                                          <Trash2 className="w-5 h-5" strokeWidth={2.5} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="grid gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 items-start">
                                {classMembers.map((m) => (
                                  <div key={m.user_id || m.student_name} className="min-h-0 w-full [contain:layout]">
                                    <MemberCard
                                      member={m as any}
                                      firstPhoto={m.photos?.[0] || firstPhotoByStudent?.[m.student_name]}
                                      classId={currentClass.id}
                                      canManage={canManage}
                                      isGlobalAdmin={isGlobalAdmin}
                                      hasApprovedAccess={hasApprovedAccess}
                                      isFlipped={editingMemberUserId === m.user_id}
                                      editPhotos={editingMemberUserId === m.user_id ? studentPhotosInCard : undefined}
                                      onStartEdit={(member) => {
                                        // Flip saja dulu; isi form & fetch foto nanti agar flip langsung terlihat
                                        setEditingProfileClassId(currentClass.id)
                                        setEditingMemberUserId?.(member.user_id)
                                        requestAnimationFrame(() => {
                                          setEditProfileName(member.student_name || '')
                                          setEditProfileEmail(member.email || '')
                                          setEditProfileTtl(member.date_of_birth || '')
                                          setEditProfileInstagram(member.instagram || '')
                                          setEditProfilePesan(member.message || '')
                                          setEditProfileVideoUrl(member.video_url || '')
                                          if (fetchStudentPhotosForCard) {
                                            fetchStudentPhotosForCard(currentClass.id, member.student_name)
                                          }
                                        })
                                      }}
                                      onCancelEdit={() => {
                                        setEditingProfileClassId(null)
                                        setEditingMemberUserId?.(null)
                                      }}
                                      onSave={(data) => {
                                        setEditProfileName(data.student_name)
                                        setEditProfileEmail(data.email)
                                        setEditProfileTtl(data.date_of_birth)
                                        setEditProfileInstagram(data.instagram)
                                        setEditProfilePesan(data.message)
                                        setEditProfileVideoUrl(data.video_url)

                                        setEditingMemberUserId?.(null)
                                        setEditingProfileClassId(null)

                                        const { pendingPhotos, pendingVideo, ...textData } = data
                                        const studentName = data.student_name || m.student_name

                                          ; (async () => {
                                            try {
                                              await handleSaveProfile?.(currentClass.id, false, m.user_id, textData, true)

                                              if (pendingPhotos && pendingPhotos.length > 0) {
                                                for (const file of pendingPhotos) {
                                                  if (typeof onUploadPhoto === 'function') {
                                                    await onUploadPhoto(currentClass.id, studentName, currentClass.name, file)
                                                  }
                                                }
                                              }

                                              if (pendingVideo && typeof onUploadVideo === 'function') {
                                                await onUploadVideo(currentClass.id, studentName, currentClass.name, pendingVideo)
                                              }

                                              if (fetchMembersForClass) {
                                                await fetchMembersForClass(currentClass.id)
                                              }
                                            } catch (err) {
                                              console.error('[MemberCard onSave] Error:', err)
                                            }
                                          })()
                                      }}
                                      onDeleteClick={() => setDeleteMemberConfirm({ classId: currentClass.id, userId: m.is_me ? undefined : m.user_id, memberName: m.student_name })}
                                      onDeletePhoto={(pid, cid, sname) => {
                                        if (onDeletePhoto) onDeletePhoto(pid, cid || currentClass.id, sname || m.student_name)
                                      }}
                                      onPlayVideo={onPlayVideo}
                                      onOpenGallery={(cid, sname) => openGallery(cid || currentClass.id, sname || m.student_name, currentClass.name)}
                                      saving={savingProfile}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                </div>
              )}
              {
                deleteClassConfirm && (
                  <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/50 backdrop-blur-md flex items-center justify-center z-[200] p-4">
                    <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-[32px] p-6 lg:p-8 max-w-sm w-full shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] text-center">
                      <h3 className="text-xl lg:text-2xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">Hapus Kelas</h3>
                      <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-8 lowercase first-letter:uppercase">
                        Yakin ingin menghapus kelas "{deleteClassConfirm.className}"? Semua data member di dalamnya akan hilang selamanya.
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setDeleteClassConfirm(null)}
                          className="flex-1 py-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-black uppercase tracking-widest shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
                        >
                          Batal
                        </button>
                        <button
                          onClick={() => {
                            handleDeleteClass(deleteClassConfirm.classId)
                            setDeleteClassConfirm(null)
                          }}
                          className="flex-1 py-3.5 rounded-xl bg-red-500 border-2 border-slate-900 dark:border-slate-700 text-white text-xs font-black uppercase tracking-widest shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
                        >
                          Ya, Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                )
              }

              {
                joinConfirmClassId && (
                  <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/50 backdrop-blur-md flex items-center justify-center z-[200] p-4">
                    <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-[32px] p-6 lg:p-8 max-w-sm w-full shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] text-center">
                      <h3 className="text-xl lg:text-2xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">Daftar di Kelas</h3>
                      <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-8">
                        Yakin daftar di kelas ini? Anda hanya bisa terdaftar di 1 kelas.
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setJoinConfirmClassId(null)}
                          className="flex-1 py-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-black uppercase tracking-widest shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
                        >
                          Batal
                        </button>
                        <button
                          onClick={() => {
                            if (handleJoinAsOwner) handleJoinAsOwner(joinConfirmClassId)
                            setJoinConfirmClassId(null)
                          }}
                          className="flex-1 py-3.5 rounded-xl bg-indigo-500 border-2 border-slate-900 dark:border-slate-700 text-white text-xs font-black uppercase tracking-widest shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
                        >
                          Ya, Daftar
                        </button>
                      </div>
                    </div>
                  </div>
                )
              }

              {
                deleteMemberConfirm && (
                  <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/50 backdrop-blur-md flex items-center justify-center z-[200] p-4">
                    <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-[32px] p-6 lg:p-8 max-w-sm w-full shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] text-center">
                      <h3 className="text-xl lg:text-2xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">Hapus Anggota</h3>
                      <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-8">
                        Hapus "{deleteMemberConfirm.memberName}" dari daftar kelas?
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setDeleteMemberConfirm(null)}
                          className="flex-1 py-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-black uppercase tracking-widest shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
                        >
                          Batal
                        </button>
                        <button
                          onClick={async () => {
                            const confirmData = deleteMemberConfirm
                            if (!confirmData) return
                            const targetUserId = confirmData.userId ?? currentUserId!
                            // Close modal first so deletion feels immediate, like TeacherCard flow.
                            setDeleteMemberConfirm(null)
                            void handleDeleteClassMember(confirmData.classId, targetUserId)
                          }}
                          className="flex-1 py-3.5 rounded-xl bg-red-500 border-2 border-slate-900 dark:border-slate-700 text-white text-xs font-black uppercase tracking-widest shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
                        >
                          Ya, Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                )
              }



              {/* Hidden Batch Photo Input */}
              <input
                type="file"
                ref={batchPhotoInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleUploadBatchPhoto}
              />

              {/* Batch Photo Viewer */}
              {
                viewingBatchPhotoClass && viewingBatchPhotoClass.batch_photo_url && (
                  <div className="fixed inset-0 z-[200] bg-slate-900/95 dark:bg-black/95 backdrop-blur-md flex flex-col animate-in fade-in duration-300 p-4 lg:p-10">
                    <div className="flex items-center justify-between mb-6 lg:mb-10 w-full max-w-6xl mx-auto">
                      <div className="bg-amber-300 dark:bg-amber-600 border-2 border-slate-900 dark:border-slate-700 px-6 py-3 rounded-2xl shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b]">
                        <h3 className="text-slate-900 dark:text-white font-black text-sm lg:text-xl uppercase tracking-widest">Foto Angkatan — {viewingBatchPhotoClass.name}</h3>
                      </div>
                      <div className="flex items-center gap-3">
                        {canManage && (
                          <button
                            onClick={() => {
                              if (confirm('Hapus foto angkatan ini?')) {
                                handleDeleteBatchPhoto(viewingBatchPhotoClass.id)
                                setViewingBatchPhotoClass(null)
                              }
                            }}
                            className="w-12 h-12 flex items-center justify-center bg-red-500 rounded-2xl border-2 border-slate-900 dark:border-slate-700 text-white shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all"
                            title="Hapus Foto"
                          >
                            <Trash2 className="w-6 h-6" strokeWidth={3} />
                          </button>
                        )}
                        <button
                          onClick={() => setViewingBatchPhotoClass(null)}
                          className="w-12 h-12 flex items-center justify-center bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all"
                        >
                          <X className="w-7 h-7" strokeWidth={4} />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 flex items-center justify-center overflow-hidden w-full max-w-7xl mx-auto">
                      <div className="relative p-2 bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-[32px] shadow-[20px_20px_0_0_rgba(0,0,0,0.3)] dark:shadow-[4px_4px_0_0_#1e293b] max-h-full">
                        <img
                          src={viewingBatchPhotoClass.batch_photo_url}
                          alt={`Foto Angkatan ${viewingBatchPhotoClass.name}`}
                          className="max-w-full max-h-[70vh] object-contain rounded-[24px]"
                        />
                      </div>
                    </div>
                    <div className="mt-8 text-center">
                      <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.3em]">Fresh Creative Yearbook Digital System</p>
                    </div>
                  </div>
                )
              }
            </main>
          </div>
        </div >
      </div >
    </div >
  )
}
