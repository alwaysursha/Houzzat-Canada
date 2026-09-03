"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WORKSPACE_SUSPEND_REASON_MIN } from "@/lib/platform/workspaces/status-constants";

type StatusEvent = {
  toStatus: string;
  reasonCode: string;
};

type PlatformWorkspaceActionsProps = {
  workspaceId: string;
  workspaceName: string;
  status: string;
  statusEvents: StatusEvent[];
};

type PendingAction = "suspend" | "reactivate" | null;

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

export function PlatformWorkspaceActions({
  workspaceId,
  workspaceName,
  status,
  statusEvents,
}: PlatformWorkspaceActionsProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const normalizedStatus = status.toUpperCase();
  const latestSuspension = statusEvents.find(
    (event) => event.toStatus === "SUSPENDED",
  );
  const latestSuspensionReason = latestSuspension?.reasonCode ?? null;
  const billingControlled =
    latestSuspensionReason === "BILLING_PAST_DUE" ||
    latestSuspensionReason === "CANCELLATION";

  const canSuspend =
    normalizedStatus === "ACTIVE" || normalizedStatus === "TRIAL";
  const canReactivate = normalizedStatus === "SUSPENDED" && !billingControlled;
  const suspendReasonValid = reason.trim().length >= WORKSPACE_SUSPEND_REASON_MIN;

  async function submitAction(action: Exclude<PendingAction, null>) {
    setSubmitting(true);
    setFeedback(null);
    try {
      const path =
        action === "suspend"
          ? `/api/platform/v1/workspaces/${encodeURIComponent(workspaceId)}/suspend`
          : `/api/platform/v1/workspaces/${encodeURIComponent(workspaceId)}/reactivate`;

      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(
          action === "suspend" ? { reason } : reason.trim() ? { reason } : {},
        ),
      });

      const body = (await response.json()) as ApiEnvelope<{
        action: { outcome: string };
      }>;

      if (!response.ok || !body.ok) {
        const message =
          body.ok === false
            ? body.message
            : "Unable to complete workspace action.";
        setFeedback({ tone: "error", message });
        return;
      }

      const verb = action === "suspend" ? "suspended" : "reactivated";
      const noOp = body.data.action.outcome === "no_op";
      setFeedback({
        tone: "success",
        message: noOp
          ? `Workspace is already ${normalizedStatus === "SUSPENDED" ? "suspended" : "active"}.`
          : `Workspace ${workspaceName} ${verb} successfully. Tenant data is preserved.`,
      });
      setPendingAction(null);
      setReason("");
      router.refresh();
    } catch {
      setFeedback({
        tone: "error",
        message: "Network error while updating workspace status.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (
    normalizedStatus === "CANCELLED" ||
    (!canSuspend && !canReactivate && !billingControlled)
  ) {
    return null;
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-[#111827]">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Workspace actions</h2>
        <p className="mt-1 text-xs text-slate-500">
          Manual platform controls. Suspension preserves all workspace data.
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

        {billingControlled ? (
          <p className="text-sm text-amber-200/90">
            This workspace is suspended for billing or cancellation reasons. Manual
            reactivation is not available until billing authority resolves the suspension.
          </p>
        ) : null}

        {pendingAction === null ? (
          <div className="flex flex-wrap gap-3">
            {canSuspend ? (
              <button
                type="button"
                onClick={() => {
                  setPendingAction("suspend");
                  setFeedback(null);
                }}
                className="rounded-lg border border-amber-800/70 bg-amber-950/30 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-950/50"
              >
                Suspend workspace
              </button>
            ) : null}
            {canReactivate ? (
              <button
                type="button"
                onClick={() => {
                  setPendingAction("reactivate");
                  setFeedback(null);
                }}
                className="rounded-lg border border-emerald-800/70 bg-emerald-950/30 px-4 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-950/50"
              >
                Reactivate workspace
              </button>
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
            <p className="text-sm font-medium text-slate-100">
              Confirm {pendingAction === "suspend" ? "suspend" : "reactivate"} for{" "}
              <span className="text-emerald-300">{workspaceName}</span>
            </p>
            <p className="mt-2 text-xs text-slate-400">
              {pendingAction === "suspend"
                ? "The workspace will be marked suspended. Members lose tenant access, but all workspace data, CRM records, subscriptions, and entitlements are preserved."
                : "The workspace will return to active status. Tenant access is restored; no data is deleted or modified beyond the status change."}
            </p>
            <label className="mt-4 block text-xs uppercase tracking-wide text-slate-500">
              {pendingAction === "suspend" ? "Reason (required)" : "Reason (optional)"}
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-[#0f172a] px-3 py-2 text-sm text-slate-100"
                placeholder={
                  pendingAction === "suspend"
                    ? "Describe why this workspace is being suspended"
                    : "Optional note for the reactivation record"
                }
              />
            </label>
            {pendingAction === "suspend" && reason.trim().length > 0 && !suspendReasonValid ? (
              <p className="mt-2 text-xs text-amber-200/90">
                Reason must be at least {WORKSPACE_SUSPEND_REASON_MIN} characters.
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={
                  submitting ||
                  (pendingAction === "suspend" && !suspendReasonValid)
                }
                onClick={() => submitAction(pendingAction)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {submitting ? "Working…" : "Confirm"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setPendingAction(null);
                  setReason("");
                }}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
