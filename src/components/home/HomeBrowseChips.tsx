"use client";

import { cn } from "@/lib/utils";

const CHIPS = [
  { targetId: "rail-new-listings", label: "New" },
  { targetId: "rail-open-houses", label: "Open houses" },
  { targetId: "recently-sold", label: "Sold" },
  { targetId: "rail-for-lease", label: "For lease" },
  { targetId: "listings-near-me", label: "Near me" },
] as const;

export function HomeBrowseChips({ className }: { className?: string }) {
  function go(targetId: string) {
    const el = document.getElementById(targetId);
    if (!el) return;
    // CSS scroll-margin on rails accounts for sticky header + status bar.
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div
      className={cn(
        "flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {CHIPS.map((chip) => (
        <button
          key={chip.targetId}
          type="button"
          onClick={() => go(chip.targetId)}
          className="shrink-0 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink/75 transition hover:border-canopy/35 hover:bg-canopy/5 hover:text-canopy"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
