"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useStaffOverlay, STAFF_OVERLAY_PRIORITY } from "@/lib/mobile/use-staff-overlay";
import {
  CALL_OUTCOME_CHOICES,
  FOLLOW_UP_CHOICES,
  buildCallOutcomeRequest,
  callOutcomeAllowsDetails,
  callOutcomeConfirmation,
  formatFollowUpLabel,
  resolveFollowUpInstant,
  type CallOutcomeId,
  type FollowUpChoice,
} from "@/lib/agent/call-outcome-presentation";

export function CallOutcomeDialog({
  leadId,
  customerName,
  phoneLabel,
  clientRequestId,
  returnFocusRef,
  onClose,
  onSaved,
}: {
  leadId: string;
  customerName: string;
  phoneLabel: string;
  clientRequestId: string;
  returnFocusRef: { current: HTMLElement | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const [outcome, setOutcome] = useState<CallOutcomeId | null>(null);
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState<FollowUpChoice | null>(null);
  const [customWhen, setCustomWhen] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  onCloseRef.current = onClose;
  savingRef.current = saving;

  useStaffOverlay({
    open: true,
    id: `call-outcome:${leadId}`,
    priority: STAFF_OVERLAY_PRIORITY.leadPopup + 2,
    lockScroll: false,
    onClose: () => {
      if (savingRef.current) return;
      onCloseRef.current();
    },
  });

  useEffect(() => {
    const node = dialogRef.current;
    node?.querySelector<HTMLElement>("[role='radio']")?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (savingRef.current) return;
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const focusable = [
        ...node.querySelectorAll<HTMLElement>(
          'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [returnFocusRef]);

  const details = outcome ? callOutcomeAllowsDetails(outcome) : false;
  const confirmation = outcome ? callOutcomeConfirmation(outcome) : null;
  const followUpInstant =
    details && followUp
      ? resolveFollowUpInstant(followUp, new Date(), customWhen)
      : null;
  const followUpLabel = followUpInstant ? formatFollowUpLabel(followUpInstant) : null;
  const customIncomplete = details && followUp === "custom" && !followUpInstant;
  const canSave = Boolean(outcome) && !saving && !customIncomplete;

  async function save() {
    if (!outcome || savingRef.current || customIncomplete) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/leads/call-outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildCallOutcomeRequest({
            leadId,
            outcome,
            note,
            followUpDueAt: followUp === "none" ? null : followUpInstant,
            clientRequestId,
          }),
        ),
      });
      if (!response.ok) {
        setError("Couldn't save this call. Try again.");
        return;
      }
      onSaved();
    } catch {
      setError("Couldn't save this call. Try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function dismiss() {
    if (savingRef.current) return;
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="Close call outcome"
        disabled={saving}
        className="absolute inset-0 bg-[#0f172a]/45"
        onClick={dismiss}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={saving}
        tabIndex={-1}
        className="relative flex max-h-[min(92dvh,760px)] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_24px_70px_rgb(15_23_42/0.35)] outline-none sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#e8edf2] px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[18px] font-bold text-[#1e2a38]">
              How did the call go?
            </h2>
            <p className="mt-1 truncate text-[13px] text-[#64748b]">
              {customerName}
              {phoneLabel ? ` · ${phoneLabel}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            disabled={saving}
            className="rounded-md px-2 py-1 text-[13px] font-semibold text-[#64748b] hover:bg-[#f1f5f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d9488] disabled:opacity-40"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div role="radiogroup" aria-label="Call result" className="grid gap-2">
            {CALL_OUTCOME_CHOICES.map((choice) => {
              const selected = outcome === choice.id;
              return (
                <button
                  key={choice.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={saving}
                  onClick={() => setOutcome(choice.id)}
                  className={cn(
                    "min-h-12 rounded-xl border px-3 text-left text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d9488] focus-visible:ring-offset-2",
                    selected
                      ? "border-[#0d9488] bg-[#f0fdfa] text-[#115e59]"
                      : "border-[#dbe3ea] bg-white text-[#1e2a38] hover:bg-[#f8fafc]",
                  )}
                >
                  {choice.label}
                </button>
              );
            })}
          </div>

          {details ? (
            <>
              <label className="block">
                <span className="text-[13px] font-semibold text-[#334155]">
                  Notes
                </span>
                <textarea
                  value={note}
                  disabled={saving}
                  onChange={(event) => setNote(event.target.value)}
                  rows={4}
                  maxLength={8000}
                  placeholder="Optional"
                  className="mt-1 w-full resize-y rounded-xl border border-[#dbe3ea] px-3 py-2 text-[14px] text-[#1e2a38] outline-none focus:border-[#0d9488] focus-visible:ring-2 focus-visible:ring-[#0d9488]"
                />
              </label>
              <div>
                <p className="text-[13px] font-semibold text-[#334155]">
                  Next follow-up
                </p>
                <div
                  role="radiogroup"
                  aria-label="Next follow-up"
                  className="mt-2 flex flex-wrap gap-2"
                >
                  {FOLLOW_UP_CHOICES.map((choice) => {
                    const selected = followUp === choice.id;
                    return (
                      <button
                        key={choice.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={saving}
                        onClick={() => setFollowUp(choice.id)}
                        className={cn(
                          "min-h-11 rounded-full border px-3 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d9488] focus-visible:ring-offset-2",
                          selected
                            ? "border-[#0d9488] bg-[#f0fdfa] text-[#115e59]"
                            : "border-[#dbe3ea] bg-white text-[#334155] hover:bg-[#f8fafc]",
                        )}
                      >
                        {choice.label}
                      </button>
                    );
                  })}
                </div>
                {followUp === "custom" ? (
                  <label className="mt-3 block">
                    <span className="text-[12px] font-medium text-[#64748b]">
                      Date and time (Eastern Time)
                    </span>
                    <input
                      type="datetime-local"
                      value={customWhen}
                      disabled={saving}
                      onChange={(event) => setCustomWhen(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#dbe3ea] px-3 py-2 text-[14px] outline-none focus:border-[#0d9488] focus-visible:ring-2 focus-visible:ring-[#0d9488]"
                    />
                  </label>
                ) : null}
                {followUp && followUp !== "none" && followUpLabel ? (
                  <p className="mt-2 text-[13px] text-[#0f766e]">
                    Follow up {followUpLabel}
                  </p>
                ) : null}
                {followUp === "none" ? (
                  <p className="mt-2 text-[13px] text-[#64748b]">
                    No follow-up will be created.
                  </p>
                ) : null}
              </div>
            </>
          ) : null}

          {confirmation ? (
            <p className="rounded-xl bg-[#fffbeb] px-3 py-3 text-[13px] leading-relaxed text-[#92400e]">
              {confirmation}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-[13px] font-medium text-red-700">
              {error}
            </p>
          ) : null}
        </div>
        <div className="border-t border-[#e8edf2] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave}
            className="min-h-12 w-full rounded-xl bg-[#0d9488] text-[15px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d9488] focus-visible:ring-offset-2 disabled:opacity-45"
          >
            {saving ? "Saving…" : "Save Call"}
          </button>
        </div>
      </div>
    </div>
  );
}
