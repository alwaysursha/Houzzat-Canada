"use client";

import { useAgentPresence } from "@/components/agent/presence/AgentPresenceProvider";
import type { AgentAvailabilityPreference } from "@/lib/chat/presence/client";
import { cn } from "@/lib/utils";

export function AgentAvailabilityControl({
  tone = "dark",
  compact = false,
  showHint = true,
  className,
}: {
  tone?: "dark" | "light";
  compact?: boolean;
  showHint?: boolean;
  className?: string;
}) {
  const { preference, preferencePending, preferenceError, setPreference } =
    useAgentPresence();

  async function select(next: AgentAvailabilityPreference) {
    if (preferencePending || next === preference) return;
    await setPreference(next);
  }

  const dark = tone === "dark";

  return (
    <div className={cn("min-w-0", className)}>
      <div
        className={cn(
          "inline-flex items-center rounded-md p-0.5",
          dark ? "bg-white/10" : "bg-[#e8eef5]",
          compact ? "gap-0.5" : "gap-0.5",
        )}
        role="group"
        aria-label="Chat availability"
      >
        {(
          [
            { value: "AVAILABLE", label: compact ? "Avail." : "Available" },
            { value: "AWAY", label: "Away" },
          ] as const
        ).map((option) => {
          const selected = preference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={preferencePending}
              aria-pressed={selected}
              aria-busy={preferencePending}
              onClick={() => {
                void select(option.value);
              }}
              className={cn(
                "rounded px-2 py-1 text-[11px] font-semibold transition disabled:opacity-60",
                compact ? "min-w-[3.25rem]" : "min-w-[4.5rem]",
                selected
                  ? option.value === "AVAILABLE"
                    ? "bg-canopy text-white shadow-sm"
                    : "bg-amber-500 text-white shadow-sm"
                  : dark
                    ? "text-white/65 hover:bg-white/10 hover:text-white"
                    : "text-[#64748b] hover:bg-white hover:text-[#1e2a38]",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {preferenceError ? (
        <p
          className={cn(
            "mt-1 max-w-[11rem] text-[10px] font-medium leading-snug",
            dark ? "text-rose-200" : "text-rose-600",
          )}
          role="status"
        >
          {preferenceError}
        </p>
      ) : showHint ? (
        <p
          className={cn(
            "mt-1 text-[10px]",
            dark ? "text-white/40" : "text-[#94a3b8]",
          )}
        >
          {preference === "AVAILABLE"
            ? "Available — online while active"
            : "Away — customers won’t see you online"}
        </p>
      ) : null}
    </div>
  );
}
