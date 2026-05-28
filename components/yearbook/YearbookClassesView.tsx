'use client'

import React from 'react'
import YearbookClassesViewUI from './YearbookClassesViewUI'
import type { AlbumClass, ClassAccess, ClassMember, ClassRequest } from './types'


export type YearbookClassesViewProps = {
  albumId?: string
  album: {
    id: string;
    name: string;
    type: string;
    classes: AlbumClass[]
  }
  classIndex: number
  setClassIndex: (fn: (i: number) => number) => void

  setView: (v: 'cover' | 'classes' | 'gallery') => void
  isOwner: boolean
  isAlbumAdmin?: boolean
  isGlobalAdmin?: boolean
  addingClass: boolean
  setAddingClass: (v: boolean) => void
  newClassName: string
  setNewClassName: (v: string) => void
  handleAddClass: () => void
  handleDeleteClass: (classId: string, className: string) => void
  handleUpdateClass?: (classId: string, updates: { name?: string; sort_order?: number; batch_photo_url?: string }) => Promise<{ id: string; name: string; sort_order?: number; batch_photo_url: string | null } | null>
  handleUpdateAlbum?: (updates: { description?: string; cover_image_url?: string; students_count?: number; flipbook_mode?: 'manual'; total_estimated_price?: number }) => Promise<unknown>
  goPrevClass: () => void
  goNextClass: () => void
  requestsByClass: Record<string, ClassRequest[]>
  myAccessByClass: Record<string, ClassAccess | null>
  myRequestByClass: Record<string, ClassRequest | null>
  accessDataLoaded?: boolean
  selectedRequestId: string | null
  setSelectedRequestId: (v: string | null) => void
  sidebarMode: 'classes' | 'approval' | 'team' | 'sambutan' | 'ai-labs' | 'flipbook' | 'preview' | 'management'
  setSidebarMode: (v: 'classes' | 'approval' | 'team' | 'sambutan' | 'ai-labs' | 'flipbook' | 'preview' | 'management') => void
  onSectionChange?: (section: 'cover' | 'classes' | 'approval' | 'team' | 'sambutan' | 'ai-labs' | 'flipbook' | 'preview' | 'management') => void
  aiLabsTool?: string | null
  requestForm: { student_name: string; email: string }
  setRequestForm: React.Dispatch<React.SetStateAction<{ student_name: string; email: string }>>
  handleRequestAccess: (classId: string) => void
  handleApproveReject: (classId: string, requestId: string, status: 'approved' | 'rejected') => void
  editingProfileClassId: string | null
  setEditingProfileClassId: (v: string | null) => void
  editingMemberUserId?: string | null
  setEditingMemberUserId?: (v: string | null) => void
  onStartEditMember?: (member: ClassMember, classId: string) => void
  onStartEditMyProfile?: (classId: string) => void
  editProfileName: string
  setEditProfileName: (v: string) => void
  editProfileEmail: string
  setEditProfileEmail: (v: string) => void
  editProfileTtl: string
  setEditProfileTtl: (v: string) => void
  editProfileInstagram: string
  setEditProfileInstagram: (v: string) => void
  editProfileTiktok: string
  setEditProfileTiktok: (v: string) => void
  editProfilePesan: string
  setEditProfilePesan: (v: string) => void
  editProfileVideoUrl: string
  setEditProfileVideoUrl: (v: string) => void
  editProfilePhone: string
  setEditProfilePhone: (v: string) => void
  handleSaveProfile: (classId: string, deleteProfile?: boolean, targetUserId?: string, overrideData?: any, skipCloseAndFetch?: boolean) => void
  savingProfile: boolean
  membersByClass: Record<string, ClassMember[]>
  classViewMode: 'list' | 'personal'
  setClassViewMode: (v: 'list' | 'personal') => void
  personalIndex: number
  setPersonalIndex: (fn: (i: number) => number) => void
  fetchMembersForClass: (classId: string) => void
  openGallery: (classId: string, studentName: string, className: string) => void
  onUploadPhoto?: (classId: string, studentName: string, className: string, file: File) => void
  onUploadVideo?: (classId: string, studentName: string, className: string, file: File) => void
  onDeletePhoto?: (photoId: string, classId: string, studentName: string) => void
  touchStartX: number | null
  setTouchStartX: (v: number | null) => void
  personalCardExpanded: boolean
  setPersonalCardExpanded: (v: boolean) => void
  firstPhotoByStudent: Record<string, string>
  studentPhotosInCard: { id: string; file_url: string; student_name: string; created_at?: string }[]
  studentNameForPhotosInCard: string | null
  studentPhotoIndexInCard: number
  setStudentPhotoIndexInCard: (fn: (i: number) => number) => void
  lastUploadedVideoName?: string | null
  onPlayVideo?: (url: string) => void
  fetchStudentPhotosForCard?: (classId: string, studentName: string) => Promise<void>
  isCoverView?: boolean
  realtimeCounter?: number
  // Cover management props
  uploadingCover?: boolean
  coverPreview?: { file: File; dataUrl: string } | null
  setCoverPreview?: (v: { file: File; dataUrl: string } | null) => void
  coverPosition?: { x: number; y: number }
  setCoverPosition?: (v: { x: number; y: number }) => void
  handleUploadCover?: (file: File, position: { x: number; y: number }, dataUrlToRevoke?: string) => Promise<void>
  handleDeleteCover?: () => Promise<void>
  handleUploadCoverVideo?: (file: File) => Promise<void>
  handleDeleteCoverVideo?: () => Promise<void>
  uploadingCoverVideo?: boolean
  handleJoinAsOwner?: (classId: string) => void
  currentUserId?: string | null
  handleUpdateRole?: (userId: string, role: 'admin' | 'member') => Promise<void>
  handleRemoveMember?: (userId: string) => Promise<void>
  handleDeleteClassMember?: (classId: string, userId: string) => Promise<void>
  fetchAlbum?: (silent?: boolean) => void
  onTeacherCountChange?: (count: number) => void
  onTeamMemberCountChange?: (count: number) => void
  flipbookPreviewMode: boolean
  setFlipbookPreviewMode: (v: boolean) => void
  mobileMenuOpen: boolean
  setMobileMenuOpen: (v: boolean) => void
  drawerMode?: 'navigation' | 'profile'
  featureUnlocks?: string[]
  flipbookEnabledByPackage?: boolean
  featureUnlocksLoaded?: boolean
  aiLabsFeaturesByPackage?: string[]
  featureCreditCosts?: Record<string, number>
  featureUseCosts?: Record<string, number>
  onFeatureUnlocked?: () => void
  effectiveBackHref?: string
  backLabel?: string
  teacherSearchQuery?: string
  classMemberSearchQuery?: string
  fullscreenRootRef?: React.RefObject<HTMLElement | null>
}

export default function YearbookClassesView(props: YearbookClassesViewProps) {
  const classes = props.album.classes ?? []
  const currentClass = classes[props.classIndex]


  const uiProps = {
    ...props,
    classes,
    currentClass,

  }

  return React.createElement(YearbookClassesViewUI, uiProps)
}











