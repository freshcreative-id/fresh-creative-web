'use client'

import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Edit3, Trash2, ImagePlus, Video, Play, X, ChevronLeft, ChevronRight, Mail, Calendar, Instagram, Quote, Plus } from 'lucide-react'
import FastImage from '@/components/ui/FastImage'

/** Strip surrounding quote characters (straight & curly) so the UI can add its own consistently */
function stripQuotes(s: string): string {
  return s.replace(/^["""\u201C\u201D]+/, '').replace(/["""\u201C\u201D]+$/, '').trim()
}

const TiktokIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
  </svg>
)

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, '').trim()
}

function toInstagramUrl(value: string): string | null {
  const s = value.trim()
  if (!s) return null
  if (/^https?:\/\//i.test(s)) return s
  const h = normalizeHandle(s)
  return h ? `https://instagram.com/${encodeURIComponent(h)}` : null
}

function toTiktokUrl(value: string): string | null {
  const s = value.trim()
  if (!s) return null
  if (/^https?:\/\//i.test(s)) return s
  const h = normalizeHandle(s)
  return h ? `https://www.tiktok.com/@${encodeURIComponent(h)}` : null
}

function toMailto(email: string): string | null {
  const s = email.trim()
  if (!s) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null
  return `mailto:${s}`
}

type Member = {
  user_id: string
  student_name: string
  email?: string | null
  date_of_birth?: string | null
  instagram?: string | null
  tiktok?: string | null
  message?: string | null
  video_url?: string | null
  photos?: string[]
  is_me?: boolean
}

type MemberCardProps = {
  member: Member
  firstPhoto?: string | null
  classId?: string
  canManage?: boolean
  isOwner?: boolean
  isGlobalAdmin?: boolean
  hasApprovedAccess?: boolean
  isFlipped?: boolean
  onStartEdit?: (m: Member) => void
  onCancelEdit?: () => void
  onSave?: (updatedData: {
    student_name: string
    email: string
    date_of_birth: string
    instagram: string
    tiktok: string
    message: string
    video_url: string
    pendingPhotos?: File[]
    pendingVideo?: File | null
  }) => void
  onDeleteClick?: () => void
  onDeletePhoto?: (photoId: string, classId?: string, studentName?: string) => void
  onPlayVideo?: (videoUrl: string) => void
  onOpenGallery?: (classId?: string, studentName?: string) => void
  saving?: boolean
  editPhotos?: { id: string; file_url: string }[]
}

export default function MemberCard({
  member,
  firstPhoto,
  classId,
  canManage,
  isOwner = false,
  isGlobalAdmin = false,
  hasApprovedAccess,
  isFlipped = false,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDeleteClick,
  onDeletePhoto,
  onPlayVideo,
  onOpenGallery,
  saving = false,
  editPhotos
}: MemberCardProps) {
  const [showPhotoViewer, setShowPhotoViewer] = useState(false)
  const [photoIndex, setPhotoIndex] = useState(0)
  const [localConfirm, setLocalConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null)
  const [showFormOverlay, setShowFormOverlay] = useState(false)
  const [isLandscape, setIsLandscape] = useState(false)
  const flipOverlayTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Tampilkan overlay form setelah animasi flip selesai (saat buka Edit), agar animasi flip terlihat sama seperti saat Batal
  useEffect(() => {
    if (isFlipped) {
      flipOverlayTimeoutRef.current = setTimeout(() => setShowFormOverlay(true), 500)
      return () => {
        if (flipOverlayTimeoutRef.current) {
          clearTimeout(flipOverlayTimeoutRef.current)
          flipOverlayTimeoutRef.current = null
        }
      }
    } else {
      if (flipOverlayTimeoutRef.current) {
        clearTimeout(flipOverlayTimeoutRef.current)
        flipOverlayTimeoutRef.current = null
      }
      setShowFormOverlay(false)
    }
  }, [isFlipped])

  // Edit form state
  const [editName, setEditName] = useState(member.student_name || '')
  const [editTtl, setEditTtl] = useState(member.date_of_birth || '')
  const [editInstagram, setEditInstagram] = useState(member.instagram || '')
  const [editEmail, setEditEmail] = useState(member.email || '')
  const [editTiktok, setEditTiktok] = useState(member.tiktok || '')
  const [editMessage, setEditMessage] = useState(member.message || '')
  const [editVideoUrl, setEditVideoUrl] = useState(member.video_url || '')
  const [showSocialFields, setShowSocialFields] = useState(false)

  // Pending (staged) files - not uploaded until Save
  const [pendingPhotos, setPendingPhotos] = useState<{ file: File; previewUrl: string }[]>([])
  const [pendingVideo, setPendingVideo] = useState<{ file: File; previewUrl: string } | null>(null)
  const photoInputRef = React.useRef<HTMLInputElement>(null)
  const videoInputRef = React.useRef<HTMLInputElement>(null)

  // Reset form only when the actual member fields change.
  // (Parent can re-create `member` object every render; depending on the whole object would
  // wipe in-progress edits, especially when fields start empty.)
  useEffect(() => {
    setEditName(member.student_name || '')
    setEditTtl(member.date_of_birth || '')
    setEditInstagram(member.instagram || '')
    setEditEmail(member.email || '')
    setEditTiktok(member.tiktok || '')
    setEditMessage(member.message || '')
    setEditVideoUrl(member.video_url || '')
  }, [
    member.user_id,
    member.student_name,
    member.date_of_birth,
    member.instagram,
    member.email,
    member.tiktok,
    member.message,
    member.video_url,
  ])

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      pendingPhotos.forEach(p => URL.revokeObjectURL(p.previewUrl))
      if (pendingVideo) URL.revokeObjectURL(pendingVideo.previewUrl)
    }
  }, [])

  // Reset pending files when card flips back (cancel)
  useEffect(() => {
    if (!isFlipped) {
      pendingPhotos.forEach(p => URL.revokeObjectURL(p.previewUrl))
      setPendingPhotos([])
      if (pendingVideo) {
        URL.revokeObjectURL(pendingVideo.previewUrl)
        setPendingVideo(null)
      }
    }
  }, [isFlipped])

  const handleSave = () => {
    onSave?.({
      student_name: editName,
      email: editEmail,
      date_of_birth: editTtl,
      instagram: editInstagram,
      tiktok: editTiktok,
      message: editMessage,
      video_url: editVideoUrl,
      pendingPhotos: pendingPhotos.map(p => p.file),
      pendingVideo: pendingVideo?.file || null,
    })
    // Cleanup after save
    pendingPhotos.forEach(p => URL.revokeObjectURL(p.previewUrl))
    setPendingPhotos([])
    if (pendingVideo) {
      URL.revokeObjectURL(pendingVideo.previewUrl)
      setPendingVideo(null)
    }
  }

  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      alert('Foto maksimal 10MB')
      e.target.value = ''
      return
    }
    const existingCount = (editPhotos?.length || photos.length)
    const totalPhotos = existingCount + pendingPhotos.length
    if (totalPhotos >= 4) {
      alert('Maksimal 4 foto')
      e.target.value = ''
      return
    }
    const previewUrl = URL.createObjectURL(file)
    setPendingPhotos(prev => [...prev, { file, previewUrl }])
    e.target.value = ''
  }

  const handleVideoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 20 * 1024 * 1024) {
      alert('Video maksimal 20MB')
      e.target.value = ''
      return
    }
    if (pendingVideo) URL.revokeObjectURL(pendingVideo.previewUrl)
    const previewUrl = URL.createObjectURL(file)
    setPendingVideo({ file, previewUrl })
    e.target.value = ''
  }

  const removePendingPhoto = (index: number) => {
    setPendingPhotos(prev => {
      const removed = prev[index]
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  const removePendingVideo = () => {
    if (pendingVideo) {
      URL.revokeObjectURL(pendingVideo.previewUrl)
      setPendingVideo(null)
    }
  }

  const photos = (member.photos && member.photos.length > 0) 
    ? member.photos.map((p, i) => ({ id: `${member.student_name}-${i}`, file_url: p, student_name: member.student_name }))
    : firstPhoto 
      ? [{ id: `${member.student_name}-first`, file_url: firstPhoto, student_name: member.student_name }]
      : []
  const basePhotos = editPhotos && editPhotos.length > 0 ? editPhotos : photos
  const displayPreviewPhotos = [
    ...basePhotos.map(p => ({ ...p, isPending: false })),
    ...pendingPhotos.map((p, i) => ({ id: `pending-${i}`, file_url: p.previewUrl, isPending: true })),
  ]

  return (
    <>
      {/* Hidden inputs for media picking (triggered by buttons). */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoSelected}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleVideoSelected}
      />

      {/* Moderation / Delete Confirmation Modal */}
      {typeof document !== 'undefined' && localConfirm && createPortal(
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/50 backdrop-blur-md flex items-center justify-center z-[100] p-4" onClick={() => setLocalConfirm(null)}>
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-[32px] p-6 sm:p-8 max-w-sm w-full shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] text-center transform transition-all animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">{localConfirm.title}</h3>
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-6">{localConfirm.message}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setLocalConfirm(null)}
                className="flex-1 py-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white text-xs font-black uppercase tracking-widest shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
              >
                Batal
              </button>
              <button
                onClick={() => { localConfirm.onConfirm(); setLocalConfirm(null) }}
                className="flex-1 py-3.5 rounded-xl bg-red-500 text-white border-2 border-slate-900 dark:border-slate-700 text-xs font-black uppercase tracking-widest shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Card Container: perspective di parent agar animasi flip (putar Y), bukan tekuk. */}
      <div className="relative w-full aspect-[1/2] min-h-0 group" style={{ perspective: '1200px', perspectiveOrigin: '50% 50%', transformStyle: 'preserve-3d' }}>
        <div
          style={{
            transformStyle: 'preserve-3d',
            transformOrigin: 'center center',
            transition: 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
            transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
          }}
          className="absolute inset-0 w-full h-full"
        >
          {/* ================= FRONT SIDE ================= */}
          <div
            className="relative w-full h-full rounded-2xl border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b]  transition-[box-shadow,transform] duration-300 flex flex-col overflow-hidden"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(0deg)',
              transformStyle: 'preserve-3d',
              pointerEvents: isFlipped ? 'none' : 'auto',
              zIndex: isFlipped ? 0 : 1
            }}
          >
            {/* Photo Section */}
            <div className="relative aspect-[4/5] overflow-hidden bg-slate-50 dark:bg-slate-800 flex-shrink-0 border-b-4 border-slate-900 dark:border-slate-700">
              {photos.length > 0 || firstPhoto ? (
                <FastImage
                  src={photos.length > 0 ? photos[0].file_url : firstPhoto || ''}
                  alt={member.student_name}
                  className={`w-full h-full cursor-pointer transition-transform duration-700 ${isLandscape ? 'object-contain' : 'object-cover'}`}
                  priority
                  onLoad={(e) => {
                    const img = e.currentTarget
                    if (img.naturalWidth > img.naturalHeight) {
                      setIsLandscape(true)
                    } else {
                      setIsLandscape(false)
                    }
                  }}
                  onClick={() => {
                    if (photos.length > 0 || firstPhoto) {
                      setShowPhotoViewer(true)
                      setPhotoIndex(0)
                    } else if (onOpenGallery) {
                      onOpenGallery(classId, member.student_name)
                    }
                  }}
                />
              ) : (
                <div
                  className="w-full h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-500"
                >
                  <ImagePlus className="w-10 h-10 mb-2 opacity-40" />
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Belum ada foto</span>
                </div>
              )}

              {/* Video Badge Overlay */}
              {member.video_url && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); if (onPlayVideo) onPlayVideo(member.video_url!) }}
                  className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-indigo-400 dark:bg-indigo-600 text-white border-2 border-slate-900 dark:border-slate-600 flex items-center justify-center transition-all shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
                  title="Putar Video"
                >
                  <Play className="w-5 h-5 ml-1" fill="currentColor" />
                </button>
              )}
            </div>

            {/* Content Section - Increased padding for a slightly larger card */}
            <div className="flex flex-col flex-1 p-4 bg-white dark:bg-slate-900">
              {/* Header */}
              <div className="mb-2.5 flex flex-col">
                <h3 className="font-black text-slate-900 dark:text-white text-base leading-tight line-clamp-1 break-words pb-0.5 uppercase tracking-tight">
                  {member.student_name}
                  {member.is_me && <span className="inline-flex items-center ml-2 px-2 py-0.5 rounded-lg text-[9px] font-black bg-emerald-400 dark:bg-emerald-600 text-slate-900 dark:text-white border-2 border-slate-900 dark:border-slate-600 shadow-[1px_1px_0_0_rgba(15,23,42,0.12)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.34)] align-middle">ANDA</span>}
                </h3>
              </div>

              {/* Profile Details List */}
              <div className="flex flex-col gap-1.5 text-[10px] font-black text-slate-600 dark:text-slate-300 tracking-tight">
                {member.date_of_birth && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 dark:text-slate-200 flex-shrink-0" strokeWidth={2.5} />
                    <span className="line-clamp-1">{member.date_of_birth}</span>
                  </div>
                )}
                {(() => {
                  const igUrl = member.instagram ? toInstagramUrl(member.instagram) : null
                  if (!igUrl) return null
                  const label = normalizeHandle(member.instagram || '')
                  return (
                    <a
                      href={igUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Instagram className="w-3.5 h-3.5 text-slate-400 dark:text-slate-200 flex-shrink-0" strokeWidth={2.5} />
                      <span className="line-clamp-1">@{label}</span>
                    </a>
                  )
                })()}

                {(() => {
                  const mailto = member.email ? toMailto(member.email) : null
                  if (!mailto) return null
                  return (
                    <a
                      href={mailto}
                      className="flex items-center gap-2 min-w-0 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Mail className="w-3.5 h-3.5 text-slate-400 dark:text-slate-200 flex-shrink-0" strokeWidth={2.5} />
                      <span className="min-w-0 flex-1 truncate normal-case tracking-normal">{member.email}</span>
                    </a>
                  )
                })()}

                {(() => {
                  const tiktokUrl = member.tiktok ? toTiktokUrl(member.tiktok) : null
                  if (!tiktokUrl) return null
                  const label = normalizeHandle(member.tiktok || '')
                  return (
                    <a
                      href={tiktokUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 min-w-0 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <TiktokIcon className="w-3.5 h-3.5 text-slate-400 dark:text-slate-200 flex-shrink-0" />
                      <span className="min-w-0 flex-1 truncate normal-case tracking-normal">@{label}</span>
                    </a>
                  )
                })()}
              </div>

              {/* Message Block */}
              {member.message && (
                <div className="mt-3.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 relative flex-1 flex flex-col min-h-0 shadow-[1px_1px_0_0_rgba(15,23,42,0.1)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.3)]">
                  <Quote className="absolute -top-2 -left-2 w-5 h-5 text-slate-900 dark:text-slate-300 bg-white dark:bg-slate-800 rounded-full p-1 border-2 border-slate-900 dark:border-slate-600" />
                  <p className="italic font-bold text-slate-600 dark:text-slate-300 leading-snug text-xs line-clamp-3 pl-1 pt-0.5">
                    "{stripQuotes(member.message)}"
                  </p>
                </div>
              )}
            </div>

            {/* Action Buttons (Bottom) */}
            <div className="px-3 pb-3 mt-auto bg-white dark:bg-slate-900 flex-shrink-0">
              <div className="flex gap-2.5">
                {(isGlobalAdmin || member.is_me) && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onStartEdit?.(member) }}
                    className="flex-1 text-[10px] font-black uppercase tracking-widest rounded-xl bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-2 border-indigo-700 dark:border-indigo-600 hover:bg-indigo-700 hover:text-white transition-all flex items-center justify-center gap-2 py-2 shadow-[1px_1px_0_0_rgba(67,56,202,0.28)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                )}
                {(isGlobalAdmin || (member.is_me && isOwner)) && (
                  <button
                    type="button"
                    onClick={() => onDeleteClick?.()}
                    className="flex-1 text-[10px] font-black uppercase tracking-widest rounded-xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 border-2 border-red-600 dark:border-red-700 hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-2 py-2 shadow-[1px_1px_0_0_rgba(220,38,38,0.28)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
                    title={member.is_me ? 'Keluar dari kelas ini' : 'Hapus anggota'}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> {member.is_me ? 'Keluar' : 'Hapus'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ================= BACK SIDE (EDIT FORM) ================= - rotateY(180deg) agar saat container 180deg wajah form menghadap user */}
          <div
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              transformStyle: 'preserve-3d',
              pointerEvents: isFlipped ? 'auto' : 'none',
              zIndex: isFlipped ? 1 : 0
            }}
            className="absolute inset-0 w-full h-full flex flex-col rounded-2xl border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b-2 border-slate-900 dark:border-slate-700 bg-amber-300 dark:bg-amber-600 flex items-center gap-3 flex-shrink-0">
              <button type="button" className="w-8 h-8 rounded-lg border-2 border-slate-900 dark:border-slate-600 hover:bg-white/20 dark:hover:bg-slate-800/50 flex items-center justify-center bg-white dark:bg-slate-800 shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all" onClick={onCancelEdit}>
                <ChevronLeft className="w-5 h-5 text-slate-900 dark:text-white" />
              </button>
              <h3 className="text-slate-900 dark:text-white font-black text-xs uppercase tracking-widest">Edit Profil</h3>
            </div>

            {/* Form Scrollable Area - Ultra compact layout */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 bg-white dark:bg-slate-900" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <div>
                <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-1 block">Nama Lengkap</label>
                <input
                  type="text"
                  value={editName || ''}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nama Lengkap"
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-1 block">Social Links</label>
                  {!showSocialFields ? (
                    <button
                      type="button"
                      onClick={() => setShowSocialFields(true)}
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-400 dark:text-slate-500 font-bold flex items-center justify-center gap-2 hover:border-indigo-500 hover:text-indigo-500 transition-all"
                    >
                      <Plus className="w-4 h-4" /> Add Social Links
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Instagram className="w-4 h-4 text-pink-500 flex-shrink-0" strokeWidth={2.5} />
                        <input
                          type="text"
                          value={editInstagram || ''}
                          onChange={(e) => setEditInstagram(e.target.value)}
                          placeholder="@username"
                          className="flex-1 px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-blue-500 flex-shrink-0" strokeWidth={2.5} />
                        <input
                          type="text"
                          value={editEmail || ''}
                          onChange={(e) => setEditEmail(e.target.value)}
                          placeholder="email@example.com"
                          className="flex-1 px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center text-[10px] font-black text-black dark:text-white">TikTok</span>
                        <input
                          type="text"
                          value={editTiktok || ''}
                          onChange={(e) => setEditTiktok(e.target.value)}
                          placeholder="@username"
                          className="flex-1 px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-1 block">Tempat, Tanggal Lahir</label>
                <input
                  type="text"
                  value={editTtl || ''}
                  onChange={(e) => setEditTtl(e.target.value)}
                  placeholder="Ttl (Sby, 1 Jan 2005)"
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>

              {/* Photo Preview List */}
              <div className="pt-1">
                <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-2 block">Foto Galeri (Maks 4)</label>
                {displayPreviewPhotos.length > 0 && (
                  <div className="flex gap-3 flex-wrap mb-3">
                    {displayPreviewPhotos.map((photo, idx) => (
                      <div key={photo.id} className="relative w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-xl flex-shrink-0 border-2 border-slate-900 dark:border-slate-600 shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)]">
                        {photo.isPending && (
                          <div className="absolute -top-2 -left-2 bg-emerald-400 dark:bg-emerald-600 text-slate-900 dark:text-white text-[8px] font-black px-1.5 py-0.5 rounded-lg border-2 border-slate-900 dark:border-slate-600 z-10 shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] uppercase">BARU</div>
                        )}
                        <FastImage
                          src={photo.file_url}
                          alt={`preview-${idx}`}
                          className="w-full h-full object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => { if (onOpenGallery) onOpenGallery(classId, member.student_name) }}
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (photo.isPending) {
                              removePendingPhoto(idx - basePhotos.length)
                            } else {
                              setLocalConfirm({ title: 'Hapus Foto', message: `Hapus foto ini?`, onConfirm: () => onDeletePhoto?.(photo.id, classId, member.student_name) })
                            }
                          }}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] hover:bg-red-600 transition-all z-20 border-2 border-slate-900 dark:border-slate-600 active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pending video preview (sama seperti TeacherCard) */}
                {pendingVideo && (
                  <div className="flex items-center gap-3 mb-3 p-3 rounded-xl bg-sky-50 dark:bg-sky-950/50 border-2 border-slate-900 dark:border-slate-600 shadow-[1px_1px_0_0_rgba(15,23,42,0.1)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.3)]">
                    <div className="w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center flex-shrink-0 border-2 border-slate-900 dark:border-slate-600">
                      <Video className="w-5 h-5 text-sky-700 dark:text-sky-400" />
                    </div>
                    <span className="text-xs font-black text-slate-900 dark:text-slate-200 truncate flex-1 uppercase tracking-tight">{pendingVideo.file.name}</span>
                    <button type="button" onClick={removePendingVideo} className="p-2 rounded-lg bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 border-2 border-slate-900 dark:border-slate-600 hover:bg-red-500 hover:text-white transition-all shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5">
                      <X className="w-4 h-4" strokeWidth={3} />
                    </button>
                  </div>
                )}
                {pendingVideo && (
                  <div className="mb-3 rounded-xl overflow-hidden border-2 border-slate-900 dark:border-slate-600 bg-black shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)]">
                    <video src={pendingVideo.previewUrl} controls preload="metadata" className="w-full max-h-40 object-contain bg-black" playsInline />
                  </div>
                )}

                {/* Media Upload Buttons */}
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={displayPreviewPhotos.length >= 4}
                    className="flex-1 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-700 dark:border-emerald-600 hover:bg-emerald-700 hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-[1px_1px_0_0_rgba(4,120,87,0.26)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
                  >
                    <ImagePlus className="w-4 h-4" /> Foto ({displayPreviewPhotos.length}/4)
                  </button>
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    className="flex-1 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-2 border-sky-700 dark:border-sky-600 hover:bg-sky-700 hover:text-white transition-all flex items-center justify-center gap-2 shadow-[1px_1px_0_0_rgba(3,105,161,0.26)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
                  >
                    <Video className="w-4 h-4" /> Video
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-1 block">Link YouTube</label>
                <input
                  type="url"
                  value={editVideoUrl || ''}
                  onChange={(e) => setEditVideoUrl(e.target.value)}
                  placeholder="Link YouTube"
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-1 block">Pesan / Kesan</label>
                <textarea
                  value={editMessage || ''}
                  onChange={(e) => setEditMessage(e.target.value)}
                  placeholder="Pesan / Kesan"
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none"
                />
              </div>
            </div>

            {/* Editing Action Buttons */}
            <div className="px-4 py-3 bg-white dark:bg-slate-900 border-t-2 border-slate-900 dark:border-slate-700 flex gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-[2] px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-indigo-500 text-white hover:bg-indigo-600 transition-all border-2 border-slate-900 dark:border-slate-600 shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 flex items-center justify-center"
              >
                {saving ? 'Loading...' : 'Simpan'}
              </button>
              <button
                type="button"
                onClick={onCancelEdit}
                className="flex-1 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border-2 border-slate-900 dark:border-slate-600 shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
              >
                Batal
              </button>
            </div>
          </div>
        </div>

        {/* Form overlay when flipped: not transformed so inputs/buttons are always clickable (3D flip blocks pointer events in some browsers) */}
        {isFlipped && showFormOverlay && (
          <div
            className="absolute inset-0 z-20 flex flex-col rounded-2xl border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] overflow-hidden"
          >
            <div className="px-4 py-3 border-b-2 border-slate-900 dark:border-slate-700 bg-amber-300 dark:bg-amber-600 flex items-center gap-3 flex-shrink-0">
              <button type="button" className="w-8 h-8 rounded-lg border-2 border-slate-900 dark:border-slate-600 hover:bg-white/20 dark:hover:bg-slate-800/50 flex items-center justify-center bg-white dark:bg-slate-800 shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all" onClick={onCancelEdit}>
                <ChevronLeft className="w-5 h-5 text-slate-900 dark:text-white" />
              </button>
              <h3 className="text-slate-900 dark:text-white font-black text-xs uppercase tracking-widest">Edit Profil</h3>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 bg-white dark:bg-slate-900 min-h-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <div>
                <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-1 block">Nama Lengkap</label>
                <input
                  type="text"
                  value={editName || ''}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nama Lengkap"
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-1 block">Social Links</label>
                  {!showSocialFields ? (
                    <button
                      type="button"
                      onClick={() => setShowSocialFields(true)}
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-400 dark:text-slate-500 font-bold flex items-center justify-center gap-2 hover:border-indigo-500 hover:text-indigo-500 transition-all"
                    >
                      <Plus className="w-4 h-4" /> Add Social Links
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Instagram className="w-4 h-4 text-pink-500 flex-shrink-0" strokeWidth={2.5} />
                        <input
                          type="text"
                          value={editInstagram || ''}
                          onChange={(e) => setEditInstagram(e.target.value)}
                          placeholder="@username"
                          className="flex-1 px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-blue-500 flex-shrink-0" strokeWidth={2.5} />
                        <input
                          type="text"
                          value={editEmail || ''}
                          onChange={(e) => setEditEmail(e.target.value)}
                          placeholder="email@example.com"
                          className="flex-1 px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center text-[10px] font-black text-black dark:text-white">TikTok</span>
                        <input
                          type="text"
                          value={editTiktok || ''}
                          onChange={(e) => setEditTiktok(e.target.value)}
                          placeholder="@username"
                          className="flex-1 px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-1 block">Tempat, Tanggal Lahir</label>
                <input type="text" value={editTtl || ''} onChange={(e) => setEditTtl(e.target.value)} placeholder="Ttl (Sby, 1 Jan 2005)" className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              </div>
              <div className="pt-1">
                <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-2 block">Foto Galeri (Maks 4)</label>
                {displayPreviewPhotos.length > 0 && (
                  <div className="flex gap-3 flex-wrap mb-3">
                    {displayPreviewPhotos.map((photo, idx) => (
                      <div key={photo.id} className="relative w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-xl flex-shrink-0 border-2 border-slate-900 dark:border-slate-600 shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)]">
                        {photo.isPending && <div className="absolute -top-2 -left-2 bg-emerald-400 dark:bg-emerald-600 text-slate-900 dark:text-white text-[8px] font-black px-1.5 py-0.5 rounded-lg border-2 border-slate-900 dark:border-slate-600 z-10 shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] uppercase">BARU</div>}
                        <FastImage src={photo.file_url} alt={`preview-${idx}`} className="w-full h-full object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity" onClick={() => { if (onOpenGallery) onOpenGallery(classId, member.student_name) }} />
                        <button type="button" onClick={(e) => { e.stopPropagation(); if (photo.isPending) removePendingPhoto(idx - basePhotos.length); else setLocalConfirm({ title: 'Hapus Foto', message: 'Hapus foto ini?', onConfirm: () => onDeletePhoto?.(photo.id, classId, member.student_name) }) }} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] hover:bg-red-600 transition-all z-20 border-2 border-slate-900 dark:border-slate-600 active:shadow-none active:translate-x-0.5 active:translate-y-0.5"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
                {pendingVideo && (
                  <div className="flex items-center gap-3 mb-3 p-3 rounded-xl bg-sky-50 dark:bg-sky-950/50 border-2 border-slate-900 dark:border-slate-600 shadow-[1px_1px_0_0_rgba(15,23,42,0.1)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.3)]">
                    <div className="w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center flex-shrink-0 border-2 border-slate-900 dark:border-slate-600">
                      <Video className="w-5 h-5 text-sky-700 dark:text-sky-400" />
                    </div>
                    <span className="text-xs font-black text-slate-900 dark:text-slate-200 truncate flex-1 uppercase tracking-tight">{pendingVideo.file.name}</span>
                    <button type="button" onClick={removePendingVideo} className="p-2 rounded-lg bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 border-2 border-slate-900 dark:border-slate-600 hover:bg-red-500 hover:text-white transition-all shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5">
                      <X className="w-4 h-4" strokeWidth={3} />
                    </button>
                  </div>
                )}
                {pendingVideo && (
                  <div className="mb-3 rounded-xl overflow-hidden border-2 border-slate-900 dark:border-slate-600 bg-black shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)]">
                    <video src={pendingVideo.previewUrl} controls preload="metadata" className="w-full max-h-40 object-contain bg-black" playsInline />
                  </div>
                )}
                <div className="flex gap-2.5">
                  <button type="button" onClick={() => photoInputRef.current?.click()} disabled={displayPreviewPhotos.length >= 4} className="flex-1 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-700 dark:border-emerald-600 hover:bg-emerald-700 hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-[1px_1px_0_0_rgba(4,120,87,0.26)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"><ImagePlus className="w-4 h-4" /> Foto ({displayPreviewPhotos.length}/4)</button>
                  <button type="button" onClick={() => videoInputRef.current?.click()} className="flex-1 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-2 border-sky-700 dark:border-sky-600 hover:bg-sky-700 hover:text-white transition-all flex items-center justify-center gap-2 shadow-[1px_1px_0_0_rgba(3,105,161,0.26)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"><Video className="w-4 h-4" /> Video</button>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-1 block">Link YouTube</label>
                <input type="url" value={editVideoUrl || ''} onChange={(e) => setEditVideoUrl(e.target.value)} placeholder="Link YouTube" className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-1 block">Pesan / Kesan</label>
                <textarea value={editMessage || ''} onChange={(e) => setEditMessage(e.target.value)} placeholder="Pesan / Kesan" rows={2} className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none" />
              </div>
            </div>
            <div className="px-4 py-3 bg-white dark:bg-slate-900 border-t-2 border-slate-900 dark:border-slate-700 flex gap-3 flex-shrink-0">
              <button type="button" onClick={handleSave} disabled={saving} className="flex-[2] px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-indigo-500 text-white hover:bg-indigo-600 transition-all border-2 border-slate-900 dark:border-slate-600 shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 flex items-center justify-center">{saving ? 'Loading...' : 'Simpan'}</button>
              <button type="button" onClick={onCancelEdit} className="flex-1 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border-2 border-slate-900 dark:border-slate-600 shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5">Batal</button>
            </div>
          </div>
        )}
      </div>

      {/* Photo Viewer Popup */}
      {showPhotoViewer && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[200] flex flex-col bg-zinc-950 animate-in fade-in duration-200">
          <div className="flex shrink-0 items-center gap-3 border-b-2 border-slate-900 bg-zinc-900/85 px-3 py-2.5 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setShowPhotoViewer(false)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black uppercase text-white transition-colors hover:bg-white/10 tracking-widest"
            >
              <X className="h-4 w-4" /> tutup
            </button>
            <div className="flex-1" />
            <div className="flex shrink-0 items-center gap-2">
              <span className="tabular-nums text-xs font-black text-zinc-400 tracking-widest">
                {photos.length > 0 ? `${photoIndex + 1} / ${photos.length}` : '0'}
              </span>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col">
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 py-3 md:px-6">
              {photos.length > 0 ? (
                <>
                  {photos.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPhotoIndex(i => Math.max(0, i - 1))}
                      disabled={photoIndex === 0}
                      className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/55 p-2.5 text-white shadow-lg backdrop-blur-sm transition-opacity disabled:opacity-25 md:left-4"
                    >
                      <ChevronLeft className="h-7 w-7 md:h-8 md:w-8" />
                    </button>
                  )}
                  <div className="flex max-h-[min(78vh,calc(100dvh-9rem))] w-full max-w-5xl items-center justify-center">
                    <div className="relative max-h-full max-w-full overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10">
                      <FastImage
                        src={photos[photoIndex].file_url}
                        alt=""
                        className="max-h-[min(78vh,calc(100dvh-9rem))] w-auto max-w-full object-contain"
                        priority
                      />
                    </div>
                  </div>
                  {photos.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPhotoIndex(i => Math.min(photos.length - 1, i + 1))}
                      disabled={photoIndex >= photos.length - 1}
                      className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/55 p-2.5 text-white shadow-lg backdrop-blur-sm transition-opacity disabled:opacity-25 md:right-4"
                    >
                      <ChevronRight className="h-7 w-7 md:h-8 md:w-8" />
                    </button>
                  )}
                </>
              ) : (
                <div className="max-w-sm px-6 text-center">
                  <p className="text-sm text-zinc-400">Belum ada foto.</p>
                </div>
              )}
            </div>

            {photos.length > 1 && (
              <div className="shrink-0 border-t-2 border-slate-900 bg-black/50 px-3 py-3 backdrop-blur-md">
                <div className="mx-auto flex max-w-5xl gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {photos.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPhotoIndex(i)}
                      className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-xl ring-2 transition-all md:h-16 md:w-16 ${
                        i === photoIndex ? 'ring-indigo-400 opacity-100' : 'ring-white/15 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <FastImage src={p.file_url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}









