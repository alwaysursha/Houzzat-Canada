"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  workspaceId: string;
  canSendOwnerActivation: boolean;
  activationEligibilityReason: string | null;
};

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

export function PlatformOwnerActivationActions({
  workspaceId,
  canSendOwnerActivation,
  activationEligibilityReason,
}: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error" | "info";
    message: string;
  } | null>(null);

  async function sendActivation() {
    setSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/platform/v1/workspaces/${encodeURIComponent(workspaceId)}/send-activation`,
        { method: "POST", headers: { Accept: "application/json" } },
      );
      const body = (await response.json()) as ApiEnvelope<{
        outcome: string;
        emailStatus: string;
      }>;
      if (!response.ok || !body.ok) {
        setFeedback({
          tone: "error",
          message:
            body.ok === false
              ? body.message
              : "Unable to send activation email.",
        });
        return;
      }
      setFeedback({
        tone: body.data.emailStatus === "failed" ? "error" : "success",
        message:
          body.data.emailStatus === "sent"
            ? "Activation email sent."
            : body.data.emailStatus === "skipped"
              ? "Activation created (email delivery skipped in this environment)."
              : "Activation created but email delivery failed.",
      });
      router.refresh();
    } catch {
      setFeedback({
        tone: "error",
        message: "Network error while sending activation email.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-[#111827]">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Owner activation</h2>
        <p className="mt-1 text-xs text-slate-500">
          Master Admin only. Sends a one-time HouzzatPRO password activation link
          when the OWNER still has no password.
          {activationEligibilityReason
            ? ` Status: ${activationEligibilityReason}.`
            : null}
        </p>
      </div>
      <div className="space-y-4 p-4">
        {feedback ? (
          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              feedback.tone === "success"
                ? "border border-emerald-900/50 bg-emerald-950/30 text-emerald-200"
                : feedback.tone === "info"
                  ? "border border-slate-700 bg-slate-900/40 text-slate-300"
                  : "border border-red-900/50 bg-red-950/30 text-red-200"
            }`}
          >
            {feedback.message}
          </div>
        ) : null}

        {canSendOwnerActivation ? (
          <button
            type="button"
            disabled={submitting}
            onClick={() => void sendActivation()}
            className="rounded-lg border border-emerald-800/70 bg-emerald-950/30 px-4 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-950/50 disabled:opacity-60"
          >
            {submitting ? "Sending…" : "Send Activation Email"}
          </button>
        ) : (
          <p className="text-sm text-slate-400">
            {activationEligibilityReason === "OWNER_PASSWORD_SET"
              ? "Owner already has a password. Activation does not apply (password reset is a separate future flow)."
              : "Owner activation is not available for this workspace."}
          </p>
        )}
      </div>
    </section>
  );
}
