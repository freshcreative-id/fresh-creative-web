'use client'

const SECTIONS = ['preview', 'flipbook', 'approval', 'team', 'sambutan', 'classes', 'ai-labs', 'cover'] as const
export type YearbookSkeletonSection = typeof SECTIONS[number]

export function isValidYearbookSection(s: string | null): s is YearbookSkeletonSection {
  return s !== null && SECTIONS.includes(s as YearbookSkeletonSection)
}

type Props = { section: YearbookSkeletonSection }

const mobileFirstWrapper = 'w-full min-h-screen mx-auto bg-white dark:bg-slate-950 lg:max-w-full'
const contentWrapper = 'max-w-[420px] md:max-w-full w-full mx-auto'

export default function YearbookSkeleton({ section }: Props) {
  const isCover = section === 'cover'
  const showClassesPanel = section === 'classes' || section === 'cover' || section === 'sambutan'
  const isPreview = section === 'preview'
  const isFlipbook = section === 'flipbook'
  const isApproval = section === 'approval'
  const isTeam = section === 'team'
  const isSambutan = section === 'sambutan'
  const isClasses = section === 'classes'
  const isAiLabs = section === 'ai-labs'

  return (
    <div className={mobileFirstWrapper} data-skeleton-section={section}>
      {/* Header - 1:1 dengan YearbookAlbumClient sticky header */}
      <div className="flex sticky top-0 z-50 bg-amber-300 dark:bg-slate-900 border-b-4 border-slate-900 dark:border-slate-700 px-3 lg:px-6 h-14 min-h-[3.5rem] items-center gap-3 lg:gap-4 shadow-[0_4px_0_0_#0f172a] dark:shadow-[0_4px_0_0_#334155]">
        <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-xl bg-white/40 dark:bg-slate-700/50 border-2 border-slate-900 dark:border-slate-700 animate-pulse shrink-0" aria-hidden />
        
        {/* Title Placeholder */}
        <div className="flex-1 lg:flex-none flex items-center lg:justify-center">
          <div className="h-6 w-24 sm:w-32 lg:w-40 bg-white/40 dark:bg-slate-700/50 border-2 border-slate-900 dark:border-slate-700 rounded-lg lg:rounded-xl animate-pulse lg:absolute lg:left-1/2 lg:-translate-x-1/2" aria-hidden />
        </div>

        <div className="ml-auto h-8 w-8 lg:h-10 lg:w-10 rounded-full bg-white/40 dark:bg-slate-700/50 border-2 border-slate-900 dark:border-slate-700 animate-pulse shrink-0 lg:hidden" aria-hidden />
      </div>

      {/* Mobile bottom nav placeholder */}
      <div className="fixed bottom-0 left-0 right-0 z-[60] h-14 sm:h-16 border-t-4 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 lg:hidden flex items-center justify-around shadow-[0_-4px_10px_0_rgba(0,0,0,0.1)] dark:shadow-[0_-4px_10px_0_rgba(0,0,0,0.3)]">
        <div className="w-10 sm:w-12 h-5 sm:h-6 bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-lg animate-pulse" />
        <div className="w-10 sm:w-12 h-5 sm:h-6 bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-lg animate-pulse" />
        <div className="w-12 h-12 sm:w-16 sm:h-16 -mt-6 sm:-mt-8 rounded-full bg-indigo-500 border-2 border-slate-900 dark:border-slate-700 animate-pulse shadow-[0_4px_0_0_#0f172a] sm:shadow-[0_6px_0_0_#0f172a] dark:shadow-[0_4px_0_0_#334155] sm:dark:shadow-[0_6px_0_0_#334155]" />
        <div className="w-10 sm:w-12 h-5 sm:h-6 bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-lg animate-pulse" />
        <div className="w-10 sm:w-12 h-5 sm:h-6 bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-lg animate-pulse" />
      </div>

      <div className={`${contentWrapper} flex flex-col min-h-[calc(100vh-3.5rem)]`}>
        <div className="flex-1 flex flex-col pb-8">
          <div className="flex flex-col lg:flex-row gap-0 flex-1 lg:pl-16 lg:px-0 lg:py-0">
            {/* Icon Sidebar */}
            <div className="hidden lg:flex fixed left-0 top-14 w-16 h-[calc(100vh-3.5rem)] flex-col border-r-4 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 z-40 py-4 shadow-[4px_0_10px_0_rgba(0,0,0,0.05)] dark:shadow-[4px_0_10px_0_rgba(0,0,0,0.2)]" aria-hidden>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex flex-col items-center gap-2 py-5 border-b-2 border-slate-100 dark:border-slate-700 last:border-0 w-full">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 animate-pulse" />
                  <div className="w-10 h-2 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-900 dark:border-slate-700 animate-pulse" />
                </div>
              ))}
            </div>

            {/* Classes panel */}
            {showClassesPanel && (
              <div className="hidden lg:flex fixed left-16 top-14 w-64 h-[calc(100vh-3.5rem)] flex-col border-r-4 border-slate-900 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 z-[35]" aria-hidden>
                <div className="flex-shrink-0 px-4 py-6 border-b-2 border-slate-900 dark:border-slate-700">
                  <div className="h-12 w-full bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-[20px] animate-pulse shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b]" />
                </div>
                <div className="flex-1 overflow-hidden px-3 py-4 space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-14 px-4 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 animate-pulse shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b]" />
                  ))}
                </div>
                <div className="flex-shrink-0 px-4 py-4 border-t-2 border-slate-900 dark:border-slate-700">
                  <div className="h-12 w-full rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border-2 border-indigo-700 dark:border-indigo-800 animate-pulse" />
                </div>
              </div>
            )}

            {/* Main content area */}
            <div className={`flex-1 flex flex-col min-h-0 ${showClassesPanel ? 'pt-0 lg:pt-0' : 'pt-0'} ${showClassesPanel ? 'lg:ml-64' : 'lg:ml-0'}`}>
              <div className="flex-1 overflow-y-auto pb-40 lg:pb-0">
                {/* Cover skeleton */}
                {isCover && (
                  <div className="max-w-4xl mx-auto px-4 pt-0 pb-8 lg:py-12">
                    <div className="flex flex-col lg:flex-row items-center lg:items-stretch gap-8 lg:gap-10">
                      {/* Cover Image Placeholder */}
                      <div className="w-full max-w-[240px] sm:max-w-xs shrink-0">
                        <div className="aspect-[3/4] bg-slate-100 dark:bg-slate-800 rounded-[32px] border-2 border-slate-900 dark:border-slate-700 animate-pulse shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] rotate-1" />
                      </div>
                      
                      {/* Info Placeholder */}
                      <div className="flex-1 flex flex-col justify-center lg:justify-start lg:pt-2 space-y-6 text-center lg:text-left">
                        <div className="space-y-4">
                          <div className="h-10 lg:h-14 w-full max-w-md bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-2xl animate-pulse" />
                          <div className="h-4 lg:h-6 w-full max-w-sm bg-slate-100 dark:bg-slate-800 rounded-full animate-pulse mx-auto lg:mx-0" />
                          <div className="h-4 lg:h-6 w-2/3 max-w-xs bg-slate-100 dark:bg-slate-800 rounded-full animate-pulse mx-auto lg:mx-0" />
                        </div>
                        
                        <div className="pt-4 flex flex-col items-center lg:items-start gap-4">
                           <div className="h-12 w-48 bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-700 rounded-xl animate-pulse shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b]" />
                           <div className="h-4 w-32 bg-slate-100 dark:bg-slate-800 rounded-full animate-pulse" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Preview/Personal View skeleton */}
                {(isPreview || isClasses) && (
                  <div className="max-w-6xl mx-auto px-4 py-8">
                    {/* Personal Card Grid Skeleton */}
                    {isClasses ? (
                      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {[1, 2, 3, 4].map((i) => (
                          <div key={i} className="rounded-[32px] border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 animate-pulse overflow-hidden shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b]">
                            <div className="aspect-[4/5] bg-slate-100 dark:bg-slate-800 border-b-4 border-slate-900 dark:border-slate-700" />
                            <div className="p-5 space-y-4">
                              <div className="h-7 w-3/4 bg-slate-100 dark:bg-slate-800 rounded-xl" />
                              <div className="h-4 w-1/2 bg-slate-100 dark:bg-slate-800 rounded-lg" />
                              <div className="flex gap-2">
                                <div className="h-10 flex-1 bg-slate-100 dark:bg-slate-800 rounded-xl" />
                                <div className="h-10 flex-1 bg-slate-100 dark:bg-slate-800 rounded-xl" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center min-h-[60vh]">
                        <div className="w-full max-w-lg aspect-[4/5] rounded-[32px] border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-[4px_4px_0_0_#334155] dark:shadow-[4px_4px_0_0_#1e293b] animate-pulse flex flex-col">
                          <div className="aspect-[4/5] bg-slate-100 dark:bg-slate-800 border-b-4 border-slate-900 dark:border-slate-700" />
                          <div className="p-6 space-y-4">
                            <div className="h-8 w-3/4 bg-slate-100 dark:bg-slate-800 rounded-xl" />
                            <div className="h-4 w-1/2 bg-slate-100 dark:bg-slate-800 rounded-lg" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Sambutan/Teacher View skeleton */}
                {isSambutan && (
                  <div className="max-w-6xl mx-auto px-4 py-8">
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="rounded-2xl border-2 border-slate-900 bg-white animate-pulse overflow-hidden shadow-[4px_4px_0_0_#334155]">
                          <div className="aspect-[4/5] bg-slate-100 border-b-4 border-slate-900" />
                          <div className="p-4 space-y-3">
                            <div className="h-6 w-3/4 bg-slate-100 rounded-xl" />
                            <div className="h-3 w-1/2 bg-slate-100 rounded-lg" />
                            <div className="h-16 w-full bg-slate-50 border-2 border-slate-100 rounded-xl mt-2" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
