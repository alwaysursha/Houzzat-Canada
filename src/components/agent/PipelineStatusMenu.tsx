"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { LeadStatus } from "@prisma/client";
import {
  PIPELINE_STATUSES,
  pipelineBannerClass,
  pipelineIcon,
  pipelineIconClass,
  pipelineLabel,
  pipelineStatusDate,
} from "@/lib/agent/pipeline";
import { cn } from "@/lib/utils";

export function PipelineStatusMenu({
  leadId,
  status,
  statusChangedAt,
  createdAt,
  variant = "banner",
  onUpdated,
  className,
}: {
  leadId: string;
  status: LeadStatus;
  statusChangedAt?: string | Date | null;
  createdAt: string | Date;
  variant?: "banner" | "compact";
  onUpdated?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateLabel = pipelineStatusDate(statusChangedAt, createdAt);
  const StatusIcon = pipelineIcon(status);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function setStatus(next: LeadStatus) {
    if (next === status || pending) {
      setOpen(false);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, status: next }),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
        onUpdated?.();
      } else {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error || "Could not update pipeline status");
      }
    } catch {
      setError("Could not update pipeline status");
    } finally {
      setPending(false);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-center gap-2 font-bold transition disabled:opacity-60",
          variant === "banner"
            ? cn(
                "rounded-md px-3 py-2.5 text-[14px]",
                pipelineBannerClass(status),
              )
            : cn(
                "min-h-10 rounded border px-3 py-2 text-[12px] font-semibold",
                pipelineBannerClass(status),
              ),
        )}
      >
        {variant === "compact" ? (
          <StatusIcon className="size-3.5 shrink-0" strokeWidth={2.25} />
        ) : null}
        <span className="truncate">
          {pipelineLabel(status)} ({dateLabel})
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 opacity-90 transition",
            open && "rotate-180",
          )}
        />
      </button>
      {error ? (
        <p className="mt-1 text-center text-[11px] font-semibold text-red-600">
          {error}
        </p>
      ) : null}

      {open ? (
        <ul
          id={menuId}
          role="listbox"
          aria-label="Pipeline status"
          className="absolute left-0 right-0 z-40 mt-1 max-h-[min(360px,70vh)] overflow-auto border border-[#cbd5e1] bg-white py-0 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
        >
          {PIPELINE_STATUSES.map((s) => {
            const Icon = pipelineIcon(s);
            const current = s === status;
            return (
              <li key={s} role="option" aria-selected={current}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] font-medium text-[#0f172a] transition hover:bg-[#f1f5f9] disabled:opacity-50",
                    current && "bg-[#f8fafc]",
                  )}
                >
                  <Icon
                    className={cn("size-4 shrink-0", pipelineIconClass(s))}
                    strokeWidth={s === "CONTACTED" || s === "NEW_LEAD" ? 2.25 : 2}
                  />
                  <span className="flex-1 truncate">
                    {pipelineLabel(s)}
                    {current ? ` (${dateLabel})` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
