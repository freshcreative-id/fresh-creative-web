'use client'

import * as ReactGlobal from 'react'
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import FilerobotImageEditor, { TABS, TOOLS } from 'react-filerobot-image-editor'
import { TOOLS_ITEMS } from 'react-filerobot-image-editor/lib/components/tools/tools.constants'
import { clsx } from 'clsx'
import { Upload, X, Wand2, Loader2 } from 'lucide-react'
import { fetchWithAuth } from '@/lib/api-client'
import { asObject, asString } from '@/components/yearbook/utils/response-narrowing'
import { createEditorConfig } from './filter-ui/editorConfig'
import { buildRemoveBgObjectRemovalTool } from './remove-bg-filerobot-tools'
import { compositeForegroundOnImageBg, compositeForegroundOnSolid } from './composite-bg'

// Some builds of react-filerobot-image-editor/konva expect global React.
if (typeof window !== 'undefined') {
  ;(window as any).React = (window as any).React ?? ReactGlobal

  // Suppress Filerobot's internal styled-components passing non-boolean / unknown props onto DOM elements.
  // React passes warnings as printf-style calls: args[0] = format string, args[1..n] = substitution values.
  // We must join all args into one flat string so that prop names (passed as separate args) are also matched.
  const originalConsoleError = console.error
  console.error = (...args: any[]) => {
    const combined = args
      .map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.message : ''))
      .join(' ')
    const isIgnoredWarning =
      combined.includes('for a non-boolean attribute `active`') ||
      combined.includes('non-boolean attribute') && combined.includes('active') ||
      // React "does not recognize" warnings for Filerobot/Scaleflex internal props
      (combined.includes('React does not recognize') &&
        (combined.includes('disableHover') ||
          combined.includes('isCollapsed') ||
          combined.includes('isAccordion') ||
          combined.includes('noWrap') ||
          combined.includes('watermarkTool') ||
          combined.includes('showTabsDrawer') ||
          combined.includes('active')))
    if (isIgnoredWarning) return
    originalConsoleError.apply(console, args)
  }

  // Force Filerobot to render standard Tabs instead of Hamburger Menu Drawer for mobile
  // by overriding window.matchMedia just for its internal mobile breakpoints (max-width: 760px).
  // We'll style it to act as a bottom navbar using CSS below.
  const originalMatchMedia = window.matchMedia
  window.matchMedia = (query) => {
    if (query.includes('max-width: 760px') || query.includes('max-width: 768px')) {
      return {
        ...originalMatchMedia(query),
        matches: false, // Force desktop layout internally so TabsNavbar mounts
      } as MediaQueryList
    }
    return originalMatchMedia(query)
  }
}

function createDownloadLink(dataUrl: string, filename: string) {
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return await res.blob()
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Gagal membaca hasil gambar.'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(blob)
  })
}

function validateImageFile(file: File): void {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select a valid image file')
  }
  const maxSize = 10 * 1024 * 1024 // 10MB
  if (file.size > maxSize) {
    throw new Error('Image size must be less than 10MB')
  }
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Please select a JPEG, PNG, GIF, or WebP image')
  }
}

// ============== UI Components from Github (Button, LoadingSpinner) ==============

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
}

const Button: React.FC<ButtonProps> = ({ variant = 'primary', children, className, ...props }) => {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center px-5 py-2.5 rounded-xl font-black text-[13px] uppercase tracking-widest border-2 transition-all touch-manipulation',
        'shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_rgba(255,255,255,0.15)]',
        'hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
        {
          'bg-indigo-500 dark:bg-indigo-500 border-slate-200 dark:border-white/30 text-white hover:bg-indigo-400 dark:hover:bg-indigo-400': variant === 'primary',
          'bg-white dark:bg-slate-800 border-slate-200 dark:border-white/30 text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700': variant === 'secondary',
        },
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex items-center justify-center p-4">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
      <span className="ml-3 text-slate-500 dark:text-slate-400 text-sm font-medium">Memproses...</span>
    </div>
  )
}

// ============== Filerobot editor: Remove BG uses native AI tab + tools override ==============

interface EditorProps {
  imageUrl: string
  onClose: () => void
  onSave: (editedImageUrl: string) => void
  handleRemoveBg: () => Promise<void>
  removeBgState: 'idle' | 'removing' | 'error'
  creditsPerRemoveBg: number | null
  currentCredits: number | null
  hasRemovedBg: boolean
  onRequestBgUpload: () => void
  onPickSolidColor: (hex: string) => void
  onRestoreTransparent: () => void
}

const ImageEditor: React.FC<EditorProps> = ({
  imageUrl,
  onClose,
  onSave,
  handleRemoveBg,
  removeBgState,
  creditsPerRemoveBg,
  currentCredits,
  hasRemovedBg,
  onRequestBgUpload,
  onPickSolidColor,
  onRestoreTransparent,
}) => {
  const tools = useMemo(() => {
    return {
      ...TOOLS_ITEMS,
      [TOOLS.OBJECT_REMOVAL]: buildRemoveBgObjectRemovalTool({
        onRemoveBg: handleRemoveBg,
        removeBgState,
        creditsPerUse: creditsPerRemoveBg,
        currentCredits,
        hasRemovedBg,
        onRequestBgUpload,
        onPickSolidColor,
        onRestoreTransparent,
      }),
    }
  }, [
    handleRemoveBg,
    removeBgState,
    creditsPerRemoveBg,
    currentCredits,
    hasRemovedBg,
    onRequestBgUpload,
    onPickSolidColor,
    onRestoreTransparent,
  ])

  const config = useMemo(() => {
    return {
      ...createEditorConfig(imageUrl),
      tools,
    }
  }, [imageUrl, tools])

  return (
    <div className="relative flex flex-col w-full h-full min-h-[100dvh] overflow-auto overscroll-none">
      <div className="flex-1 min-h-0 flex flex-col">
        <FilerobotImageEditor
          // tools override is supported at runtime but omitted from package typings.
          {...(config as any)}
          onSave={(editedImageObject: any) => {
            onSave(String(editedImageObject?.imageBase64 || ''))
          }}
          onClose={onClose}
          defaultTabId={TABS.ADJUST}
          defaultToolId={TOOLS.CROP}
          savingPixelRatio={2}
          previewPixelRatio={2}
        />
      </div>

            <style jsx global>{`
          :root {
            color-scheme: dark;
          }
          .filerobot-image-editor-root,
          .FIE_root {
            height: 100% !important;
            min-height: 0 !important;
            box-shadow: none !important;
          }
          .FIE_tabs_navbar {
            box-shadow: none !important;
          }

          /* Sidebar tab & panel opsi (Adjust, Finetune, Filter, …) — scroll tanpa scrollbar */
          .FIE_root .FIE_tabs_navbar,
          .FIE_root .FIE_tabs-drawer,
          .FIE_root .FIE_tools-bar-wrapper,
          .FIE_root .FIE_tools-bar,
          .FIE_root .FIE_tool-options-wrapper,
          .FIE_root .FIE_editor-tab,
          .FIE_root .SfxAccordionDetails-root {
            -ms-overflow-style: none !important;
            scrollbar-width: none !important;
          }
          .FIE_root .FIE_tabs_navbar::-webkit-scrollbar,
          .FIE_root .FIE_tabs-drawer::-webkit-scrollbar,
          .FIE_root .FIE_tools-bar-wrapper::-webkit-scrollbar,
          .FIE_root .FIE_tools-bar::-webkit-scrollbar,
          .FIE_root .FIE_tool-options-wrapper::-webkit-scrollbar,
          .FIE_root .FIE_editor-tab::-webkit-scrollbar,
          .FIE_root .SfxAccordionDetails-root::-webkit-scrollbar,
          .FIE_root .FIE_tools-bar-wrapper *::-webkit-scrollbar,
          .FIE_root .FIE_tool-options-wrapper *::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
          }
          .FIE_root .FIE_tools-bar-wrapper *,
          .FIE_root .FIE_tool-options-wrapper * {
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
          }
          
          /* Forced Mobile Bottom Navbar Override */
                      @media (max-width: 768px) {
              .FIE_main-container {
                flex-direction: column-reverse !important;
              }
              .FIE_tabs_navbar {
                display: flex !important;
                flex-direction: row !important;
                width: 100% !important;
                min-width: 100% !important;
                height: 72px !important;
                overflow-x: auto !important;
                overflow-y: hidden !important;
                padding: 8px !important;
                border-top: 1px solid #3f3f46 !important;
                z-index: 100 !important;
                align-items: center !important;
                justify-content: flex-start !important;
                gap: 16px !important;
                /* Hide standard scrollbar across browsers */
                -ms-overflow-style: none !important;
                scrollbar-width: none !important;
              }
              .FIE_tabs_navbar::-webkit-scrollbar {
                display: none !important;
              }
              .FIE_tabs_navbar > div, .FIE_tabs_navbar > span, .FIE_tabs_navbar > button {
                flex-shrink: 0 !important;
                min-width: 64px !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 4px 8px !important;
              }
              .FIE_editor-content {
                width: 100% !important;
                height: calc(100dvh - 72px - 56px) !important; /* Adjust based on topbar and bottom nav */
              }
                            [data-testid="FIE-tab-label"] {
                font-size: 11px !important;
                margin-top: 4px !important;
                text-align: center !important;
              }
              
              /* Hide any hamburger menu buttons or toggle buttons inside Filerobot on mobile */
              [data-testid="FIE-tabs-drawer-menu-button"],
              .FIE_tabs-drawer,
              [data-testid="FIE-topbar-menu-button"],
              .FIE_topbar-menu-button,
              .SfxButton-link-basic-secondary:has(svg title:contains('Menu')),
              button:has(svg title:contains('Menu')),
              button[title="Menu"],
              button[aria-label="Menu"] {
                display: none !important;
              }
            }
        .FIE_topbar {
          box-shadow: none !important;
          border-bottom: 1px solid #2f2f2f !important;
        }
        /* Remove BG panel: buka height cap & reset padding bawaan FIE agar layout kita tidak terpotong. */
        .FIE_tool-options-wrapper:has([data-testid='FIE-remove-bg-options']) {
          max-height: none !important;
          overflow: visible !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        /* Wrapper luar juga jangan overflow hidden supaya tidak butuh scroll. */
        .FIE_tools-bar-wrapper:has([data-testid='FIE-remove-bg-options']) {
          overflow: visible !important;
        }
        /* Item tool tidak di-render (null) — strip carousel tetap ada wrapper kosong; sembunyikan. */
        .FIE_tools-bar-wrapper:has([data-testid='FIE-remove-bg-options']) .FIE_tools-bar {
          display: none !important;
        }
        /*
          Library: getCursorStyle() → toolId === ObjectRemoval ⇒ cursor "none" (mode brush + kursor custom).
          Remove BG tidak pakai brush — pakai kursor biasa di canvas.
        */
        .FIE_root:has([data-testid='FIE-remove-bg-options']) .FIE_canvas-node {
          cursor: default !important;
        }
        /* Kurangi kilatan putih saat ganti source (loader Filerobot default rgba putih). */
        .FIE_root .FIE_spinner-wrapper {
          background: rgba(15, 15, 15, 0.35) !important;
        }

        /* ━━━ Crop-presets dropdown patch (portal, di luar .FIE_root) ━━━
         * SfxMenu-root: width 195px fixed + overflow-x:hidden → konten accordion terpotong.
         * ─────────────────────────────────────────────────────────── */

        /* Menu wrapper — perlebar & izinkan konten penuh */
        .FIE_crop-presets-menu.SfxMenu-root {
          width: auto !important;
          min-width: 240px !important;
          max-width: none !important;
          max-height: none !important;
          overflow: visible !important;
          background-color: #1c1c1c !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.55) !important;
          border-radius: 8px !important;
          padding: 4px 0 !important;
        }

        /* StyledMenu inner container (bg dari BackgroundStateless) */
        .FIE_crop-presets-menu > div {
          background-color: transparent !important;
        }

        /* Setiap menu item */
        .FIE_crop-presets-menu .SfxMenuItem-root {
          background-color: transparent !important;
          color: #e0e0e0 !important;
          white-space: nowrap;
          min-width: 0;
          box-sizing: border-box;
        }
        .FIE_crop-presets-menu .SfxMenuItem-root:hover {
          background-color: rgba(255,255,255,0.08) !important;
        }
        .FIE_crop-presets-menu .SfxMenuItem-root.active,
        .FIE_crop-presets-menu .SfxMenuItem-root[class*='active'] {
          background-color: rgba(33,150,243,0.15) !important;
        }

        /* Label teks di dalam item */
        .FIE_crop-presets-menu .SfxMenuItem-Label,
        .FIE_crop-presets-menu .SfxMenuItemLabel-root,
        .FIE_crop-presets-menu span {
          color: #e0e0e0 !important;
          white-space: nowrap;
        }

        /* Accordion (Social Media groups) */
        .FIE_crop-presets-menu .SfxAccordion-root {
          width: 100% !important;
          overflow: visible !important;
        }

        /* Accordion header (judul grup, e.g. "LinkedIn") */
        .FIE_crop-presets-menu .SfxAccordionHeader-root {
          width: 100% !important;
          padding: 6px 16px !important;
          box-sizing: border-box;
          color: #9ca3af !important;
        }
        .FIE_crop-presets-menu .SfxAccordionHeader-root:hover {
          background-color: rgba(255,255,255,0.06) !important;
        }
        .FIE_crop-presets-menu .SfxAccordionHeader-label {
          color: #9ca3af !important;
          white-space: nowrap;
        }
        .FIE_crop-presets-menu .SfxAccordionHeader-icon {
          color: #6b7280 !important;
        }
        .FIE_crop-presets-menu .SfxAccordionHeader-wrapper {
          color: #9ca3af !important;
        }

        /* Accordion details (expanded list items) */
        .FIE_crop-presets-menu .SfxAccordionDetails-root {
          margin: 0 !important;
          overflow: visible !important;
        }

        /* Nested accordion item (item di dalam grup) */
        .FIE_crop-presets-menu .SfxMenuItem-root[class*='isAccordion'],
        .FIE_crop-presets-menu [class*='FIE_crop-preset'] {
          padding-left: 24px !important;
        }

        /* ━━━ Save-modal patch (portal ke body, di luar .FIE_root) ━━━
         * SfxModal-Container di-render lewat portal — CSS .FIE_root tidak berlaku.
         * Override langsung lewat class Scaleflex UI.
         * ─────────────────────────────────────────────────────────── */

        /* Overlay backdrop */
        .SfxModal-Overlay {
          background-color: rgba(0, 0, 0, 0.65) !important;
        }

        /* Kotak putih modal → gelap */
        .SfxModal-Container {
          background-color: #1c1c1c !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6) !important;
          color: #e8e8e8 !important;
        }

        /* Header / title area */
        .SfxModalTitle-root {
          background-color: #161616 !important;
          border-bottom-color: #2f2f2f !important;
          color: #e8e8e8 !important;
        }
        .SfxModalTitle-LabelPrimary,
        .SfxModalTitle-LabelSecondary {
          color: #e8e8e8 !important;
        }
        .SfxModalTitle-Close {
          color: #9ca3af !important;
        }
        .SfxModalTitle-Close:hover {
          color: #e8e8e8 !important;
        }

        /* Body area (semua teks & label di dalam modal) */
        .SfxModal-Container label,
        .SfxModal-Container .SfxLabel-root,
        .SfxModal-Container span {
          color: #9ca3af !important;
        }

        /* Input fields di modal (nama file, dll) */
        .SfxModal-Container .SfxInput-root,
        .SfxModal-Container .SfxInputGroup-root {
          background-color: transparent !important;
          border-color: rgba(255,255,255,0.12) !important;
          color: #e8e8e8 !important;
        }
        .SfxModal-Container .SfxInput-root:hover {
          background-color: rgba(255,255,255,0.05) !important;
          border-color: rgba(255,255,255,0.22) !important;
        }
        .SfxModal-Container .SfxInput-root:focus-within {
          border-color: #2196f3 !important;
          box-shadow: 0 0 0 2px rgba(33,150,243,0.18) !important;
        }
        .SfxModal-Container .SfxInput-Base {
          color: #e8e8e8 !important;
          -webkit-text-fill-color: #e8e8e8 !important;
          background-color: transparent !important;
          caret-color: #e8e8e8 !important;
        }
        .SfxModal-Container .SfxInput-Base::placeholder {
          color: rgba(255,255,255,0.25) !important;
          -webkit-text-fill-color: rgba(255,255,255,0.25) !important;
        }
        .SfxModal-Container .SfxInput-Icon {
          color: rgba(255,255,255,0.35) !important;
        }

        /* Select dropdown (pilih format file) */
        .SfxModal-Container .SfxSelectGroup-root,
        .SfxModal-Container .SfxSelect-root,
        .SfxModal-Container [class*='SfxSelect'] {
          background-color: transparent !important;
          border-color: rgba(255,255,255,0.12) !important;
          color: #e8e8e8 !important;
        }
        /* Dropdown list items */
        .SfxMenuItem-root {
          background-color: #1c1c1c !important;
          color: #e8e8e8 !important;
        }
        .SfxMenuItem-root:hover {
          background-color: #2a2a2a !important;
        }

        /* Tombol Save & Cancel di dalam modal */
        .SfxModalActions-root .SfxButton-root {
          color: #e8e8e8 !important;
        }
        /* Tombol primary (Save) */
        .SfxModalActions-root .SfxButton-root[color='primary'],
        .SfxModal-Container .SfxButton-root[color='primary'] {
          background-color: #1976d2 !important;
          color: #ffffff !important;
          border: none !important;
        }
        .SfxModalActions-root .SfxButton-root[color='primary']:hover {
          background-color: #1565c0 !important;
        }
        /* Tombol secondary (Cancel) */
        .SfxModalActions-root .SfxButton-root[color='secondary'],
        .SfxModal-Container .SfxButton-root[color='secondary'] {
          background-color: transparent !important;
          border-color: rgba(255,255,255,0.15) !important;
          color: #e8e8e8 !important;
        }
        .SfxModalActions-root .SfxButton-root[color='secondary']:hover {
          background-color: rgba(255,255,255,0.07) !important;
        }
        /* Tombol warning-primary (Confirm / "Ya, Lanjutkan" di ConfirmationModal) */
        .SfxModalActions-root .SfxButton-root[color='warning-primary'],
        .SfxModal-Container .SfxButton-root[color='warning-primary'] {
          background-color: #b45309 !important;
          color: #ffffff !important;
          border: none !important;
        }
        .SfxModalActions-root .SfxButton-root[color='warning-primary']:hover,
        .SfxModal-Container .SfxButton-root[color='warning-primary']:hover {
          background-color: #92400e !important;
        }

        /* Slider quality di modal */
        .SfxModal-Container .FIE_save-quality-wrapper label,
        .SfxModal-Container .FIE_save-quality-wrapper span {
          color: #9ca3af !important;
        }

        /* ━━━ Scaleflex UI — dark-theme patch (semua bg transparan) ━━━
         * Biarkan warna dasar Filerobot yang menentukan bg sidebar;
         * kita hanya pastikan teks & border input tetap kontras.
         * ─────────────────────────────────────────────────────────── */

        /* Panel & area tool — transparan agar menyatu dengan bg Filerobot */
        .FIE_root .FIE_tool-options-wrapper,
        .FIE_root .FIE_tools-bar-wrapper,
        .FIE_root .FIE_resize-tool-options,
        .FIE_root [class*='FIE_'][class*='-option'],
        .FIE_root [class*='FIE_'][class*='-options'] {
          background-color: transparent !important;
        }

        /* ── InputGroup & Input wrapper ── */
        .FIE_root .SfxInputGroup-root,
        .FIE_root .SfxInput-root {
          background-color: transparent !important;
          border-color: rgba(255,255,255,0.12) !important;
          color: #e8e8e8 !important;
        }
        .FIE_root .SfxInput-root:hover {
          background-color: rgba(255,255,255,0.05) !important;
          border-color: rgba(255,255,255,0.22) !important;
        }
        .FIE_root .SfxInput-root:focus-within {
          background-color: rgba(255,255,255,0.06) !important;
          border-color: #2196f3 !important;
          box-shadow: 0 0 0 2px rgba(33,150,243,0.18) !important;
        }

        /* ── Input Base ── */
        .FIE_root .SfxInput-Base {
          color: #e8e8e8 !important;
          -webkit-text-fill-color: #e8e8e8 !important;
          background-color: transparent !important;
          caret-color: #e8e8e8 !important;
        }
        .FIE_root .SfxInput-Base::placeholder {
          color: rgba(255,255,255,0.25) !important;
          -webkit-text-fill-color: rgba(255,255,255,0.25) !important;
        }
        .FIE_root .SfxInput-Base::-webkit-inner-spin-button,
        .FIE_root .SfxInput-Base::-webkit-outer-spin-button {
          -webkit-appearance: none;
        }

        /* ── Label & teks samping input ("Width", "Height", "px") ── */
        .FIE_root .SfxInputGroup-root span,
        .FIE_root .SfxInput-root span,
        .FIE_root .SfxLabel-root,
        .FIE_root label {
          color: rgba(255,255,255,0.45) !important;
        }

        /* ── Icon akhir ("px") ── */
        .FIE_root .SfxInput-Icon {
          color: rgba(255,255,255,0.35) !important;
        }

        /* ── Gembok / Ratio-lock & Reset button ── */
        .FIE_root .FIE_resize-ratio-locker.SfxIconButton-root,
        .FIE_root .FIE_resize-reset-button.SfxIconButton-root {
          background-color: transparent !important;
          border: none !important;
          box-shadow: none !important;
        }
        .FIE_root .FIE_resize-ratio-locker.SfxIconButton-root:hover,
        .FIE_root .FIE_resize-reset-button.SfxIconButton-root:hover {
          background-color: rgba(255,255,255,0.08) !important;
        }

        /* ── SfxButton di panel tool ── */
        .FIE_root .FIE_tool-options-wrapper .SfxButton-root {
          background-color: transparent !important;
          color: #e8e8e8 !important;
          border-color: rgba(255,255,255,0.12) !important;
        }
        .FIE_root .FIE_tool-options-wrapper .SfxButton-root:hover {
          background-color: rgba(255,255,255,0.07) !important;
          border-color: rgba(255,255,255,0.22) !important;
        }
        /* Fix for Crop tool dropdowns (like Social Media) closing on hover & scrollbar issues */
        .FIE_tool-options-wrapper,
        .FIE_tools-bar-wrapper,
        .FIE_tabs-drawer {
          overflow: visible !important;
        }

        .FIE_crop-preset-groups,
        .SfxMenu-root,
        [data-testid='FIE-crop-presets-groups-folder'] {
          overflow: visible !important;
        }

        /* Prevent text from being cut off in the dropdown */
        .SfxMenuItem-root,
        .SfxMenuItem-subList {
          white-space: nowrap !important;
          min-width: max-content !important;
        }

        /* Make sure the submenu popup doesn't get clipped and doesn't scroll inside the sidebar */
        .SfxMenu-root {
          max-height: none !important;
          height: auto !important;
        }

        /* ━━━ Fix: Crop button height mismatch ━━━
         * The Crop tool renders inside StyledToolsBarItemButton (.FIE_crop-tool)
         * which is a flex div with padding:8px 12px.  Inside it lives
         * StyledOpenMenuButton (.FIE_crop-presets-opener-button) — an SfxButton
         * that has its own min-height / padding and inflates the row.
         * Fix: cap the outer wrapper AND neutralise the button's own sizing.
         */
        .FIE_crop-tool {
          height: 36px !important;
          max-height: 36px !important;
          padding-top: 4px !important;
          padding-bottom: 4px !important;
          box-sizing: border-box !important;
          align-items: center !important;
        }
        /* Neutralise the SfxButton dropdown chevron so it doesn't push height */
        .FIE_crop-presets-opener-button.SfxButton-root,
        .FIE_crop-presets-opener-button {
          min-height: unset !important;
          height: auto !important;
          padding: 0 !important;
          line-height: 1 !important;
          display: inline-flex !important;
          align-items: center !important;
        }

        /* ━━━ Fix: Scroll-arrow white gradient background on tools bar ━━━
         * Filerobot Carousel renders FIE_carousel-prev-button / FIE_carousel-next-button
         * with a hardcoded white linear-gradient.  Override to match dark theme.
         */
        .FIE_carousel-prev-button,
        .FIE_carousel-next-button,
        [data-testid='FIE-carousel-prev-button'],
        [data-testid='FIE-carousel-next-button'] {
          background: linear-gradient(
            90deg,
            #1e1e1e 1.56%,
            rgba(30,30,30,0.89) 52.4%,
            rgba(30,30,30,0.53) 76.04%,
            rgba(30,30,30,0) 100%
          ) !important;
          color: #e8e8e8 !important;
        }
        [data-testid='FIE-carousel-next-button'],
        .FIE_carousel-next-button {
          background: linear-gradient(
            270deg,
            #1e1e1e 1.56%,
            rgba(30,30,30,0.89) 52.4%,
            rgba(30,30,30,0.53) 76.04%,
            rgba(30,30,30,0) 100%
          ) !important;
        }
        /* Icon colour inside arrows */
        .FIE_carousel-prev-button svg,
        .FIE_carousel-next-button svg,
        [data-testid='FIE-carousel-prev-button'] svg,
        [data-testid='FIE-carousel-next-button'] svg {
          color: #e8e8e8 !important;
          fill: #e8e8e8 !important;
        }
      `}</style>
    </div>
  )
}

// ============== Main Default Component ==============

export default function ImageEditorFilerobot({ creditCost }: { creditCost?: number }) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [editedImage, setEditedImage] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const creditsPerRemoveBg = creditCost ?? 0
  const [currentCredits, setCurrentCredits] = useState<number | null>(null)
  const [removeBgState, setRemoveBgState] = useState<'idle' | 'removing' | 'error'>('idle')
  /** Setelah Remove BG sukses — tampilkan opsi upload / warna solid. */
  const [hasRemovedBg, setHasRemovedBg] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const replaceBgInputRef = useRef<HTMLInputElement>(null)
  /**
   * Hanya naik saat user upload gambar BARU dari disk — jangan pakai `key={selectedImage}`:
   * tiap ganti blob (Remove BG / solid / upload BG) memicu remount dan menghapus undo/redo Filerobot.
   */
  const [editorSessionKey, setEditorSessionKey] = useState(0)
  /** Potongan PNG transparan hasil Remove BG — dipakai untuk ganti BG solid/upload & kembali transparan. */
  const [transparentCutoutUrl, setTransparentCutoutUrl] = useState<string | null>(null)

  // Fetch current user credits (refresh when editor opens, and on credits-updated event)
  const refreshCurrentCredits = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/user/me')
      if (!res.ok) return
      const data = asObject(await res.json().catch(() => ({})))
      if (typeof data.credits === 'number') setCurrentCredits(data.credits)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    refreshCurrentCredits()
  }, [])

  // When editor opens, re-fetch so saldo is always fresh
  useEffect(() => {
    if (selectedImage) refreshCurrentCredits()
  }, [selectedImage, refreshCurrentCredits])

  // Keep in sync with credits-updated events (e.g. after Remove BG succeeds)
  useEffect(() => {
    const handler = () => { refreshCurrentCredits() }
    window.addEventListener('credits-updated', handler)
    return () => window.removeEventListener('credits-updated', handler)
  }, [refreshCurrentCredits])

  // Lock scrolling when editor is active
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!selectedImage) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [selectedImage])

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    const file = event.target.files?.[0]
    if (!file) return

    try {
      validateImageFile(file)
      setIsProcessing(true)

      const image = new Image()
      const imageUrl = URL.createObjectURL(file)
      await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = () => reject(new Error('Failed to load image'))
        image.src = imageUrl
      })
      URL.revokeObjectURL(imageUrl)

      // Convert standard file to data URL for Selected Image (Filerobot consumes Data URLs or pure URLs)
      const reader = new FileReader()
      reader.onload = (e) => {
        if (e.target?.result) {
          setHasRemovedBg(false)
          setTransparentCutoutUrl(null)
          setEditorSessionKey((k) => k + 1)
          setSelectedImage(e.target.result as string)
        }
      }
      reader.readAsDataURL(file)
    } catch (err) {
      console.error('Error processing image:', err)
      alert(err instanceof Error ? err.message : 'Failed to process image')
    } finally {
      setIsProcessing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSave = (editedImageUrl: string) => {
    setEditedImage(editedImageUrl)
    setHasRemovedBg(false)
    setTransparentCutoutUrl(null)
    setSelectedImage(null)
  }

  const handleDownload = () => {
    if (editedImage) {
      createDownloadLink(editedImage, 'edited-image.png')
    }
  }

  const handleClose = () => {
    setHasRemovedBg(false)
    setTransparentCutoutUrl(null)
    setSelectedImage(null)
  }

  const handleReset = () => {
    setEditedImage(null)
    setHasRemovedBg(false)
    setTransparentCutoutUrl(null)
    setSelectedImage(null)
  }

  const handleReplaceBgFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (event.target) event.target.value = ''
    if (!file || !transparentCutoutUrl) return
    try {
      validateImageFile(file)
      const reader = new FileReader()
      reader.onload = async () => {
        const bgUrl = String(reader.result || '')
        const fg = transparentCutoutUrl
        try {
          const out = await compositeForegroundOnImageBg(fg, bgUrl)
          setSelectedImage(out)
        } catch (err) {
          alert(err instanceof Error ? err.message : 'Gagal menggabungkan background')
        }
      }
      reader.readAsDataURL(file)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'File tidak valid')
    }
  }

  const handlePickSolidColor = useCallback(
    async (hex: string) => {
      if (!transparentCutoutUrl) return
      try {
        const out = await compositeForegroundOnSolid(transparentCutoutUrl, hex)
        setSelectedImage(out)
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Gagal menerapkan warna')
      }
    },
    [transparentCutoutUrl],
  )

  const handleRestoreTransparent = useCallback(() => {
    if (transparentCutoutUrl) setSelectedImage(transparentCutoutUrl)
  }, [transparentCutoutUrl])

  // ============== Remove BG Server Action ==============
  const handleRemoveBg = useCallback(async () => {
    if (!selectedImage) return
    if (hasRemovedBg) return
    setError(null)
    setRemoveBgState('removing')
    try {
      const creditRes = await fetchWithAuth('/api/admin/ai-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature_slug: 'image_remove_bg' }),
      })
      const creditData = asObject(await creditRes.json().catch(() => ({})))
      if (!creditRes.ok || creditData.ok === false) {
        if (creditRes.status === 402) {
          setError('Credit kamu tidak cukup untuk Remove Background. Silakan top up credit terlebih dahulu.')
        } else {
          setError(asString(creditData.error) || 'Gagal memotong credit untuk Remove Background.')
        }
        setRemoveBgState('error')
        return
      }

      const blob = await dataUrlToBlob(selectedImage)
      const { removeBackground } = await import('@imgly/background-removal')
      const outBlob = await removeBackground(blob, {
        output: { format: 'image/png' },
      })
      const outUrl = await blobToDataUrl(outBlob)
      setTransparentCutoutUrl(outUrl)
      setSelectedImage(outUrl)
      setHasRemovedBg(true)
      setRemoveBgState('idle')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('credits-updated'))
      }
    } catch (e) {
      setRemoveBgState('error')
      setError(e instanceof Error ? e.message : String(e))
      alert('Error saat Remove BG: ' + (e instanceof Error ? e.message : String(e)))
    }
  }, [selectedImage, hasRemovedBg])

  return (
    <div className="h-full overflow-hidden bg-white dark:bg-slate-950 relative w-full transition-colors duration-300">
      {error && selectedImage && (
        <div className="fixed top-20 inset-x-0 z-[100] p-3 text-center bg-red-600 text-white font-bold text-xs uppercase tracking-widest shadow-xl">
          {error}
        </div>
      )}

      {/* Upload landing — tombol saja, di tengah */}
      {!selectedImage && !editedImage && (
        <div className="flex flex-col items-center justify-center h-full gap-5 px-6 pt-24 sm:pt-40">

          {/* Icon card */}
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center
              bg-indigo-100 dark:bg-indigo-500/20
              border-2 border-slate-200 dark:border-white/20
              shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_rgba(255,255,255,0.1)]"
          >
            <svg
              className="w-10 h-10 text-indigo-600 dark:text-indigo-400"
              fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 21h18M3 3h18" />
            </svg>
          </div>

          <div className="text-center">
            <p className="text-[16px] font-black text-slate-900 dark:text-white tracking-tight">
              Edit &amp; percantik fotomu
            </p>
          </div>

          {/* Upload button / spinner */}
          {isProcessing ? (
            <LoadingSpinner />
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
              />
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                Pilih Foto
              </Button>
            </>
          )}

          {error && (
            <p className="text-red-500 dark:text-red-400 font-medium text-sm text-center max-w-xs">{error}</p>
          )}
        </div>
      )}

      {selectedImage && (
        <div className="fixed inset-0 z-50">
          <input
            ref={replaceBgInputRef}
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleReplaceBgFileChange}
          />
          <ImageEditor
            key={editorSessionKey}
            imageUrl={selectedImage}
            onClose={handleClose}
            onSave={handleSave}
            handleRemoveBg={handleRemoveBg}
            removeBgState={removeBgState}
            creditsPerRemoveBg={creditsPerRemoveBg}
            currentCredits={currentCredits}
            hasRemovedBg={hasRemovedBg}
            onRequestBgUpload={() => replaceBgInputRef.current?.click()}
            onPickSolidColor={handlePickSolidColor}
            onRestoreTransparent={handleRestoreTransparent}
          />
        </div>
      )}

      {editedImage && !selectedImage && (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-white text-gray-900">
          <div className="relative w-full max-w-2xl">
            <img src={editedImage} alt="Edited" className="w-full rounded-lg shadow-xl" />
            <div className="absolute top-4 right-4">
              <Button variant="secondary" onClick={handleReset}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
          <div className="mt-6 flex flex-col items-center justify-center gap-4">
            <Button onClick={handleDownload} className="text-lg px-6 py-3">
              Download Image
            </Button>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              Upload Another Image
            </Button>
            <input 
              ref={fileInputRef} 
              type="file" 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileChange} 
            />
          </div>
        </div>
      )}


    </div>
  )
}






