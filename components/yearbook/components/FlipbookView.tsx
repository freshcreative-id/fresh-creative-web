'use client'

import React from 'react'
import ManualFlipbookViewer from './ManualFlipbookViewer'
import LayoutEditor from './FlipbookLayoutEditor'

interface FlipbookViewProps {
  album: { id: string;[key: string]: unknown } | null
  manualPages: any[]
  canManage: boolean
  flipbookPreviewMode: boolean
  onPlayVideo: (url: string) => void
  onUpdateAlbum?: any
  fullscreenRootRef?: React.RefObject<HTMLElement | null>
}

export default function FlipbookView({
  album,
  manualPages,
  canManage,
  flipbookPreviewMode,
  onPlayVideo,
  onUpdateAlbum,
  fullscreenRootRef,
}: FlipbookViewProps) {
  // Keep editor mounted so switching preview <-> editor feels instant.
  // Previously the editor unmounted in preview mode, causing refetch and blank flash.
  const showPreview = flipbookPreviewMode || !canManage
  const showEditor = canManage

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden relative bg-white dark:bg-slate-950">
      <div className={`${showPreview ? 'flex' : 'hidden'} flex-1 min-h-0 flex-col p-0`}>
          <ManualFlipbookViewer 
            pages={manualPages} 
            onPlayVideo={onPlayVideo} 
            className="w-full h-full" 
            albumId={album?.id}
            fullscreenRootRef={fullscreenRootRef}
            isEditorView={canManage && !flipbookPreviewMode} 
            isVisible={showPreview} 
            // Admin preview shell has a taller header; nudge book slightly down in preview only.
            centerNudgeDownPxMobile={flipbookPreviewMode ? 6 : undefined}
            centerNudgeDownPxDesktop={flipbookPreviewMode ? 8 : undefined}
            // Use the same spacing preset as public so preview matches public.
            chromePaddingYExtraMobile={flipbookPreviewMode ? 10 : undefined}
            chromePaddingYExtraDesktop={flipbookPreviewMode ? 24 : undefined}
            chromePaddingXExtraMobile={flipbookPreviewMode ? -8 : undefined}
            chromePaddingXExtraDesktop={flipbookPreviewMode ? 0 : undefined}
          />
      </div>
      <div
        className={`${showEditor && !flipbookPreviewMode ? 'flex' : 'hidden'} flex-1 min-h-0 pb-[calc(3.5rem+env(safe-area-inset-bottom)+8px)] lg:pb-0`}
      >
        <LayoutEditor
          album={album}
          onPlayVideo={onPlayVideo}
          onUpdateAlbum={onUpdateAlbum}
          canManage={canManage}
        />
      </div>
    </div>
  )
}











