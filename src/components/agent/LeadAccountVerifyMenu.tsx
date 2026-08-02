"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

function VerifiedIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-[#6b9fd4] text-white",
        className,
      )}
      aria-hidden
    >
      <Check className="size-[62%]" strokeWidth={3} />
    </span>
  );
}

export function LeadAccountVerifyMenu({
  leadId,
  emailVerified,
  onUpdated,
  onVerifiedChange,
  compact = false,
}: {
  leadId: string;
  emailVerified: boolean;
  onUpdated?: () => void;
  /** Optimistic local sync (leads table). */
  onVerifiedChange?: (verified: boolean) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    function place() {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const menuWidth = 220;
      const gap = 4;
      const padding = 8;
      let left = compact ? rect.left : rect.right - menuWidth;
      left = Math.max(
        padding,
        Math.min(left, window.innerWidth - menuWidth - padding),
      );
      let top = rect.bottom + gap;
      const menuHeight = menuRef.current?.offsetHeight ?? 96;
      if (top + menuHeight > window.innerHeight - padding) {
        top = Math.max(padding, rect.top - gap - menuHeight);
      }
      setMenuPos({ top, left });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, compact]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
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

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function setVerified(next: boolean) {
    if (pending || next === emailVerified) {
      setOpen(false);
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/agent/leads/verify-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          channel: "email",
          verified: next,
        }),
      });
      if (!res.ok) return;
      setOpen(false);
      setToast("Lead verification status updated!");
      onVerifiedChange?.(next);
      router.refresh();
      onUpdated?.();
    } finally {
      setPending(false);
    }
  }

  const menu =
    open && menuPos && typeof document !== "undefined"
      ? createPortal(
          <ul
            ref={menuRef}
            id={menuId}
            role="listbox"
            style={{ top: menuPos.top, left: menuPos.left }}
            className="fixed z-[200] w-[220px] border border-[#cbd5e1] bg-white py-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
          >
            <li role="option" aria-selected={emailVerified}>
              <button
                type="button"
                disabled={pending}
                onClick={() => void setVerified(true)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] font-medium text-[#0f172a] hover:bg-[#f1f5f9] disabled:opacity-50",
                  emailVerified && "bg-[#f8fafc]",
                )}
              >
                <VerifiedIcon className="size-4 shrink-0" />
                Verified Unlocked
              </button>
            </li>
            <li role="option" aria-selected={!emailVerified}>
              <button
                type="button"
                disabled={pending}
                onClick={() => void setVerified(false)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] font-medium text-[#0f172a] hover:bg-[#f1f5f9] disabled:opacity-50",
                  !emailVerified && "bg-[#f8fafc]",
                )}
              >
                <Lock
                  className="size-4 shrink-0 text-[#94a3b8]"
                  strokeWidth={2}
                />
                Unverified Locked
              </button>
            </li>
          </ul>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="relative inline-flex shrink-0 items-center">
      <button
        ref={buttonRef}
        type="button"
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={
          emailVerified ? "Verified Unlocked" : "Unverified Locked"
        }
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "inline-flex items-center gap-0.5 rounded-md p-0.5 transition hover:bg-[#f1f5f9] disabled:opacity-50",
          emailVerified ? "text-[#6b9fd4]" : "text-[#a8b4c0]",
        )}
      >
        {emailVerified ? (
          <VerifiedIcon className={compact ? "size-3.5" : "size-4"} />
        ) : (
          <Lock
            className={compact ? "size-3.5" : "size-[18px]"}
            strokeWidth={2}
          />
        )}
        <ChevronDown
          className={cn(
            "opacity-60 transition",
            compact ? "size-3" : "size-3.5",
            open && "rotate-180",
          )}
        />
      </button>

      {menu}

      {toast ? (
        <div className="fixed right-4 top-4 z-[100] flex items-center gap-2 rounded-md border border-[#d8dee6] bg-white px-3 py-2 text-[12px] font-semibold text-[#334155] shadow-sm">
          <VerifiedIcon className="size-4" />
          {toast}
        </div>
      ) : null}
    </div>
  );
}
