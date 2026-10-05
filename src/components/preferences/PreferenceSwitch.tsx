"use client";

import { cn } from "@/lib/utils";

export function PreferenceSwitch({
  id,
  checked,
  disabled,
  pending,
  onCheckedChange,
  label,
}: {
  id: string;
  checked: boolean;
  disabled?: boolean;
  pending?: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy/50 focus-visible:ring-offset-2",
        checked ? "bg-canopy" : "bg-ink/15",
        (disabled || pending) && "cursor-not-allowed opacity-60",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block size-5 translate-x-1 rounded-full bg-white shadow transition",
          checked && "translate-x-6",
        )}
      />
    </button>
  );
}
