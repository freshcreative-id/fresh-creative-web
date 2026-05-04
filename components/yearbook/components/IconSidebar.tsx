'use client'

import React from 'react'
import Link from 'next/link'
import { Sparkles, ClipboardList, Book, Eye, Lock, Edit3 } from 'lucide-react'
import { getYearbookSectionQueryUrl } from '../lib/yearbook-paths'

type SectionMode = 'classes' | 'approval' | 'team' | 'sambutan' | 'ai-labs' | 'flipbook' | 'preview'

interface IconSidebarProps {
  pathname?: string | null
  albumId: string
  isCoverView: boolean
  sidebarMode: string
  setSidebarMode?: (mode: SectionMode) => void
  setView?: (view: 'cover' | 'classes' | 'gallery') => void
  onSectionChange?: (section: SectionMode) => void
  canManage: boolean
  requestsByClass: Record<string, any[]>
  flipbookAccessible?: boolean
  aiLabsAccessible?: boolean
  loading?: boolean
}

const linkClass = (active: boolean) =>
  `flex-shrink-0 flex flex-col items-center justify-center gap-1.5 py-4 border-b-2 border-slate-900 dark:border-slate-700 text-[10px] font-black uppercase tracking-tight transition-all w-full ${active
    ? 'bg-amber-400 dark:bg-amber-600 text-slate-900 dark:text-white'
    : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10'
  }`

function IconSidebarInner({
  pathname = null,
  albumId,
  isCoverView,
  sidebarMode,
  canManage,
  requestsByClass,
  onSectionChange,
  flipbookAccessible = true,
  aiLabsAccessible = true,
  loading = false,
}: IconSidebarProps) {
  const pendingCount = Object.values(requestsByClass).flat().length
  const url = (mode: Parameters<typeof getYearbookSectionQueryUrl>[1]) => getYearbookSectionQueryUrl(albumId, mode, pathname)

  const handleClick = (section: SectionMode) => (e: React.MouseEvent) => {
    if (onSectionChange) {
      e.preventDefault()
      onSectionChange(section)
    }
  }

  if (loading) return null

  return (
    <div className="hidden lg:fixed lg:left-0 lg:top-14 lg:w-16 lg:h-[calc(100vh-3.5rem)] lg:flex flex-col lg:z-40 lg:bg-white lg:dark:bg-slate-900 lg:border-r-2 lg:border-slate-900 lg:dark:border-slate-700 lg:shadow-[2px_0_0_0_#0f172a] lg:dark:shadow-[2px_0_0_0_#334155] animate-in fade-in slide-in-from-left-4 duration-500">
      {canManage && (
        <a href={url('preview')} className={linkClass(sidebarMode === 'preview')} title="Preview Album" onClick={handleClick('preview')}>
          <Eye className="w-6 h-6" strokeWidth={2.5} />
          <span>Preview</span>
        </a>
      )}
      <a href={url('ai-labs')} className={`relative ${linkClass(sidebarMode === 'ai-labs')}`} title="AI Labs" onClick={handleClick('ai-labs')}>
        <div className="relative">
          <Sparkles className="w-6 h-6" strokeWidth={2.5} />
          {!aiLabsAccessible && (
            <Lock className="w-3.5 h-3.5 absolute -top-1.5 -right-1.5 text-purple-600 dark:text-purple-400 bg-white dark:bg-slate-800 rounded-full p-0.5 border border-slate-900 dark:border-slate-700 shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b]" />
          )}
        </div>
        <span>AI Labs</span>
      </a>
      <a href={url('classes')} className={linkClass((['classes', 'sambutan', 'cover'].includes(sidebarMode) || isCoverView))} title="Edit Konten" onClick={handleClick('classes')}>
        <Edit3 className="w-6 h-6" strokeWidth={2.5} />
        <span>Edit</span>
      </a>
      <a href={url('flipbook')} className={`relative ${linkClass(sidebarMode === 'flipbook')}`} title="Flipbook" onClick={handleClick('flipbook')}>
        <div className="relative">
          <Book className="w-6 h-6" strokeWidth={2.5} />
          {!flipbookAccessible && (
            <Lock className="w-3.5 h-3.5 absolute -top-1.5 -right-1.5 text-amber-600 dark:text-amber-400 bg-white dark:bg-slate-800 rounded-full p-0.5 border border-slate-900 dark:border-slate-700 shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b]" />
          )}
        </div>
        <span>Flipbook</span>
      </a>
      {canManage && (
        <a href={url('approval')} className={`relative ${linkClass(sidebarMode === 'approval')}`} title="Kelola Approval" onClick={handleClick('approval')}>
          <ClipboardList className="w-6 h-6" strokeWidth={2.5} />
          <span>Approval</span>
          {pendingCount > 0 && (
            <span className="absolute top-3 right-3 flex h-3 w-3 rounded-full bg-red-500 border-2 border-slate-900 dark:border-slate-700 shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] animate-pulse" />
          )}
        </a>
      )}
    </div>
  )
}

export default React.memo(IconSidebarInner)
