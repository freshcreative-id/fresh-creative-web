'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Edit, Plus, Save, Trash2, X, Loader2, Check, Copy, Gift, ToggleLeft, ToggleRight, Clock, ChevronRight, Layout, Zap, Hash, Calendar, AlertCircle, Users, Star, Percent } from 'lucide-react'
import { fetchWithAuth } from '../../../lib/api-client'

interface CreditPackage {
    id: string
    credits: number
    price: number
    popular: boolean
}

interface RedeemCode {
    id: string
    code: string
    credits: number
    max_uses: number
    used_count: number
    is_active: boolean
    expires_at: string | null
    created_at: string
    redeem_history?: { id: string; user_id: string; credits_received: number; redeemed_at: string }[]
}

interface DiscountVoucher {
    id: string
    code: string
    percent_off: number
    max_uses: number
    used_count: number
    is_active: boolean
    expires_at: string | null
    created_at: string
    updated_at?: string
}

function formatIdDateTimeNoPukul(input: string): string {
    const d = new Date(input)
    if (Number.isNaN(d.getTime())) return input

    // Some browsers include "pukul" in id-ID for toLocaleString; build output manually.
    const parts = new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(d)

    const get = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((p) => p.type === type)?.value ?? ''

    const day = get('day')
    const month = get('month')
    const year = get('year')
    const hour = get('hour')
    const minute = get('minute')

    const date = [day, month, year].filter(Boolean).join(' ')
    const time = [hour, minute].filter(Boolean).join(':')
    return time ? `${date} ${time}` : date
}

const PackageForm = ({ pkg, onSave, onCancel }: { pkg: Partial<CreditPackage> | null, onSave: (p: Partial<CreditPackage>) => void, onCancel: () => void }) => {
    const [formData, setFormData] = useState<Partial<CreditPackage>>({
        id: pkg?.id,
        credits: pkg?.credits ?? 0,
        price: pkg?.price ?? 0,
        popular: pkg?.popular ?? false,
    })

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : Number(value)
        }))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onSave(formData)
    }

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
            <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-2xl shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] p-5 md:p-6 w-full max-w-md">
                <div className="flex justify-between items-center mb-5">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">{pkg?.id ? 'Edit Package' : 'New Package'}</h2>
                    <button onClick={onCancel} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <X size={20} className="text-slate-700 dark:text-slate-200" strokeWidth={2.5} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Credits Amount</label>
                            <input
                                name="credits"
                                type="number"
                                value={formData.credits}
                                onChange={handleChange}
                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-violet-200"
                                required
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Price (IDR)</label>
                            <input
                                name="price"
                                type="number"
                                value={formData.price}
                                onChange={handleChange}
                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-violet-200"
                                required
                            />
                        </div>
                        <div className="p-3 border-2 border-slate-900 dark:border-slate-700 rounded-xl bg-amber-50 dark:bg-slate-800">
                            <label className="flex items-center gap-3 cursor-pointer select-none">
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        checked={formData.popular}
                                        onChange={handleChange}
                                        name="popular"
                                        className="sr-only peer"
                                    />
                                    <div className="w-10 h-5 bg-slate-200 dark:bg-slate-600 rounded-full peer-checked:bg-amber-400 transition-colors" />
                                    <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
                                </div>
                                <span className="text-sm text-slate-900 dark:text-white font-bold flex items-center gap-2">
                                    <Star size={14} className="text-amber-500 fill-amber-500" />
                                    Mark as Popular
                                </span>
                            </label>
                        </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onCancel} className="flex-1 inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-[2px_2px_0_0_#334155] hover:shadow-none whitespace-nowrap">
                            Cancel
                        </button>
                        <button type="submit" className="flex-1 inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 bg-emerald-400 text-emerald-900 rounded-xl font-bold hover:bg-emerald-300 transition-all shadow-[2px_2px_0_0_#059669] hover:shadow-none whitespace-nowrap">
                            Save
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default function AdminCreditSettingsPage() {
    const [packages, setPackages] = useState<CreditPackage[]>([])
    const [loading, setLoading] = useState(true)
    const [editingPackage, setEditingPackage] = useState<Partial<CreditPackage> | null>(null)
    type ActiveTab = 'packages' | 'redeem' | 'discount'
    const VALID_TABS: ActiveTab[] = ['packages', 'redeem', 'discount']
    const getTabFromHash = (): ActiveTab => {
        if (typeof window === 'undefined') return 'packages'
        const hash = window.location.hash.replace('#', '') as ActiveTab
        return VALID_TABS.includes(hash) ? hash : 'packages'
    }
    const [activeTab, setActiveTab] = useState<ActiveTab>(getTabFromHash)
    const switchTab = (tab: ActiveTab) => {
        setActiveTab(tab)
        window.location.hash = tab
    }

    // Delete confirmation state
    const [deletePrompt, setDeletePrompt] = useState<{ id: string, type: 'package' | 'redeem' | 'discount', title: string, text: string } | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    // Redeem code state
    const [redeemCodes, setRedeemCodes] = useState<RedeemCode[]>([])
    const [loadingRedeem, setLoadingRedeem] = useState(true)
    const [showCreateRedeem, setShowCreateRedeem] = useState(false)
    const [newCode, setNewCode] = useState({ code: '', credits: 10, max_uses: 1, expires_at: '' })
    const [statusBanner, setStatusBanner] = useState<string | null>(null)

    // Discount voucher state
    const [discountVouchers, setDiscountVouchers] = useState<DiscountVoucher[]>([])
    const [loadingDiscount, setLoadingDiscount] = useState(true)
    const [showCreateDiscount, setShowCreateDiscount] = useState(false)
    const [newDiscount, setNewDiscount] = useState({ code: '', percent_off: 10, max_uses: 1, expires_at: '' })

    const isAnyModalOpen = !!editingPackage || showCreateRedeem || showCreateDiscount || !!deletePrompt

    useEffect(() => {
        if (typeof document === 'undefined') return
        const previousOverflow = document.body.style.overflow
        if (isAnyModalOpen) {
            document.body.style.overflow = 'hidden'
        }
        return () => {
            document.body.style.overflow = previousOverflow
        }
    }, [isAnyModalOpen])

    const cacheKeyPackages = 'admin_credit_packages_v1'
    const cacheKeyRedeem = 'admin_redeem_codes_v1'
    const cacheKeyDiscount = 'admin_discount_vouchers_v1'
    const hasCachePackagesRef = useRef(false)
    const hasCacheRedeemRef = useRef(false)
    const hasCacheDiscountRef = useRef(false)

    useLayoutEffect(() => {
        if (typeof window === 'undefined') return
        try {
            const pkgRaw = window.sessionStorage.getItem(cacheKeyPackages)
            const redeemRaw = window.sessionStorage.getItem(cacheKeyRedeem)
            const discountRaw = window.sessionStorage.getItem(cacheKeyDiscount)
            if (pkgRaw) {
                const parsed = JSON.parse(pkgRaw) as { ts: number; data: CreditPackage[] }
                if (Array.isArray(parsed?.data)) {
                    setPackages(parsed.data)
                    setLoading(false)
                    hasCachePackagesRef.current = true
                }
            }
            if (redeemRaw) {
                const parsed = JSON.parse(redeemRaw) as { ts: number; data: RedeemCode[] }
                if (Array.isArray(parsed?.data)) {
                    setRedeemCodes(parsed.data)
                    setLoadingRedeem(false)
                    hasCacheRedeemRef.current = true
                }
            }
            if (discountRaw) {
                const parsed = JSON.parse(discountRaw) as { ts: number; data: DiscountVoucher[] }
                if (Array.isArray(parsed?.data)) {
                    setDiscountVouchers(parsed.data)
                    setLoadingDiscount(false)
                    hasCacheDiscountRef.current = true
                }
            }
        } catch {
            // ignore
        }
    }, [])

    const fetchPackages = async (silent = false) => {
        if (!silent) setLoading(true)
        try {
            const res = await fetchWithAuth(`/api/credits/packages?t=${Date.now()}`)
            if (!res.ok) throw new Error('Failed to fetch packages')
            const data = (await res.json()) as unknown
            setPackages(Array.isArray(data) ? (data as CreditPackage[]) : [])
            if (typeof window !== 'undefined') {
                try {
                    window.sessionStorage.setItem(cacheKeyPackages, JSON.stringify({ ts: Date.now(), data }))
                } catch {
                    // ignore
                }
            }
        } catch (err) {
            console.error(err)
            setStatusBanner('error: Gagal memuat paket')
            setTimeout(() => setStatusBanner(null), 3000)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchPackages(hasCachePackagesRef.current)
        fetchRedeemCodes(hasCacheRedeemRef.current)
        fetchDiscountVouchers(hasCacheDiscountRef.current)
    }, [])

    useEffect(() => {
        const lastFetchRef = { packages: 0, redeem: 0, discount: 0 }
        const onRealtime = (event: Event) => {
            const detail = (event as CustomEvent<{ type?: string; channel?: string; payload?: Record<string, unknown> }>).detail
            if (!detail?.type || detail.channel !== 'global') return
            if (detail.type !== 'api.mutated') return

            const path = typeof detail.payload?.path === 'string' ? detail.payload.path : ''
            const now = Date.now()

            if (path.startsWith('/api/credits/packages')) {
                if (now - lastFetchRef.packages < 800) return
                lastFetchRef.packages = now
                fetchPackages(true)
                return
            }

            if (path.startsWith('/api/credits/redeem')) {
                if (now - lastFetchRef.redeem < 800) return
                lastFetchRef.redeem = now
                fetchRedeemCodes(true)
                return
            }

            if (path.startsWith('/api/discount-vouchers')) {
                if (now - lastFetchRef.discount < 800) return
                lastFetchRef.discount = now
                fetchDiscountVouchers(true)
            }
        }

        window.addEventListener('fresh:realtime', onRealtime)
        return () => window.removeEventListener('fresh:realtime', onRealtime)
    }, [])

    const handleSave = async (pkg: Partial<CreditPackage>) => {
        const method = pkg.id ? 'PUT' : 'POST'
        const isEdit = method === 'PUT'
        setStatusBanner('saving-package')
        try {
            const res = await fetchWithAuth('/api/credits/packages', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pkg),
            })
            if (!res.ok) throw new Error(await res.text())
            setEditingPackage(null)
            setStatusBanner(isEdit ? 'update-package-success' : 'create-package-success')
            fetchPackages(true)
            setTimeout(() => setStatusBanner(null), 3000)
        } catch (err) {
            console.error('Save failed:', err)
            setStatusBanner('error: Gagal menyimpan paket')
            setTimeout(() => setStatusBanner(null), 3000)
        }
    }

    const handleDelete = (id: string, creditsText?: number) => {
        setDeletePrompt({
            id,
            type: 'package',
            title: 'Hapus Paket Credit',
            text: `Yakin ingin menghapus paket kredit ${creditsText ? `(${creditsText} credits)` : ''} ini? Tindakan ini tidak dapat dibatalkan.`
        })
    }

    // ── Redeem Code Functions ──

    const fetchRedeemCodes = async (silent = false) => {
        if (!silent) setLoadingRedeem(true)
        try {
            const res = await fetchWithAuth(`/api/credits/redeem?t=${Date.now()}`)
            if (!res.ok) throw new Error('Failed to fetch redeem codes')
            const data = (await res.json()) as unknown
            setRedeemCodes(Array.isArray(data) ? (data as RedeemCode[]) : [])
            if (typeof window !== 'undefined') {
                try {
                    window.sessionStorage.setItem(cacheKeyRedeem, JSON.stringify({ ts: Date.now(), data }))
                } catch {
                    // ignore
                }
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoadingRedeem(false)
        }
    }

    const fetchDiscountVouchers = async (silent = false) => {
        if (!silent) setLoadingDiscount(true)
        try {
            const res = await fetchWithAuth(`/api/discount-vouchers?t=${Date.now()}`)
            if (!res.ok) throw new Error('Failed to fetch discount vouchers')
            const data = (await res.json()) as unknown
            setDiscountVouchers(Array.isArray(data) ? (data as DiscountVoucher[]) : [])
            if (typeof window !== 'undefined') {
                try {
                    window.sessionStorage.setItem(cacheKeyDiscount, JSON.stringify({ ts: Date.now(), data }))
                } catch {
                    // ignore
                }
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoadingDiscount(false)
        }
    }

    const generateRandomCode = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
        let code = ''
        for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
        return code
    }

    const handleCreateRedeem = async () => {
        const code = newCode.code.trim() || generateRandomCode()
        setStatusBanner('creating-redeem')

        let expiresAtISO = null;
        if (newCode.expires_at) {
            expiresAtISO = new Date(newCode.expires_at).toISOString();
        }

        try {
            const res = await fetchWithAuth('/api/credits/redeem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code,
                    credits: newCode.credits,
                    max_uses: newCode.max_uses,
                    expires_at: expiresAtISO,
                }),
            })
            const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
            if (!res.ok) throw new Error(data?.error || 'Gagal membuat kode')
            setStatusBanner(`create-redeem-success:${data?.code ?? code}`)
            setShowCreateRedeem(false)
            setNewCode({ code: '', credits: 10, max_uses: 1, expires_at: '' })
            fetchRedeemCodes(true)
            setTimeout(() => setStatusBanner(null), 3000)
        } catch (err) {
            setStatusBanner(`error: ${err instanceof Error ? err.message : 'Gagal membuat kode'}`)
            setTimeout(() => setStatusBanner(null), 3000)
        }
    }

    const handleToggleRedeem = async (item: RedeemCode) => {
        setStatusBanner('updating-redeem-status')
        try {
            const res = await fetchWithAuth('/api/credits/redeem', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: item.id, is_active: !item.is_active }),
            })
            if (!res.ok) throw new Error(await res.text())
            setStatusBanner(item.is_active ? 'redeem-disabled-success' : 'redeem-enabled-success')
            fetchRedeemCodes(true)
            setTimeout(() => setStatusBanner(null), 3000)
        } catch (err) {
            setStatusBanner('error: Gagal mengubah status')
            setTimeout(() => setStatusBanner(null), 3000)
        }
    }

    const handleDeleteRedeem = (id: string, code: string) => {
        setDeletePrompt({
            id,
            type: 'redeem',
            title: 'Hapus Kode Redeem',
            text: `Yakin ingin menghapus kode redeem "${code}"? Tindakan ini tidak dapat dibatalkan.`
        })
    }

    const handleCreateDiscount = async () => {
        const code = newDiscount.code.trim() || generateRandomCode()
        setStatusBanner('creating-discount')

        let expiresAtISO = null;
        if (newDiscount.expires_at) {
            expiresAtISO = new Date(newDiscount.expires_at).toISOString();
        }

        try {
            const res = await fetchWithAuth('/api/discount-vouchers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code,
                    percent_off: newDiscount.percent_off,
                    max_uses: newDiscount.max_uses,
                    expires_at: expiresAtISO,
                }),
            })
            const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
            if (!res.ok) throw new Error(data?.error || 'Gagal membuat voucher')
            setStatusBanner(`create-discount-success:${data?.code ?? code}`)
            setShowCreateDiscount(false)
            setNewDiscount({ code: '', percent_off: 10, max_uses: 1, expires_at: '' })
            fetchDiscountVouchers(true)
            setTimeout(() => setStatusBanner(null), 3000)
        } catch (err) {
            setStatusBanner(`error: ${err instanceof Error ? err.message : 'Gagal membuat voucher'}`)
            setTimeout(() => setStatusBanner(null), 3000)
        }
    }

    const handleToggleDiscount = async (item: DiscountVoucher) => {
        setStatusBanner('updating-discount-status')
        try {
            const res = await fetchWithAuth('/api/discount-vouchers', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: item.id, is_active: !item.is_active }),
            })
            if (!res.ok) throw new Error(await res.text())
            setStatusBanner(item.is_active ? 'discount-disabled-success' : 'discount-enabled-success')
            fetchDiscountVouchers(true)
            setTimeout(() => setStatusBanner(null), 3000)
        } catch (err) {
            setStatusBanner('error: Gagal mengubah status voucher')
            setTimeout(() => setStatusBanner(null), 3000)
        }
    }

    const handleDeleteDiscount = (id: string, code: string) => {
        setDeletePrompt({
            id,
            type: 'discount',
            title: 'Hapus Voucher Diskon',
            text: `Yakin ingin menghapus voucher diskon "${code}"? Tindakan ini tidak dapat dibatalkan.`
        })
    }

    const executeDelete = async () => {
        if (!deletePrompt) return
        setIsDeleting(true)
        setStatusBanner('deleting-item')
        try {
            if (deletePrompt.type === 'package') {
                const res = await fetchWithAuth('/api/credits/packages', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: deletePrompt.id }),
                })
                if (!res.ok) throw new Error(await res.text())
                setStatusBanner('delete-package-success')
                fetchPackages(true)
            } else if (deletePrompt.type === 'redeem') {
                const res = await fetchWithAuth('/api/credits/redeem', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: deletePrompt.id }),
                })
                if (!res.ok) throw new Error(await res.text())
                setStatusBanner('delete-redeem-success')
                fetchRedeemCodes(true)
            } else if (deletePrompt.type === 'discount') {
                const res = await fetchWithAuth('/api/discount-vouchers', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: deletePrompt.id }),
                })
                if (!res.ok) throw new Error(await res.text())
                setStatusBanner('delete-discount-success')
                fetchDiscountVouchers(true)
            }
            setTimeout(() => setStatusBanner(null), 3000)
        } catch (err) {
            console.error('Delete failed:', err)
            setStatusBanner(`error: Gagal menghapus ${deletePrompt.type === 'package' ? 'paket' : deletePrompt.type === 'redeem' ? 'kode' : 'voucher'}`)
            setTimeout(() => setStatusBanner(null), 3000)
        } finally {
            setIsDeleting(false)
            setDeletePrompt(null)
        }
    }

    const copyCode = (code: string) => {
        navigator.clipboard.writeText(code)
        setStatusBanner('copy-success')
        setTimeout(() => setStatusBanner(null), 2000)
    }

    return (
        <div className="max-w-6xl mx-auto pb-12">
            {editingPackage && (
                <PackageForm pkg={editingPackage} onSave={handleSave} onCancel={() => setEditingPackage(null)} />
            )}

            {statusBanner && (
                <div className={`fixed bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 z-[200] max-w-[90%] md:max-w-sm w-full px-4 py-3 rounded-xl border-2 shadow-[2px_2px_0_0_#334155] transform transition-all animate-bounce-subtle ${statusBanner.startsWith('error:') ? 'bg-rose-100 border-rose-300 text-rose-700' : statusBanner.includes('success') ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-amber-100 border-amber-300 text-amber-700'}`}>
                    <div className="flex items-center gap-2 font-bold text-xs md:text-sm">
                        {statusBanner === 'saving-package' || statusBanner === 'creating-redeem' || statusBanner === 'updating-redeem-status' || statusBanner === 'creating-discount' || statusBanner === 'updating-discount-status' || statusBanner === 'deleting-item'
                            ? <Loader2 className="animate-spin w-4 h-4" />
                            : null}
                        {statusBanner === 'saving-package' ? 'Menyimpan package...' :
                            statusBanner === 'creating-redeem' ? 'Membuat kode redeem...' :
                                statusBanner === 'updating-redeem-status' ? 'Mengubah status kode...' :
                                    statusBanner === 'creating-discount' ? 'Membuat voucher diskon...' :
                                        statusBanner === 'updating-discount-status' ? 'Mengubah status voucher...' :
                                    statusBanner === 'deleting-item' ? 'Menghapus data...' :
                                        statusBanner === 'create-package-success' ? 'Package berhasil dibuat.' :
                                            statusBanner === 'update-package-success' ? 'Package berhasil diperbarui.' :
                                                statusBanner === 'delete-package-success' ? 'Package berhasil dihapus.' :
                                                    statusBanner === 'delete-redeem-success' ? 'Kode redeem berhasil dihapus.' :
                                                        statusBanner === 'delete-discount-success' ? 'Voucher diskon berhasil dihapus.' :
                                                        statusBanner === 'redeem-enabled-success' ? 'Kode redeem berhasil diaktifkan.' :
                                                            statusBanner === 'redeem-disabled-success' ? 'Kode redeem berhasil dinonaktifkan.' :
                                                                statusBanner === 'discount-enabled-success' ? 'Voucher diskon berhasil diaktifkan.' :
                                                                    statusBanner === 'discount-disabled-success' ? 'Voucher diskon berhasil dinonaktifkan.' :
                                                                statusBanner === 'copy-success' ? 'Kode berhasil disalin.' :
                                                                    statusBanner.startsWith('create-redeem-success:') ? `Kode ${statusBanner.replace('create-redeem-success:', '')} berhasil dibuat!` :
                                                                        statusBanner.startsWith('create-discount-success:') ? `Voucher ${statusBanner.replace('create-discount-success:', '')} berhasil dibuat!` :
                                                                        statusBanner.startsWith('error: ') ? `Error: ${statusBanner.replace('error: ', '')}` : statusBanner}
                    </div>
                </div>
            )}

            {/* Create Redeem Code Modal */}
            {showCreateRedeem && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
                    <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-2xl shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] p-5 md:p-6 w-full max-w-md">
                        <div className="flex justify-between items-center mb-5">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Buat Kode Redeem</h2>
                            <button onClick={() => setShowCreateRedeem(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                <X size={20} className="text-slate-700 dark:text-slate-200" strokeWidth={2.5} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Kode Voucher</label>
                                <div className="flex gap-2">
                                    <input
                                        value={newCode.code}
                                        onChange={(e) => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })}
                                        placeholder="AUTO-GENERATE"
                                        className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-200 uppercase font-mono text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setNewCode({ ...newCode, code: generateRandomCode() })}
                                        className="px-3 py-2 bg-pink-100 text-pink-700 rounded-xl text-[10px] font-bold hover:bg-pink-200 transition-all shadow-[2px_2px_0_0_#db2777] hover:shadow-none"
                                    >
                                        GENERATE
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Jumlah Credit</label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={newCode.credits}
                                        onChange={(e) => setNewCode({ ...newCode, credits: Number(e.target.value) })}
                                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-pink-200"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Limit Pakai</label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={newCode.max_uses}
                                        onChange={(e) => setNewCode({ ...newCode, max_uses: Number(e.target.value) })}
                                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-pink-200"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Kadaluarsa (Opsional)</label>
                                <input
                                    type="datetime-local"
                                    value={newCode.expires_at}
                                    onChange={(e) => setNewCode({ ...newCode, expires_at: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-pink-200"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-5">
                            <button
                                type="button"
                                onClick={() => setShowCreateRedeem(false)}
                                className="flex-1 inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-[2px_2px_0_0_#334155] hover:shadow-none whitespace-nowrap"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleCreateRedeem}
                                className="flex-1 inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 bg-pink-400 text-pink-900 rounded-xl font-bold hover:bg-pink-300 transition-all shadow-[2px_2px_0_0_#db2777] hover:shadow-none gap-2 whitespace-nowrap"
                            >
                                <Gift size={16} strokeWidth={2.5} />
                                Buat Kode
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Discount Voucher Modal */}
            {showCreateDiscount && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[120]">
                    <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-2xl shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] p-5 md:p-6 w-full max-w-md">
                        <div className="flex justify-between items-center mb-5">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Buat Voucher Diskon</h2>
                            <button onClick={() => setShowCreateDiscount(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                <X size={20} className="text-slate-700 dark:text-slate-200" strokeWidth={2.5} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Kode Voucher</label>
                                <div className="flex gap-2">
                                    <input
                                        value={newDiscount.code}
                                        onChange={(e) => setNewDiscount({ ...newDiscount, code: e.target.value.toUpperCase() })}
                                        placeholder="AUTO-GENERATE"
                                        className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-200 uppercase font-mono text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setNewDiscount({ ...newDiscount, code: generateRandomCode() })}
                                        className="px-3 py-2 bg-sky-100 text-sky-700 rounded-xl text-[10px] font-bold hover:bg-sky-200 transition-all shadow-[2px_2px_0_0_#0284c7] hover:shadow-none"
                                    >
                                        GENERATE
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Diskon (%)</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={newDiscount.percent_off}
                                        onChange={(e) => setNewDiscount({ ...newDiscount, percent_off: Number(e.target.value) })}
                                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-sky-200"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Limit Pakai</label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={newDiscount.max_uses}
                                        onChange={(e) => setNewDiscount({ ...newDiscount, max_uses: Number(e.target.value) })}
                                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-sky-200"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Kadaluarsa (Opsional)</label>
                                <input
                                    type="datetime-local"
                                    value={newDiscount.expires_at}
                                    onChange={(e) => setNewDiscount({ ...newDiscount, expires_at: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-sky-200"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-5">
                            <button
                                type="button"
                                onClick={() => setShowCreateDiscount(false)}
                                className="flex-1 inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-[2px_2px_0_0_#334155] hover:shadow-none whitespace-nowrap"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleCreateDiscount}
                                className="flex-1 inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 bg-sky-400 text-sky-900 rounded-xl font-bold hover:bg-sky-300 transition-all shadow-[2px_2px_0_0_#0284c7] hover:shadow-none gap-2 whitespace-nowrap"
                            >
                                <Percent size={16} strokeWidth={2.5} />
                                Buat Voucher
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deletePrompt && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[200]">
                    <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-2xl shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] p-5 md:p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                        <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-white">
                            Hapus{' '}
                            {deletePrompt.type === 'package'
                                ? 'Package'
                                : deletePrompt.type === 'redeem'
                                    ? 'Kode Redeem'
                                    : 'Voucher Diskon'}
                            ?
                        </h3>
                        <p className="mt-2 text-xs md:text-sm text-slate-500 dark:text-slate-400">
                            Aksi ini tidak bisa dibatalkan.{' '}
                            {deletePrompt.type === 'package'
                                ? 'Data'
                                : deletePrompt.type === 'redeem'
                                    ? 'Kode'
                                    : 'Voucher'}{' '}
                            yang dipilih akan dihapus permanen.
                        </p>
                        <div className="mt-4 flex gap-3">
                            <button
                                type="button"
                                onClick={() => setDeletePrompt(null)}
                                disabled={isDeleting}
                                className="flex-1 inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] hover:shadow-none disabled:opacity-60 whitespace-nowrap"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={executeDelete}
                                disabled={isDeleting}
                                className="flex-1 inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 bg-rose-400 text-rose-900 rounded-xl font-bold hover:bg-rose-300 transition-all shadow-[2px_2px_0_0_#e11d48] hover:shadow-none disabled:opacity-60 gap-2 whitespace-nowrap"
                            >
                                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Hapus'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6">
                <div className="space-y-1">
                    <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white tracking-tight leading-none">Credit Settings</h1>
                    <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400">Atur harga paket top up & management voucher code promo.</p>
                </div>
                {activeTab === 'packages' ? (
                    <button
                        onClick={() => setEditingPackage({})}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[44px] md:min-h-[48px] px-5 py-2.5 md:px-6 md:py-3 bg-emerald-400 text-emerald-900 rounded-xl font-bold hover:bg-emerald-300 transition-all shadow-[2px_2px_0_0_#059669] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 text-sm md:text-base whitespace-nowrap"
                    >
                        <Plus size={18} className="md:w-5 md:h-5" strokeWidth={2.5} />
                        Tambah Paket Credit
                    </button>
                ) : activeTab === 'redeem' ? (
                    <button
                        onClick={() => setShowCreateRedeem(true)}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[44px] md:min-h-[48px] px-5 py-2.5 md:px-6 md:py-3 bg-pink-400 text-pink-900 rounded-xl font-bold hover:bg-pink-300 transition-all shadow-[2px_2px_0_0_#db2777] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 text-sm md:text-base whitespace-nowrap"
                    >
                        <Gift size={18} className="md:w-5 md:h-5" strokeWidth={2.5} />
                        Buat Kode Redeem
                    </button>
                ) : (
                    <button
                        onClick={() => setShowCreateDiscount(true)}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[44px] md:min-h-[48px] px-5 py-2.5 md:px-6 md:py-3 bg-sky-400 text-sky-900 rounded-xl font-bold hover:bg-sky-300 transition-all shadow-[2px_2px_0_0_#0284c7] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 text-sm md:text-base whitespace-nowrap"
                    >
                        <Percent size={18} className="md:w-5 md:h-5" strokeWidth={2.5} />
                        Buat Voucher Diskon
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="mb-8">
              <div className="relative flex w-full md:w-fit items-center gap-1 p-1 bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b]">
                <div
                  className="absolute top-1 bottom-1 rounded-xl bg-violet-400 transition-all duration-300 ease-out"
                  style={{
                    transform:
                      activeTab === 'packages'
                        ? 'translateX(0)'
                        : activeTab === 'redeem'
                          ? 'translateX(100%)'
                          : 'translateX(200%)',
                    width: 'calc(33.333333% - 6px)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => switchTab('packages')}
                  className={`relative z-10 flex flex-1 md:flex-none min-w-0 items-center justify-center gap-1.5 md:gap-2 px-2 py-1.5 md:px-5 md:py-2 rounded-xl text-[11px] md:text-sm font-bold transition-all duration-200 ${
                    activeTab === 'packages'
                      ? 'text-slate-900'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <Layout className="hidden md:inline-block w-3.5 h-3.5 md:w-5 md:h-5 shrink-0" strokeWidth={2.5} />
                  <span className="truncate">Packages</span>
                  <span className="flex items-center justify-center h-4 md:h-5 px-1 md:px-1.5 bg-slate-900 dark:bg-slate-700 text-white text-[9px] md:text-xs rounded-md md:rounded-lg border-2 border-slate-900 dark:border-slate-600 ml-1">
                    {packages.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('redeem')}
                  className={`relative z-10 flex flex-1 md:flex-none min-w-0 items-center justify-center gap-1.5 md:gap-2 px-2 py-1.5 md:px-5 md:py-2 rounded-xl text-[11px] md:text-sm font-bold transition-all duration-200 ${
                    activeTab === 'redeem'
                      ? 'text-slate-900'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <Hash className="hidden md:inline-block w-3.5 h-3.5 md:w-5 md:h-5 shrink-0" strokeWidth={2.5} />
                  <span className="truncate">Redeems</span>
                  <span className="flex items-center justify-center h-4 md:h-5 px-1 md:px-1.5 bg-slate-900 dark:bg-slate-700 text-white text-[9px] md:text-xs rounded-md md:rounded-lg border-2 border-slate-900 dark:border-slate-600 ml-1">
                    {redeemCodes.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('discount')}
                  className={`relative z-10 flex flex-1 md:flex-none min-w-0 items-center justify-center gap-1.5 md:gap-2 px-2 py-1.5 md:px-5 md:py-2 rounded-xl text-[11px] md:text-sm font-bold transition-all duration-200 ${
                    activeTab === 'discount'
                      ? 'text-slate-900'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <Percent className="hidden md:inline-block w-3.5 h-3.5 md:w-5 md:h-5 shrink-0" strokeWidth={2.5} />
                  <span className="truncate">Discount</span>
                  <span className="flex items-center justify-center h-4 md:h-5 px-1 md:px-1.5 bg-slate-900 dark:bg-slate-700 text-white text-[9px] md:text-xs rounded-md md:rounded-lg border-2 border-slate-900 dark:border-slate-600 ml-1">
                    {discountVouchers.length}
                  </span>
                </button>
              </div>
            </div>

            {activeTab === 'packages' ? (
                <>
                    {loading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 min-h-[320px] sm:min-h-[360px]">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-2xl p-5 md:p-6 animate-pulse shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b]">
                                    <div className="space-y-3">
                                        <div className="h-7 bg-slate-100 dark:bg-slate-800 rounded-xl w-14" />
                                        <div className="h-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg w-10" />
                                        <div className="h-7 bg-slate-50 dark:bg-slate-800 rounded-xl w-full mt-2" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : packages.length === 0 ? (
                          <div className="flex flex-col items-center justify-center min-h-[320px] sm:min-h-[360px] py-16 px-4 md:px-8 text-center bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-3xl border-dashed shadow-[2px_2px_0_0_#94a3b8] dark:shadow-[2px_2px_0_0_#1e293b]">
                              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-4 transform -rotate-3 border-2 border-slate-900 dark:border-slate-700">
                                  <Layout size={32} className="text-slate-400 dark:text-slate-500" strokeWidth={1.5} />
                              </div>
                              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Belum ada paket credit</h3>
                              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 max-w-md mb-6">
                                  Anda belum membuat daftar paket credit. Silakan buat paket baru untuk ditawarkan kepada pelanggan.
                              </p>
                              <button
                                  onClick={() => setEditingPackage({ credits: 0, price: 0, popular: false })}
                                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-emerald-900 rounded-xl font-bold text-sm shadow-[2px_2px_0_0_#059669] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all whitespace-nowrap"
                              >
                                  <Plus size={18} strokeWidth={2.5} />
                                  Buat Paket Credit
                              </button>
                          </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 pb-12">
                            {packages.map((pkg) => (
                                <div key={pkg.id} className="group relative bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-2xl p-5 md:p-6 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] hover:shadow-none hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all overflow-hidden">
                                    <div className="flex justify-between items-start mb-3 md:mb-4">
                                        <div>
                                            <p className="text-2xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-none mb-0.5">{pkg.credits}</p>
                                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Credits</p>
                                        </div>
                                    </div>

                                    <div className="pt-3 md:pt-4 border-t-2 border-slate-100 dark:border-slate-700 flex justify-between items-center gap-2">
                                        <p className="text-lg md:text-xl font-bold text-violet-600 dark:text-violet-400">Rp {pkg.price.toLocaleString('id-ID')}</p>
                                        {pkg.popular && (
                                            <span className="bg-amber-400 dark:bg-amber-600 text-amber-900 dark:text-white text-[9px] md:text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-[2px_2px_0_0_#d97706]">
                                                Popular
                                            </span>
                                        )}
                                    </div>

                                    <div className="absolute top-3 right-3 md:top-4 md:right-4 flex gap-1.5 md:gap-2 lg:opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all">
                                        <button onClick={() => setEditingPackage(pkg)} className="inline-flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900 shadow-[2px_2px_0_0_#d97706] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all">
                                            <Edit className="w-4 h-4" strokeWidth={2.5} />
                                        </button>
                                        <button onClick={() => handleDelete(pkg.id, pkg.credits)} className="inline-flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-900 shadow-[2px_2px_0_0_#e11d48] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all">
                                            <Trash2 className="w-4 h-4" strokeWidth={2.5} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            ) : activeTab === 'redeem' ? (
                <>
                    {loadingRedeem ? (
                        <div className="space-y-6 min-h-[320px] sm:min-h-[360px]">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-[24px] md:rounded-[32px] p-5 md:p-8 animate-pulse shadow-[#64748b] dark:shadow-[2px_2px_0_0_#1e293b] md:shadow-[#64748b] dark:md:shadow-[6px_6px_0_0_#334155]">
                                    <div className="flex justify-between items-center">
                                        <div className="space-y-3">
                                            <div className="h-5 md:h-6 bg-slate-100 dark:bg-slate-800 rounded-lg w-32 md:w-40" />
                                            <div className="h-3 md:h-4 bg-slate-50 dark:bg-slate-800 rounded-lg w-48 md:w-64" />
                                        </div>
                                        <div className="h-8 md:h-10 bg-slate-100 dark:bg-slate-800 rounded-xl w-20 md:w-24" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : redeemCodes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center min-h-[320px] sm:min-h-[360px] py-16 px-4 md:px-8 text-center bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-3xl border-dashed shadow-[2px_2px_0_0_#94a3b8] dark:shadow-[2px_2px_0_0_#1e293b]">
                            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-4 transform -rotate-3 border-2 border-slate-900 dark:border-slate-700">
                                <Gift size={32} className="text-slate-400 dark:text-slate-500" strokeWidth={1.5} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Belum ada kode redeem</h3>
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 max-w-md mb-6">
                                Anda belum membuat daftar kode redeem. Silakan klik "Buat Kode Redeem" untuk mencetak voucher baru.
                            </p>
                            <button
                                onClick={() => setShowCreateRedeem(true)}
                                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 bg-pink-400 hover:bg-pink-300 text-pink-900 rounded-xl font-bold text-sm shadow-[2px_2px_0_0_#db2777] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all whitespace-nowrap"
                            >
                                <Gift size={18} strokeWidth={2.5} />
                                Buat Kode Redeem
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4 pb-20">
                            {redeemCodes.map((item) => {
                                const isExpired = item.expires_at && new Date(item.expires_at) < new Date()
                                const isFull = item.used_count >= item.max_uses
                                const statusColor = !item.is_active || isExpired
                                    ? 'rose'
                                    : isFull
                                        ? 'amber'
                                        : 'emerald'
                                const statusText = !item.is_active
                                    ? 'Nonaktif'
                                    : isExpired
                                        ? 'Kadaluarsa'
                                        : isFull
                                            ? 'Habis'
                                            : 'Aktif'

                                return (
                                    <div
                                        key={item.id}
                                        className={`group relative bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-2xl p-4 md:p-5 transition-all shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] hover:shadow-none hover:-translate-x-0.5 hover:-translate-y-0.5 ${!item.is_active || isExpired || isFull ? 'opacity-60 grayscale-[0.3]' : ''
                                            }`}
                                    >
                                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 md:gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2 mb-2 md:mb-3">
                                                    <div className="px-3 py-1.5 md:px-4 md:py-2 bg-slate-900 dark:bg-slate-700 text-white rounded-lg md:rounded-xl font-mono text-sm md:text-lg font-bold tracking-wider shadow-[2px_2px_0_0_#475569]">
                                                        {item.code}
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            onClick={() => copyCode(item.code)}
                                                            className="p-1.5 md:p-2 rounded-lg bg-pink-50 dark:bg-pink-950/30 text-pink-500 hover:bg-pink-100 dark:hover:bg-pink-900/50 transition-all shadow-[2px_2px_0_0_#db2777] hover:shadow-none"
                                                            title="Copy Code"
                                                        >
                                                            <Copy size={14} className="md:w-4 md:h-4" strokeWidth={2} />
                                                        </button>
                                                        <span className={`text-[9px] md:text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${statusColor === 'emerald' ? 'bg-emerald-100 text-emerald-700' :
                                                            statusColor === 'amber' ? 'bg-amber-100 text-amber-700' :
                                                                'bg-rose-100 text-rose-700'
                                                            }`}>
                                                            {statusText}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-pink-50 dark:bg-pink-950/30 flex items-center justify-center shrink-0">
                                                            <Gift className="w-4 h-4 md:w-5 md:h-5 text-pink-500" strokeWidth={2} />
                                                        </div>
                                                        <div>
                                                            <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bonus</p>
                                                            <p className="text-xs md:text-sm font-bold text-slate-900 dark:text-white">{item.credits} Credits</p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center shrink-0">
                                                            <Users className="w-4 h-4 md:w-5 md:h-5 text-orange-500" strokeWidth={2} />
                                                        </div>
                                                        <div>
                                                            <p className="text-[9px] md:text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">Usage</p>
                                                            <p className="text-xs md:text-sm font-black text-slate-900 dark:text-white">{item.used_count}/{item.max_uses}</p>
                                                        </div>
                                                    </div>

                                                    {item.expires_at && (
                                                        <div className="flex items-center gap-2 md:gap-3 col-span-2 md:col-span-1">
                                                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-blue-100 dark:bg-blue-900/50 border-2 border-slate-900 dark:border-slate-700 flex items-center justify-center shadow-[#64748b] dark:shadow-[2px_2px_0_0_#1e293b]">
                                                                <Clock className="w-4 h-4 md:w-5 md:h-5 text-blue-600 dark:text-blue-400" strokeWidth={2.5} />
                                                            </div>
                                                            <div>
                                                                <p className="text-[9px] md:text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">Expiry</p>
                                                                <p className="text-xs md:text-sm font-black text-slate-900 dark:text-white">
                                                                    {formatIdDateTimeNoPukul(item.expires_at)}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex lg:flex-col items-center justify-end gap-2 lg:pl-4 lg:border-l-2 lg:border-slate-100 dark:lg:border-slate-700 shrink-0 mt-2 lg:mt-0">
                                                <button
                                                    onClick={() => handleToggleRedeem(item)}
                                                    className={`flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-xl border-2 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] hover:shadow-none hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all ${item.is_active ? 'bg-emerald-100 dark:bg-emerald-900/50 border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500'
                                                        }`}
                                                    title={item.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                                                >
                                                    {item.is_active ? <ToggleRight size={18} className="md:w-5 md:h-5" strokeWidth={2} /> : <ToggleLeft size={18} className="md:w-5 md:h-5" strokeWidth={2} />}
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteRedeem(item.id, item.code)}
                                                    className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-xl bg-rose-100 dark:bg-rose-900/50 border-2 border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-400 shadow-[2px_2px_0_0_#e11d48] hover:shadow-none hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all"
                                                    title="Hapus"
                                                >
                                                    <Trash2 size={16} className="md:w-4 md:h-4" strokeWidth={2} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </>
            ) : (
                <>
                    {loadingDiscount ? (
                        <div className="space-y-6 min-h-[320px] sm:min-h-[360px]">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-[24px] md:rounded-[32px] p-5 md:p-8 animate-pulse shadow-[#64748b] dark:shadow-[2px_2px_0_0_#1e293b] md:shadow-[#64748b] dark:md:shadow-[6px_6px_0_0_#334155]">
                                    <div className="flex justify-between items-center">
                                        <div className="space-y-3">
                                            <div className="h-5 md:h-6 bg-slate-100 dark:bg-slate-800 rounded-lg w-32 md:w-40" />
                                            <div className="h-3 md:h-4 bg-slate-50 dark:bg-slate-800 rounded-lg w-48 md:w-64" />
                                        </div>
                                        <div className="h-8 md:h-10 bg-slate-100 dark:bg-slate-800 rounded-xl w-20 md:w-24" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : discountVouchers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center min-h-[320px] sm:min-h-[360px] py-16 px-4 md:px-8 text-center bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-3xl border-dashed shadow-[2px_2px_0_0_#94a3b8] dark:shadow-[2px_2px_0_0_#1e293b]">
                            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-4 transform -rotate-3 border-2 border-slate-900 dark:border-slate-700">
                                <Percent size={32} className="text-slate-400 dark:text-slate-500" strokeWidth={1.5} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Belum ada voucher diskon</h3>
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 max-w-md mb-6">
                                Buat voucher diskon persentase untuk promo di halaman pricing.
                            </p>
                            <button
                                onClick={() => setShowCreateDiscount(true)}
                                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 bg-sky-400 hover:bg-sky-300 text-sky-900 rounded-xl font-bold text-sm shadow-[2px_2px_0_0_#0284c7] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all whitespace-nowrap"
                            >
                                <Plus size={18} strokeWidth={2.5} />
                                Buat Voucher Diskon
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4 pb-20">
                            {discountVouchers.map((item) => {
                                const isExpired = item.expires_at && new Date(item.expires_at) < new Date()
                                const isFull = item.used_count >= item.max_uses
                                const statusColor = !item.is_active || isExpired
                                    ? 'rose'
                                    : isFull
                                        ? 'amber'
                                        : 'emerald'
                                const statusText = !item.is_active
                                    ? 'Nonaktif'
                                    : isExpired
                                        ? 'Kadaluarsa'
                                        : isFull
                                            ? 'Habis'
                                            : 'Aktif'

                                return (
                                    <div
                                        key={item.id}
                                        className={`group relative bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-2xl p-4 md:p-5 transition-all shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] hover:shadow-none hover:-translate-x-0.5 hover:-translate-y-0.5 ${!item.is_active || isExpired || isFull ? 'opacity-60 grayscale-[0.3]' : ''
                                            }`}
                                    >
                                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 md:gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2 mb-2 md:mb-3">
                                                    <div className="px-3 py-1.5 md:px-4 md:py-2 bg-slate-900 dark:bg-slate-700 text-white rounded-lg md:rounded-xl font-mono text-sm md:text-lg font-bold tracking-wider shadow-[2px_2px_0_0_#475569]">
                                                        {item.code}
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            onClick={() => copyCode(item.code)}
                                                            className="p-1.5 md:p-2 rounded-lg bg-sky-50 dark:bg-sky-950/30 text-sky-600 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-all shadow-[2px_2px_0_0_#0284c7] hover:shadow-none"
                                                            title="Copy Code"
                                                        >
                                                            <Copy size={14} className="md:w-4 md:h-4" strokeWidth={2} />
                                                        </button>
                                                        <span className={`text-[9px] md:text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${statusColor === 'emerald' ? 'bg-emerald-100 text-emerald-700' :
                                                            statusColor === 'amber' ? 'bg-amber-100 text-amber-700' :
                                                                'bg-rose-100 text-rose-700'
                                                            }`}>
                                                            {statusText}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-sky-50 dark:bg-sky-950/30 flex items-center justify-center shrink-0">
                                                            <Percent className="w-4 h-4 md:w-5 md:h-5 text-sky-600" strokeWidth={2} />
                                                        </div>
                                                        <div>
                                                            <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Diskon</p>
                                                            <p className="text-xs md:text-sm font-bold text-slate-900 dark:text-white">{item.percent_off}%</p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center shrink-0">
                                                            <Users className="w-4 h-4 md:w-5 md:h-5 text-orange-500" strokeWidth={2} />
                                                        </div>
                                                        <div>
                                                            <p className="text-[9px] md:text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">Usage</p>
                                                            <p className="text-xs md:text-sm font-black text-slate-900 dark:text-white">{item.used_count}/{item.max_uses}</p>
                                                        </div>
                                                    </div>

                                                    {item.expires_at && (
                                                        <div className="flex items-center gap-2 md:gap-3 col-span-2 md:col-span-1">
                                                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-blue-100 dark:bg-blue-900/50 border-2 border-slate-900 dark:border-slate-700 flex items-center justify-center shadow-[#64748b] dark:shadow-[2px_2px_0_0_#1e293b]">
                                                                <Clock className="w-4 h-4 md:w-5 md:h-5 text-blue-600 dark:text-blue-400" strokeWidth={2.5} />
                                                            </div>
                                                            <div>
                                                                <p className="text-[9px] md:text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">Expiry</p>
                                                                <p className="text-xs md:text-sm font-black text-slate-900 dark:text-white">
                                                                    {formatIdDateTimeNoPukul(item.expires_at)}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex lg:flex-col items-center justify-end gap-2 lg:pl-4 lg:border-l-2 lg:border-slate-100 dark:lg:border-slate-700 shrink-0 mt-2 lg:mt-0">
                                                <button
                                                    onClick={() => handleToggleDiscount(item)}
                                                    className={`flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-xl border-2 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] hover:shadow-none hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all ${item.is_active ? 'bg-emerald-100 dark:bg-emerald-900/50 border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500'
                                                        }`}
                                                    title={item.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                                                >
                                                    {item.is_active ? <ToggleRight size={18} className="md:w-5 md:h-5" strokeWidth={2} /> : <ToggleLeft size={18} className="md:w-5 md:h-5" strokeWidth={2} />}
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteDiscount(item.id, item.code)}
                                                    className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-xl bg-rose-100 dark:bg-rose-900/50 border-2 border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-400 shadow-[2px_2px_0_0_#e11d48] hover:shadow-none hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all"
                                                    title="Hapus"
                                                >
                                                    <Trash2 size={16} className="md:w-4 md:h-4" strokeWidth={2} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}







