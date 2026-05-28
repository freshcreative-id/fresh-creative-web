'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  BookOpen,
  Book,
  MessageSquare,
  Sparkles,
  Users,
  UserCircle,
  X,
  Edit3,
  Trash2,
  Lock,
  Plus,
  Minus,
  Check,
  Clock,
  Eye,
  ClipboardList,
  UserCog,
  ChevronLeft,
  ImagePlus,
} from 'lucide-react'
import { toast } from '@/lib/toast'
import { getYearbookSectionQueryUrl } from '../lib/yearbook-paths'

type AlbumClass = { id: string; name: string; sort_order?: number; student_count?: number; batch_photo_url?: string | null }
type ClassRequest = { id: string; student_name: string; email?: string | null; status: string }

export interface YearbookMobileNavProps {
  pathname?: string | null
  effectiveAlbumId: string
  isCoverView: boolean
  sidebarMode: string
  canManage: boolean
  mobileMenuOpen: boolean
  setMobileMenuOpen: (v: boolean) => void
  drawerMode?: 'navigation' | 'profile'
  joinStats: { pending_count?: number } | null
  classes: AlbumClass[]
  classIndex: number
  setClassIndex: any
  myRequestByClass: Record<string, ClassRequest | null>
  membersByClass: Record<string, unknown[]>
  myAccessByClass: Record<string, { status?: string; student_name?: string } | null>
  currentClass: AlbumClass | null
  addingClass: boolean
  setAddingClass: (v: boolean) => void
  handleUpdateClass?: (classId: string, updates: { name?: string, sort_order?: number }) => Promise<unknown>
  setDeleteClassConfirm: (v: { classId: string; className: string } | null) => void
  isOwner?: boolean
  isAlbumAdmin?: boolean
  isGlobalAdmin?: boolean
  handleJoinAsOwner?: (classId: string) => void
  newClassName?: string
  setNewClassName?: (v: string) => void
  handleAddClass?: () => void
  flipbookAccessible?: boolean
  aiLabsAccessible?: boolean
  flipbookPreviewMode?: boolean
  onSectionChange?: (section: 'cover' | 'classes' | 'approval' | 'team' | 'sambutan' | 'ai-labs' | 'flipbook' | 'preview' | 'management') => void
  backHref?: string
  backLabel?: string
}

export default function YearbookMobileNav(props: YearbookMobileNavProps) {
  const {
    pathname = null,
    effectiveAlbumId,
    isCoverView,
    sidebarMode,
    canManage,
    mobileMenuOpen,
    setMobileMenuOpen,
    drawerMode = 'navigation',
    joinStats,
    classes,
    classIndex,
    setClassIndex,
    myRequestByClass,
    membersByClass,
    myAccessByClass,
    currentClass,
    addingClass,
    setAddingClass,
    handleUpdateClass,
    setDeleteClassConfirm,
    isOwner = false,
    isAlbumAdmin = false,
    isGlobalAdmin = false,
    handleJoinAsOwner,
    newClassName = '',
    setNewClassName,
    handleAddClass,
    flipbookAccessible = true,
    aiLabsAccessible = true,
    flipbookPreviewMode = false,
    onSectionChange,
    backHref,
    backLabel,
  } = props

  const router = useRouter()
  const [mobileEditingClassId, setMobileEditingClassId] = useState<string | null>(null)
  const [mobileEditNameVal, setMobileEditNameVal] = useState('')
  const [mobileEditOrderVal, setMobileEditOrderVal] = useState(0)
  const [joinConfirmOpen, setJoinConfirmOpen] = useState(false)
  const url = (mode: 'cover' | 'classes' | 'sambutan' | 'ai-labs' | 'preview' | 'flipbook' | 'approval' | 'team') =>
    getYearbookSectionQueryUrl(effectiveAlbumId, mode, pathname)

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const aiLabsTool = searchParams?.get('tool')
  const isAiLabsToolActive = sidebarMode === 'ai-labs' && !!aiLabsTool
  const isManagementSubSection = (['classes', 'sambutan'].includes(sidebarMode) || isCoverView) && canManage
  const isProfileNav = sidebarMode === 'classes' && !isCoverView
  const hideBottomNav = isAiLabsToolActive || 
                        (sidebarMode === 'flipbook' && (flipbookPreviewMode || !canManage)) ||
                        isManagementSubSection

  const [bottomNavVisible, setBottomNavVisible] = useState(true)
  const lastScrollY = useRef(0)
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const scrollThreshold = 60
    const scrollEndDelay = 400

    const handleScroll = () => {
      const y = typeof window !== 'undefined' ? window.scrollY : 0
      const prev = lastScrollY.current
      lastScrollY.current = y

      if (prev !== undefined) {
        if (y > prev && y > scrollThreshold) {
          setBottomNavVisible(false)
        } else if (y < prev) {
          setBottomNavVisible(true)
        }
      }

      if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current)
      scrollEndTimer.current = setTimeout(() => {
        setBottomNavVisible(true)
        scrollEndTimer.current = null
      }, scrollEndDelay)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current)
    }
  }, [])

  const handleNavClick = (mode: any) => {
    if (!effectiveAlbumId) return
    if (onSectionChange) {
      onSectionChange(mode)
    } else {
      router.push(getYearbookSectionQueryUrl(effectiveAlbumId, mode, pathname), { scroll: false })
    }
  }

  return (
    <>
      {/* Mobile Bottom Navigation - Preview & Approval langsung di bar, tidak dibungkus Menu Lainnya */}
      {!hideBottomNav && (
        <div className={`fixed bottom-0 left-0 right-0 z-[60] bg-white dark:bg-slate-900 border-t-2 border-slate-900 dark:border-slate-700 flex lg:hidden items-center justify-between px-0 min-h-[3.5rem] sm:min-h-16 pb-safe safe-area-bottom transform transition-transform duration-300 ease-out ${bottomNavVisible ? 'translate-y-0' : 'translate-y-32'}`}>
          {canManage && (
            <button
              onClick={() => handleNavClick('preview')}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 active:scale-95 transition-all min-w-0 py-[3px] ${sidebarMode === 'preview' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
            >
              <Eye className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" strokeWidth={2.5} />
              <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-center truncate w-full px-0.5">Preview</span>
            </button>
          )}

          <button
            onClick={() => handleNavClick(canManage ? 'management' : 'classes')}
            className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 active:scale-95 transition-all min-w-0 py-[3px] ${(['classes', 'sambutan', 'management'].includes(sidebarMode) || isCoverView) ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
          >
            <Edit3 className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" strokeWidth={2.5} />
            <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-center truncate w-full px-0.5">Edit</span>
          </button>

          <div className="flex-1 flex items-center justify-center relative min-w-0 py-[3px]">
            <button
              onClick={() => handleNavClick('ai-labs')}
              className={`absolute -top-5 sm:-top-7 w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shadow-[0_1.5px_0_0_#0f172a] sm:shadow-[0_6px_0_0_#0f172a] dark:shadow-[0_1.5px_0_0_#334155] sm:dark:shadow-[0_6px_0_0_#334155] active:shadow-none active:translate-y-0.5 sm:active:translate-y-1 transition-all border-2 border-slate-900 dark:border-slate-700 ${sidebarMode === 'ai-labs'
                ? 'bg-amber-300 dark:bg-amber-600 text-slate-900 dark:text-white'
                : 'bg-indigo-500 text-white'
                }`}
            >
              <div className="relative">
                <Sparkles className="w-5 h-5 sm:w-7 sm:h-7" strokeWidth={2.5} />
                {!aiLabsAccessible && (
                  <Lock className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 text-slate-900 dark:text-white" strokeWidth={3} />
                )}
              </div>
            </button>
            <span className={`text-[8px] sm:text-[9px] font-black uppercase tracking-widest mt-7 sm:mt-9 ${sidebarMode === 'ai-labs' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`}>
              AI Labs
            </span>
          </div>

          <button
            onClick={() => handleNavClick('flipbook')}
            className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 active:scale-95 transition-all min-w-0 relative py-[3px] ${sidebarMode === 'flipbook' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
          >
            <div className="relative">
              <Book className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" strokeWidth={2.5} />
              {!flipbookAccessible && (
                <Lock className="w-2 h-2 sm:w-2.5 sm:h-2.5 absolute -top-0.5 -right-0.5 text-slate-900 dark:text-white" strokeWidth={3} />
              )}
            </div>
            <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-center truncate w-full px-0.5">Flipbook</span>
          </button>

          {canManage && (
            <button
              onClick={() => handleNavClick('approval')}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 active:scale-95 transition-all relative min-w-0 py-[3px] ${sidebarMode === 'approval' || sidebarMode === 'team' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
            >
              <div className="relative">
                <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" strokeWidth={2.5} />
                {joinStats && joinStats.pending_count > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 flex h-2.5 w-2.5 sm:h-3 sm:w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-red-500 border-2 border-white" />
                  </span>
                )}
              </div>
              <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest truncate w-full px-0.5">Akses</span>
            </button>
          )}
        </div>
      )}

      {/* Mobile Class Drawer */}
      {mobileMenuOpen && (
        <>
          <div className="fixed inset-0 z-[65] bg-slate-900/60 backdrop-blur-sm lg:hidden animate-in fade-in duration-200" onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-[70] w-3/4 max-w-[280px] bg-white dark:bg-slate-900 border-r-4 border-slate-900 dark:border-slate-700 flex flex-col shadow-2xl lg:hidden animate-in slide-in-from-left duration-300">
            <div className="p-5 border-b-2 border-slate-100 dark:border-slate-700 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-[0.2em]">
                  {drawerMode === 'profile' ? 'Profil' : 'Daftar Kelas'}
                </h2>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white active:bg-slate-50 dark:active:bg-slate-700 transition-all"
                >
                  <X className="w-4 h-4" strokeWidth={3} />
                </button>
              </div>

              {/* Profile Info Card removed as requested - Status moved to bottom */}

              {/* Profile Mode Header Space */}
              {drawerMode === 'profile' && <div className="h-2" />}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* NAVIGATION MODE (Hamburger Dalam): Show Classes ONLY */}
              {drawerMode === 'navigation' && (
                <div className="space-y-6">
                  {/* Registration Prompt for Owners */}
                  {(() => {
                    if (!currentClass) return null
                    const access = Object.values(myAccessByClass).some(a => a?.status === 'approved')
                    if (canManage && !access) {
                      return (
                        <div className="px-1">
                          <div className="p-4 bg-indigo-50 dark:bg-indigo-950/30 border-2 border-slate-900 dark:border-slate-800 rounded-2xl text-center space-y-3">
                            <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-tight">
                              Anda owner album. Daftar di kelas {currentClass.name}?
                            </p>
                            <button
                              onClick={() => setJoinConfirmOpen(true)}
                              className="w-full py-2 bg-indigo-500 text-white text-[10px] font-black uppercase rounded-xl border-2 border-slate-900 shadow-[2px_2px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all"
                            >
                              Daftar
                            </button>
                          </div>
                        </div>
                      )
                    }
                    return null
                  })()}
                  {/* Classes List Section */}
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {classes.map((c, idx) => {
                        const access = myAccessByClass[c.id]
                        if (!canManage && access?.status !== 'approved') return null
                        const isActive = idx === classIndex
                        const isEditing = mobileEditingClassId === c.id

                        if (isEditing) {
                          return (
                            <div key={c.id} className="w-full flex flex-col gap-4 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border-2 border-slate-900 dark:border-slate-700 animate-in zoom-in-95 duration-200">
                              <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Nama Kelas</label>
                                <input
                                  type="text"
                                  value={mobileEditNameVal}
                                  onChange={(e) => setMobileEditNameVal(e.target.value)}
                                  className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 text-sm font-bold text-slate-900 dark:text-white focus:outline-none"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      if (handleUpdateClass && mobileEditNameVal.trim()) {
                                        handleUpdateClass(c.id, { name: mobileEditNameVal.trim(), sort_order: mobileEditOrderVal })
                                        setMobileEditingClassId(null)
                                      }
                                    }
                                    if (e.key === 'Escape') setMobileEditingClassId(null)
                                  }}
                                />
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Urutan Kelas</label>
                                <div className="flex items-center justify-between gap-1.5 bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl p-0.5 w-full">
                                  <button
                                    type="button"
                                    onClick={() => setMobileEditOrderVal(Math.max(0, mobileEditOrderVal - 1))}
                                    disabled={mobileEditOrderVal === 0}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white disabled:opacity-20"
                                  >
                                    <Minus className="w-3.5 h-3.5" strokeWidth={3} />
                                  </button>
                                  <div className="px-2 text-center flex-1">
                                    <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">{mobileEditOrderVal + 1}</span>
                                    <span className="text-[10px] text-slate-300 dark:text-slate-500 font-black tracking-tighter ml-1">/ {classes.length}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setMobileEditOrderVal(Math.min(classes.length - 1, mobileEditOrderVal + 1))}
                                    disabled={mobileEditOrderVal >= classes.length - 1}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white disabled:opacity-20"
                                  >
                                    <Plus className="w-3.5 h-3.5" strokeWidth={3} />
                                  </button>
                                </div>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    if (handleUpdateClass && mobileEditNameVal.trim()) {
                                      handleUpdateClass(c.id, { name: mobileEditNameVal.trim(), sort_order: mobileEditOrderVal })
                                      setMobileEditingClassId(null)
                                    }
                                  }}
                                  className="flex-1 py-3 bg-indigo-500 text-white text-[10px] font-black uppercase rounded-xl border-2 border-slate-900 shadow-[2px_2px_0_0_#000]"
                                >
                                  Simpan
                                </button>
                                <button
                                  onClick={() => setMobileEditingClassId(null)}
                                  className="flex-1 py-3 bg-white dark:bg-slate-800 text-slate-400 text-[10px] font-black uppercase rounded-xl border-2 border-slate-900"
                                >
                                  Batal
                                </button>
                              </div>
                            </div>
                          )
                        }

                        return (
                          <div key={c.id} className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setClassIndex(idx)
                                setMobileMenuOpen(false)
                                if (sidebarMode !== 'classes') {
                                  if (onSectionChange) onSectionChange('classes')
                                  else if (effectiveAlbumId) router.push(getYearbookSectionQueryUrl(effectiveAlbumId, 'classes', pathname))
                                }
                              }}
                              className={`flex-1 flex items-center justify-between p-3 rounded-2xl border-2 transition-all ${isActive && sidebarMode === 'classes' ? 'bg-amber-300 border-slate-900 shadow-[1.5px_1.5px_0_0_#334155] -translate-y-0.5' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:bg-slate-50'}`}
                            >
                              <span className="text-xs font-black uppercase tracking-tight truncate">{c.name}</span>
                            </button>

                            {canManage && (
                              <div className="flex flex-row gap-1 shrink-0">
                                <button
                                  onClick={() => {
                                    setMobileEditingClassId(c.id)
                                    setMobileEditNameVal(c.name)
                                    setMobileEditOrderVal(idx)
                                  }}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white active:scale-95 transition-all"
                                >
                                  <Edit3 className="w-3.5 h-3.5" strokeWidth={3} />
                                </button>
                                <button
                                  onClick={() => setDeleteClassConfirm && setDeleteClassConfirm({ classId: c.id, className: c.name })}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 text-red-500 active:scale-95 transition-all"
                                >
                                  <Trash2 className="w-3.5 h-3.5" strokeWidth={3} />
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {canManage && (
                      <button
                        onClick={() => setAddingClass(true)}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 text-[10px] font-black uppercase tracking-widest hover:border-slate-400 hover:text-slate-500 transition-all"
                      >
                        <Plus className="w-4 h-4" strokeWidth={3} /> Tambah Kelas
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* PROFILE MODE: Role Badge */}
              {drawerMode === 'profile' && (
                <div className="py-12 flex flex-col items-center justify-center space-y-5 animate-in fade-in zoom-in-95 duration-500">
                  <div className="relative">
                    <div className="w-24 h-24 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto border-4 border-slate-900 dark:border-slate-700">
                      <UserCircle className="w-12 h-12 text-slate-900 dark:text-white" strokeWidth={1.5} />
                    </div>
                    <div className="absolute -bottom-1 -right-1 bg-amber-400 dark:bg-amber-600 border-2 border-slate-900 dark:border-slate-700 rounded-lg px-2 py-0.5 shadow-sm">
                      <UserCog className="w-3.5 h-3.5 text-slate-900 dark:text-white" />
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-1">Status Anda</p>
                    <div className="inline-block px-4 py-2 rounded-2xl bg-slate-900 dark:bg-slate-700 border-2 border-black dark:border-slate-600 shadow-[3px_3px_0_0_#334155] dark:shadow-none">
                      <span className="text-xs font-black text-white uppercase tracking-widest">
                        {(() => {
                          if (isGlobalAdmin) return 'Admin Global'
                          if (isAlbumAdmin) return 'Admin Album'
                          if (isOwner) return 'Owner Album'
                          const hasApproved = Object.values(myAccessByClass).some(a => a?.status === 'approved')
                          if (hasApproved) return 'Anggota'
                          return 'Tamu'
                        })()}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Section */}
            <div className="mt-auto p-4 border-t-4 border-slate-900 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-4">
              {/* Global Registration Status */}
              {(() => {
                const approvedEntry = (Object.entries(myAccessByClass) as [string, any][]).find(([_, a]) => a?.status === 'approved')
                const approvedClassId = approvedEntry?.[0]
                const approvedAccess = approvedEntry?.[1]
                const className = classes.find(c => c.id === approvedClassId)?.name
                
                if (!approvedAccess) {
                  if (canManage) {
                    return (
                      <div className="p-3 bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-900/50 rounded-2xl flex flex-col gap-1.5 text-center">
                        <p className="text-[10px] font-black text-red-500 dark:text-red-400 uppercase tracking-tight">
                          Kamu belum terdaftar di kelas manapun.
                        </p>
                      </div>
                    )
                  }
                  return null
                }

                return (
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 border-2 border-indigo-200 dark:border-indigo-800 rounded-2xl flex flex-col gap-1.5">
                    <p className="text-[9px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest leading-none">Status Anda:</p>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <Check className="w-3 h-3 text-indigo-600 dark:text-indigo-400" strokeWidth={4} />
                        <span className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-tight truncate">
                          {approvedAccess.student_name}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-tight pl-5">
                        Terdaftar di {className ?? 'Kelas Lain'}
                      </span>
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Exit Album Button at the very bottom - ONLY in Profile Mode */}
            {drawerMode === 'profile' && (
              <div className="p-4 pt-0 bg-slate-50 dark:bg-slate-800/50">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false)
                    router.push(backHref || '/user/albums')
                  }}
                  className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-red-50 dark:bg-red-950/20 border-2 border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={4} />
                  <span>Keluar Album</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Konfirmasi daftar kelas (owner) */}
      {joinConfirmOpen && currentClass && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/50 backdrop-blur-md flex items-center justify-center z-[300] p-4">
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-[32px] p-6 sm:p-8 max-w-sm w-full shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] text-center">
            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Daftar di Kelas</h3>
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-6">
              Yakin daftar di kelas ini? Anda hanya bisa terdaftar di 1 kelas.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setJoinConfirmOpen(false)}
                className="flex-1 py-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-black uppercase tracking-widest shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (handleJoinAsOwner) handleJoinAsOwner(currentClass.id)
                  setJoinConfirmOpen(false)
                  setMobileMenuOpen(false)
                }}
                className="flex-1 py-3.5 rounded-xl bg-indigo-500 text-white border-2 border-slate-900 dark:border-slate-700 text-xs font-black uppercase tracking-widest shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
              >
                Ya, Daftar
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  )
}










