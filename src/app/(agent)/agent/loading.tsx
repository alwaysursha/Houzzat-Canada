/**
 * Lightweight Agent CRM loading chrome for soft navigations.
 * Kept minimal so section switches feel immediate; AgentShell chrome stays visible.
 */
export default function AgentLoading() {
  return (
    <div
      className="flex min-h-[40vh] flex-col gap-3 pt-1"
      aria-busy="true"
      aria-label="Loading Agent CRM"
    >
      <div className="h-1 w-full overflow-hidden rounded-full bg-[#1e2a38]/8">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-[#1e2a38]/25" />
      </div>
      <div className="h-3 w-28 animate-pulse rounded bg-[#1e2a38]/10" />
      <div className="h-3 w-full max-w-xs animate-pulse rounded bg-[#1e2a38]/10" />
    </div>
  );
}
