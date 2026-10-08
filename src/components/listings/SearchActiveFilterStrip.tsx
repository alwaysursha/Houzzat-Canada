"use client";

import { X } from "lucide-react";
import type { SearchResultChip } from "@/lib/listings/search-results-copy";
import { cn } from "@/lib/utils";

/**
 * Removable chips for committed Search criteria (below the toolbar).
 * Labels come from searchResultsCopy — e.g. "3+ Beds", "2+ Baths" — so the
 * strip cannot drift from the URL / API query.
 */
export function SearchActiveFilterStrip({
  chips,
  onClearChip,
  onClearAll,
  className,
}: {
  chips: SearchResultChip[];
  onClearChip: (chip: SearchResultChip) => void;
  onClearAll: () => void;
  className?: string;
}) {
  const removable = chips.filter((chip) => chip.clearable);
  if (removable.length === 0) return null;

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:gap-2 sm:overflow-x-hidden sm:pb-0",
        className,
      )}
      role="list"
      aria-label="Active filters"
    >
      {chips.map((chip) => {
        const key = chip.city ? `${chip.key}:${chip.city}` : chip.key;
        if (!chip.clearable) {
          return (
            <span
              key={key}
              role="listitem"
              className="inline-flex h-9 max-w-[14rem] shrink-0 items-center rounded-full border border-canopy/20 bg-canopy/10 px-3 text-xs font-semibold text-canopy sm:h-8 sm:px-2.5"
            >
              <span className="truncate">{chip.label}</span>
            </span>
          );
        }
        return (
          <button
            key={key}
            type="button"
            role="listitem"
            aria-label={`Remove ${chip.label}`}
            title={`Remove ${chip.label}`}
            onClick={() => onClearChip(chip)}
            className="group inline-flex h-9 max-w-[14rem] shrink-0 items-center gap-1 rounded-full border border-canopy/30 bg-canopy/[0.08] py-0 pl-3 pr-1 text-xs font-semibold text-canopy transition hover:border-canopy/50 hover:bg-canopy/15 sm:h-8 sm:pr-1.5"
          >
            <span className="min-w-0 truncate">{chip.label}</span>
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-canopy/70 transition group-hover:bg-canopy/15 group-hover:text-canopy sm:size-6">
              <X className="size-3.5" aria-hidden />
            </span>
          </button>
        );
      })}
      <button
        type="button"
        aria-label="Clear all filters"
        onClick={onClearAll}
        className="inline-flex h-9 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold text-ink/45 transition hover:bg-mist hover:text-danger sm:h-8"
      >
        Clear all
      </button>
    </div>
  );
}
