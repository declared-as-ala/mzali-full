export default function ProductLoading() {
  return (
    <div className="min-h-screen bg-ink-50 flex flex-col justify-between">
      {/* Top Header Placeholder */}
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur-md">
        <div className="container-shop flex h-16 items-center justify-between gap-4">
          <div className="h-8 w-8 rounded-lg bg-ink-200 animate-pulse md:hidden" />
          <div className="h-9 w-40 rounded-lg bg-ink-200 animate-pulse" />
          <div className="hidden md:flex items-center gap-6">
            <div className="h-4 w-16 rounded bg-ink-100 animate-pulse" />
            <div className="h-4 w-20 rounded bg-ink-100 animate-pulse" />
            <div className="h-4 w-16 rounded bg-ink-100 animate-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-ink-100 animate-pulse" />
            <div className="h-9 w-9 rounded-xl bg-ink-100 animate-pulse" />
          </div>
        </div>
      </header>

      <main className="container-shop py-6 lg:py-10 flex-1 animate-pulse">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
          {/* Gallery Skeleton */}
          <div className="space-y-3">
            <div className="relative w-full overflow-hidden rounded-2xl bg-ink-200 aspect-square shadow-sm" />
            <div className="flex gap-2">
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl bg-ink-200 shrink-0" />
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl bg-ink-200 shrink-0" />
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl bg-ink-200 shrink-0" />
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl bg-ink-200 shrink-0" />
            </div>
          </div>

          {/* Details Skeleton */}
          <div className="space-y-4">
            <div className="h-4 w-24 rounded bg-brand-100" />
            <div className="h-9 md:h-11 w-4/5 rounded-xl bg-ink-200" />
            
            <div className="flex items-baseline gap-3 pt-1">
              <div className="h-9 w-32 rounded-lg bg-brand-200" />
              <div className="h-6 w-20 rounded bg-ink-200" />
            </div>

            {/* Description Lines */}
            <div className="space-y-2 pt-2">
              <div className="h-3.5 w-full rounded bg-ink-200/70" />
              <div className="h-3.5 w-5/6 rounded bg-ink-200/70" />
              <div className="h-3.5 w-2/3 rounded bg-ink-200/70" />
            </div>

            {/* Bundle Offer Boxes */}
            <div className="space-y-2 pt-2">
              <div className="h-4 w-32 rounded bg-ink-200" />
              <div className="h-14 w-full rounded-xl border-2 border-ink-200 bg-ink-100" />
              <div className="h-14 w-full rounded-xl border-2 border-ink-200 bg-ink-100" />
            </div>

            {/* Quantity and Actions */}
            <div className="flex items-center gap-3 pt-3">
              <div className="h-12 w-36 rounded-xl border border-ink-200 bg-ink-100" />
              <div className="h-12 flex-1 rounded-xl bg-ink-200" />
            </div>
            <div className="h-14 w-full rounded-xl bg-brand-400" />
          </div>
        </div>

        {/* Related Products Skeleton */}
        <section className="mt-16">
          <div className="h-7 w-44 rounded-md bg-ink-200 mb-6" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white p-3 space-y-3">
                <div className="w-full aspect-[4/5] rounded-xl bg-ink-200" />
                <div className="h-4 w-3/4 rounded bg-ink-200" />
                <div className="h-5 w-1/3 rounded bg-brand-200" />
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer Placeholder */}
      <footer className="border-t border-ink-200 bg-white py-8">
        <div className="container-shop flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="h-6 w-36 rounded bg-ink-200 animate-pulse" />
          <div className="h-4 w-48 rounded bg-ink-100 animate-pulse" />
        </div>
      </footer>
    </div>
  );
}

