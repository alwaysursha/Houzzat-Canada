"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { PersonalizeHomepageModal } from "@/components/home/PersonalizeHomepageModal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PersonalizeHomepageButton({
  cities,
  variant = "hero",
}: {
  cities: string[];
  variant?: "hero" | "tools";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "tools" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-canopy/30 bg-surface px-3 py-2 text-xs font-semibold text-canopy-deep transition hover:border-canopy/50 hover:bg-canopy/5"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          Create Custom Search
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
          Create Custom Search
        </Button>
      )}
      <PersonalizeHomepageModal
        open={open}
        onClose={() => setOpen(false)}
        cities={cities}
      />
    </>
  );
}
