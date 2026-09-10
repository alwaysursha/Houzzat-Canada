import { ChevronLeft, ChevronRight, X } from "lucide-react";

export function LeadProfileV2Chrome({
  name,
  loading,
  refreshing,
  onClose,
  onRefresh,
  showLeadNav,
  prevLeadId,
  nextLeadId,
  onNavigateLead,
}: {
  name: string;
  loading: boolean;
  refreshing: boolean;
  onClose?: () => void;
  onRefresh: () => void;
  showLeadNav: boolean;
  prevLeadId: string | null;
  nextLeadId: string | null;
  onNavigateLead?: (leadId: string) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[#e8edf2] px-2 py-2 sm:px-4">
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-[#94a3b8] transition hover:bg-[#f1f5f9] hover:text-[#1e2a38]"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      ) : (
        <span className="size-8" />
      )}

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <p className="truncate text-[11px] font-bold uppercase tracking-wide text-[#94a3b8]">
          Lead profile
        </p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading || refreshing}
          className="shrink-0 text-[11px] font-semibold text-[#2b6cb0] transition hover:text-[#1d4ed8] hover:underline disabled:cursor-not-allowed disabled:opacity-40"
        >
          {refreshing ? "Refreshing…" : "Refresh profile"}
        </button>
      </div>

      {showLeadNav ? (
        <div
          className="flex shrink-0 items-center"
          aria-busy={loading || undefined}
        >
          <button
            type="button"
            disabled={!prevLeadId || loading}
            onClick={() => prevLeadId && onNavigateLead?.(prevLeadId)}
            className="rounded-md p-1.5 text-[#1e2a38] transition hover:bg-[#f1f5f9] disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Previous lead"
          >
            <ChevronLeft className="size-6" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            disabled={!nextLeadId || loading}
            onClick={() => nextLeadId && onNavigateLead?.(nextLeadId)}
            className="rounded-md p-1.5 text-[#1e2a38] transition hover:bg-[#f1f5f9] disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Next lead"
          >
            <ChevronRight className="size-6" strokeWidth={2.25} />
          </button>
        </div>
      ) : (
        <span className="size-8 shrink-0" aria-hidden />
      )}
      <span className="sr-only">{name}</span>
    </div>
  );
}
