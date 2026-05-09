'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Plus, User, Users, Search } from 'lucide-react'
import AlbumsView from '@/components/albums/AlbumsView'

export default function AdminAlbumsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabFromUrl = useMemo(() => {
    const fromQuery = searchParams.get('tab')
    if (fromQuery === 'mine' || fromQuery === 'manage') return fromQuery
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('adminAlbumsTab')
      if (saved === 'mine' || saved === 'manage') return saved
    }
    return 'manage'
  }, [searchParams])
  const [activeTab, setActiveTab] = useState<'mine' | 'manage'>(tabFromUrl)
  const lastUrlTabRef = useRef<'mine' | 'manage'>(tabFromUrl)

  useEffect(() => {
    if (tabFromUrl !== lastUrlTabRef.current) {
      lastUrlTabRef.current = tabFromUrl
      setActiveTab(tabFromUrl)
    }
  }, [tabFromUrl])

  const setTab = (tab: 'mine' | 'manage') => {
    setActiveTab(tab)
    lastUrlTabRef.current = tab
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('adminAlbumsTab', tab)
    }
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const [showCreatePopup, setShowCreatePopup] = useState(false)

  const leftElement = (
    <div className="relative flex w-full md:w-fit items-center gap-1 p-1 bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0_0_#334155] dark:shadow-[2px_2px_0_0_#1e293b]">
      <div
        className="absolute top-1 bottom-1 rounded-xl bg-violet-400 transition-all duration-300 ease-out"
        style={{
          transform: activeTab === 'mine' ? 'translateX(0)' : 'translateX(100%)',
          width: 'calc(50% - 6px)',
        }}
      />
      <button
        type="button"
        onClick={() => setTab('mine')}
        className={`relative z-10 flex flex-1 md:flex-none min-w-0 items-center justify-center gap-1.5 md:gap-2 px-2 py-1.5 md:px-5 md:py-2 rounded-xl text-[11px] md:text-sm font-bold transition-all duration-200 ${
          activeTab === 'mine'
            ? 'text-slate-900'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
        }`}
      >
        <User className="hidden md:inline-block w-3.5 h-3.5 md:w-5 md:h-5 shrink-0" strokeWidth={2.5} />
        <span className="truncate">Album Saya</span>
      </button>
      <button
        type="button"
        onClick={() => setTab('manage')}
        className={`relative z-10 flex flex-1 md:flex-none min-w-0 items-center justify-center gap-1.5 md:gap-2 px-2 py-1.5 md:px-5 md:py-2 rounded-xl text-[11px] md:text-sm font-bold transition-all duration-200 ${
          activeTab === 'manage'
            ? 'text-slate-900'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
        }`}
      >
        <Search className="hidden md:inline-block w-3.5 h-3.5 md:w-5 md:h-5 shrink-0" strokeWidth={2.5} />
        <span className="truncate">Manajemen</span>
      </button>
    </div>
  )

  const createButton = (
    <button
      type="button"
      onClick={() => setShowCreatePopup(true)}
      className="flex-1 min-w-0 md:flex-initial inline-flex items-center justify-center gap-1 sm:gap-2 px-2 py-2 sm:px-4 sm:py-2 text-[10px] sm:text-sm font-black rounded-lg sm:rounded-xl border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] bg-violet-400 text-slate-900 dark:bg-violet-900/40 dark:text-violet-200 hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all active:scale-95 shrink-0"
      title="Buat Album Baru"
    >
      <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" strokeWidth={3} />
      <span className="whitespace-nowrap truncate tracking-wider">Buat</span>
    </button>
  )

  return (
    <div className="max-w-6xl mx-auto pb-12">
      {/* Header Title & Subtitle */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6">
        <div className="space-y-1">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white leading-none">
            {activeTab === 'mine' ? 'Album Saya' : 'Manajemen Album'}
          </h1>
          <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400">
            {activeTab === 'mine' ? 'Daftar album Anda.' : 'Kelola semua album yang tersedia.'}
          </p>
        </div>
      </div>

      {/* Popup Buat Project */}
      {showCreatePopup && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setShowCreatePopup(false)}>
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-[1.5rem] shadow-[4px_4px_0_0_#0f172a] dark:shadow-[4px_4px_0_0_#1e293b] p-6 sm:p-8 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mb-1 uppercase tracking-tight">Buat Project?</h2>
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              Kamu akan diarahkan ke pemilihan paket untuk memulai.
            </p>
            
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => router.push('/admin/showroom')}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-violet-300 dark:bg-violet-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white text-sm font-black uppercase tracking-wider shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
              >
                Gas Lanjut
              </button>
              <button
                type="button"
                onClick={() => setShowCreatePopup(false)}
                className="w-full py-3 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white text-xs font-black uppercase tracking-widest shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#334155] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={activeTab === 'mine' ? 'block' : 'hidden'}>
        <AlbumsView 
          variant="user" 
          linkContext="admin" 
          fetchUrl="/api/albums?scope=mine" 
          active={activeTab === 'mine'} 
          hideHeader={true} 
          leftElement={leftElement}
          createButton={createButton}
        />
      </div>
      <div className={activeTab === 'manage' ? 'block' : 'hidden'}>
        <AlbumsView 
          variant="admin" 
          linkContext="admin" 
          active={activeTab === 'manage'} 
          hideHeader={true} 
          leftElement={leftElement}
          createButton={createButton}
        />
      </div>
    </div>
  )
}






