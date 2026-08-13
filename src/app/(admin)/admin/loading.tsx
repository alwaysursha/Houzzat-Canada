/**
 * Instant Admin HQ loading chrome — card skeletons inside AdminShell
 * so Capacitor hard-nav into /admin is never a blank white screen.
 */
export default function AdminLoading() {
  return (
    <div
      className="min-h-[50vh] overflow-x-hidden"
      aria-busy="true"
      aria-label="Loading Admin HQ"
    >
      <div className="mb-4 hidden lg:block">
        <div className="h-3 w-40 animate-pulse rounded bg-ink/10" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-ink/10" />
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-line/80 bg-surface/90 p-4 shadow-[0_1px_0_rgb(20_32_28/0.03)]"
            >
              <div className="h-2.5 w-16 animate-pulse rounded bg-ink/10" />
              <div className="mt-3 h-8 w-14 animate-pulse rounded bg-ink/10" />
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-line/80 bg-surface/90 p-4 sm:p-5">
          <div className="h-3 w-28 animate-pulse rounded bg-ink/10" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 border-b border-line/50 pb-3 last:border-0 last:pb-0"
              >
                <div className="size-9 shrink-0 animate-pulse rounded-full bg-ink/10" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-[70%] max-w-xs animate-pulse rounded bg-ink/10" />
                  <div className="h-2.5 w-[45%] max-w-[12rem] animate-pulse rounded bg-ink/10" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
