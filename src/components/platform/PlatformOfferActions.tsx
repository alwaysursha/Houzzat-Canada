"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatCents } from "@/lib/platform/ui/format";

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

type PlatformOfferActionsProps = {
  offerId: string;
  status: string;
  prospectLabel: string;
  planCode: string;
  billingCadence: string;
  recurringTotalCents: number;
  oneTimeTotalCents: number;
  includedSeats: number;
  additionalSeats: number;
  expiresAt: string | null;
};

export function PlatformOfferActions({
  offerId,
  status,
  prospectLabel,
  planCode,
  billingCadence,
  recurringTotalCents,
  oneTimeTotalCents,
  includedSeats,
  additionalSeats,
  expiresAt,
}: PlatformOfferActionsProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [privateUrl, setPrivateUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDraft = status === "DRAFT";
  const canCancel =
    status === "DRAFT" || status === "SENT" || status === "VIEWED";

  async function sendOffer() {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/platform/v1/offers/${encodeURIComponent(offerId)}/send`,
        {
          method: "POST",
          headers: { Accept: "application/json" },
        },
      );
      const body = (await response.json()) as ApiEnvelope<{
        action: {
          privateUrl: string | null;
          alreadySent: boolean;
          outcome: string;
        };
        invitationEmail?: { status: string };
        notice?: string;
      }>;
      if (!response.ok || !body.ok) {
        setError(body.ok === false ? body.message : "Unable to send offer.");
        return;
      }
      setPrivateUrl(body.data.action.privateUrl);
      setNotice(
        body.data.notice ??
          (body.data.action.alreadySent
            ? "Offer was already sent. The private link is not shown again."
            : body.data.invitationEmail?.status === "sent"
              ? "Your proposal was emailed to the prospect. This private link is shown once — store it securely if you also want a copy."
              : body.data.invitationEmail?.status === "failed"
                ? "Offer sent. The invitation email could not be delivered. This private link is shown once — share it securely with the prospect."
                : "Offer sent. This private link is shown once. Store/share it securely."),
      );
      setConfirmSend(false);
      router.refresh();
    } catch {
      setError("Network error while sending offer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelOffer() {
    if (!window.confirm("Cancel this commercial offer? Active tokens will be revoked.")) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/platform/v1/offers/${encodeURIComponent(offerId)}/cancel`,
        {
          method: "POST",
          headers: { Accept: "application/json" },
        },
      );
      const body = (await response.json()) as ApiEnvelope<unknown>;
      if (!response.ok || !body.ok) {
        setError(body.ok === false ? body.message : "Unable to cancel offer.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error while cancelling offer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyUrl() {
    if (!privateUrl) return;
    try {
      await navigator.clipboard.writeText(privateUrl);
      setNotice("Private link copied. This link is shown once — store it securely.");
    } catch {
      setNotice("Copy failed — select and copy the link manually.");
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-800 bg-[#111827] p-5">
      <h2 className="text-sm font-semibold text-slate-200">Offer actions</h2>

      {error ? (
        <p className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          {notice}
        </p>
      ) : null}
      {privateUrl ? (
        <div className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-3">
          <p className="text-xs uppercase tracking-wide text-emerald-400">
            Private offer URL (shown once)
          </p>
          <p className="mt-2 break-all font-mono text-xs text-emerald-100">
            {privateUrl}
          </p>
          <button
            type="button"
            onClick={() => void copyUrl()}
            className="mt-3 rounded-md border border-emerald-700 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-900/40"
          >
            Copy link
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {isDraft ? (
          <>
            <a
              href={`/platform/offers/${encodeURIComponent(offerId)}/edit`}
              className="inline-flex rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Edit Offer
            </a>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setConfirmSend(true)}
              className="inline-flex rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
            >
              Send Offer
            </button>
          </>
        ) : null}
        {canCancel ? (
          <button
            type="button"
            disabled={submitting}
            onClick={() => void cancelOffer()}
            className="inline-flex rounded-lg border border-red-800 px-3 py-2 text-sm text-red-200 hover:bg-red-950/40 disabled:opacity-60"
          >
            Cancel Offer
          </button>
        ) : null}
      </div>

      {confirmSend ? (
        <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4">
          <p className="text-sm font-semibold text-slate-100">
            Confirm send
          </p>
          <p className="mt-1 text-xs text-slate-500">
            We&apos;ll email the secure proposal to the prospect. You&apos;ll
            also receive a private link once to copy.
          </p>
          <dl className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-slate-500">Prospect</dt>
              <dd>{prospectLabel}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Plan</dt>
              <dd>
                {planCode} · {billingCadence}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Recurring</dt>
              <dd>{formatCents(recurringTotalCents)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">One-time</dt>
              <dd>{formatCents(oneTimeTotalCents)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Seats</dt>
              <dd>
                {includedSeats} + {additionalSeats}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Expiry</dt>
              <dd>{expiresAt ?? "—"}</dd>
            </div>
          </dl>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void sendOffer()}
              className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
            >
              {submitting ? "Sending…" : "Send Offer"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setConfirmSend(false)}
              className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300"
            >
              Back
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
