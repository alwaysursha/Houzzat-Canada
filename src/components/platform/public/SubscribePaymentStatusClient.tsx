"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { HouzzatProWordmark } from "@/components/auth/HouzzatProWordmark";
import {
  PRIVATE_OFFER_CTA_SUPPORT_LABEL,
  PRIVATE_OFFER_PAYMENT_STATUS_FAILED,
  PRIVATE_OFFER_PAYMENT_STATUS_NEXT,
  PRIVATE_OFFER_PAYMENT_STATUS_PENDING,
  PRIVATE_OFFER_PAYMENT_STATUS_PROVISIONING,
  PRIVATE_OFFER_PAYMENT_STATUS_RECOVERABLE,
  PRIVATE_OFFER_PAYMENT_STATUS_SUCCESS_BODY,
  PRIVATE_OFFER_PAYMENT_STATUS_SUCCESS_SIGN_IN_BODY,
  PRIVATE_OFFER_PAYMENT_STATUS_SUCCESS_TITLE,
  PRIVATE_OFFER_PAYMENT_STATUS_TIMEOUT,
  PRIVATE_OFFER_PAYMENT_STATUS_TITLE,
  PRIVATE_OFFER_PAYMENT_STATUS_UNKNOWN,
} from "@/lib/platform/offers/private-offer-copy";
import type { CheckoutPaymentUiPhase } from "@/lib/platform/billing/checkout-payment-status";
import { resolveHouzzatProSupportCta } from "@/lib/platform/status/support";

type StatusPayload = {
  phase: CheckoutPaymentUiPhase;
  nextAction: "activate" | "sign_in" | "wait" | null;
  paymentConfirmed: boolean;
  provisioningComplete: boolean;
  activationRequired: boolean;
  activationComplete: boolean;
  provisioningRecoverable: boolean;
};

const POLL_MS = 2500;
/** Soft ceiling for awaiting unpaid/pending webhook confirmation only. */
const PENDING_PAYMENT_MAX_POLL_MS = 3 * 60_000;

type UiState =
  | { kind: "processing"; message: string }
  | { kind: "success"; nextAction: "activate" | "sign_in" }
  | { kind: "recoverable"; message: string }
  | { kind: "failed"; message: string }
  | { kind: "unknown"; message: string }
  | { kind: "timeout"; message: string };

/**
 * Map server phase → UI. READY always wins regardless of browser elapsed time.
 * Do not treat timer alone as recoverable while provisioning is PENDING/RUNNING.
 */
function mapStatus(data: StatusPayload, elapsedMs: number): UiState {
  switch (data.phase) {
    case "ready":
      if (data.nextAction === "activate" || data.nextAction === "sign_in") {
        return { kind: "success", nextAction: data.nextAction };
      }
      return {
        kind: "recoverable",
        message: PRIVATE_OFFER_PAYMENT_STATUS_RECOVERABLE,
      };
    case "paid_provisioning":
      if (data.provisioningRecoverable) {
        return {
          kind: "recoverable",
          message: PRIVATE_OFFER_PAYMENT_STATUS_RECOVERABLE,
        };
      }
      return {
        kind: "processing",
        message: PRIVATE_OFFER_PAYMENT_STATUS_PROVISIONING,
      };
    case "pending":
      if (elapsedMs >= PENDING_PAYMENT_MAX_POLL_MS) {
        return {
          kind: "timeout",
          message: PRIVATE_OFFER_PAYMENT_STATUS_TIMEOUT,
        };
      }
      return {
        kind: "processing",
        message: PRIVATE_OFFER_PAYMENT_STATUS_PENDING,
      };
    case "failed":
      return { kind: "failed", message: PRIVATE_OFFER_PAYMENT_STATUS_FAILED };
    case "unknown":
      return { kind: "unknown", message: PRIVATE_OFFER_PAYMENT_STATUS_UNKNOWN };
    default: {
      const _exhaustive: never = data.phase;
      void _exhaustive;
      return { kind: "unknown", message: PRIVATE_OFFER_PAYMENT_STATUS_UNKNOWN };
    }
  }
}

export function SubscribePaymentStatusClient({
  sessionId,
}: {
  sessionId: string | null;
}) {
  const support = resolveHouzzatProSupportCta();
  const startedAt = useRef(Date.now());
  const lastPhaseRef = useRef<CheckoutPaymentUiPhase | null>(null);
  const [pollEpoch, setPollEpoch] = useState(0);
  const [ui, setUi] = useState<UiState>(() =>
    sessionId
      ? { kind: "processing", message: PRIVATE_OFFER_PAYMENT_STATUS_PENDING }
      : { kind: "unknown", message: PRIVATE_OFFER_PAYMENT_STATUS_UNKNOWN },
  );
  const [continuing, setContinuing] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(
        `/api/platform/public/checkout/status?session_id=${encodeURIComponent(sessionId)}`,
        { cache: "no-store", headers: { Accept: "application/json" } },
      );
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        data?: StatusPayload;
      } | null;
      if (!res.ok || !body?.ok || !body.data) {
        const elapsed = Date.now() - startedAt.current;
        if (
          lastPhaseRef.current !== "paid_provisioning" &&
          elapsed >= PENDING_PAYMENT_MAX_POLL_MS
        ) {
          setUi({
            kind: "timeout",
            message: PRIVATE_OFFER_PAYMENT_STATUS_TIMEOUT,
          });
        }
        return;
      }
      lastPhaseRef.current = body.data.phase;
      setUi(mapStatus(body.data, Date.now() - startedAt.current));
    } catch {
      /* keep last UI; next poll retries */
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    void poll();
    const id = window.setInterval(() => {
      if (cancelled) return;
      const elapsed = Date.now() - startedAt.current;
      const phase = lastPhaseRef.current;
      // Stop interval only for unpaid pending timeout — keep polling while
      // paid provisioning is still legitimately PENDING/RUNNING.
      if (
        phase !== "paid_provisioning" &&
        phase !== "ready" &&
        elapsed >= PENDING_PAYMENT_MAX_POLL_MS
      ) {
        window.clearInterval(id);
        setUi((prev) =>
          prev.kind === "success" || prev.kind === "recoverable"
            ? prev
            : {
                kind: "timeout",
                message: PRIVATE_OFFER_PAYMENT_STATUS_TIMEOUT,
              },
        );
        return;
      }
      void poll();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [sessionId, poll, pollEpoch]);

  function onCheckAgain() {
    startedAt.current = Date.now();
    lastPhaseRef.current = null;
    setUi({
      kind: "processing",
      message: PRIVATE_OFFER_PAYMENT_STATUS_PROVISIONING,
    });
    // Remount the poll interval so Check Again actually re-enters polling.
    setPollEpoch((n) => n + 1);
  }

  async function onNext() {
    if (!sessionId || continuing) return;
    setContinuing(true);
    setContinueError(null);
    try {
      const res = await fetch("/api/platform/public/checkout/continue", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        data?: { url?: string };
      } | null;
      if (!res.ok || !body?.ok || !body.data?.url) {
        setContinueError(
          body?.message ??
            "Unable to continue yet. Please wait a moment and try again.",
        );
        setContinuing(false);
        return;
      }
      window.location.assign(body.data.url);
    } catch {
      setContinueError("Network error. Please try again.");
      setContinuing(false);
    }
  }

  const title =
    ui.kind === "success"
      ? PRIVATE_OFFER_PAYMENT_STATUS_SUCCESS_TITLE
      : PRIVATE_OFFER_PAYMENT_STATUS_TITLE;

  const body =
    ui.kind === "success"
      ? ui.nextAction === "sign_in"
        ? PRIVATE_OFFER_PAYMENT_STATUS_SUCCESS_SIGN_IN_BODY
        : PRIVATE_OFFER_PAYMENT_STATUS_SUCCESS_BODY
      : ui.message;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#07111f] px-4 py-16 text-center">
      <div className="w-full max-w-lg">
        <HouzzatProWordmark size="lg" className="text-white" />
        <h1 className="mt-10 font-display text-3xl font-semibold tracking-tight text-white">
          {title}
        </h1>
        <p className="mt-4 text-base text-slate-300">{body}</p>

        {ui.kind === "processing" ? (
          <p className="mt-6 text-sm text-slate-500" aria-live="polite">
            Confirming securely…
          </p>
        ) : null}

        {ui.kind === "success" ? (
          <div className="mt-8 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => void onNext()}
              disabled={continuing}
              className="inline-flex min-w-[10rem] items-center justify-center rounded-lg bg-emerald-500 px-6 py-3 text-sm font-semibold text-[#07111f] transition hover:bg-emerald-400 disabled:opacity-60"
            >
              {continuing ? "Continuing…" : PRIVATE_OFFER_PAYMENT_STATUS_NEXT}
            </button>
            {continueError ? (
              <p className="text-sm text-rose-300">{continueError}</p>
            ) : null}
          </div>
        ) : null}

        {ui.kind === "recoverable" ||
        ui.kind === "timeout" ||
        ui.kind === "failed" ||
        ui.kind === "unknown" ? (
          <div className="mt-8 flex flex-col items-center gap-3">
            {ui.kind === "recoverable" || ui.kind === "timeout" ? (
              <button
                type="button"
                onClick={onCheckAgain}
                className="inline-flex rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-emerald-400/40 hover:bg-white/5"
              >
                Check again
              </button>
            ) : null}
            <Link
              href={support.href}
              className="inline-flex rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-emerald-200 transition hover:border-emerald-400/40 hover:bg-white/5"
            >
              {PRIVATE_OFFER_CTA_SUPPORT_LABEL}
            </Link>
          </div>
        ) : (
          <Link
            href={support.href}
            className="mt-8 inline-flex rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-emerald-200 transition hover:border-emerald-400/40 hover:bg-white/5"
          >
            {PRIVATE_OFFER_CTA_SUPPORT_LABEL}
          </Link>
        )}
      </div>
    </div>
  );
}
