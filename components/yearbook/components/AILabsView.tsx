'use client'

import React, { useState } from 'react'
import dynamic from 'next/dynamic'
import NextLink from 'next/link'
import { usePathname } from 'next/navigation'
import { Video, Shirt, UserCircle, ImageIcon, Images, Lock, Coins, Loader2, Zap, ChevronRight } from 'lucide-react'
import { AI_LABS_FEATURES_USER } from '@/lib/dashboard-nav'
import { toast } from '@/lib/toast'
import { apiUrl } from '../../../lib/api-url'
import { fetchWithAuth } from '../../../lib/api-client'
import { asObject, getErrorMessage } from '@/components/yearbook/utils/response-narrowing'

// Map feature labels to feature_type slugs for unlocking
const FEATURE_SLUG_MAP: Record<string, string> = {
    'tryon': 'tryon',
    'pose': 'pose',
    'image-editor': 'image_remove_bg',
    'photogroup': 'photogroup',
    'phototovideo': 'phototovideo',
    'enhance': 'enhance',
}

interface AILabsViewProps {
    album: any
    aiLabsTool: string | null
    aiLabsFeaturesByPackage?: string[]
    featureUnlocks?: string[]
    featureCreditCosts?: Record<string, number>
    featureUseCosts?: Record<string, number>
    onFeatureUnlocked?: () => void
    featureUnlocksLoaded?: boolean
}

function ToolLoading({ label }: { label: string }) {
    return (
        <div className="max-w-5xl mx-auto px-3 py-6 sm:p-8">
            <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-3xl p-6 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b]">
                <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                    <div className="min-w-0">
                        <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest truncate">{label}</p>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Menyiapkan fitur…</p>
                    </div>
                </div>
            </div>
        </div>
    )
}

// Lazy-load heavy tools so opening a tool doesn't block the UI.
const TryOn = dynamic(() => import('@/components/features/TryOn'), { ssr: false, loading: () => <ToolLoading label="V-Tryon" /> })
const Pose = dynamic(() => import('@/components/features/Pose'), { ssr: false, loading: () => <ToolLoading label="Pose" /> })
const ImageEditor = dynamic(() => import('@/components/features/ImageEditor'), { ssr: false, loading: () => <ToolLoading label="Image Editor" /> })
const PhotoGroup = dynamic(() => import('@/components/features/PhotoGroup'), { ssr: false, loading: () => <ToolLoading label="Photo Group" /> })
const PhotoToVideo = dynamic(() => import('@/components/features/PhotoToVideo'), { ssr: false, loading: () => <ToolLoading label="Photo to Video" /> })
const Enhance = dynamic(() => import('@/components/features/enhance/EnhanceClient'), { ssr: false, loading: () => <ToolLoading label="Photo Enhance" /> })

// Preload helpers to make navigation feel instant.
const preloadTool: Record<string, () => void> = {
    tryon: () => { void import('@/components/features/TryOn') },
    pose: () => { void import('@/components/features/Pose') },
    'image-editor': () => { void import('@/components/features/ImageEditor') },
    photogroup: () => { void import('@/components/features/PhotoGroup') },
    phototovideo: () => { void import('@/components/features/PhotoToVideo') },
    enhance: () => { void import('@/components/features/enhance/EnhanceClient') },
}

export default function AILabsView({ album, aiLabsTool, aiLabsFeaturesByPackage = [], featureUnlocks = [], featureCreditCosts = {}, featureUseCosts = {}, onFeatureUnlocked, featureUnlocksLoaded = false }: AILabsViewProps) {
    const pathname = usePathname()
    const isAdmin = pathname?.startsWith('/admin')
    const FEATURE_ICONS = [Shirt, UserCircle, ImageIcon, Images, Video] as const
    const albumBase = album?.id ? (isAdmin ? `/admin/album/yearbook/${album.id}` : `/user/album/yearbook/${album.id}`) : ''
    const [unlockingFeature, setUnlockingFeature] = useState<string | null>(null)
    const [confirmUnlockToolSlug, setConfirmUnlockToolSlug] = useState<string | null>(null)

    const isFeatureUnlocked = (toolSlug: string) => {
        const featureType = FEATURE_SLUG_MAP[toolSlug] || toolSlug
        // If this specific feature is enabled by pricing package, it's accessible
        if (aiLabsFeaturesByPackage.includes(featureType)) return true
        // Otherwise check if individually unlocked via credits
        return featureUnlocks.includes(featureType)
    }

    const getFeatureUnlockCost = (toolSlug: string) => {
        const featureType = FEATURE_SLUG_MAP[toolSlug] || toolSlug
        return featureCreditCosts[featureType] ?? 0
    }

    const getFeatureUseCost = (toolSlug: string) => {
        const featureType = FEATURE_SLUG_MAP[toolSlug] || toolSlug
        return featureUseCosts[featureType] ?? 0
    }

    const isPayPerUse = (toolSlug: string) => {
        return getFeatureUseCost(toolSlug) > 0
    }

    const handleUnlockFeature = async (toolSlug: string) => {
        if (!album?.id) return
        const featureType = FEATURE_SLUG_MAP[toolSlug] || toolSlug
        setUnlockingFeature(toolSlug)
        try {
            const res = await fetchWithAuth(`/api/albums/${album.id}/unlock-feature`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feature_type: featureType }),
            })
            const data = asObject(await res.json().catch(() => ({})))
            if (res.ok) {
                toast.success(`Fitur berhasil dibuka! 🎉`)
                onFeatureUnlocked?.()
            } else if (res.status === 402) {
                toast.error(getErrorMessage(data, 'Credit tidak cukup. Silakan top up terlebih dahulu.'))
            } else if (res.status === 409) {
                toast.info('Fitur sudah dibuka sebelumnya.')
                onFeatureUnlocked?.()
            } else {
                toast.error(getErrorMessage(data, 'Gagal membuka fitur.'))
            }
        } catch (err) {
            toast.error('Terjadi kesalahan. Silakan coba lagi.')
        } finally {
            setUnlockingFeature(null)
        }
    }

    if (aiLabsTool && albumBase) {
        // While feature unlock data is still loading, show a lightweight loader (avoid blank).
        if (!featureUnlocksLoaded) return <ToolLoading label="AI Labs" />
        // Check if tool is unlocked before rendering
        if (!isFeatureUnlocked(aiLabsTool)) {
            const unlockCost = getFeatureUnlockCost(aiLabsTool)
            return (
                <div className="flex flex-col items-center justify-center min-h-[40vh] p-4 text-center">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-[24px] sm:rounded-[28px] bg-amber-400 dark:bg-amber-600 flex items-center justify-center mb-6 border-2 border-slate-900 dark:border-slate-700 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b]">
                        <Lock className="w-6 h-6 sm:w-8 sm:h-8 text-slate-900 dark:text-white" strokeWidth={3} />
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">Fitur Terkunci</h2>
                    <p className="text-slate-400 dark:text-slate-500 font-bold text-[10px] sm:text-xs max-w-[280px] sm:max-w-sm mb-8 uppercase tracking-widest leading-relaxed">
                        Buka fitur ini dengan kredit untuk mulai menggunakannya di album ini.
                    </p>
                    <div className="flex flex-col items-center gap-4">
                        <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b]">
                            <Zap className="w-4 h-4 text-amber-500 dark:text-amber-400" strokeWidth={3} />
                            <span className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">{unlockCost} CREDIT UNLOCK</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setConfirmUnlockToolSlug(aiLabsTool)}
                            disabled={unlockingFeature === aiLabsTool}
                            className="px-8 py-4 rounded-xl bg-indigo-500 text-white border-2 border-slate-900 dark:border-slate-700 font-black text-sm uppercase shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all disabled:opacity-50 flex items-center gap-2.5"
                        >
                            {unlockingFeature === aiLabsTool ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    MEMBUKA...
                                </>
                            ) : (
                                <>
                                    <Zap className="w-5 h-5" />
                                    BUKA SEKARANG
                                </>
                            )}
                        </button>
                    </div>
                    {confirmUnlockToolSlug === aiLabsTool && (
                        <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/50 backdrop-blur-md flex items-center justify-center z-[200] p-4">
                            <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-[32px] p-6 sm:p-8 max-w-sm w-full shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] text-center">
                                <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Buka Fitur AI</h3>
                                <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-6">
                                    Yakin tidak? Unlock fitur ini akan menggunakan {getFeatureUnlockCost(confirmUnlockToolSlug ?? '') ?? 0} credit.
                                </p>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setConfirmUnlockToolSlug(null)}
                                        className="flex-1 py-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-black uppercase tracking-widest shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
                                    >
                                        Batal
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            handleUnlockFeature(aiLabsTool)
                                            setConfirmUnlockToolSlug(null)
                                        }}
                                        className="flex-1 py-3.5 rounded-xl bg-indigo-500 text-white border-2 border-slate-900 dark:border-slate-700 text-xs font-black uppercase tracking-widest shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
                                    >
                                        Ya, Buka
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )
        }

        const renderTool = (Tool: React.ComponentType<any>) => (
            <div className="max-w-5xl mx-auto px-3 py-3 sm:p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <Tool creditCost={getFeatureUseCost(aiLabsTool) ?? 0} />
            </div>
        )

        if (aiLabsTool === 'tryon') return renderTool(TryOn)
        if (aiLabsTool === 'pose') return renderTool(Pose)
        if (aiLabsTool === 'image-editor') {
            return (
                <div className="max-w-5xl mx-auto px-3 py-3 sm:p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                    <ImageEditor creditCost={getFeatureUseCost(aiLabsTool) ?? 0} />
                </div>
            )
        }
        if (aiLabsTool === 'photogroup') return renderTool(PhotoGroup)
        if (aiLabsTool === 'phototovideo') return renderTool(PhotoToVideo)
        if (aiLabsTool === 'enhance') return renderTool(Enhance)
    }

    const FEATURE_COLORS = [
        'bg-emerald-400',
        'bg-sky-400',
        'bg-amber-400',
        'bg-rose-400',
        'bg-indigo-400'
    ]

    return (
        <div className="max-w-6xl mx-auto px-4 py-4 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                {AI_LABS_FEATURES_USER.map((feature, index) => {
                    const Icon = FEATURE_ICONS[index] ?? Video
                    const toolSlug = feature.href.replace(/\/$/, '').split('/').pop() ?? ''
                    const href = albumBase ? `${albumBase}?section=ai-labs&tool=${encodeURIComponent(toolSlug)}` : feature.href
                    const unlocked = isFeatureUnlocked(toolSlug)
                    const unlockCost = getFeatureUnlockCost(toolSlug)
                    const useCost = getFeatureUseCost(toolSlug)
                    const iconBg = FEATURE_COLORS[index % FEATURE_COLORS.length]

                    return (
                        <div
                            key={feature.href}
                            className="group relative bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-900 dark:border-slate-700 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all flex flex-col overflow-hidden"
                        >
                            <div className="p-5 flex flex-col h-full">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 border-2 border-slate-900 dark:border-slate-700 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] transition-transform group-hover:scale-110 ${iconBg}`}>
                                    <Icon className="w-6 h-6 text-slate-900 dark:text-white" strokeWidth={3} />
                                </div>

                                <div className="flex-1 min-h-[60px]">
                                    <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight mb-1.5 line-clamp-1">{feature.label}</h3>
                                    <p className="text-[10px] sm:text-xs font-bold text-slate-400 dark:text-slate-500 mb-4 leading-relaxed line-clamp-2">{feature.description}</p>
                                </div>

                                <div className="mt-auto pt-4 border-t-2 border-slate-50 dark:border-slate-700 flex items-center justify-between gap-3">
                                    {!featureUnlocksLoaded ? (
                                        <div className="flex-1 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 animate-pulse" />
                                    ) : !unlocked ? (
                                        <button
                                            onClick={() => setConfirmUnlockToolSlug(toolSlug)}
                                            disabled={unlockingFeature === toolSlug}
                                            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-amber-400 dark:bg-amber-600 border-2 border-slate-900 dark:border-slate-700 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all text-[9px] font-black uppercase tracking-widest text-slate-900 dark:text-white"
                                        >
                                            {unlockingFeature === toolSlug ? (
                                                <>
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ...
                                                </>
                                            ) : (
                                                <>
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <span className="truncate">BUKA</span>
                                                    </div>
                                                    <ChevronRight className="w-3.5 h-3.5 shrink-0" strokeWidth={3} />
                                                </>
                                            )}
                                        </button>
                                    ) : (
                                        <NextLink
                                            href={href}
                                            prefetch
                                            scroll={false}
                                            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-indigo-500 border-2 border-slate-900 dark:border-slate-700 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all text-[9px] font-black uppercase tracking-widest text-white px-2"
                                            onMouseEnter={() => preloadTool[toolSlug]?.()}
                                            onMouseDown={() => preloadTool[toolSlug]?.()}
                                        >
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <span className="truncate">BUKA</span>
                                            </div>
                                            <ChevronRight className="w-3.5 h-3.5 shrink-0" strokeWidth={3} />
                                        </NextLink>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {confirmUnlockToolSlug && (
                <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/50 backdrop-blur-md flex items-center justify-center z-[200] p-4">
                    <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-[32px] p-6 sm:p-8 max-w-sm w-full shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] text-center">
                        <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Buka Fitur AI</h3>
                        <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-6">
                            Yakin tidak? Unlock fitur ini akan menggunakan {getFeatureUnlockCost(confirmUnlockToolSlug)} credit.
                        </p>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setConfirmUnlockToolSlug(null)}
                                className="flex-1 py-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-black uppercase tracking-widest shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    handleUnlockFeature(confirmUnlockToolSlug)
                                    setConfirmUnlockToolSlug(null)
                                }}
                                className="flex-1 py-3.5 rounded-xl bg-indigo-500 text-white border-2 border-slate-900 dark:border-slate-700 text-xs font-black uppercase tracking-widest shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
                            >
                                Ya, Buka
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}











