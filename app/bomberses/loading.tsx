export default function BombersesLoading() {
  return (
    <div className="min-h-screen bg-ink-50 flex flex-col justify-between">
      {/* Header Skeleton */}
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur-md">
        <div className="container-shop flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-ink-200 animate-pulse lg:hidden" />
            <div className="h-9 w-36 rounded-lg bg-ink-200 animate-pulse" />
            <div className="hidden md:block h-7 w-24 rounded-full bg-ink-200 animate-pulse" />
            <div className="hidden md:block h-7 w-24 rounded-full bg-ink-200 animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-ink-100 animate-pulse" />
            <div className="h-9 w-9 rounded-full bg-ink-100 animate-pulse" />
          </div>
        </div>
      </header>

      <main className="container-shop py-6 sm:py-10 flex-1 animate-pulse">
        {/* Breadcrumb Skeleton */}
        <div className="mb-4 flex items-center gap-2">
          <div className="h-3.5 w-14 rounded bg-ink-200" />
          <div className="h-3.5 w-20 rounded bg-ink-200" />
        </div>

        {/* Title & Sort Skeleton */}
        <div className="mb-6 sm:mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-ink-100 pb-5">
          <div className="space-y-2">
            <div className="h-3 w-28 rounded bg-brand-100" />
            <div className="h-8 sm:h-10 w-44 rounded-lg bg-ink-200" />
            <div className="h-4 w-24 rounded bg-ink-100" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-10 w-40 rounded-xl bg-ink-200" />
            <div className="h-10 w-14 rounded-xl bg-brand-200" />
          </div>
        </div>

        {/* 3-Column Mobile / 4-Column Desktop Skeleton Grid */}
        <div className="grid grid-cols-3 gap-1.5 min-[375px]:gap-2 sm:gap-3.5 md:gap-4 lg:grid-cols-4 lg:gap-5">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
            <div
              key={i}
              className="flex flex-col overflow-hidden rounded-xl sm:rounded-2xl border border-ink-200 bg-white p-1.5 min-[375px]:p-2 sm:p-3 space-y-2"
            >
              <div className="w-full aspect-[3/4] rounded-lg sm:rounded-xl bg-ink-200" />
              <div className="h-3 sm:h-4 w-3/4 rounded bg-ink-200" />
              <div className="h-3.5 sm:h-5 w-1/2 rounded bg-brand-200" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
