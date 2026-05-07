'use client'

import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Edit3, Trash2, ImagePlus, Video, Play, Briefcase, MessageSquare, X, ChevronLeft, ChevronRight, Quote } from 'lucide-react'
import FastImage from '@/components/ui/FastImage'

/** Strip surrounding quote characters (straight & curly) so the UI can add its own consistently */
function stripQuotes(s: string): string {
  return s.replace(/^["""\u201C\u201D]+/, '').replace(/["""\u201C\u201D]+$/, '').trim()
}

type Teacher = {
  id: string
  name: string
  title?: string
  message?: string
  photo_url?: string
  video_url?: string
  sort_order?: number
  photos?: { id: string; file_url: string; sort_order: number }[]
}

type TeacherCardProps = {
  teacher: Teacher
  isOwner: boolean
  isFlipped: boolean
  onStartEdit: (teacher: Teacher) => void
  onCancelEdit: () => void
  onSave: (updatedData: {
    name: string
    title: string
    message: string
    video_url: string
    pendingPhotos?: File[]
    pendingVideo?: File | null
  }) => void
  onDelete: (teacherId: string) => void
  onDeletePhoto: (teacherId: string, photoId: string) => void
  onPlayVideo: (videoUrl: string) => void
  onClickPhoto?: (teacher: Teacher, photoIndex: number) => void
  savingTeacher: boolean
}

export default function TeacherCard({
  teacher,
  isOwner,
  isFlipped,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onDeletePhoto,
  onPlayVideo,
  onClickPhoto,
  savingTeacher
}: TeacherCardProps) {
  const [showPhotoViewer, setShowPhotoViewer] = useState(false)
  const [photoIndex, setPhotoIndex] = useState(0)
  // Edit form state
  const [editName, setEditName] = useState(teacher.name || '')
  const [editTitle, setEditTitle] = useState(teacher.title || '')
  const [editMessage, setEditMessage] = useState(teacher.message || '')
  const [editVideoUrl, setEditVideoUrl] = useState(teacher.video_url || '')
  const [localConfirm, setLocalConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null)
  const [isLandscape, setIsLandscape] = useState(false)

  // Pending (staged) files - not uploaded until Save
  const [pendingPhotos, setPendingPhotos] = useState<{ file: File; previewUrl: string }[]>([])
  const [pendingVideo, setPendingVideo] = useState<{ file: File; previewUrl: string } | null>(null)
  const photoInputRef = React.useRef<HTMLInputElement>(null)
  const videoInputRef = React.useRef<HTMLInputElement>(null)

  // Reset form when teacher data changes or card flips
  useEffect(() => {
    setEditName(teacher.name || '')
    setEditTitle(teacher.title || '')
    setEditMessage(teacher.message || '')
    setEditVideoUrl(teacher.video_url || '')
  }, [teacher])

  // Cleanup blob URLs on unmount or when pending files change
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
    onSave({
      name: editName,
      title: editTitle,
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
    const totalPhotos = (teacher.photos?.length || 0) + pendingPhotos.length
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

  // Combined photos: existing + pending previews (for display in edit form)
  const existingPhotos = teacher.photos || []
  const allDisplayPhotos = [
    ...existingPhotos.map(p => ({ id: p.id, file_url: p.file_url, isPending: false })),
    ...pendingPhotos.map((p, i) => ({ id: `pending-${i}`, file_url: p.previewUrl, isPending: true })),
  ]

  return (
    <>
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
      {typeof document !== 'undefined' && localConfirm && createPortal(
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/50 backdrop-blur-md flex items-center justify-center z-[100] p-4" onClick={() => setLocalConfirm(null)}>
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-[32px] p-6 sm:p-8 max-w-sm w-full shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] text-center" onClick={e => e.stopPropagation()}>
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
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Match MemberCard proportions so grid feels consistent */}
      <div className="relative w-full aspect-[1/2] min-h-0 group" style={{ perspective: '1200px' }}>
        <div
          style={{
            transformStyle: 'preserve-3d',
            transition: 'transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1)',
            transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
          }}
          className="relative w-full h-full"
        >
          {/* ================= FRONT SIDE ================= */}
          <div
            className="relative w-full h-full backface-hidden rounded-2xl border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b]  transition-all duration-300 flex flex-col overflow-hidden"
            style={{ backfaceVisibility: 'hidden' }}
          >
            {/* Photo section */}
            <div className="relative aspect-[4/5] overflow-hidden bg-slate-50 dark:bg-slate-800 flex-shrink-0 border-b-4 border-slate-900 dark:border-slate-700">
              {(teacher.photos && teacher.photos.length > 0 || teacher.photo_url) ? (
                <FastImage
                  src={teacher.photos && teacher.photos.length > 0 ? teacher.photos[0].file_url : teacher.photo_url}
                  alt={teacher.name}
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
                    const hasPhotos = (teacher.photos && teacher.photos.length > 0) || teacher.photo_url
                    if (hasPhotos) {
                      setPhotoIndex(0)
                      setShowPhotoViewer(true)
                      if (onClickPhoto) onClickPhoto(teacher, 0)
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

              {/* Video Play Button Overlay */}
              {teacher.video_url && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onPlayVideo(teacher.video_url!)
                  }}
                  className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-indigo-400 dark:bg-indigo-600 text-white border-2 border-slate-900 dark:border-slate-600 flex items-center justify-center transition-all shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
                  title="Putar Video"
                >
                  <Play className="w-5 h-5 ml-1" fill="currentColor" />
                </button>
              )}
            </div>

            {/* Profile info section */}
            <div className="flex flex-col flex-1 p-4 bg-white dark:bg-slate-900">
              {/* Name & Title Group */}
              <div className="mb-2.5 flex flex-col">
                <h3 className="font-black text-slate-900 dark:text-white text-base leading-tight line-clamp-1 break-words pb-0.5 uppercase tracking-tight">
                  {teacher.name}
                </h3>
                {teacher.title && (
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] line-clamp-1 flex items-center gap-2 font-black uppercase tracking-widest mt-0.5">
                    <Briefcase className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0" strokeWidth={2.5} />
                    {teacher.title}
                  </p>
                )}
              </div>

              {/* Message Block */}
              {teacher.message && (
                <div className="mt-3.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 relative flex-1 flex flex-col min-h-0 shadow-[1px_1px_0_0_rgba(15,23,42,0.1)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.3)]">
                  <Quote className="absolute -top-2 -left-2 w-5 h-5 text-slate-900 dark:text-slate-300 bg-white dark:bg-slate-800 rounded-full p-1 border-2 border-slate-900 dark:border-slate-600" />
                  <p className="italic font-bold text-slate-600 dark:text-slate-300 leading-snug text-xs line-clamp-3 pl-1 pt-0.5">
                    "{stripQuotes(teacher.message)}"
                  </p>
                </div>
              )}
            </div>

            {/* Action buttons (Bottom) */}
            {isOwner && (
              <div className="px-3 pb-3 mt-auto bg-white dark:bg-slate-900 flex-shrink-0">
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onStartEdit(teacher)
                    }}
                    className="flex-1 text-[10px] font-black uppercase tracking-widest rounded-xl bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-2 border-indigo-700 dark:border-indigo-600 hover:bg-indigo-700 hover:text-white transition-all flex items-center justify-center gap-2 py-2 shadow-[1px_1px_0_0_rgba(67,56,202,0.28)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLocalConfirm({
                        title: 'Hapus Guru',
                        message: `Hapus "${teacher.name}" dari daftar?`,
                        onConfirm: () => onDelete(teacher.id)
                      })
                    }}
                    className="flex-1 text-[10px] font-black uppercase tracking-widest rounded-xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 border-2 border-red-600 dark:border-red-700 hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-2 py-2 shadow-[1px_1px_0_0_rgba(220,38,38,0.28)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
                    title="Hapus guru"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Hapus
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ================= BACK SIDE (EDIT FORM) ================= */}
          <div
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)'
            }}
            className="absolute inset-0 w-full h-full flex flex-col rounded-2xl border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b-4 border-slate-900 dark:border-slate-700 bg-amber-300 dark:bg-amber-600 flex items-center gap-3 flex-shrink-0">
              <button type="button" className="w-8 h-8 rounded-lg border-2 border-slate-900 dark:border-slate-600 hover:bg-white/20 dark:hover:bg-slate-800/50 flex items-center justify-center bg-white dark:bg-slate-800 shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all" onClick={onCancelEdit}>
                <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
              </button>
              <h3 className="text-slate-900 dark:text-white font-black text-xs uppercase tracking-widest">Edit Guru</h3>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <div>
                <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-1 block">Nama Guru</label>
                <input
                  type="text"
                  value={editName || ''}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nama Guru"
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-1 block">Jabatan</label>
                <input
                  type="text"
                  value={editTitle || ''}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Jabatan Guru (mis: Wali Kelas)"
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>

              {/* Photo Preview & Upload */}
              <div className="pt-1">
                <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-2 block">Foto Galeri (Maks 4)</label>
                {allDisplayPhotos.length > 0 && (
                  <div className="flex gap-3 flex-wrap mb-3">
                    {allDisplayPhotos.map((photo, idx) => (
                      <div key={photo.id} className="relative w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-xl flex-shrink-0 border-2 border-slate-900 dark:border-slate-600 shadow-[1px_1px_0_0_rgba(15,23,42,0.13)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.36)]">
                        {photo.isPending && (
                          <div className="absolute -top-2 -left-2 bg-emerald-400 text-slate-900 text-[8px] font-black px-1.5 py-0.5 rounded-lg border-2 border-slate-900 z-10 shadow-[1px_1px_0_0_rgba(15,23,42,0.14)] uppercase">BARU</div>
                        )}
                        <FastImage
                          src={photo.file_url}
                          alt={`${teacher.name} ${idx + 1}`}
                          className="w-full h-full object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => {
                            setPhotoIndex(idx)
                            setShowPhotoViewer(true)
                            if (!photo.isPending && onClickPhoto) onClickPhoto(teacher, idx)
                          }}
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (photo.isPending) {
                              removePendingPhoto(idx - existingPhotos.length)
                            } else {
                              setLocalConfirm({ title: 'Hapus Foto', message: `Hapus foto ini?`, onConfirm: () => onDeletePhoto(teacher.id, photo.id) })
                            }
                          }}
                          className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-[1px_1px_0_0_rgba(15,23,42,0.14)] hover:bg-red-600 transition-all z-20 border-2 border-slate-900 active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
                        >
                          <X className="w-4 h-4" strokeWidth={3} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pending video preview */}
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
                    disabled={allDisplayPhotos.length >= 4}
                    className="flex-1 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase bg-emerald-100 text-emerald-700 border-2 border-emerald-700 hover:bg-emerald-700 hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-[1px_1px_0_0_rgba(4,120,87,0.28)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
                  >
                    <ImagePlus className="w-4 h-4" /> Foto ({(allDisplayPhotos.length)}/4)
                  </button>
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    className="flex-1 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase bg-sky-100 text-sky-700 border-2 border-sky-700 hover:bg-sky-700 hover:text-white transition-all flex items-center justify-center gap-2 shadow-[1px_1px_0_0_rgba(3,105,161,0.28)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
                  >
                    <Video className="w-4 h-4" /> Video
                  </button>
                </div>
              </div>

              {/* Video URL Input */}
              <div className="pt-1">
                <label className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-1 block">Link Video (YouTube/Lainnya)</label>
                <input
                  type="url"
                  value={editVideoUrl || ''}
                  onChange={(e) => setEditVideoUrl(e.target.value)}
                  placeholder="Link Video Eksternal"
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>

              {/* Message Textarea */}
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

            {/* Save & Cancel buttons */}
            <div className="px-4 py-3 bg-white dark:bg-slate-900 border-t-4 border-slate-900 dark:border-slate-700 flex gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={handleSave}
                disabled={savingTeacher}
                className="flex-[2] px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-indigo-500 text-white hover:bg-indigo-600 transition-all border-2 border-slate-900 dark:border-slate-600 shadow-[1px_1px_0_0_rgba(15,23,42,0.1)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.3)] active:shadow-none active:translate-x-1 active:translate-y-1 disabled:opacity-50 flex items-center justify-center"
              >
                {savingTeacher ? 'Loading...' : 'Simpan'}
              </button>
              <button
                type="button"
                onClick={onCancelEdit}
                className="flex-1 px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border-2 border-slate-900 dark:border-slate-600 shadow-[1px_1px_0_0_rgba(15,23,42,0.1)] dark:shadow-[1px_1px_0_0_rgba(51,65,85,0.3)] active:shadow-none active:translate-x-1 active:translate-y-1"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
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
                {allDisplayPhotos.length > 0 ? `${photoIndex + 1} / ${allDisplayPhotos.length}` : '0'}
              </span>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col">
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 py-3 md:px-6">
              {allDisplayPhotos.length > 0 ? (
                <>
                  {allDisplayPhotos.length > 1 && (
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
                        src={allDisplayPhotos[photoIndex].file_url}
                        alt=""
                        className="max-h-[min(78vh,calc(100dvh-9rem))] w-auto max-w-full object-contain"
                        priority
                      />
                    </div>
                  </div>
                  {allDisplayPhotos.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPhotoIndex(i => Math.min(allDisplayPhotos.length - 1, i + 1))}
                      disabled={photoIndex >= allDisplayPhotos.length - 1}
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

            {allDisplayPhotos.length > 1 && (
              <div className="shrink-0 border-t-2 border-slate-900 bg-black/50 px-3 py-3 backdrop-blur-md">
                <div className="mx-auto flex max-w-5xl gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {allDisplayPhotos.map((p, i) => (
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









