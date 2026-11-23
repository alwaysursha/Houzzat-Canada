"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Indicator = { label: string; value: string };

type Props = {
  workspaceId: string;
  indicators: Indicator[];
  offerId: string | null;
};

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

export function PlatformManualOnboarding({
  workspaceId,
  indicators,
  offerId,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(action: string, path: string) {
    setPending(action);
    setFeedback(null);
    setError(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const body = (await response.json()) as ApiEnvelope<{
        offerId?: string | null;
        offerStatus?: string;
        prospectId?: string;
        workspaceId?: string;
        outcome?: string;
      }>;
      if (!response.ok || !body.ok) {
        setError(body.ok === false ? body.message : "The action could not be completed.");
        return;
      }
      if (action === "offer" && body.data.outcome === "terms_required" && body.data.prospectId) {
        router.push(
          `/platform/offers/new?prospectId=${encodeURIComponent(body.data.prospectId)}&workspaceId=${encodeURIComponent(workspaceId)}`,
        );
        return;
      }
      if (action === "offer" && body.data.offerId) {
        const edit = body.data.offerStatus === "DRAFT";
        router.push(
          edit
            ? `/platform/offers/${encodeURIComponent(body.data.offerId)}/edit`
            : `/platform/offers/${encodeURIComponent(body.data.offerId)}`,
        );
        return;
      }
      setFeedback(
        action === "prepare"
          ? "Workspace prepared. No email was sent."
          : "Payment invitation sent.",
      );
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setPending(null);
    }
  }

  const base = `/api/platform/v1/workspaces/${encodeURIComponent(workspaceId)}`;

  return (
    <section className="rounded-xl border border-slate-800 bg-[#111827]">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Manual onboarding</h2>
        <p className="mt-1 text-xs text-slate-500">
          Prepare the existing workspace first. Payment and owner activation stay separate
          and are never sent by prepare.
        </p>
      </div>
      <div className="space-y-4 p-4">
        <dl className="grid gap-2 sm:grid-cols-2">
          {indicators.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-slate-400">{item.label}</dt>
              <dd className="font-medium text-slate-100">{item.value}</dd>
            </div>
          ))}
        </dl>
        {feedback ? <p className="text-sm text-emerald-200">{feedback}</p> : null}
        {error ? <p className="text-sm text-red-200">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending != null}
            onClick={() => void post("prepare", `${base}/prepare`)}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-60"
          >
            {pending === "prepare" ? "Preparing…" : "Prepare Workspace"}
          </button>
          <button
            type="button"
            disabled={pending != null}
            onClick={() => void post("offer", `${base}/prepare-offer`)}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-60"
          >
            {pending === "offer" ? "Opening…" : "Enter commercial terms"}
          </button>
          <button
            type="button"
            disabled={pending != null || !offerId}
            onClick={() => void post("payment", `${base}/send-payment-invitation`)}
            className="rounded-lg border border-amber-800/70 px-3 py-2 text-sm text-amber-100 hover:bg-amber-950/40 disabled:opacity-60"
          >
            {pending === "payment" ? "Sending…" : "Send Payment Invitation"}
          </button>
        </div>
        {offerId ? (
          <p className="text-xs text-slate-500">
            Offer {offerId} is linked to this workspace. Review its terms before sending payment.
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            Send Payment Invitation stays unavailable until a commercial offer is prepared.
          </p>
        )}
      </div>
    </section>
  );
}
