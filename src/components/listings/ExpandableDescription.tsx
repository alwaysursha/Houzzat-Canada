"use client";

import { useState } from "react";
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
          className="text-sm font-semibold text-canopy transition hover:underline"
        >
          {expanded ? "Less description" : "Full description"}
        </button>
      ) : null}
    </div>
  );
}
