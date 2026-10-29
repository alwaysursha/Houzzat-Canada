"use client";

import { useTenantDisplayName } from "@/components/tenancy/TenantBrandProvider";
import { cn } from "@/lib/utils";

/** Approved IDX / CREA / VOW disclosure — do not paraphrase for display. */
export const MLS_DISCLAIMER_TEXT =
  "MLS®, Multiple Listing Service® and the associated logos are owned or controlled by The Canadian Real Estate Association (CREA) and are used under license. Listing information is provided by TRREB members via PropTx (IDX) and is believed to be reliable but not guaranteed. Brokerage attribution is shown on each listing. Sold prices and listing history are available only to registered Houzzat clients under TRREB Virtual Office Website (VOW) rules.";

/** Verbatim middle sentence — always visible in compact mobile Search footer. */
const MLS_DISCLAIMER_COMPACT_LINE =
  "Listing information is provided by TRREB members via PropTx (IDX) and is believed to be reliable but not guaranteed.";

/**
 * IDX / CREA attribution + VOW notice.
 * `compact` keeps a verbatim attribution line visible and the full approved
 * wording one tap away — so mobile Search does not permanently spend a full
 * multi-line paragraph of viewport height.
 */
export function MlsDisclaimer({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const brandName = useTenantDisplayName("Houzzat");
  const disclaimer = MLS_DISCLAIMER_TEXT.replaceAll("Houzzat", brandName);
  if (compact) {
    return (
      <aside className={cn("text-[10px] leading-snug text-ink/45", className)}>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-start gap-2 py-0.5 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1 text-ink/50">
              {MLS_DISCLAIMER_COMPACT_LINE}
            </span>
            <span className="shrink-0 pt-px font-semibold text-canopy group-open:hidden">
              Full
            </span>
            <span className="hidden shrink-0 pt-px font-semibold text-canopy group-open:inline">
              Hide
            </span>
          </summary>
          <p className="mt-1.5 text-[10px] leading-snug text-ink/40">
            {disclaimer}
          </p>
        </details>
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        "rounded-lg border border-line bg-surface/80 px-4 py-3 text-xs leading-relaxed text-ink/60",
        className,
      )}
    >
      {disclaimer}
    </aside>
  );
}
