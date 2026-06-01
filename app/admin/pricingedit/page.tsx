'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Edit, Plus, Save, Trash2, X, Book, Sparkles, Star, ChevronRight, Layout, Zap, RefreshCw } from 'lucide-react'
import { fetchWithAuth } from '../../../lib/api-client'

interface PricingPackage {
  id: string
  name: string
  price_per_student: number
  min_students: number
  features: string[]
  flipbook_enabled: boolean
  ai_labs_features: string[]
  is_popular: boolean
}

interface AiFeaturePricing {
  id: string
  feature_slug: string
  credits_per_use: number
  credits_per_unlock: number
  /** JSON: {"5":1,"10":2,"12":3} — kredit per detik (Photo to Video) */
  duration_credits_json?: string | null
}

const PTV_SEC_MIN = 2
const PTV_SEC_MAX = 12

type PtvDurRow = { id: string; sec: number | ''; credits: number }

function newPtvRowId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `ptv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function parsePtvDurRows(item: AiFeaturePricing): PtvDurRow[] {
  const fb = item.credits_per_use ?? 0
  let o: Record<string, number> = {}
  try {
    if (item.duration_credits_json?.trim()) {
      o = JSON.parse(item.duration_credits_json) as Record<string, number>
    }
  } catch {
    o = {}
  }
  const keys = Object.keys(o)
    .map((k) => parseInt(k, 10))
    .filter((n) => Number.isFinite(n) && n >= PTV_SEC_MIN && n <= PTV_SEC_MAX)
    .sort((a, b) => a - b)
  if (keys.length === 0) {
    return [
      { id: newPtvRowId(), sec: 5, credits: fb },
      { id: newPtvRowId(), sec: 10, credits: fb },
    ]
  }
  return keys.map((n) => ({
    id: newPtvRowId(),
    sec: n,
    credits: typeof o[String(n)] === 'number' && o[String(n)] >= 0 ? o[String(n)] : fb,
  }))
}

function buildPtvDurationJsonFromRows(
  rows: PtvDurRow[]
): { json: string; creditsPerUse: number } | { error: string } {
  const o: Record<string, number> = {}
  const seen = new Set<number>()
  const creditVals: number[] = []
  for (const r of rows) {
    if (r.sec === '' || !Number.isFinite(Number(r.sec))) continue
    const s = Math.round(Number(r.sec))
    if (s < PTV_SEC_MIN || s > PTV_SEC_MAX) {
      return {
        error: `Durasi ${s} di luar rentang ${PTV_SEC_MIN}–${PTV_SEC_MAX} detik (batas Seedance).`,
      }
    }
    if (seen.has(s)) {
      return { error: `Ada duplikat durasi: ${s} detik.` }
    }
    seen.add(s)
    const c = Math.max(0, r.credits)
    o[String(s)] = c
    creditVals.push(c)
  }
  if (seen.size === 0) {
    return { error: 'Isi minimal satu baris: detik (angka) dan kredit.' }
  }
  return {
    json: JSON.stringify(o),
    creditsPerUse: Math.min(...creditVals),
  }
}

function formatPtvGenerateLine(item: AiFeaturePricing): string {
  try {
    const o = item.duration_credits_json?.trim()
      ? (JSON.parse(item.duration_credits_json!) as Record<string, number>)
      : {}
    const keys = Object.keys(o)
      .map((k) => parseInt(k, 10))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b)
    if (keys.length === 0) return `${item.credits_per_use}`
    return keys.map((k) => `${k}s: ${o[String(k)]}`).join(' · ')
  } catch {
    return `${item.credits_per_use}`
  }
}

const AI_FEATURE_LABELS: Record<string, string> = {
  tryon: 'Try On',
  pose: 'Pose',
  photogroup: 'Photo Group',
  phototovideo: 'Photo to Video',
  image_remove_bg: 'Image Editor',
  enhance: 'Photo Enhance',
  flipbook_unlock: 'Flipbook',
}

// Slugs yang punya biaya generate (bukan unlock-only)
const GENERATE_SLUGS = new Set(['tryon', 'pose', 'photogroup', 'phototovideo', 'image_remove_bg', 'enhance'])

const DEFAULT_PACKAGE_FORM: Partial<PricingPackage> = {
  name: '',
  price_per_student: 0,
  // Tidak dipakai lagi untuk perhitungan; tetap ada di schema backend.
  min_students: 0,
  features: [],
  flipbook_enabled: false,
  ai_labs_features: [],
  is_popular: false,
}

const PackageForm = ({ pkg, onSave, onCancel }: { pkg: Partial<PricingPackage> | null, onSave: (p: Partial<PricingPackage>) => void, onCancel: () => void }) => {
  const [formData, setFormData] = useState<Partial<PricingPackage>>({
    ...DEFAULT_PACKAGE_FORM,
    ...(pkg ?? {}),
  })

  const [addons, setAddons] = useState<{ name: string, price: number }[]>(() => {
    return (formData.features || []).map(f => {
      try {
        const parsed = JSON.parse(f);
        if (parsed.name) return { name: parsed.name, price: Number(parsed.price) || 0 };
      } catch (e) { }
      return { name: f, price: 0 };
    })
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    if (type === 'number') {
      setFormData({ ...formData, [name]: Number(value) })
    } else {
      setFormData({ ...formData, [name]: value })
    }
  }

  const handleAddonNameChange = (index: number, name: string) => {
    const newAddons = [...addons];
    newAddons[index].name = name;
    setAddons(newAddons);
  }

  const handleAddonPriceChange = (index: number, price: number) => {
    const newAddons = [...addons];
    newAddons[index].price = price;
    setAddons(newAddons);
  }

  const removeAddon = (index: number) => {
    setAddons(addons.filter((_, i) => i !== index));
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    const features = addons.map(a => JSON.stringify(a));
    onSave({ ...formData, features })
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-2xl shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] p-5 md:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{pkg?.id ? 'Edit Package' : 'New Package'}</h2>
          <button onClick={onCancel} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={20} className="text-slate-700 dark:text-slate-200" strokeWidth={2.5} />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Package Name</label>
              <input name="name" value={formData.name} onChange={handleChange} placeholder="e.g. Gold" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-violet-200" required />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Price / Student</label>
              <input name="price_per_student" type="number" value={formData.price_per_student} onChange={handleChange} placeholder="0" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-violet-200" required />
            </div>

            <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border-2 border-slate-900 dark:border-slate-700">
              <div className="flex justify-between items-center mb-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Features</p>
                <button type="button" onClick={() => setAddons([...addons, { name: '', price: 0 }])} className="text-[10px] bg-emerald-100 text-emerald-700 px-2.5 py-1.5 rounded-lg hover:bg-emerald-200 font-bold transition-all shadow-[2px_2px_0_0_#059669] hover:shadow-none">
                  + Add
                </button>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {addons.length === 0 && <p className="text-[10px] text-slate-400 font-medium italic py-2 text-center">Belum ada add-on.</p>}
                {addons.map((addon, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={addon.name}
                      onChange={(e) => handleAddonNameChange(idx, e.target.value)}
                      placeholder="Fitur"
                      className="flex-1 p-2 text-xs bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-violet-200"
                      required
                    />
                    <input
                      type="number"
                      value={addon.price || ''}
                      onChange={(e) => handleAddonPriceChange(idx, Number(e.target.value))}
                      placeholder="Rp"
                      className="w-20 p-2 text-xs bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                    <button type="button" onClick={() => removeAddon(idx)} className="inline-flex items-center justify-center w-8 h-8 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 border-2 border-slate-900 dark:border-slate-700 rounded-xl bg-amber-50 dark:bg-slate-800">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={!!formData.is_popular}
                    onChange={(e) => setFormData({ ...formData, is_popular: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-200 dark:bg-slate-600 rounded-full peer-checked:bg-amber-400 transition-colors" />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
                </div>
                <span className="text-sm text-slate-900 dark:text-white font-bold flex items-center gap-2">
                  <Star size={14} className="text-amber-500 fill-amber-500" />
                  Popular
                </span>
              </label>
            </div>

            <div className="space-y-2">
              <div className="p-3 border-2 border-slate-900 dark:border-slate-700 rounded-xl bg-sky-50 dark:bg-slate-800">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={!!formData.flipbook_enabled}
                      onChange={(e) => setFormData({ ...formData, flipbook_enabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-200 dark:bg-slate-600 rounded-full peer-checked:bg-sky-400 transition-colors" />
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
                  </div>
                  <span className="text-sm text-slate-900 dark:text-white font-bold flex items-center gap-2">
                    <Book size={14} className="text-sky-500" />
                    Enable Flipbook
                  </span>
                </label>
              </div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-4">Included AI Labs</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(AI_FEATURE_LABELS)
                  .filter(([slug]) => slug !== 'flipbook_unlock')
                  .map(([slug, label]) => (
                  <label key={slug} className={`flex items-center gap-2 p-2 rounded-xl border-2 transition-all cursor-pointer select-none ${(formData.ai_labs_features ?? []).includes(slug) ? 'bg-violet-100 border-violet-300 dark:bg-violet-900/30 dark:border-violet-700' : 'bg-white dark:bg-slate-800 border-slate-900 dark:border-slate-700'
                    }`}>
                    <input
                      type="checkbox"
                      checked={(formData.ai_labs_features ?? []).includes(slug)}
                      onChange={(e) => {
                        const current = formData.ai_labs_features ?? []
                        setFormData({
                          ...formData,
                          ai_labs_features: e.target.checked
                            ? [...current, slug]
                            : current.filter((s) => s !== slug),
                        })
                      }}
                      className="w-4 h-4 rounded border-2 border-slate-300 dark:border-slate-600 text-violet-600 focus:ring-violet-200"
                    />
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 truncate">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onCancel} className="flex-1 px-4 py-2.5 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-[2px_2px_0_0_#334155] hover:shadow-none">
              Cancel
            </button>
            <button type="submit" className="flex-1 px-4 py-2.5 bg-emerald-400 text-emerald-900 rounded-xl font-bold hover:bg-emerald-300 transition-all shadow-[2px_2px_0_0_#059669] hover:shadow-none">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function PricingEditPage() {
  const [packages, setPackages] = useState<PricingPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [editingPackage, setEditingPackage] = useState<Partial<PricingPackage> | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  type ActiveTab = 'yearbook' | 'ai'
  const VALID_TABS: ActiveTab[] = ['yearbook', 'ai']
  const getTabFromHash = (): ActiveTab => {
    if (typeof window === 'undefined') return 'yearbook'
    const hash = window.location.hash.replace('#', '') as ActiveTab
    return VALID_TABS.includes(hash) ? hash : 'yearbook'
  }
  const [activeTab, setActiveTab] = useState<ActiveTab>(getTabFromHash)
  const switchTab = (tab: ActiveTab) => {
    setActiveTab(tab)
    window.location.hash = tab
  }
  const [aiPricing, setAiPricing] = useState<AiFeaturePricing[]>([])
  const [loadingAi, setLoadingAi] = useState(true)
  const [editingAi, setEditingAi] = useState<AiFeaturePricing | null>(null)
  const isAnyModalOpen = !!editingPackage || !!deleteTargetId || !!editingAi

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
  const [ptvDurRows, setPtvDurRows] = useState<PtvDurRow[]>([
    { id: newPtvRowId(), sec: 5, credits: 1 },
    { id: newPtvRowId(), sec: 10, credits: 1 },
  ])
  const hasCachePackagesRef = useRef(false)
  const hasCacheAiRef = useRef(false)

  const cacheKeyPackages = 'admin_pricing_packages_v1'
  const cacheKeyAi = 'admin_ai_pricing_v2'

  // Instant render from cache to avoid skeleton when switching sidebar (before paint).
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const pkgRaw = window.sessionStorage.getItem(cacheKeyPackages)
      const aiRaw = window.sessionStorage.getItem(cacheKeyAi)
      if (pkgRaw) {
        const parsed = JSON.parse(pkgRaw) as { ts: number; data: PricingPackage[] }
        if (Array.isArray(parsed?.data)) {
          setPackages(parsed.data)
          setLoading(false)
          hasCachePackagesRef.current = true
        }
      }
      if (aiRaw) {
        const parsed = JSON.parse(aiRaw) as { ts: number; data: AiFeaturePricing[] }
        if (Array.isArray(parsed?.data)) {
          setAiPricing(parsed.data)
          setLoadingAi(false)
          hasCacheAiRef.current = true
        }
      }
    } catch {
      // ignore
    }
  }, [])

  const fetchPackages = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetchWithAuth(`/api/pricing?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch packages')
      const data = (await res.json()) as unknown
      const list = Array.isArray(data) ? (data as PricingPackage[]) : []
      list.sort((a, b) => a.price_per_student - b.price_per_student)
      setPackages(list)
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem(cacheKeyPackages, JSON.stringify({ ts: Date.now(), data: list }))
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const fetchAiPricing = async (silent = false) => {
    if (!silent) setLoadingAi(true)
    try {
      const res = await fetchWithAuth(`/api/admin/ai-edit?t=${Date.now()}`)
      if (!res.ok) throw new Error('Failed to fetch AI pricing')
      const data = (await res.json()) as unknown
      setAiPricing(Array.isArray(data) ? (data as AiFeaturePricing[]) : [])
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem(cacheKeyAi, JSON.stringify({ ts: Date.now(), data }))
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      if (!silent) setLoadingAi(false)
    }
  }

  useEffect(() => {
    fetchPackages(hasCachePackagesRef.current)
    fetchAiPricing(hasCacheAiRef.current)
  }, [])

  useEffect(() => {
    const lastFetchRef = { ai: 0, pricing: 0 }
    const onRealtime = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; channel?: string; payload?: Record<string, unknown> }>).detail
      if (!detail?.type || detail.channel !== 'global') return
      if (detail.type !== 'api.mutated') return
      const path = typeof detail.payload?.path === 'string' ? (detail.payload.path as string) : ''
      const now = Date.now()

      if (path === '/api/admin/ai-edit') {
        if (now - lastFetchRef.ai < 800) return
        lastFetchRef.ai = now
        // Auto-refresh AI pricing across devices
        fetchAiPricing(true)
        return
      }

      if (path === '/api/pricing') {
        if (now - lastFetchRef.pricing < 800) return
        lastFetchRef.pricing = now
        // Auto-refresh yearbook pricing across devices
        fetchPackages(true)
      }
    }
    window.addEventListener('fresh:realtime', onRealtime)
    return () => window.removeEventListener('fresh:realtime', onRealtime)
  }, [])

  useEffect(() => {
    if (editingAi?.feature_slug === 'phototovideo') {
      setPtvDurRows(parsePtvDurRows(editingAi))
    }
  }, [editingAi])

  const [saveStatus, setSaveStatus] = useState<string | null>(null)

  const handleSave = async (pkg: Partial<PricingPackage>) => {
    const method = pkg.id ? 'PUT' : 'POST'
    const isEdit = method === 'PUT'
    console.log('[SAVE] method:', method, 'pkg:', JSON.stringify(pkg))
    setSaveStatus('saving')
    try {
      const res = await fetchWithAuth('/api/pricing', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pkg),
      })
      const responseText = await res.text()
      console.log('[SAVE] response status:', res.status, 'body:', responseText)
      if (!res.ok) {
        setSaveStatus('error: ' + responseText)
        alert('Save gagal: ' + responseText)
        return
      }
      setSaveStatus(isEdit ? 'update-success' : 'create-success')
      setEditingPackage(null)
      await fetchPackages()
      setTimeout(() => setSaveStatus(null), 3000)
    } catch (err) {
      console.error('Save failed:', err)
      const msg = err instanceof Error ? err.message : String(err)
      setSaveStatus('error: ' + msg)
      alert('Save gagal: ' + msg)
    }
  }

  const handleSaveAi = async (item: AiFeaturePricing) => {
    setSaveStatus('saving')
    try {
      const payload: Record<string, unknown> = {
        id: item.id,
        feature_slug: item.feature_slug,
        credits_per_unlock: item.credits_per_unlock,
      }
      if (item.feature_slug === 'phototovideo') {
        const built = buildPtvDurationJsonFromRows(ptvDurRows)
        if ('error' in built) {
          alert(built.error)
          setSaveStatus(null)
          return
        }
        payload.credits_per_use = built.creditsPerUse
        payload.duration_credits_json = built.json
      } else {
        payload.credits_per_use = item.credits_per_use
      }
      const res = await fetchWithAuth('/api/admin/ai-edit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      setEditingAi(null)
      fetchAiPricing()
      setSaveStatus('ai-update-success')
      setTimeout(() => setSaveStatus(null), 3000)
    } catch (err) {
      console.error('Save AI pricing failed:', err)
      const msg = err instanceof Error ? err.message : String(err)
      setSaveStatus('error: ' + msg)
      alert('Save gagal: ' + msg)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleteTargetId(id)
  }

  const confirmDelete = async () => {
    if (!deleteTargetId) return
    setDeleting(true)
    setSaveStatus('deleting')
    try {
      const res = await fetchWithAuth('/api/pricing', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTargetId }),
      })
      if (!res.ok) throw new Error(await res.text())
      setDeleteTargetId(null)
      setSaveStatus('delete-success')
      fetchPackages()
      setTimeout(() => setSaveStatus(null), 3000)
    } catch (err) {
      console.error('Delete failed:', err)
      const msg = err instanceof Error ? err.message : String(err)
      setSaveStatus('delete-error: ' + msg)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-0 sm:p-0 md:p-0">
      {editingPackage && (
        <PackageForm pkg={editingPackage} onSave={handleSave} onCancel={() => setEditingPackage(null)} />
      )}
      {deleteTargetId && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[200]">
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-2xl shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] p-5 md:p-6 w-full max-w-sm">
            <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-white">Hapus Package?</h3>
            <p className="mt-2 text-xs md:text-sm text-slate-500 dark:text-slate-400">
              Aksi ini tidak bisa dibatalkan. Data package yang dipilih akan dihapus permanen.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTargetId(null)}
                className="flex-1 px-4 py-2.5 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] hover:shadow-none disabled:opacity-60"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmDelete}
                className="flex-1 px-4 py-2.5 bg-rose-400 text-rose-900 rounded-xl font-bold hover:bg-rose-300 transition-all shadow-[2px_2px_0_0_#e11d48] hover:shadow-none disabled:opacity-60"
              >
                {deleting ? 'Menghapus...' : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
      {saveStatus && (
        <div className={`fixed bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 z-[200] max-w-[90%] md:max-w-sm w-full px-4 py-3 rounded-xl border-2 shadow-[2px_2px_0_0_#334155] transform transition-all animate-bounce-subtle ${saveStatus === 'saving' ? 'bg-amber-100 border-amber-300 text-amber-700' :
          saveStatus === 'create-success' || saveStatus === 'update-success' || saveStatus === 'delete-success' || saveStatus === 'ai-update-success' ? 'bg-emerald-100 border-emerald-300 text-emerald-700' :
          saveStatus === 'deleting' ? 'bg-amber-100 border-amber-300 text-amber-700' :
            'bg-rose-100 border-rose-300 text-rose-700'
          }`}>
          <div className="flex items-center gap-2 font-bold text-xs md:text-sm">
            {saveStatus === 'saving' || saveStatus === 'deleting' ? <RefreshCw className="animate-spin w-4 h-4" /> : null}
            {saveStatus === 'saving' ? 'Processing...' :
              saveStatus === 'deleting' ? 'Deleting package...' :
              saveStatus === 'create-success' ? 'Package berhasil dibuat.' :
              saveStatus === 'update-success' ? 'Package berhasil diperbarui.' :
              saveStatus === 'ai-update-success' ? 'AI pricing berhasil disimpan.' :
              saveStatus === 'delete-success' ? 'Package berhasil dihapus.' :
              saveStatus.startsWith('delete-error: ') ? `Error: ${saveStatus.replace('delete-error: ', '')}` :
                `Error: ${saveStatus}`}
          </div>
        </div>
      )}
      {editingAi && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-2xl shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] p-5 md:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white mb-4">
              Pricing: {AI_FEATURE_LABELS[editingAi.feature_slug] ?? editingAi.feature_slug}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSaveAi(editingAi)
              }}
              className="space-y-4"
            >
              <div className="space-y-3">
                {editingAi.feature_slug !== 'flipbook_unlock' && editingAi.feature_slug !== 'phototovideo' && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Credit per Gen</label>
                    <input
                      name="credits_per_use"
                      type="number"
                      min={0}
                      value={editingAi.credits_per_use}
                      onChange={(e) =>
                        setEditingAi({
                          ...editingAi,
                          credits_per_use: Number(e.target.value),
                        })
                      }
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-violet-200"
                      required
                    />
                  </div>
                )}
                {editingAi.feature_slug === 'phototovideo' && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                      Tambah baris dengan <span className="font-bold">+</span>: isi <span className="font-bold">detik</span> (bilangan bulat {PTV_SEC_MIN}–{PTV_SEC_MAX}) dan <span className="font-bold">kredit</span> per generate.
                    </p>
                    <div className="rounded-xl border-2 border-slate-900 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Durasi &amp; kredit
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setPtvDurRows((prev) => [
                              ...prev,
                              { id: newPtvRowId(), sec: '', credits: 0 },
                            ])
                          }
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-bold hover:bg-emerald-200 transition-all shadow-[2px_2px_0_0_#059669] hover:shadow-none"
                        >
                          <Plus size={14} strokeWidth={2.5} />
                          Baris
                        </button>
                      </div>
                      <div className="space-y-2 md:space-y-3">
                        {ptvDurRows.map((row) => (
                          <div
                            key={row.id}
                            className="flex flex-wrap items-end gap-2"
                          >
                            <div className="flex-1 min-w-[4.5rem]">
                              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                                Detik
                              </label>
                              <input
                                type="number"
                                min={PTV_SEC_MIN}
                                max={PTV_SEC_MAX}
                                step={1}
                                placeholder={`${PTV_SEC_MIN}–${PTV_SEC_MAX}`}
                                value={row.sec === '' ? '' : row.sec}
                                onChange={(e) => {
                                  const v = e.target.value
                                  setPtvDurRows((prev) =>
                                    prev.map((r) =>
                                      r.id === row.id
                                        ? {
                                            ...r,
                                            sec: v === '' ? '' : Number(v),
                                          }
                                        : r
                                    )
                                  )
                                }}
                                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
                              />
                            </div>
                            <div className="flex-1 min-w-[4.5rem]">
                              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                                Kredit
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={row.credits}
                                onChange={(e) =>
                                  setPtvDurRows((prev) =>
                                    prev.map((r) =>
                                      r.id === row.id
                                        ? { ...r, credits: Number(e.target.value) }
                                        : r
                                    )
                                  )
                                }
                                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
                              />
                            </div>
                            <button
                              type="button"
                              disabled={ptvDurRows.length <= 1}
                              onClick={() =>
                                setPtvDurRows((prev) =>
                                  prev.filter((r) => r.id !== row.id)
                                )
                              }
                              className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-rose-100 text-rose-600 hover:bg-rose-200 disabled:opacity-40 disabled:pointer-events-none transition-colors shadow-[2px_2px_0_0_#e11d48] hover:shadow-none"
                              title="Hapus baris"
                            >
                              <Trash2 className="w-4 h-4 md:w-5 md:h-5" strokeWidth={3} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Credit per Unlock</label>
                  <input
                    name="credits_per_unlock"
                    type="number"
                    min={0}
                    value={editingAi.credits_per_unlock}
                    onChange={(e) =>
                      setEditingAi({
                        ...editingAi,
                        credits_per_unlock: Number(e.target.value),
                      })
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-violet-200"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingAi(null)}
                  className="flex-1 px-4 py-2.5 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-[2px_2px_0_0_#334155] hover:shadow-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-sky-400 text-sky-900 rounded-xl font-bold hover:bg-sky-300 transition-all shadow-[2px_2px_0_0_#0284c7] hover:shadow-none"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="max-w-6xl mx-auto pb-12">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6">
          <div className="space-y-1">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {activeTab === 'yearbook' ? 'Pricing Yearbook' : 'Pricing AI'}
            </h1>
            <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400">
              {activeTab === 'yearbook' ? 'Kelola paket harga yearbook.' : 'Kelola biaya unlock & generate.'}
            </p>
          </div>
          {activeTab === 'yearbook' && (
            <button
              onClick={() => setEditingPackage({})}
              className="hidden sm:inline-flex items-center justify-center gap-2 min-h-[44px] md:min-h-[48px] px-5 py-2.5 md:px-6 md:py-3 bg-emerald-400 text-emerald-900 rounded-xl font-bold hover:bg-emerald-300 transition-all shadow-[2px_2px_0_0_#059669] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 text-sm md:text-base whitespace-nowrap"
            >
              <Plus size={18} className="md:w-5 md:h-5" strokeWidth={2.5} />
              Buat Paket
            </button>
          )}
        </div>

      {/* Tabs */}
      <div className="mb-8">
        <div className="relative flex w-full md:w-fit items-center gap-1 p-1 bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b]">
          <div
            className="absolute top-1 bottom-1 rounded-xl bg-violet-400 transition-all duration-300 ease-out"
            style={{
              transform: activeTab === 'yearbook' ? 'translateX(0)' : 'translateX(100%)',
              width: 'calc(50% - 6px)',
            }}
          />
          <button
            type="button"
            onClick={() => switchTab('yearbook')}
            className={`relative z-10 flex flex-1 md:flex-none min-w-0 items-center justify-center gap-1.5 md:gap-2 px-2 py-1.5 md:px-5 md:py-2 rounded-xl text-[11px] md:text-sm font-bold transition-all duration-200 ${
              activeTab === 'yearbook'
                ? 'text-slate-900'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Layout className="hidden md:inline-block w-3.5 h-3.5 md:w-5 md:h-5 shrink-0" strokeWidth={2.5} />
            <span className="truncate">Yearbook</span>
            <span className="flex items-center justify-center h-4 md:h-5 px-1 md:px-1.5 bg-slate-900 dark:bg-slate-700 text-white text-[9px] md:text-xs rounded-md md:rounded-lg border-2 border-slate-900 dark:border-slate-600 ml-1">
              {packages.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => switchTab('ai')}
            className={`relative z-10 flex flex-1 md:flex-none min-w-0 items-center justify-center gap-1.5 md:gap-2 px-2 py-1.5 md:px-5 md:py-2 rounded-xl text-[11px] md:text-sm font-bold transition-all duration-200 ${
              activeTab === 'ai'
                ? 'text-slate-900'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Zap className="hidden md:inline-block w-3.5 h-3.5 md:w-5 md:h-5 shrink-0" strokeWidth={2.5} />
            <span className="truncate">Unlock & Gen</span>
            <span className="flex items-center justify-center h-4 md:h-5 px-1 md:px-1.5 bg-slate-900 dark:bg-slate-700 text-white text-[9px] md:text-xs rounded-md md:rounded-lg border-2 border-slate-900 dark:border-slate-600 ml-1">
              {aiPricing.length}
            </span>
          </button>
        </div>
        {activeTab === 'yearbook' && (
          <button
            onClick={() => setEditingPackage({})}
            className="sm:hidden mt-4 w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 bg-emerald-400 text-emerald-900 rounded-xl font-bold hover:bg-emerald-300 transition-all shadow-[2px_2px_0_0_#059669] hover:shadow-none text-sm whitespace-nowrap"
          >
            <Plus size={18} strokeWidth={2.5} />
            Buat Paket
          </button>
        )}
      </div>

      {activeTab === 'yearbook' ? (
        loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-2xl p-5 md:p-6 animate-pulse shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b]"
              >
                <div className="space-y-3">
                  <div className="h-5 md:h-6 bg-slate-100 dark:bg-slate-800 rounded-xl w-28 md:w-40" />
                  <div className="h-3 md:h-4 bg-slate-50 dark:bg-slate-800 rounded-lg w-full" />
                  <div className="h-16 md:h-20 bg-slate-50 dark:bg-slate-800 rounded-xl w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : packages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 md:px-8 text-center bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-3xl border-dashed shadow-[2px_2px_0_0_#94a3b8] dark:shadow-[2px_2px_0_0_#1e293b] mx-4 md:mx-0">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-4 transform -rotate-3 border-2 border-slate-900 dark:border-slate-700">
              <Layout size={32} className="text-slate-400 dark:text-slate-500" strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Belum ada paket harga</h3>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 max-w-md mb-6">
              Anda belum membuat daftar paket harga untuk Yearbook. Silakan buat paket baru untuk ditawarkan kepada pelanggan.
            </p>
            <button
              onClick={() => setEditingPackage({})}
              className="flex items-center gap-2 bg-emerald-400 hover:bg-emerald-300 text-emerald-900 px-5 py-2.5 rounded-xl font-bold text-sm shadow-[2px_2px_0_0_#059669] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all"
            >
              <Plus size={18} strokeWidth={2.5} />
              Buat Paket Pertama
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 pb-12">
            {packages.map((pkg) => {
              const addonsList = pkg.features.map((f) => {
                try {
                  const j = JSON.parse(f);
                  return { name: j.name || f, price: Number(j.price) || 0 };
                } catch {
                  return { name: f, price: 0 };
                }
              });

              return (
                <div
                  key={pkg.id}
                  className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-2xl p-5 md:p-6 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] hover:shadow-none hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all group relative overflow-hidden"
                >
                  <div className="absolute top-3 right-3 md:top-4 md:right-4 flex gap-1.5">
                    <button
                      onClick={() => setEditingPackage(pkg)}
                      className="inline-flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900 shadow-[2px_2px_0_0_#d97706] hover:shadow-none transition-all"
                    >
                      <Edit className="w-4 h-4" strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => handleDelete(pkg.id)}
                      className="inline-flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-xl bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-900 shadow-[2px_2px_0_0_#e11d48] hover:shadow-none transition-all"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>

                  <div className="mb-3 md:mb-4 pr-16 md:pr-20">
                    <div className="flex items-center flex-wrap gap-2 mb-1.5">
                      <h3 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">{pkg.name}</h3>
                      {pkg.is_popular && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400 text-amber-900 text-[9px] md:text-[10px] font-bold shadow-[2px_2px_0_0_#d97706]">
                          <Star size={10} className="md:w-3 md:h-3" fill="currentColor" /> Pop
                        </span>
                      )}
                    </div>
                    <div className="text-slate-900 dark:text-white font-bold">
                      <span className="text-[10px] md:text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Harga dasar</span>
                      <div className="mt-0.5">
                        <span className="text-xl md:text-2xl">Rp {pkg.price_per_student.toLocaleString('id-ID')}</span>
                        <span className="text-slate-400 dark:text-slate-400 text-xs ml-1">/ student</span>
                      </div>
                    </div>
                  </div>

                  {(pkg.ai_labs_features ?? []).length > 0 && (
                    <div className="mb-4 flex flex-wrap gap-1.5">
                      {(pkg.ai_labs_features ?? []).map((slug) => (
                        <span
                          key={slug}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold ${slug === 'flipbook_unlock' ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'
                            }`}
                        >
                          {slug === 'flipbook_unlock' ? <Book size={11} strokeWidth={2} /> : <Sparkles size={11} strokeWidth={2} />}
                          {AI_FEATURE_LABELS[slug]?.toUpperCase() ?? slug.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-2">Add-on extra (opsional)</p>
                    <ul className="space-y-2">
                      {addonsList.length === 0 ? (
                        <li className="text-xs font-medium text-slate-400 dark:text-slate-400 italic">Belum ada add-on.</li>
                      ) : (
                        addonsList.map((addon, i) => (
                          <li key={i} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
                              <ChevronRight size={12} className="text-violet-400 dark:text-violet-300" strokeWidth={3} />
                              {addon.name}
                            </div>
                            <span className="text-slate-500 dark:text-slate-400">
                              {addon.price > 0 ? `+Rp ${addon.price.toLocaleString('id-ID')} / siswa` : '—'}
                            </span>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : loadingAi ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-2xl p-5 animate-pulse shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b]"
            >
              <div className="flex justify-between items-center">
                <div className="space-y-2">
                  <div className="h-5 bg-slate-100 dark:bg-slate-800 rounded-lg w-36" />
                  <div className="h-3 bg-slate-50 dark:bg-slate-800 rounded-lg w-52" />
                </div>
                <div className="h-9 bg-slate-100 dark:bg-slate-800 rounded-xl w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : aiPricing.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-2xl p-10 text-center shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] mx-4 md:mx-0">
          <Zap className="w-12 h-12 mx-auto mb-3 text-sky-300" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">No AI Data</h3>
          <p className="text-xs text-slate-400 dark:text-slate-400 font-medium">Jalankan migration SQL terlebih dahulu untuk mengisi data pricing AI.</p>
        </div>
      ) : (
        <div className="space-y-3 pb-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {aiPricing.map((item) => {
              const isFlipbook = item.feature_slug === 'flipbook_unlock'
              const hasGenerate = GENERATE_SLUGS.has(item.feature_slug)
              return (
                <div
                  key={item.id}
                  className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-2xl p-4 md:p-5 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] hover:shadow-none hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all group flex justify-between items-center"
                >
                  <div>
                    <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-white mb-2">
                      {AI_FEATURE_LABELS[item.feature_slug] ?? item.feature_slug}
                    </h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      <div className="flex flex-col">
                        <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Unlock</span>
                        <span className="text-sm md:text-base font-bold text-violet-500 dark:text-violet-400">{item.credits_per_unlock} <span className="text-[9px] text-slate-400 dark:text-slate-400">CREDITS</span></span>
                      </div>
                      {hasGenerate && !isFlipbook && (
                        <div className="flex flex-col">
                          <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Generate</span>
                          {item.feature_slug === 'phototovideo' ? (
                            <span className="text-xs md:text-sm font-bold text-sky-500 dark:text-sky-400 leading-snug break-words">
                              {formatPtvGenerateLine(item)}
                            </span>
                          ) : (
                            <span className="text-sm md:text-base font-bold text-sky-500 dark:text-sky-400">
                              {item.credits_per_use}{' '}
                              <span className="text-[9px] text-slate-400 dark:text-slate-400">CREDITS</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingAi(item)}
                    className="inline-flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900 shadow-[2px_2px_0_0_#d97706] hover:shadow-none transition-all shrink-0 ml-2"
                  >
                    <Edit className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  </div>
)
}







