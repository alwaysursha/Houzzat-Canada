"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Maximize2,
  Minimize2,
  Minus,
  Square,
  X,
} from "lucide-react";
import { useEmailComposer } from "@/components/agent/email-composer/email-composer-context";
import {
  STAFF_OVERLAY_PRIORITY,
  useStaffOverlay,
} from "@/lib/mobile/use-staff-overlay";
import { visualViewportOverlayStyle } from "@/lib/visual-viewport-overlay-style";
import { cn } from "@/lib/utils";

/**
 * Floating Gmail-style CRM email composer.
 * Portaled to document.body so Lead Profile V2 stacking cannot clip it.
 * On mobile, pinned to the visual viewport + safe-area insets so Android
 * keyboards and status bars cannot cover the header or Send controls.
 */
export function EmailComposerShell() {
  const {
    windowState,
    draft,
    statusMessage,
    statusTone,
    pending,
    discardOpen,
    canSubmit,
    minimize,
    restore,
    toggleMaximize,
    requestClose,
    confirmDiscard,
    cancelDiscard,
    setSubject,
    setBody,
    send,
  } = useEmailComposer();

  const titleId = useId();
  const subjectRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const open = windowState !== "closed";
  const minimized = windowState === "minimized";
  const maximized = windowState === "maximized";

  useStaffOverlay({
    open: open && !minimized,
    id: draft ? `email-composer:${draft.leadId}` : "email-composer",
    priority: STAFF_OVERLAY_PRIORITY.emailPreview + 5,
    // Lock page scroll whenever the full composer is up (incl. mobile keyboard).
    lockScroll: open && !minimized,
    onClose: () => {
      if (pending) return;
      requestClose();
    },
  });

  useEffect(() => {
    if (!open || minimized) return;
    const timer = window.setTimeout(() => subjectRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open, minimized, draft?.leadId]);

  useEffect(() => {
    if (!open || minimized) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (discardOpen) {
          cancelDiscard();
          return;
        }
        if (!pending) requestClose();
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "Enter" &&
        canSubmit &&
        !pending
      ) {
        event.preventDefault();
        void send();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    open,
    minimized,
    discardOpen,
    pending,
    canSubmit,
    requestClose,
    cancelDiscard,
    send,
  ]);

  // Pin the portal root to the visual viewport so Android Chrome keyboard
  // resizes do not leave the header under the status bar or Send off-screen.
  useEffect(() => {
    if (!open || minimized) return;
    function syncViewport() {
      const el = overlayRef.current;
      if (!el) return;
      const style = visualViewportOverlayStyle(window.visualViewport);
      el.style.left = style.left;
      el.style.top = style.top;
      el.style.width = style.width;
      el.style.height = style.height;
      el.style.right = style.right;
      el.style.bottom = style.bottom;
    }
    syncViewport();
    window.addEventListener("resize", syncViewport);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", syncViewport);
    vv?.addEventListener("scroll", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
      vv?.removeEventListener("resize", syncViewport);
      vv?.removeEventListener("scroll", syncViewport);
      const el = overlayRef.current;
      if (!el) return;
      el.style.left = "";
      el.style.top = "";
      el.style.width = "";
      el.style.height = "";
      el.style.right = "";
      el.style.bottom = "";
    };
  }, [open, minimized]);

  if (typeof document === "undefined" || !open || !draft) return null;

  const recipientLabel = draft.recipientName
    ? `${draft.recipientName} <${draft.toEmail}>`
    : draft.toEmail;

  if (minimized) {
    return createPortal(
      <div
        className="pointer-events-auto fixed bottom-0 right-3 z-[105] w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-t-xl border border-[#c5d0dc] bg-[#1e2a38] text-white shadow-[0_-8px_30px_rgba(15,23,42,0.28)] sm:right-5 pb-[env(safe-area-inset-bottom,0px)]"
        role="dialog"
        aria-label="Minimized email composer"
      >
        <button
          type="button"
          onClick={restore}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-white/10"
        >
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
            {draft.subject.trim() || "New message"}
          </span>
          <span className="sr-only">Restore composer</span>
        </button>
        <div className="absolute right-1 top-1 flex items-center gap-0.5">
          <IconBtn label="Restore" onClick={restore}>
            <Square className="size-3.5" />
          </IconBtn>
          <IconBtn label="Close" onClick={requestClose}>
            <X className="size-3.5" />
          </IconBtn>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      ref={overlayRef}
      className={cn(
        "pointer-events-none fixed inset-0 z-[105]",
        maximized
          ? "flex items-stretch justify-stretch p-0 sm:p-3"
          : "flex items-stretch justify-center sm:items-end sm:justify-end sm:p-0 sm:pr-5 sm:pb-0",
      )}
    >
      {maximized ? (
        <button
          type="button"
          aria-label="Restore composer size"
          className="pointer-events-auto absolute inset-0 bg-[#0f172a]/35 backdrop-blur-[1px]"
          onClick={toggleMaximize}
        />
      ) : null}

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "pointer-events-auto flex w-full min-h-0 flex-col overflow-hidden border border-[#c5d0dc] bg-white shadow-[0_16px_48px_rgba(15,23,42,0.22)] transition-[width,height,border-radius] duration-200 ease-out",
          // Mobile: fill the visual-viewport overlay; pad for status bar / home indicator.
          "h-full max-h-full pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]",
          maximized
            ? "relative rounded-none sm:rounded-2xl"
            : "rounded-none sm:h-[min(34rem,calc(100%-2rem))] sm:max-h-[min(34rem,calc(100%-2rem))] sm:w-[min(36rem,calc(100vw-2.5rem))] sm:rounded-t-2xl sm:pt-0 sm:pb-0",
        )}
      >
        <header className="flex shrink-0 items-center gap-2 bg-[#1e2a38] px-3 py-2 text-white">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-[13px] font-semibold">
            New message
          </h2>
          <IconBtn label="Minimize" onClick={minimize} disabled={pending}>
            <Minus className="size-3.5" />
          </IconBtn>
          <IconBtn
            label={maximized ? "Restore size" : "Maximize"}
            onClick={toggleMaximize}
            disabled={pending}
          >
            {maximized ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
          </IconBtn>
          <IconBtn label="Close" onClick={requestClose} disabled={pending}>
            <X className="size-3.5" />
          </IconBtn>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-[#e2e8f0] px-3 py-2">
            <div className="flex items-baseline gap-2 text-[12px]">
              <span className="w-10 shrink-0 font-semibold text-[#64748b]">
                To
              </span>
              <span className="min-w-0 truncate font-medium text-[#1e2a38]">
                {recipientLabel}
              </span>
            </div>
            {!draft.consented ? (
              <p className="mt-1 text-[11px] font-medium text-amber-700">
                No CASL consent — sending is blocked until consent is recorded.
              </p>
            ) : null}
          </div>

          <label className="flex shrink-0 items-center gap-2 border-b border-[#e2e8f0] px-3 py-1.5">
            <span className="w-10 shrink-0 text-[12px] font-semibold text-[#64748b]">
              Subject
            </span>
            <input
              ref={subjectRef}
              value={draft.subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="Subject"
              disabled={pending}
              className="min-w-0 flex-1 border-0 bg-transparent py-1 text-[13px] text-[#1e2a38] outline-none placeholder:text-[#94a3b8] disabled:opacity-60"
            />
          </label>

          <textarea
            value={draft.body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={20000}
            placeholder="Write your message…"
            disabled={pending}
            className="min-h-0 flex-1 resize-none overflow-y-auto border-0 bg-white px-3 py-3 text-[13px] leading-relaxed text-[#1e2a38] outline-none placeholder:text-[#94a3b8] disabled:opacity-60"
          />

          <footer className="flex shrink-0 flex-col gap-2 border-t border-[#e2e8f0] bg-[#f8fafc] px-3 py-2.5">
            {statusMessage ? (
              <p
                className={cn(
                  "text-[12px] font-medium",
                  statusTone === "success" && "text-emerald-700",
                  statusTone === "error" && "text-red-700",
                  statusTone === "info" && "text-amber-700",
                  !statusTone && "text-[#475569]",
                )}
                role="status"
              >
                {statusMessage}
              </p>
            ) : (
              <p className="text-[11px] text-[#94a3b8]">
                Signature and legal footer are added automatically when sent.
              </p>
            )}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => void send()}
                disabled={!canSubmit}
                className="rounded-lg bg-[#0f766e] px-4 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#0d9488] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {pending ? "Sending…" : "Send"}
              </button>
              <p className="hidden text-[10px] text-[#94a3b8] sm:block">
                ⌘/Ctrl + Enter to send
              </p>
            </div>
          </footer>
        </div>

        {discardOpen ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0f172a]/45 p-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
            <div
              role="alertdialog"
              aria-labelledby={`${titleId}-discard`}
              className="w-full max-w-sm rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-xl"
            >
              <h3
                id={`${titleId}-discard`}
                className="text-[14px] font-semibold text-[#1e2a38]"
              >
                Discard this message?
              </h3>
              <p className="mt-1 text-[12px] text-[#64748b]">
                Your unsent subject and message will be cleared for this lead.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelDiscard}
                  className="rounded-lg border border-[#d8dee6] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#334155]"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={confirmDiscard}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-[12px] font-semibold text-white"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-7 items-center justify-center rounded-md text-white/90 transition hover:bg-white/15 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
