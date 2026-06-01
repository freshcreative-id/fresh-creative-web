import { Sparkles, type LucideIcon, DollarSign, Library, ShoppingBag, Pencil, Folder, ImageIcon } from 'lucide-react'
import type { NavSection } from '@/components/dashboard/DashboardShell'

/** AI Labs: satu item di sidebar, isi fitur di halaman hub (grid kartu seperti Gojek). */
export const AI_LABS_SECTION_USER: NavSection = {
  title: 'AI Labs',
  items: [{ href: '/user/ai-labs', label: 'AI Labs', icon: Sparkles }],
}

export const ALBUMS_SECTION_USER: NavSection = {
  title: 'Album Saya',
  items: [{ href: '/user/albums', label: 'Album', icon: Library }],
}

export const AI_LABS_SECTION_ADMIN: NavSection = {
  title: 'AI Labs',
  items: [{ href: '/admin/ai-labs', label: 'AI Labs', icon: Sparkles }],
}

export const PRICING_SECTION_ADMIN: NavSection = {
  title: 'Pricing',
  items: [
    { href: '/admin/pricingedit', label: 'Pricing Settings', icon: Pencil },
    { href: '/admin/credits', label: 'Credit Settings', icon: DollarSign },
  ],
}


export const ALBUMS_SECTION_ADMIN: NavSection = {
  title: 'Manajemen Album',
  items: [{ href: '/admin/albums', label: 'Album', icon: Library }],
}

export const SHOWCASE_SECTION_ADMIN: NavSection = {
  title: 'Tampilan User',
  items: [{ href: '/admin/showcase', label: 'View Settings', icon: ImageIcon }],
}

export const FILES_SECTION_USER: NavSection = {
  title: 'File Saya',
  items: [{ href: '/user/files', label: 'File Saya', icon: Folder }],
}

export const FILES_SECTION_ADMIN: NavSection = {
  title: 'File Saya',
  items: [{ href: '/admin/files', label: 'File Saya', icon: Folder }],
}

/** Daftar fitur AI Labs untuk halaman hub (grid kartu seperti Gojek). */
export const AI_LABS_FEATURES_USER = [
  { href: '/user/tryon', label: 'V-Tryon', description: 'Ubah Outfit' },
  { href: '/user/pose', label: 'Pose', description: 'Ubah pose foto' },
  { href: '/user/enhance', label: 'Photo Enhance', description: 'Pertajam foto blur' },
  { href: '/user/image-editor', label: 'Image Editor', description: 'Edit & Remove Background' },
  { href: '/user/photogroup', label: 'Photo Group', description: 'Gabungkan foto' },
  { href: '/user/phototovideo', label: 'Photo to Video', description: 'Ubah foto jadi video singkat' },
] as const

export const AI_LABS_FEATURES_ADMIN = [
  { href: '/admin/tryon', label: 'V-Tryon', description: 'Ubah Outfit' },
  { href: '/admin/pose', label: 'Pose', description: 'Ubah pose foto' },
  { href: '/admin/enhance', label: 'Photo Enhance', description: 'Pertajam foto blur' },
  { href: '/admin/image-editor', label: 'Image Editor', description: 'Edit & Remove Background' },
  { href: '/admin/photogroup', label: 'Photo Group', description: 'Gabungkan foto' },
  { href: '/admin/phototovideo', label: 'Photo to Video', description: 'Ubah foto jadi video singkat' },
] as const






