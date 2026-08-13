/**
 * Instant Agent CRM loading chrome — card skeletons inside AgentShell
 * so Capacitor hard-nav into /agent is never a blank white screen.
 */
export default function AgentLoading() {
  return (
    <div
      className="min-h-[50vh] overflow-x-hidden"
      aria-busy="true"
      aria-label="Loading Agent CRM"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-[#d8dee6] bg-white p-4 shadow-sm">
          <div className="h-3 w-24 animate-pulse rounded bg-[#1e2a38]/10" />
          <div className="mt-3 h-6 w-48 animate-pulse rounded bg-[#1e2a38]/10" />
          <div className="mt-2 h-3 w-full max-w-sm animate-pulse rounded bg-[#1e2a38]/10" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[#d8dee6] bg-white p-3.5 shadow-sm"
            >
              <div className="h-2.5 w-14 animate-pulse rounded bg-[#1e2a38]/10" />
              <div className="mt-3 h-7 w-10 animate-pulse rounded bg-[#1e2a38]/10" />
              <div className="mt-2 h-2.5 w-20 animate-pulse rounded bg-[#1e2a38]/10" />
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-[#d8dee6] bg-white p-4 shadow-sm">
          <div className="h-3 w-28 animate-pulse rounded bg-[#1e2a38]/10" />
          <div className="mt-4 flex gap-3 overflow-hidden">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="w-44 shrink-0 rounded-lg border border-[#e8edf2] bg-[#f8fafc] p-3"
              >
                <div className="h-2.5 w-16 animate-pulse rounded bg-[#1e2a38]/10" />
                <div className="mt-3 h-4 w-28 animate-pulse rounded bg-[#1e2a38]/10" />
                <div className="mt-2 h-2.5 w-20 animate-pulse rounded bg-[#1e2a38]/10" />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[#d8dee6] bg-white p-3.5 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="size-10 shrink-0 animate-pulse rounded-full bg-[#1e2a38]/10" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-[60%] animate-pulse rounded bg-[#1e2a38]/10" />
                  <div className="h-2.5 w-[40%] animate-pulse rounded bg-[#1e2a38]/10" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
