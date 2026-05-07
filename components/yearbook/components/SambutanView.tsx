'use client'

import React, { useState, useMemo } from 'react'
import { Plus, Users, X, ChevronLeft, ChevronRight } from 'lucide-react'
import TeacherCard from '@/components/yearbook/components/TeacherCard'
import FastImage from '@/components/ui/FastImage'

export type Teacher = {
  id: string
  name: string
  title?: string
  message?: string
  photo_url?: string
  video_url?: string
  sort_order?: number
  photos?: { id: string; file_url: string; sort_order: number }[]
}

interface SambutanViewProps {
  teachers: Teacher[]
  canManage: boolean
  onAddTeacher: (name: string, title: string) => void
  onUpdateTeacher: (teacherId: string, updates: { name?: string; title?: string; message?: string; video_url?: string; pendingPhotos?: File[]; pendingVideo?: File | null }) => void
  onDeleteTeacher: (teacherId: string, teacherName: string) => void
  onDeletePhoto: (teacherId: string, photoId: string) => void
  onPlayVideo?: (videoUrl: string) => void
}

function sortTeachersByName<T extends { name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }))
}

export default function SambutanView({
  teachers,
  canManage,
  onAddTeacher,
  onUpdateTeacher,
  onDeleteTeacher,
  onDeletePhoto,
  onPlayVideo,
}: SambutanViewProps) {
  const [addingTeacher, setAddingTeacher] = useState(false)
  const [newTeacherName, setNewTeacherName] = useState('')
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null)

  const teachersSorted = useMemo(() => sortTeachersByName(teachers), [teachers])


  return (
    <div className="w-full max-w-7xl mx-auto px-3 pt-0 pb-4 sm:px-4 sm:py-4 lg:px-6">
      {canManage && (
        <>
          {/* Add Teacher Modal/Overlay */}
          {addingTeacher && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                onClick={() => { setAddingTeacher(false); setNewTeacherName('') }}
              />
              <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-slate-700 rounded-[32px] shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] overflow-hidden animate-in zoom-in-95 duration-200 z-[101]">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Tambah Profil</h3>
                    <button
                      onClick={() => { setAddingTeacher(false); setNewTeacherName('') }}
                      className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                    >
                      <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                    </button>
                  </div>

                  <div className="flex flex-col gap-6">
                    <div>
                      <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 block">Nama Lengkap</label>
                      <input
                        type="text"
                        value={newTeacherName}
                        onChange={(e) => setNewTeacherName(e.target.value)}
                        placeholder="Contoh: Bpk. Budi Santoso"
                        className="w-full px-5 py-4 rounded-xl bg-slate-50 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 text-base font-black text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 transition-all shadow-[2px_2px_0_0_#f1f5f9] dark:shadow-[1.5px_1.5px_0_0_#1e293b]"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newTeacherName.trim()) {
                            onAddTeacher(newTeacherName.trim(), '')
                            setAddingTeacher(false)
                            setNewTeacherName('')
                          }
                          if (e.key === 'Escape') {
                            setAddingTeacher(false)
                            setNewTeacherName('')
                          }
                        }}
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => { setAddingTeacher(false); setNewTeacherName('') }}
                        className="flex-1 py-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-black uppercase tracking-widest border-2 border-slate-900 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (newTeacherName.trim()) {
                            onAddTeacher(newTeacherName.trim(), '')
                            setAddingTeacher(false)
                            setNewTeacherName('')
                          }
                        }}
                        disabled={!newTeacherName.trim()}
                        className="flex-[2] py-4 rounded-2xl bg-emerald-400 dark:bg-emerald-600 text-slate-900 dark:text-white text-xs font-black uppercase tracking-widest border-2 border-slate-900 dark:border-slate-700 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-50"
                      >
                        Tambah Sekarang
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Floating Action Button for Adding Teacher */}
          {!addingTeacher && (
            <button
              type="button"
              onClick={() => setAddingTeacher(true)}
              className="fixed bottom-24 right-6 lg:bottom-10 lg:right-10 z-[60] flex items-center justify-center w-14 h-14 lg:w-16 lg:h-16 rounded-full bg-amber-400 dark:bg-amber-600 border-2 border-slate-900 dark:border-slate-700 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all active:scale-90 group"
              title="Tambah Profil"
            >
              <Plus className="w-8 h-8 text-slate-900 dark:text-white transition-transform group-hover:rotate-90" strokeWidth={2.5} />
            </button>
          )}
        </>
      )}

      {teachersSorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 min-h-[45vh] w-full bg-slate-50/50 dark:bg-slate-900/20 rounded-[48px] border-2 border-dashed border-slate-900 dark:border-slate-900 transition-all duration-300 group/empty">
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-indigo-500/20 dark:bg-indigo-500/10 blur-2xl rounded-full scale-150 opacity-0 group-hover/empty:opacity-100 transition-opacity duration-500" />
            <div className="relative w-24 h-24 rounded-[32px] bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 shadow-[1.5px_1.5px_0_0_#334155] dark:shadow-[1.5px_1.5px_0_0_#1e293b] flex items-center justify-center transition-transform duration-500">
              <Users className="w-12 h-12 text-slate-300 dark:text-slate-600 group-hover/empty:text-indigo-400 dark:group-hover/empty:text-indigo-500 transition-colors" strokeWidth={1.5} />
            </div>
          </div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-[0.1em] mb-2 text-center px-6">Belum Ada Guru</h3>
          <p className="text-slate-400 dark:text-slate-600 text-[10px] sm:text-xs font-black uppercase tracking-widest text-center max-w-[280px] leading-relaxed px-6">
            Pilih tombol tambah di pojok layar untuk memulai daftar profil guru
          </p>
        </div>
      ) : (
        <div className="grid gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 items-start">
          {teachersSorted.map((teacher) => (
            <TeacherCard
              key={teacher.id}
              teacher={teacher}
              isOwner={canManage}
              isFlipped={editingTeacherId === teacher.id}
              onStartEdit={(t) => setEditingTeacherId(t.id)}
              onCancelEdit={() => setEditingTeacherId(null)}
              onSave={(updatedData) => {
                onUpdateTeacher(teacher.id, updatedData)
                setEditingTeacherId(null)
              }}
              onDelete={(teacherId) => onDeleteTeacher(teacherId, teacher.name)}
              onDeletePhoto={onDeletePhoto}
              onPlayVideo={(videoUrl) => onPlayVideo?.(videoUrl)}
              savingTeacher={false}
            />
          ))}
        </div>
      )}
    </div>
  )
}













