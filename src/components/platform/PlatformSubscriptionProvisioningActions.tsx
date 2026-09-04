"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

type PlatformSubscriptionProvisioningActionsProps = {
  subscriptionId: string;
  canRetryProvisioning: boolean;
  provisioningStatus: string | null;
};

export function PlatformSubscriptionProvisioningActions({
  subscriptionId,
  canRetryProvisioning,
  provisioningStatus,
}: PlatformSubscriptionProvisioningActionsProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  if (!canRetryProvisioning) {
    return null;
  }

  async function retryProvisioning() {
    setSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/platform/v1/subscriptions/${encodeURIComponent(subscriptionId)}/provision`,
        {
          method: "POST",
          headers: { Accept: "application/json" },
        },
      );
      const body = (await response.json()) as ApiEnvelope<{
        outcome: string;
        runId: string | null;
        workspaceId: string | null;
      }>;

      if (!response.ok || !body.ok) {
        setFeedback({
          tone: "error",
          message:
            body.ok === false
              ? body.message
              : "Unable to retry provisioning.",
        });
        return;
      }

      setFeedback({
        tone: "success",
        message:
          body.data.outcome === "already_succeeded"
            ? "Provisioning already succeeded."
            : body.data.outcome === "succeeded"
              ? "Provisioning completed successfully."
              : `Provisioning finished with outcome ${body.data.outcome}.`,
      });
      router.refresh();
    } catch {
      setFeedback({
        tone: "error",
        message: "Network error while retrying provisioning.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-[#111827]">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Provisioning</h2>
        <p className="mt-1 text-xs text-slate-500">
          Start or retry workspace provisioning for this paid Stripe subscription.
          {provisioningStatus
            ? ` Current run status: ${provisioningStatus}.`
            : " No provisioning run yet."}
        </p>
      </div>
      <div className="space-y-4 p-4">
        {feedback ? (
          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              feedback.tone === "success"
                ? "border border-emerald-900/50 bg-emerald-950/30 text-emerald-200"
                : "border border-red-900/50 bg-red-950/30 text-red-200"
            }`}
          >
            {feedback.message}
          </div>
        ) : null}
        <button
          type="button"
          disabled={submitting}
          onClick={() => void retryProvisioning()}
          className="rounded-lg border border-emerald-800/70 bg-emerald-950/30 px-4 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-950/50 disabled:opacity-60"
        >
          {submitting ? "Working…" : "Retry Provisioning"}
        </button>
      </div>
    </section>
  );
}
