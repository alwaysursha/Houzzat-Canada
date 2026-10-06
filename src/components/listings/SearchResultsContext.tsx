"use client";

import { X } from "lucide-react";
import type {
  SearchResultChip,
  SearchResultChipKey,
  SearchResultsCopy,
} from "@/lib/listings/search-results-copy";
import { cn } from "@/lib/utils";

/** Place and free-text stay in the location field, not this chip row. */
const TOOLBAR_OMIT = new Set<SearchResultChipKey>(["place", "query"]);

export function SearchResultsHeading({
  title,
  countLabel,
  countHeadline,
  emphasizeCount = false,
}: {
  title: string;
  countLabel: string;
  /** Canonical total line, e.g. "247 Homes for Sale". */
  countHeadline?: string;
  /** Mobile card results: lead with the real result count. */
  emphasizeCount?: boolean;
}) {
  if (emphasizeCount && countHeadline) {
    return (
      <div className="search-results-heading sticky top-0 z-20 bg-mist px-2.5 py-2.5 sm:px-4 sm:py-2.5">
        <h1 className="min-w-0 text-[1.35rem] font-semibold leading-tight tracking-tight text-ink sm:text-2xl">
          {countHeadline}
        </h1>
        {title && title !== countHeadline ? (
          <p className="mt-0.5 truncate text-xs text-ink/45 sm:text-sm">{title}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="search-results-heading sticky top-0 z-20 flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5 bg-mist px-3 py-2 sm:gap-x-3 sm:px-4 sm:py-2.5">
      <style>{`@media (min-width: 640px) { .search-results-heading { flex-wrap: nowrap; } .search-results-heading h1 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }`}</style>
      <h1 className="min-w-0 text-lg font-semibold leading-snug tracking-tight text-ink sm:text-2xl sm:leading-tight">
        {title}
      </h1>
      <p className="shrink-0 text-xs text-ink/45 sm:text-sm">{countLabel}</p>
    </div>
  );
}

export function SearchToolbarChips({
  chips,
  onClearChip,
}: {
  chips: SearchResultsCopy["chips"];
  onClearChip: (chip: SearchResultChip) => void;
}) {
  const visible = chips.filter((chip) => !TOOLBAR_OMIT.has(chip.key));
  if (visible.length === 0) return null;
  return (
    <>
      {visible.map((chip) => (
        <ToolbarChip
          key={chip.city ? `${chip.key}:${chip.city}` : chip.key}
          chip={chip}
          onClear={onClearChip}
        />
      ))}
    </>
  );
}

function ToolbarChip({
  chip,
  onClear,
}: {
  chip: SearchResultChip;
  onClear: (chip: SearchResultChip) => void;
}) {
  if (!chip.clearable) {
    return (
      <span className="inline-flex h-8 shrink-0 items-center rounded-full border border-canopy/20 bg-canopy/10 px-2.5 text-xs font-semibold text-canopy">
        {chip.label}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onClear(chip)}
      className={cn(
        "inline-flex h-8 max-w-[14rem] shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-2.5 text-xs font-medium text-ink/75 transition hover:border-ink/20 hover:text-ink",
      )}
    >
      <span className="truncate">{chip.label}</span>
      <X className="size-3 shrink-0 text-ink/35" aria-hidden />
      <span className="sr-only">Remove {chip.label}</span>
    </button>
  );
}
