'use client'

import { History, ExternalLink, CreditCard, X, Download, Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { fetchWithAuth } from '../../../lib/api-client'
import { asObject } from '@/components/yearbook/utils/response-narrowing'
import { generateAndPrintInvoice } from '@/lib/generate-invoice'

type Transaction = {
  id: string
  external_id: string
  amount: number
  status: string
  invoice_url: string | null
  created_at: string
  credits: number | null
  payment_method?: string | null
  album_name?: string | null
  description?: string | null
  package_snapshot?: string | null
  discount_percent_off?: number | null
  new_students_count?: number | null
}

export default function UserRiwayatPage() {
  const cacheKey = 'user_transactions_v1'

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = window.sessionStorage.getItem(cacheKey)
      if (!raw) return []
      const parsed = JSON.parse(raw) as { ts: number; data: Transaction[] }
      return Array.isArray(parsed?.data) ? parsed.data : []
    } catch {
      return []
    }
  })
  const [loading, setLoading] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      const raw = window.sessionStorage.getItem(cacheKey)
      if (!raw) return true
      const parsed = JSON.parse(raw) as { ts: number; data: Transaction[] }
      return !Array.isArray(parsed?.data)
    } catch {
      return true
    }
  })
  const [invoicePopupUrl, setInvoicePopupUrl] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return transactions.slice(start, start + itemsPerPage)
  }, [transactions, currentPage])

  const totalPages = Math.ceil(transactions.length / itemsPerPage)

  // Cache is hydrated in state initializer (no skeleton flash).

  const fetchTransactions = useCallback(async (skipLoading = false) => {
    if (!skipLoading) setLoading(true)
    try {
      const ts = Date.now()
      const res = await fetchWithAuth(`/api/user/transactions?_t=${ts}`, { cache: 'no-store' })
      if (!res.ok) {
        setTransactions([])
        return
      }
      const data = await res.json()
      const list = Array.isArray(data) ? data : []
      setTransactions(list)
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: list }))
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.error('Error fetching transactions:', err)
      setTransactions([])
    } finally {
      if (!skipLoading) setLoading(false)
    }
  }, [])

  const hasCacheRef = useRef(!loading)
  const lastRealtimeFetchRef = useRef(0)

  useEffect(() => {
    fetchTransactions(hasCacheRef.current)
  }, [fetchTransactions])

  useEffect(() => {
    const onRealtime = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; channel?: string; payload?: Record<string, unknown> }>).detail
      if (!detail?.type || detail.channel !== 'global') return
      const path = typeof detail.payload?.path === 'string' ? detail.payload.path : ''
      const isAlbumMutationForPayments =
        path.startsWith('/api/albums/') &&
        (path.includes('/checkout') ||
          path.includes('/join-requests') ||
          /^\/api\/albums\/[^/]+$/.test(path))
      const isTransactionEvent =
        path.startsWith('/api/credits/') ||
        path.startsWith('/api/webhooks/xendit') ||
        isAlbumMutationForPayments
      if (!isTransactionEvent) return
      const now = Date.now()
      if (now - lastRealtimeFetchRef.current < 3000) return
      lastRealtimeFetchRef.current = now
      fetchTransactions(true)
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
      fetchTransactions()
      window.history.replaceState({}, '', '/user/riwayat')
    }
  }, [fetchTransactions])

  // Pastikan tidak ada double scrollbar saat popup Xendit terbuka
  useEffect(() => {
    if (invoicePopupUrl) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
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

      <div className="flex flex-col gap-2 mb-8">
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Riwayat Transaksi
        </h1>
        <p className="text-slate-600 dark:text-slate-300 font-medium text-xs md:text-sm">
          Daftar riwayat transaksi Top Up Anda.
        </p>
      </div>

      {loading ? (
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
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-24 h-24 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center mb-6 text-slate-300">
              <History className="w-12 h-12" strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Belum Ada Riwayat</h3>
            <p className="text-sm font-bold text-slate-400 dark:text-slate-300 max-w-sm">
              Transaksi Top Up atau pemesanan album Anda akan tercatat secara otomatis di sini.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4 md:space-y-5 lg:space-y-6">
          {paginatedTransactions.map((tx) => {
            const st = tx.status.toUpperCase()
            const isPaid = st === 'PAID' || st === 'SETTLED'
            const isPending = st === 'PENDING'
            const isInvoiceTerminalFail =
              st === 'EXPIRED' ||
              st === 'VOID' ||
              st === 'VOIDED' ||
              st === 'FAILED' ||
              st === 'CANCELLED' ||
              st === 'CANCELED'
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
                      : isInvoiceTerminalFail
                        ? 'border-black bg-rose-400 shadow-[2px_2px_0_0_#334155] md:shadow-[2px_2px_0_0_#334155] dark:border-black dark:bg-rose-900 dark:shadow-[2px_2px_0_0_#1e293b] dark:md:shadow-[2px_2px_0_0_#1e293b]'
                      : 'border-black bg-red-400 shadow-[2px_2px_0_0_#334155] md:shadow-[2px_2px_0_0_#334155]'
                    }`}
                >
                  <CreditCard
                    className={`w-5 h-5 md:w-6 md:h-6 ${isInvoiceTerminalFail ? 'text-slate-900 dark:text-rose-100' : 'text-slate-900'}`}
                    strokeWidth={2.5}
                  />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
                    {tx.description || (tx.album_name ? tx.album_name : (tx.credits != null ? `Top Up ${tx.credits} Credits` : 'Transaction'))}
                  </h4>
                  <div className="flex flex-col gap-1.5">
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
                          : isInvoiceTerminalFail
                            ? 'border-slate-900 bg-rose-400 text-slate-900 shadow-[2px_2px_0_0_#94a3b8] sm:shadow-[#64748b] dark:border-slate-900 dark:bg-rose-900 dark:text-rose-100 dark:shadow-[2px_2px_0_0_#475569] dark:sm:shadow-[#64748b]'
                          : 'border-slate-900 bg-red-400 text-white shadow-[2px_2px_0_0_#94a3b8] sm:shadow-[#64748b]'
                        }`}
                    >
                      {isPaid ? 'SUCCESS' : isInvoiceTerminalFail ? (st === 'EXPIRED' ? 'EXPIRED' : st) : tx.status}
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
      {!loading && transactions.length > itemsPerPage && (
        <div className="flex items-center justify-between mt-10 flex-wrap gap-4 px-2">
          <p className="text-sm font-bold text-slate-400">
            Menampilkan <span className="text-slate-900">{((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, transactions.length)}</span> dari <span className="text-slate-900">{transactions.length}</span> data
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
    </>
  )
}







