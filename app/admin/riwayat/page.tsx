'use client'

import { History, ExternalLink, Loader2, CreditCard, X, Users, User, Search, RefreshCw, ChevronLeft, ChevronRight, Calendar, Download } from 'lucide-react'
import { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo } from 'react'
import { fetchWithAuth } from '../../../lib/api-client'
import { generateAndPrintInvoice } from '../../../lib/generate-invoice'
import Link from 'next/link'

type Transaction = {
  id: string
  user_id?: string
  external_id?: string
  amount: number
  status: string
  invoice_url: string | null
  created_at: string
  credits?: number | null
  user_full_name?: string
  user_email?: string
  payment_method?: string | null
  album_name?: string | null
  description?: string | null
  package_snapshot?: string | null
  discount_percent_off?: number | null
  new_students_count?: number | null
}

type ViewMode = 'mine' | 'all'

export default function AdminRiwayatPage() {
  const [loadingMap, setLoadingMap] = useState<{ mine: boolean, all: boolean }>({ mine: true, all: true })
  const [invoicePopupUrl, setInvoicePopupUrl] = useState<string | null>(null)
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('adminRiwayatTab') as ViewMode) || 'mine'
    }
    return 'mine'
  })

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode)
    if (typeof window !== 'undefined') {
      localStorage.setItem('adminRiwayatTab', mode)
    }
  }

  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const [transactionsMap, setTransactionsMap] = useState<{ mine: Transaction[] | null, all: Transaction[] | null }>({ mine: null, all: null })
  const transactions = transactionsMap[viewMode] || []
  const currentLoading = loadingMap[viewMode] && transactionsMap[viewMode] === null

  // Cache per tab so switching sidebar doesn't re-skeleton.
  const cacheKeyMine = 'admin_transactions_v1:mine'
  const cacheKeyAll = 'admin_transactions_v1:all'

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const mineRaw = window.sessionStorage.getItem(cacheKeyMine)
      const allRaw = window.sessionStorage.getItem(cacheKeyAll)
      const mine = mineRaw ? (JSON.parse(mineRaw) as { ts: number; data: Transaction[] }).data : null
      const all = allRaw ? (JSON.parse(allRaw) as { ts: number; data: Transaction[] }).data : null
      if (mine || all) {
        setTransactionsMap({ mine: mine ?? null, all: all ?? null })
        setLoadingMap({ mine: mine == null, all: all == null })
      }
    } catch {
      // ignore
    }
  }, [])

  const fetchTransactions = useCallback(async (mode: ViewMode, skipLoading = false) => {
    if (!skipLoading) {
      setLoadingMap(prev => ({ ...prev, [mode]: true }))
    }
    try {
      const ts = Date.now()
      const url = mode === 'all' ? `/api/admin/transactions?scope=all&_t=${ts}` : `/api/admin/transactions?_t=${ts}`
      const res = await fetchWithAuth(url, { credentials: 'include', cache: 'no-store' })
      if (!res.ok) {
        setTransactionsMap(prev => ({ ...prev, [mode]: [] }))
        return
      }
      const data = await res.json()
      const list = Array.isArray(data) ? data : []
      setTransactionsMap(prev => ({ ...prev, [mode]: list }))
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem(mode === 'all' ? cacheKeyAll : cacheKeyMine, JSON.stringify({ ts: Date.now(), data: list }))
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.error('Error fetching transactions:', err)
      setTransactionsMap(prev => ({ ...prev, [mode]: [] }))
    } finally {
      if (!skipLoading) {
        setLoadingMap(prev => ({ ...prev, [mode]: false }))
      }
    }
  }, [])

  useEffect(() => {
    fetchTransactions(viewMode)
  }, [viewMode, fetchTransactions])

  const lastRealtimeFetchRef = useRef(0)

  useEffect(() => {
    const onRealtime = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; channel?: string; payload?: Record<string, unknown> }>).detail
      if (!detail?.type || detail.channel !== 'global') return
      const path = typeof detail.payload?.path === 'string' ? detail.payload.path : ''
      const isTransactionEvent =
        path.startsWith('/api/credits/') ||
        path.startsWith('/api/admin/transactions') ||
        path.startsWith('/api/webhooks/xendit') ||
        (path.startsWith('/api/albums') && path.includes('/checkout'))
      if (!isTransactionEvent) return
      const now = Date.now()
      if (now - lastRealtimeFetchRef.current < 3000) return // throttle 3s
      lastRealtimeFetchRef.current = now
      fetchTransactions('mine', true)
      fetchTransactions('all', true)
    }
    window.addEventListener('fresh:realtime', onRealtime)

    return () => {
      window.removeEventListener('fresh:realtime', onRealtime)
    }
  }, [fetchTransactions])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const statusParam = params.get('status')
    if (statusParam === 'success' || statusParam === 'failed') {
      fetchTransactions(viewMode)
      window.history.replaceState({}, '', '/admin/riwayat')
    }
  }, [viewMode, fetchTransactions])

  const filteredTransactions = useMemo(() => {
    if (viewMode !== 'all' || !searchQuery.trim()) return transactions;
    const q = searchQuery.toLowerCase();
    return transactions.filter(tx =>
      (tx.user_full_name && tx.user_full_name.toLowerCase().includes(q)) ||
      (tx.user_email && tx.user_email.toLowerCase().includes(q)) ||
      (tx.external_id && tx.external_id.toLowerCase().includes(q))
    );
  }, [transactions, searchQuery, viewMode]);

  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredTransactions.slice(start, start + itemsPerPage)
  }, [filteredTransactions, currentPage, itemsPerPage])
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage)

  // Pastikan tidak ada double scrollbar saat popup Xendit terbuka
  useEffect(() => {
    if (invoicePopupUrl) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [invoicePopupUrl])

  return (
    <>
      {invoicePopupUrl && (
        <div className="fixed inset-0 z-[110] flex flex-col bg-white dark:bg-slate-900" role="dialog" aria-modal="true" aria-label="Selesaikan pembayaran">
          <div className="flex items-center justify-between px-4 py-3 border-b-4 border-slate-900 bg-slate-50 dark:bg-slate-800 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-white" strokeWidth={3} />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Selesaikan Pembayaran</h3>
            </div>
            <button
              type="button"
              onClick={() => setInvoicePopupUrl(null)}
              className="flex items-center justify-center w-10 h-10 rounded-xl border-2 border-slate-900 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-900 hover:text-red-500 shadow-[#64748b] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 min-h-0 relative">
            <iframe
              src={invoicePopupUrl}
              title="Invoice Xendit"
              className="absolute inset-0 w-full h-full border-0"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-top-navigation"
              allow="payment"
            />
          </div>
        </div>
      )}

    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white tracking-tight leading-none">
            Riwayat Transaksi
          </h1>
          <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400">
            {viewMode === 'mine' ? 'Daftar riwayat transaksi Top Up Anda.' : 'Monitor semua transaksi dari pengguna.'}
          </p>
        </div>
      </div>

      <div className="flex justify-center md:justify-start mb-4 sm:mb-6">
        <div className="relative flex w-full md:w-fit items-center gap-1 p-1 bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b]">
          <div
            className={`absolute top-1 bottom-1 rounded-xl bg-violet-400 transition-all duration-300 ease-out`}
            style={{
              transform: viewMode === 'mine' ? 'translateX(0)' : 'translateX(100%)',
              width: 'calc(50% - 6px)',
              left: '4px'
            }}
          />
          <button
            type="button"
            onClick={() => { setViewMode('mine'); setCurrentPage(1); }}
            className={`relative z-10 flex flex-1 md:flex-none min-w-0 items-center justify-center gap-1.5 md:gap-2 px-2 py-1.5 md:px-5 md:py-2 rounded-xl text-[11px] md:text-sm font-bold transition-all duration-200 ${viewMode === 'mine' ? 'text-slate-900' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            <User className="hidden md:inline-block w-3.5 h-3.5 md:w-5 md:h-5 shrink-0" strokeWidth={2.5} />
            <span className="truncate">Riwayat Saya</span>
          </button>
          <button
            type="button"
            onClick={() => { setViewMode('all'); setCurrentPage(1); }}
            className={`relative z-10 flex flex-1 md:flex-none min-w-0 items-center justify-center gap-1.5 md:gap-2 px-2 py-1.5 md:px-5 md:py-2 rounded-xl text-[11px] md:text-sm font-bold transition-all duration-200 ${viewMode === 'all' ? 'text-slate-900' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            <Users className="hidden md:inline-block w-3.5 h-3.5 md:w-5 md:h-5 shrink-0" strokeWidth={2.5} />
            <span className="truncate">Semua Orang</span>
          </button>
        </div>
      </div>

      {viewMode === 'all' && (
        <div className="mb-8 relative max-w-2xl">
          <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 rounded-2xl shadow-inner group focus-within:bg-white dark:focus-within:bg-slate-900 transition-all">
            <Search className="h-4 w-4 md:h-5 md:w-5 text-slate-400 group-focus-within:text-slate-900 transition-colors" strokeWidth={3} />
            <input
              type="text"
              placeholder="Cari nama, email, atau ID transaksi..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full bg-transparent text-[11px] md:text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
            />
          </div>
        </div>
      )}

      {currentLoading ? (
        <div className="space-y-4 md:space-y-5 lg:space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl md:rounded-2xl border-2 border-slate-900 bg-white dark:bg-slate-900 p-4 sm:p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-5 animate-pulse shadow-[2px_2px_0_0_#334155] md:shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] dark:md:shadow-[2px_2px_0_0_#1e293b]">
              <div className="flex items-center gap-4 sm:gap-5">
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-slate-100 dark:bg-slate-800 shrink-0 border-2 border-slate-900 dark:border-slate-700" />
                <div className="space-y-2 md:space-y-3">
                  <div className="h-4 md:h-5 bg-slate-100 dark:bg-slate-800 rounded-lg w-32 sm:w-48" />
                  <div className="h-3 md:h-4 bg-slate-50 dark:bg-slate-900 rounded-lg w-48 sm:w-64" />
                </div>
              </div>
              <div className="flex flex-row md:flex-col items-center md:items-end justify-between gap-3 mt-2 md:mt-0">
                <div className="h-5 md:h-6 bg-slate-100 dark:bg-slate-800 rounded-lg w-24 md:w-32" />
                <div className="h-4 md:h-5 bg-slate-100 dark:bg-slate-800 rounded-full w-16 md:w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <div className="rounded-[40px] border-2 border-slate-900 bg-white dark:bg-slate-900 p-12 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b]">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-24 h-24 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center mb-6 text-slate-300">
              <History className="w-12 h-12" strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Belum Ada Riwayat</h3>
            <p className="text-sm font-bold text-slate-400 dark:text-slate-300 max-w-sm">
              {viewMode === 'mine' ? 'Transaksi Top Up atau pemesanan album Anda akan tercatat secara otomatis di sini.' : 'Belum ada transaksi yang tercatat dalam sistem.'}
            </p>
          </div>
        </div>
      ) : filteredTransactions.length === 0 && viewMode === 'all' && searchQuery ? (
        <div className="rounded-[40px] border-2 border-slate-900 bg-white p-12 shadow-[2px_2px_0_0_#334155]">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-24 h-24 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-6 text-slate-300">
              <Search className="w-12 h-12" strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Hasil Tidak Ditemukan</h3>
            <p className="text-sm font-bold text-slate-400 max-w-sm">
              Tidak ada transaksi yang cocok dengan pencarian &quot;<span className="text-slate-900">{searchQuery}</span>&quot;
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4 md:space-y-5 lg:space-y-6">
          {paginatedTransactions.map((tx) => {
            const st = tx.status.toUpperCase()
            const isPaid = st === 'PAID' || st === 'SETTLED'
            const isPending = st === 'PENDING'
            const isExpired = st === 'EXPIRED'
            return (
            <div
              key={tx.id}
              className="rounded-xl md:rounded-2xl border-2 border-black bg-white dark:bg-slate-900 p-4 sm:p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-5 shadow-[2px_2px_0_0_#334155] md:shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b] dark:md:shadow-[2px_2px_0_0_#1e293b] hover:translate-x-1 hover:translate-y-1 transition-all"
            >
              <div className="flex items-start sm:items-center gap-4 sm:gap-5">
                <div
                  className={`w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl border-2 flex items-center justify-center shrink-0 ${isPaid
                    ? 'border-black bg-emerald-300 shadow-[2px_2px_0_0_#334155] md:shadow-[2px_2px_0_0_#334155]'
                    : isPending
                      ? 'border-black bg-orange-300 shadow-[2px_2px_0_0_#334155] md:shadow-[2px_2px_0_0_#334155]'
                      : isExpired
                        ? 'border-black bg-rose-400 shadow-[2px_2px_0_0_#334155] md:shadow-[2px_2px_0_0_#334155] dark:border-black dark:bg-rose-900 dark:shadow-[2px_2px_0_0_#1e293b] dark:md:shadow-[2px_2px_0_0_#1e293b]'
                      : 'border-black bg-red-400 shadow-[2px_2px_0_0_#334155] md:shadow-[2px_2px_0_0_#334155]'
                    }`}
                >
                  <CreditCard
                    className={`w-5 h-5 md:w-6 md:h-6 ${isExpired ? 'text-slate-900 dark:text-rose-100' : 'text-slate-900'}`}
                    strokeWidth={2.5}
                  />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
                    {tx.description || (tx.album_name ? tx.album_name : (tx.credits != null ? `Top Up ${tx.credits} Credits` : 'Transaction'))}
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {viewMode === 'all' && (tx.user_full_name != null || tx.user_email != null) && (
                      <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-[13px] font-bold bg-slate-100 dark:bg-slate-800 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border-2 border-slate-900 dark:border-slate-700 w-fit">
                        <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-500 mr-0.5 sm:mr-1" />
                        <span className="text-slate-900 dark:text-white font-bold">{tx.user_full_name ?? '-'}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-0.5 sm:mx-1" />
                        <span className="font-medium text-slate-500 dark:text-slate-300">{tx.user_email ?? '-'}</span>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] sm:text-[12px] font-bold text-slate-400">
                      <span className="flex items-center gap-1 sm:gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(tx.created_at).toLocaleDateString('id-ID', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {tx.external_id && (
                        <span className="flex items-center gap-1 sm:gap-1.5 font-mono">
                          <code className="bg-slate-200 dark:bg-slate-700 px-1.5 sm:px-2 rounded text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 text-[10px] sm:text-xs tracking-wider">
                            {`TR-${tx.external_id.split('_ts_')[1] || tx.external_id.slice(-8)}`}
                          </code>
                        </span>
                      )}
                      {tx.payment_method && (
                        <span className="px-1.5 sm:px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-indigo-50 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 font-bold text-[9px] sm:text-[10px] uppercase tracking-wide">
                          {tx.payment_method.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between md:flex-col md:items-end gap-3 mt-2 md:mt-0 xl:ml-6">
                <div className="text-left md:text-right">
                  <span className="block text-lg sm:text-xl md:text-2xl font-bold text-slate-900 dark:text-white">
                    Rp {tx.amount.toLocaleString('id-ID')}
                  </span>
                  <div className="mt-1 flex md:justify-end">
                    <span
                      className={`text-[9px] sm:text-[10px] font-bold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg border-2 uppercase tracking-widest ${isPaid
                        ? 'border-slate-900 bg-emerald-300 text-slate-900 shadow-[2px_2px_0_0_#94a3b8] sm:shadow-[#64748b]'
                        : isPending
                          ? 'border-slate-900 bg-orange-300 text-slate-900 shadow-[2px_2px_0_0_#94a3b8] sm:shadow-[#64748b]'
                          : isExpired
                            ? 'border-slate-900 bg-rose-400 text-slate-900 shadow-[2px_2px_0_0_#94a3b8] sm:shadow-[#64748b] dark:border-slate-900 dark:bg-rose-900 dark:text-rose-100 dark:shadow-[2px_2px_0_0_#475569] dark:sm:shadow-[#64748b]'
                          : 'border-slate-900 bg-red-400 text-white shadow-[2px_2px_0_0_#94a3b8] sm:shadow-[#64748b]'
                        }`}
                    >
                      {isPaid ? 'SUCCESS' : isExpired ? 'EXPIRED' : tx.status}
                    </span>
                  </div>
                </div>

                {tx.invoice_url && isPending && (
                  <button
                    type="button"
                    onClick={() => tx.invoice_url && setInvoicePopupUrl(tx.invoice_url)}
                    className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs md:text-sm font-bold bg-orange-400 text-slate-900 px-3 sm:px-4 md:px-5 py-2 md:py-2.5 rounded-xl md:rounded-2xl border-2 border-slate-900 hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-[2px_2px_0_0_#64748b] md:shadow-[2px_2px_0_0_#64748b] transition-all shrink-0 w-fit"
                  >
                    Lanjutkan Bayar
                    <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={3} />
                  </button>
                )}

                {tx.invoice_url && isPaid && (
                  <button
                    type="button"
                    onClick={() => generateAndPrintInvoice(tx)}
                    className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs md:text-sm font-bold bg-emerald-200 text-slate-900 px-3 sm:px-4 md:px-5 py-2 md:py-2.5 rounded-xl md:rounded-2xl border-2 border-slate-900 hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-[2px_2px_0_0_#64748b] md:shadow-[2px_2px_0_0_#64748b] transition-all shrink-0 w-fit"
                  >
                    Download Invoice
                    <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={3} />
                  </button>
                )}
              </div>
            </div>
            )
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {!currentLoading && filteredTransactions.length > itemsPerPage && (
        <div className="flex items-center justify-between mt-10 flex-wrap gap-4 px-2">
          <p className="text-sm font-bold text-slate-400">
            Menampilkan <span className="text-slate-900">{((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredTransactions.length)}</span> dari <span className="text-slate-900">{filteredTransactions.length}</span> data
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-white border-2 border-slate-900 text-slate-900 shadow-[#64748b] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-50 transition-all"
            >
              <ChevronLeft className="w-5 h-5" strokeWidth={3} />
            </button>
            <div className="flex items-center px-4 py-2 text-sm font-bold bg-indigo-200 border-2 border-slate-900 shadow-[#64748b] rounded-xl text-slate-900">
              {currentPage} / {totalPages}
            </div>
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-white border-2 border-slate-900 text-slate-900 shadow-[#64748b] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-50 transition-all"
            >
              <ChevronRight className="w-5 h-5" strokeWidth={3} />
            </button>
          </div>
        </div>
      )}
    </div>
    </>
  )
}







