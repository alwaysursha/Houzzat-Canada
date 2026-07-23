"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function ExpandableDescription({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const needsToggle = text.trim().length > 180;

  if (!text.trim()) return null;

  return (
    <div className="space-y-2">
      <p
        className={cn(
          "leading-relaxed text-ink/80",
          !expanded && needsToggle && "line-clamp-4",
          className,
        )}
      >
        {text}
      </p>
      {needsToggle ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-canopy bg-mist px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-canopy/5"
        >
          {expanded ? "Less Description" : "Full Description"}
          {expanded ? (
            <ChevronUp className="size-4 text-canopy" aria-hidden />
          ) : (
            <ChevronDown className="size-4 text-canopy" aria-hidden />
          )}
        </button>
      ) : null}
    </div>
  );
}
