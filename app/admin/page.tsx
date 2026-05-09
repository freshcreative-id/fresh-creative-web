'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Pencil, X, Sparkles, Trash2, ShieldCheck, UserCheck, LayoutDashboard, RefreshCw, Ban } from 'lucide-react'
import { apiUrl } from '../../lib/api-url'
import { fetchWithAuth } from '../../lib/api-client'
import { onAuthChange } from '@/lib/auth-client'

type OverviewStats = {
  totalUsers: number
  totalAdmins: number
  totalCredits: number
  newUsers7d: number
  latestUsers: {
    id: string
    email: string | null
    full_name: string | null
    role?: string | null
    is_suspended?: boolean | null
    credits?: number | null
    created_at?: string | null
  }[]
  page?: number
  perPage?: number
  total?: number
}

export default function AdminPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editUserId, setEditUserId] = useState<string | null>(null)
  const [editCredits, setEditCredits] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'admin' | null>(null)
  const [sortFilter, setSortFilter] = useState<'credits' | null>(null)
  const [daysFilter, setDaysFilter] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTitle, setConfirmTitle] = useState('')
  const [confirmDescription, setConfirmDescription] = useState('')
  const [confirmConfirmText, setConfirmConfirmText] = useState('Konfirmasi')
  const [confirmCancelText, setConfirmCancelText] = useState('Batal')
  const [confirmVariant, setConfirmVariant] = useState<'danger' | 'warning'>('warning')
  const [confirmLoading, setConfirmLoading] = useState(false)
  const confirmActionRef = useRef<null | (() => Promise<void>)>(null)
  const mountedRef = useRef(true)
  const hasCacheRef = useRef(false)
  const fetchIdRef = useRef(0)

  const cacheKey = `admin_users_overview_v1:${page}:${search.trim().toLowerCase() || ''}:${roleFilter || 'all'}:${sortFilter || 'none'}:${daysFilter || 0}`

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Instant render from cache to avoid skeleton on back/side nav (layout effect = before paint).
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    hasCacheRef.current = false // Reset before checking so fetchOverview knows if it was a cache miss

    try {
      const raw = window.sessionStorage.getItem(cacheKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as { ts: number; data: OverviewStats }
      if (parsed?.data) {
        setStats(parsed.data)
        setLoading(false)
        hasCacheRef.current = true
      }
    } catch {
      // ignore cache errors
    }
  }, [cacheKey])

  // Needed to hide actions for the currently logged-in admin.
  useEffect(() => {
    const unsub = onAuthChange((user) => {
      setCurrentAdminId(user?.uid ?? null)
    })
    return () => unsub()
  }, [])

  const fetchOverview = useCallback(async (silent = false) => {
    if (!mountedRef.current) return
    const currentFetchId = ++fetchIdRef.current

    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('perPage', '10')
      if (search.trim()) params.set('search', search.trim())
      if (roleFilter) params.set('role', roleFilter)
      if (sortFilter) params.set('sort', sortFilter)
      if (daysFilter) params.set('days', String(daysFilter))

      const ts = Date.now()
      params.set('_t', String(ts))

      const res = await fetchWithAuth(`/api/admin/users/overview?${params.toString()}`)
      const data = (await res.json().catch(() => null)) as unknown
      if (fetchIdRef.current !== currentFetchId) return

      if (!res.ok) {
        const err = (data && typeof data === 'object' && !Array.isArray(data) ? (data as any).error : undefined) as
          | string
          | undefined
        if (mountedRef.current && !silent) setError(err || 'Gagal memuat overview')
        if (mountedRef.current && !silent) setLoading(false)
        return
      }
      if (mountedRef.current) {
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          setStats(data as OverviewStats)
        } else if (!silent) {
          setError('Gagal memuat overview')
        }
        if (typeof window !== 'undefined') {
          try {
            window.sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }))
          } catch {
            // ignore
          }
        }
      }
    } catch {
      if (fetchIdRef.current !== currentFetchId) return
      if (mountedRef.current && !silent) {
        setError('Gagal memuat overview')
      }
    } finally {
      if (fetchIdRef.current === currentFetchId && mountedRef.current && !silent) {
        setLoading(false)
      }
    }
  }, [page, search, roleFilter, sortFilter, daysFilter, cacheKey])

  useEffect(() => {
    fetchOverview(hasCacheRef.current)
  }, [fetchOverview])

  useEffect(() => {
    // Supabase auth-only: no Realtime, no polling.
    // Refetch when admin returns to tab.
    const onVisible = () => {
      fetchOverview(true)
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchOverview])

  const updateCredits = async (id: string, value: number) => {
    setSavingId(id)
    try {
      const res = await fetchWithAuth('/api/admin/users/overview', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, credits: value }),
      })
      const data = (await res.json().catch(() => null)) as unknown
      if (!res.ok) {
        const err = (data && typeof data === 'object' && !Array.isArray(data) ? (data as any).error : undefined) as
          | string
          | undefined
        alert(err || 'Gagal update credit')
        return
      }
      setStats((prev) => {
        if (!prev) return prev
        const users = prev.latestUsers.map((u) =>
          u.id === id ? { ...u, credits: value } : u
        )
        const totalCredits = users.reduce(
          (sum, u) => sum + (typeof u.credits === 'number' ? u.credits : 0),
          0
        )
        return { ...prev, latestUsers: users, totalCredits }
      })
      setEditUserId((current) => (current === id ? null : current))
    } finally {
      setSavingId(null)
    }
  }

  const updateUser = async (id: string, payload: { isSuspended?: boolean }) => {
    setSavingId(id)
    try {
      const res = await fetchWithAuth('/api/admin/users/overview', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isSuspended: payload.isSuspended }),
      })
      const data = (await res.json().catch(() => null)) as unknown
      if (!res.ok) {
        const err = (data && typeof data === 'object' && !Array.isArray(data) ? (data as any).error : undefined) as
          | string
          | undefined
        alert(err || 'Gagal update user')
        return
      }
      if (typeof payload.isSuspended === 'boolean') {
        setStats((prev) => {
          if (!prev) return prev
          const users = prev.latestUsers.map((u) =>
            u.id === id ? { ...u, is_suspended: payload.isSuspended } : u
          )
          return { ...prev, latestUsers: users }
        })
      }
    } finally {
      setSavingId(null)
    }
  }

  const handleStartEditCredits = (userId: string, currentCredits: number | null | undefined) => {
    setEditUserId(userId)
    setEditCredits(String(currentCredits ?? 0))
  }

  const handleSaveCredits = (userId: string) => {
    const value = parseInt(editCredits, 10)
    if (Number.isNaN(value) || value < 0) {
      alert('Credit harus angka >= 0')
      return
    }
    updateCredits(userId, value)
  }

  const openConfirm = (config: {
    title: string
    description: string
    confirmText: string
    cancelText?: string
    variant?: 'danger' | 'warning'
    onConfirm: () => Promise<void>
  }) => {
    setConfirmTitle(config.title)
    setConfirmDescription(config.description)
    setConfirmConfirmText(config.confirmText)
    setConfirmCancelText(config.cancelText ?? 'Batal')
    setConfirmVariant(config.variant ?? 'warning')
    confirmActionRef.current = config.onConfirm
    setConfirmOpen(true)
  }

  const handleConfirm = async () => {
    if (!confirmActionRef.current) return
    setConfirmLoading(true)
    try {
      await confirmActionRef.current()
      setConfirmOpen(false)
    } finally {
      setConfirmLoading(false)
    }
  }

  const handleSuspendUser = (userId: string, currentlySuspended: boolean) => {
    const next = !currentlySuspended
    openConfirm({
      title: next ? 'Suspend User' : 'Unsuspend User',
      description: next
        ? 'User tidak bisa login sampai admin membuka suspend.'
        : 'User bisa login kembali setelah suspend dibuka.',
      confirmText: next ? 'Suspend' : 'Unsuspend',
      variant: 'warning',
      onConfirm: async () => {
        await updateUser(userId, { isSuspended: next })
      },
    })
  }

  const handleChangeRole = async (userId: string, nextRole: 'user' | 'admin') => {
    openConfirm({
      title: nextRole === 'admin' ? 'Jadikan Admin' : 'Jadikan User',
      description: nextRole === 'admin'
        ? 'User akan mendapatkan akses dashboard admin.'
        : 'Akses admin akan dicabut dari user ini.',
      confirmText: nextRole === 'admin' ? 'Jadikan Admin' : 'Jadikan User',
      variant: 'warning',
      onConfirm: async () => {
        setSavingId(userId)
        try {
          const res = await fetchWithAuth('/api/admin/users/overview', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: userId, role: nextRole }),
          })
          const data = (await res.json().catch(() => null)) as unknown
          if (!res.ok) {
            const err = (data && typeof data === 'object' && !Array.isArray(data) ? (data as any).error : undefined) as
              | string
              | undefined
            alert(err || 'Gagal update role')
            return
          }
          setStats((prev) => {
            if (!prev) return prev
            const users = prev.latestUsers.map((u) =>
              u.id === userId ? { ...u, role: nextRole } : u
            )
            const totalAdmins = users.filter((u) => u.role === 'admin').length
            return { ...prev, latestUsers: users, totalAdmins }
          })
        } finally {
          setSavingId(null)
        }
      },
    })
  }

  const totalRows = stats?.total ?? stats?.latestUsers.length ?? 0
  const perPage = stats?.perPage ?? 10
  const currentPage = stats?.page ?? page
  const totalPages = totalRows > 0 ? Math.ceil(totalRows / perPage) : 1

  const statCards = [
    { label: 'Total User', value: stats?.totalUsers.toLocaleString() ?? '0', color: 'from-violet-100 to-violet-50 border-violet-200', valueColor: 'text-violet-700' },
    { label: 'Admin', value: stats?.totalAdmins.toLocaleString() ?? '0', color: 'from-pink-100 to-pink-50 border-pink-200', valueColor: 'text-pink-700' },
    { label: 'Total Credit', value: stats?.totalCredits.toLocaleString() ?? '0', color: 'from-amber-100 to-amber-50 border-amber-200', valueColor: 'text-amber-700' },
    { label: 'User Baru 7 Hari', value: stats?.newUsers7d.toLocaleString() ?? '0', color: 'from-emerald-100 to-emerald-50 border-emerald-200', valueColor: 'text-emerald-700' },
  ]

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white tracking-tight leading-none">
            Admin Dashboard
          </h1>
          <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 max-w-2xl">
            Overview data pengguna, kredit, dan aktivitas registrasi
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 font-semibold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-4 gap-1.5 sm:gap-4 md:gap-6 mb-8">
        {loading && !stats ? (
          [1, 2, 3, 4].map((i) => (
            <div key={`stat-skeleton-${i}`} className="bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl md:rounded-2xl p-2 md:p-6 animate-pulse shadow-sm md:shadow-[2px_2px_0_0_#0f172a]">
              <div className="h-3 w-16 bg-slate-100 rounded mb-3" />
              <div className="h-8 w-24 bg-slate-50 rounded" />
            </div>
          ))
        ) : (
          <>
            {[
              { id: 'total', label: 'Total User', value: stats?.totalUsers.toLocaleString() ?? '0', color: 'bg-sky-500 dark:bg-slate-800', shadow: 'shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155]', text: 'text-slate-900 dark:text-white', active: roleFilter === null && sortFilter === null && daysFilter === null },
              { id: 'admin', label: 'Admin', value: stats?.totalAdmins.toLocaleString() ?? '0', color: 'bg-rose-300 dark:bg-slate-800', shadow: 'shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155]', text: 'text-slate-900 dark:text-white', active: roleFilter === 'admin' },
              { id: 'credits', label: 'Total Credit', value: stats?.totalCredits.toLocaleString() ?? '0', color: 'bg-amber-300 dark:bg-slate-800', shadow: 'shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155]', text: 'text-slate-900 dark:text-white', active: sortFilter === 'credits' },
              { id: 'new', label: 'New User', value: stats?.newUsers7d.toLocaleString() ?? '0', color: 'bg-emerald-300 dark:bg-slate-800', shadow: 'shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155]', text: 'text-slate-900 dark:text-white', active: daysFilter === 7 }
            ].map((sc) => (
              <div 
                key={sc.label} 
                onClick={() => {
                  if (sc.id === 'total') {
                    setRoleFilter(null)
                    setSortFilter(null)
                    setDaysFilter(null)
                    setPage(1)
                  } else if (sc.id === 'admin') {
                    setRoleFilter('admin')
                    setSortFilter(null)
                    setDaysFilter(null)
                    setPage(1)
                  } else if (sc.id === 'credits') {
                    setRoleFilter(null)
                    setSortFilter('credits')
                    setDaysFilter(null)
                    setPage(1)
                  } else if (sc.id === 'new') {
                    setRoleFilter(null)
                    setSortFilter(null)
                    setDaysFilter(7)
                    setPage(1)
                  }
                }}
                className={`${sc.color} border-2 border-slate-900 dark:border-slate-700 rounded-xl md:rounded-[24px] p-2 md:p-6 ${sc.shadow} cursor-pointer hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none ${sc.active ? 'ring-2 md:ring-4 ring-indigo-500 ring-offset-1 md:ring-offset-2 dark:ring-offset-slate-900' : ''} transition-all flex flex-col items-center justify-center text-center min-w-0`}
              >
                <p className={`text-[9px] md:text-xs font-black uppercase tracking-tighter md:tracking-widest mb-0.5 md:mb-2 ${sc.text} truncate`}>{sc.label}</p>
                <p className={`text-base md:text-4xl font-black ${sc.text} truncate`}>
                  {sc.value}
                </p>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-[24px] md:rounded-[32px] overflow-hidden shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] md:shadow-[2px_2px_0_0_#0f172a] dark:md:shadow-[2px_2px_0_0_#0f172a]">
        <div className="px-5 py-4 md:px-8 md:py-6 border-b-4 border-slate-900 dark:border-slate-700 flex items-center justify-between gap-4 flex-wrap bg-sky-500 dark:bg-slate-800">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white leading-none">
              {roleFilter === 'admin' ? 'Manage Admins' : sortFilter === 'credits' ? 'Users by Credits' : daysFilter === 7 ? 'New Users (Last 7 Days)' : 'Manage Users'}
            </h2>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => fetchOverview()}
              disabled={loading}
              className="p-2.5 bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all disabled:opacity-50"
              title="Refresh Data"
            >
              <RefreshCw size={18} strokeWidth={3} className={loading ? 'animate-spin' : ''} />
            </button>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setPage(1)
                setSearch(e.target.value)
              }}
              placeholder="Cari user..."
              className="w-full sm:w-64 px-4 py-2.5 text-sm font-bold bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] focus:shadow-none transition-all"
            />
          </div>
        </div>
        <div className="md:hidden p-4 space-y-4">
          {loading && (
            <>
              {[1, 2, 3].map((i) => (
                <div key={`mobile-skeleton-${i}`} className="bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-2xl p-4 space-y-3 shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] animate-pulse">
                  <div className="h-5 w-40 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                  <div className="h-3 w-32 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                  <div className="h-10 w-full bg-slate-200 dark:bg-slate-700 rounded-xl" />
                </div>
              ))}
            </>
          )}
          {!loading && stats && stats.latestUsers.length === 0 && (
            <div className="py-12 text-center text-slate-400 bg-slate-50 rounded-2xl border-2 border-slate-900 border-dashed">
              <p className="font-black">Belum ada user terdaftar.</p>
            </div>
          )}
          {!loading && stats && stats.latestUsers.length > 0 && stats.latestUsers.map((u) => (
            <div key={u.id} className="bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-2xl p-4 space-y-4 shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                    {u.full_name || 'No Name'} {currentAdminId === u.id && <span className="text-indigo-500 font-bold ml-1 text-[10px]">(Anda)</span>}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-300 truncate">{u.email || '-'}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`px-2 py-0.5 rounded-full border-2 border-slate-900 dark:border-slate-700 text-[9px] font-black uppercase shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] ${u.is_suspended ? 'bg-red-400 text-white' : 'bg-emerald-300 dark:bg-emerald-700 text-slate-900 dark:text-white'}`}>
                    {u.is_suspended ? 'Suspended' : 'Aktif'}
                  </span>
                  <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 border-2 border-slate-900 dark:border-slate-700 rounded-full text-[9px] font-black uppercase shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] text-slate-900 dark:text-white">
                    {u.role || 'user'}
                  </span>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest leading-none mb-1">Credits</p>
                  {editUserId === u.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        value={editCredits}
                        onChange={(e) => setEditCredits(e.target.value)}
                        className="w-20 px-2 py-1 bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-lg text-xs font-black text-slate-900 dark:text-white focus:outline-none"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveCredits(u.id)}
                        className="p-1 px-2.5 bg-indigo-400 dark:bg-indigo-700 border-2 border-slate-900 dark:border-slate-700 rounded-lg text-[10px] font-black text-white"
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-xl font-black text-slate-900 dark:text-white">{u.credits?.toLocaleString() ?? 0}</p>
                      <button onClick={() => handleStartEditCredits(u.id, u.credits ?? 0)} className="text-[10px] font-bold text-indigo-500 dark:text-indigo-300 underline flex items-center gap-0.5">
                        <Pencil size={10} strokeWidth={3} /> edit
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest leading-none mb-1">Joined</p>
                  <p className="text-[10px] font-bold text-slate-900 dark:text-white">{u.created_at ? new Date(u.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' }) : '-'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {!(currentAdminId && u.id === currentAdminId) && (
                  <>
                    <button
                      onClick={() => handleChangeRole(u.id, u.role === 'admin' ? 'user' : 'admin')}
                      disabled={savingId === u.id}
                      className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-[10px] font-black uppercase hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white transition-colors disabled:opacity-50"
                    >
                      {u.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                    </button>
                    <button
                      onClick={() => handleSuspendUser(u.id, !!u.is_suspended)}
                      disabled={savingId === u.id}
                      className={`px-3 py-2 border-2 border-slate-900 dark:border-slate-700 rounded-xl text-[10px] font-black uppercase transition-colors disabled:opacity-50 ${u.is_suspended ? 'bg-emerald-300 dark:bg-emerald-700 text-slate-900 dark:text-white' : 'bg-amber-300 dark:bg-amber-700 text-slate-900 dark:text-white'}`}
                    >
                      {u.is_suspended ? 'Unsuspend' : 'Suspend'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto hidden md:block">
          <table className="min-w-full">
            <thead className="bg-slate-50 text-slate-500 border-b-4 border-slate-900">
              <tr>
                <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-widest text-slate-900">Full Name</th>
                <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-widest text-slate-900">Email</th>
                <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-widest text-slate-900">Role</th>
                <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-widest text-slate-900">Status</th>
                <th className="px-5 py-4 text-right text-xs font-black uppercase tracking-widest text-slate-900">Credits</th>
                <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-widest text-slate-900">Joined</th>
                <th className="px-5 py-4 text-right text-xs font-black uppercase tracking-widest text-slate-900">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-slate-100 dark:divide-slate-800">
              {loading && (
                <>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <tr key={`table-skeleton-${i}`} className="animate-pulse">
                      <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-lg w-32" /></td>
                      <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-lg w-48" /></td>
                      <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-lg w-16" /></td>
                      <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-lg w-12" /></td>
                      <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-lg w-12 ml-auto" /></td>
                      <td className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-lg w-20" /></td>
                      <td className="px-5 py-4 text-right"><div className="h-8 bg-slate-200 dark:bg-slate-700 rounded-xl w-24 ml-auto" /></td>
                    </tr>
                  ))}
                </>
              )}
              {!loading && stats && stats.latestUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-400 font-black italic">
                    Belum ada user terdaftar.
                  </td>
                </tr>
              )}
              {!loading && stats && stats.latestUsers.length > 0 && stats.latestUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group">
                  <td className="px-5 py-4">
                    <p className="text-sm font-black text-slate-900 dark:text-white">
                      {u.full_name || '-'} {currentAdminId === u.id && <span className="text-indigo-500 font-bold ml-1 text-[10px]">(Anda)</span>}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm font-bold text-slate-400">{u.email || '-'}</p>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-slate-100 dark:bg-slate-700 border-2 border-slate-900 dark:border-slate-700 rounded-lg text-[10px] font-black uppercase text-slate-900 dark:text-white">
                        {u.role || 'user'}
                      </span>
                      {!(currentAdminId && u.id === currentAdminId) && (
                        <button
                          onClick={() => handleChangeRole(u.id, u.role === 'admin' ? 'user' : 'admin')}
                          disabled={savingId === u.id}
                          className="opacity-0 group-hover:opacity-100 text-[10px] font-black text-indigo-500 underline uppercase transition-all"
                        >
                          Change
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-3 py-1 rounded-full border-2 border-slate-900 text-[9px] font-black uppercase shadow-[2px_2px_0_0_#0f172a] ${u.is_suspended ? 'bg-red-400 text-white' : 'bg-emerald-300 text-slate-900'}`}>
                      {u.is_suspended ? 'Suspended' : 'Aktif'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    {editUserId === u.id ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <input
                          type="number"
                          min={0}
                          value={editCredits}
                          onChange={(e) => setEditCredits(e.target.value)}
                          className="w-20 px-2 py-1 bg-white border-2 border-slate-900 rounded-lg text-right text-xs font-black text-slate-900 focus:outline-none"
                        />
                        <button
                          onClick={() => handleSaveCredits(u.id)}
                          className="p-1 px-3 bg-indigo-400 border-2 border-slate-900 rounded-lg text-[10px] font-black shadow-[2px_2px_0_0_#0f172a] hover:shadow-none transition-all"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-3 group/credit">
                        <span className="text-sm font-black text-slate-900 dark:text-white">
                          {u.credits?.toLocaleString() ?? 0}
                        </span>
                        <button
                          onClick={() => handleStartEditCredits(u.id, u.credits ?? 0)}
                          className="p-1.5 bg-slate-50 border-2 border-slate-900 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-white shadow-[2px_2px_0_0_#0f172a] hover:shadow-none transition-all"
                        >
                          <Pencil size={12} strokeWidth={3} />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-[11px] font-bold text-slate-400 uppercase">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!(currentAdminId && u.id === currentAdminId) && (
                        <>
                          <button
                            onClick={() => handleSuspendUser(u.id, !!u.is_suspended)}
                            className={`p-2 rounded-xl border-2 border-slate-900 shadow-[2px_2px_0_0_#0f172a] hover:shadow-none transition-all ${u.is_suspended ? 'bg-emerald-300 text-slate-900' : 'bg-amber-300 text-slate-900'}`}
                            title={u.is_suspended ? 'Unsuspend User' : 'Suspend User'}
                          >
                            {u.is_suspended ? <UserCheck size={16} strokeWidth={3} /> : <Ban size={16} strokeWidth={3} />}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {stats && totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between pb-12">
          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={currentPage <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-4 py-2 bg-white border-2 border-slate-900 rounded-xl text-xs font-black uppercase hover:bg-slate-50 disabled:opacity-40 shadow-[2px_2px_0_0_#0f172a] hover:shadow-none transition-all"
            >
              Prev
            </button>
            <button
              disabled={currentPage >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="px-4 py-2 bg-white border-2 border-slate-900 rounded-xl text-xs font-black uppercase hover:bg-slate-50 disabled:opacity-40 shadow-[2px_2px_0_0_#0f172a] hover:shadow-none transition-all"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 dark:bg-black/50 backdrop-blur-md px-4">
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-[32px] w-full max-w-sm p-6 sm:p-8 text-center shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155]">
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">{confirmTitle}</h3>
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-6">{confirmDescription}</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={confirmLoading}
                className="flex-1 py-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white text-xs font-black uppercase tracking-widest shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 disabled:opacity-50 transition-all"
              >
                {confirmCancelText}
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirmLoading}
                className={`flex-1 py-3.5 rounded-xl border-2 border-slate-900 dark:border-slate-600 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 disabled:opacity-50 transition-all ${confirmVariant === 'danger'
                  ? 'bg-red-500 text-white'
                  : 'bg-amber-400 dark:bg-amber-600 text-slate-900 dark:text-white'
                  }`}
              >
                {confirmLoading ? 'Wait...' : confirmConfirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}






