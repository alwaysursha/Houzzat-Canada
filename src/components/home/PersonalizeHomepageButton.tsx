"use client";

import { useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { PersonalizeHomepageModal } from "@/components/home/PersonalizeHomepageModal";
import { Button } from "@/components/ui/button";
import { HOMEPAGE_SEARCH_DEFAULT_NAME } from "@/lib/listings/homepage-personalization";
import {
  committedFromActiveSearchHref,
  homepagePersonalizationQueryFromCommitted,
  isMeaningfulActiveSearchHref,
} from "@/lib/listings/homepage-search-source";
import { loadActiveSearchMemory } from "@/lib/listings/search-state/active-search-memory";
import { cn } from "@/lib/utils";

export function PersonalizeHomepageButton({
  cities,
  variant = "hero",
}: {
  cities: string[];
  variant?: "hero" | "tools";
}) {
  const [open, setOpen] = useState(false);

  const activeInitial = useMemo(() => {
    if (!open) return undefined;
    const memory = loadActiveSearchMemory();
    if (!memory || !isMeaningfulActiveSearchHref(memory.href)) return undefined;
    const committed = committedFromActiveSearchHref(memory.href);
    if (!committed) return undefined;
    const query = homepagePersonalizationQueryFromCommitted(committed);
    return {
      name: HOMEPAGE_SEARCH_DEFAULT_NAME,
      ...query,
    };
  }, [open]);

  return (
    <>
      {variant === "tools" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-canopy/30 bg-surface px-3 py-2 text-xs font-semibold text-canopy-deep transition hover:border-canopy/50 hover:bg-canopy/5"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          Personalize homepage
        </button>
      ) : (
        <Button
          type="button"
          size="sm"
          onClick={() => setOpen(true)}
          className={cn(
            "gap-2 border border-white/40 bg-white/15 text-white backdrop-blur hover:bg-white/25",
          )}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Personalize homepage
        </Button>
      )}
      <PersonalizeHomepageModal
        open={open}
        onClose={() => setOpen(false)}
        cities={cities}
        sourceKind={activeInitial ? "active" : undefined}
        initial={activeInitial}
      />
    </>
  );
}
