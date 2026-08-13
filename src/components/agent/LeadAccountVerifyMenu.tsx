"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Lock, Unlock } from "lucide-react";
import {
  accountAccessStatusLabel,
  getAccountAccessStatus,
  type AccountAccessStatus,
} from "@/lib/account-access";
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

function StatusIcon({
  status,
  className,
}: {
  status: AccountAccessStatus;
  className?: string;
}) {
  switch (status) {
    case "verified_unlocked":
      return <VerifiedIcon className={className} />;
    case "unverified_unlocked":
      return (
        <Unlock
          className={cn("text-[#ca8a04]", className)}
          strokeWidth={2.25}
          aria-hidden
        />
      );
    case "unverified_locked":
      return (
        <Lock
          className={cn("text-[#94a3b8]", className)}
          strokeWidth={2}
          aria-hidden
        />
      );
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function LeadAccountVerifyMenu({
  leadId,
  emailVerified,
  accountCreatedAt,
  onUpdated,
  onVerifiedChange,
  compact = false,
}: {
  leadId: string;
  emailVerified: boolean;
  /** Customer account createdAt — used for 7-day grace (Unverified Unlocked). */
  accountCreatedAt?: string | Date | null;
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

  const status = getAccountAccessStatus({
    emailVerified: emailVerified ? new Date() : null,
    createdAt: accountCreatedAt ?? null,
  });
  const statusLabel = accountAccessStatusLabel(status);

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
      const menuHeight = menuRef.current?.offsetHeight ?? 140;
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
    const nextStatus = getAccountAccessStatus({
      emailVerified: next ? new Date() : null,
      createdAt: accountCreatedAt ?? null,
    });
    if (pending || nextStatus === status) {
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

  const menuOptions: {
    status: AccountAccessStatus;
    verified: boolean | null;
    hint?: string;
  }[] = [
    { status: "verified_unlocked", verified: true },
    {
      status: "unverified_unlocked",
      verified: false,
      hint: "Within 7-day grace",
    },
    {
      status: "unverified_locked",
      verified: false,
      hint: "Past grace / limited access",
    },
  ];

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
            {menuOptions.map((option) => {
              const selected = option.status === status;
              const canSelect =
                option.status === "verified_unlocked" ||
                // Clearing verification: only offer the row that matches what
                // clearing would produce (grace → unlocked, else locked).
                (option.verified === false &&
                  getAccountAccessStatus({
                    emailVerified: null,
                    createdAt: accountCreatedAt ?? null,
                  }) === option.status);

              return (
                <li
                  key={option.status}
                  role="option"
                  aria-selected={selected}
                >
                  <button
                    type="button"
                    disabled={pending || !canSelect}
                    onClick={() => {
                      if (option.verified == null) return;
                      void setVerified(option.verified);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2.5 text-left disabled:opacity-45",
                      selected ? "bg-[#f8fafc]" : "hover:bg-[#f1f5f9]",
                      !canSelect && "cursor-default hover:bg-transparent",
                    )}
                  >
                    <StatusIcon
                      status={option.status}
                      className="size-4 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-[#0f172a]">
                        {accountAccessStatusLabel(option.status)}
                      </span>
                      {option.hint ? (
                        <span className="block text-[11px] font-medium text-[#94a3b8]">
                          {option.hint}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
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
        aria-label={statusLabel}
        title={statusLabel}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "inline-flex min-h-10 min-w-10 items-center justify-center gap-0.5 rounded-md p-2 transition hover:bg-[#f1f5f9] disabled:opacity-50",
          compact && "min-h-9 min-w-9 p-1.5",
          status === "verified_unlocked" && "text-[#6b9fd4]",
          status === "unverified_unlocked" && "text-[#ca8a04]",
          status === "unverified_locked" && "text-[#a8b4c0]",
        )}
      >
        <StatusIcon
          status={status}
          className={compact ? "size-3.5" : "size-4"}
        />
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
