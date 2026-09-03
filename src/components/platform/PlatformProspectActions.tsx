"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  PROSPECT_NOTE_BODY_MIN,
  PROSPECT_SOURCES,
  PROSPECT_STATUSES,
  type ProspectSourceValue,
  type ProspectStatusValue,
} from "@/lib/platform/prospects/constants";

type PlatformProspectActionsProps = {
  prospectId: string;
  contactName: string;
  email: string;
  businessName: string;
  phone: string;
  brokerageName: string;
  estimatedTeamSize: string;
  region: string;
  website: string;
  source: string;
  status: string;
  notesInternal: string;
};

type PendingAction =
  | "edit"
  | "status"
  | "schedule"
  | "complete"
  | "no_show"
  | "cancel"
  | "note"
  | null;

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-700 bg-[#0f172a] px-3 py-2 text-sm text-slate-100";
const labelClass = "block text-xs uppercase tracking-wide text-slate-500";

export function PlatformProspectActions({
  prospectId,
  contactName,
  email,
  businessName,
  phone,
  brokerageName,
  estimatedTeamSize,
  region,
  website,
  source,
  status,
  notesInternal,
}: PlatformProspectActionsProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const [editContactName, setEditContactName] = useState(contactName);
  const [editEmail, setEditEmail] = useState(email);
  const [editBusinessName, setEditBusinessName] = useState(businessName);
  const [editPhone, setEditPhone] = useState(phone);
  const [editBrokerageName, setEditBrokerageName] = useState(brokerageName);
  const [editTeamSize, setEditTeamSize] = useState(estimatedTeamSize);
  const [editRegion, setEditRegion] = useState(region);
  const [editWebsite, setEditWebsite] = useState(website);
  const [editSource, setEditSource] = useState<ProspectSourceValue>(
    (PROSPECT_SOURCES as readonly string[]).includes(source)
      ? (source as ProspectSourceValue)
      : "WEBSITE_DEMO",
  );
  const [editNotesInternal, setEditNotesInternal] = useState(notesInternal);
  const [nextStatus, setNextStatus] = useState<ProspectStatusValue>(
    (PROSPECT_STATUSES as readonly string[]).includes(status)
      ? (status as ProspectStatusValue)
      : "NEW",
  );
  const [scheduledAt, setScheduledAt] = useState("");
  const [noteBody, setNoteBody] = useState("");

  function openAction(action: Exclude<PendingAction, null>) {
    setPendingAction(action);
    setFeedback(null);
    setNoteBody("");
    setScheduledAt("");
    setNextStatus(
      (PROSPECT_STATUSES as readonly string[]).includes(status)
        ? (status as ProspectStatusValue)
        : "NEW",
    );
    setEditContactName(contactName);
    setEditEmail(email);
    setEditBusinessName(businessName);
    setEditPhone(phone);
    setEditBrokerageName(brokerageName);
    setEditTeamSize(estimatedTeamSize);
    setEditRegion(region);
    setEditWebsite(website);
    setEditSource(
      (PROSPECT_SOURCES as readonly string[]).includes(source)
        ? (source as ProspectSourceValue)
        : "WEBSITE_DEMO",
    );
    setEditNotesInternal(notesInternal);
  }

  async function submit() {
    if (!pendingAction) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      let path = "";
      let method = "POST";
      let payload: Record<string, unknown> = {};

      switch (pendingAction) {
        case "edit": {
          path = `/api/platform/v1/prospects/${encodeURIComponent(prospectId)}`;
          method = "PATCH";
          const teamRaw = editTeamSize.trim();
          payload = {
            contactName: editContactName,
            email: editEmail,
            businessName: editBusinessName.trim() || null,
            phone: editPhone.trim() || null,
            brokerageName: editBrokerageName.trim() || null,
            estimatedTeamSize: teamRaw ? Number(teamRaw) : null,
            region: editRegion.trim() || null,
            website: editWebsite.trim() || null,
            source: editSource,
            notesInternal: editNotesInternal.trim() || null,
          };
          break;
        }
        case "status": {
          path = `/api/platform/v1/prospects/${encodeURIComponent(prospectId)}/status`;
          payload = { status: nextStatus };
          break;
        }
        case "schedule": {
          path = `/api/platform/v1/prospects/${encodeURIComponent(prospectId)}/demo`;
          payload = {
            action: "schedule",
            scheduledAt: scheduledAt
              ? new Date(scheduledAt).toISOString()
              : "",
            note: noteBody.trim() || null,
          };
          break;
        }
        case "complete":
        case "no_show":
        case "cancel": {
          path = `/api/platform/v1/prospects/${encodeURIComponent(prospectId)}/demo`;
          payload = {
            action: pendingAction,
            note: noteBody.trim() || null,
          };
          break;
        }
        case "note": {
          path = `/api/platform/v1/prospects/${encodeURIComponent(prospectId)}/activities`;
          payload = { type: "NOTE", body: noteBody };
          break;
        }
        default: {
          const _exhaustive: never = pendingAction;
          throw new Error(`Unhandled action ${_exhaustive}`);
        }
      }

      const response = await fetch(path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as ApiEnvelope<{
        action: { outcome: string };
      }>;
      if (!response.ok || !body.ok) {
        setFeedback({
          tone: "error",
          message:
            body.ok === false ? body.message : "Unable to update prospect.",
        });
        return;
      }

      setFeedback({
        tone: "success",
        message:
          body.data.action.outcome === "no_op"
            ? "No changes were needed."
            : "Prospect updated.",
      });
      setPendingAction(null);
      setNoteBody("");
      router.refresh();
    } catch {
      setFeedback({
        tone: "error",
        message: "Network error while updating prospect.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const noteValid = noteBody.trim().length >= PROSPECT_NOTE_BODY_MIN;
  const confirmDisabled =
    submitting ||
    (pendingAction === "note" && !noteValid) ||
    (pendingAction === "schedule" && !scheduledAt) ||
    (pendingAction === "edit" &&
      (!editContactName.trim() || !editEmail.trim()));

  return (
    <section className="rounded-xl border border-slate-800 bg-[#111827]">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Prospect actions</h2>
        <p className="mt-1 text-xs text-slate-500">
          Master Admin sales controls. Does not touch tenant CRM or offers.
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

        {pendingAction === null ? (
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["edit", "Edit Prospect"],
                ["status", "Change Status"],
                ["schedule", "Schedule Demo"],
                ["complete", "Mark Demo Completed"],
                ["no_show", "Mark No-Show"],
                ["cancel", "Cancel Demo"],
                ["note", "Add Internal Note"],
              ] as const
            ).map(([action, label]) => (
              <button
                key={action}
                type="button"
                onClick={() => openAction(action)}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
            {pendingAction === "edit" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelClass}>
                  Contact name
                  <input
                    className={inputClass}
                    value={editContactName}
                    onChange={(e) => setEditContactName(e.target.value)}
                  />
                </label>
                <label className={labelClass}>
                  Email
                  <input
                    className={inputClass}
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                  />
                </label>
                <label className={labelClass}>
                  Business name
                  <input
                    className={inputClass}
                    value={editBusinessName}
                    onChange={(e) => setEditBusinessName(e.target.value)}
                  />
                </label>
                <label className={labelClass}>
                  Phone
                  <input
                    className={inputClass}
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                  />
                </label>
                <label className={labelClass}>
                  Brokerage
                  <input
                    className={inputClass}
                    value={editBrokerageName}
                    onChange={(e) => setEditBrokerageName(e.target.value)}
                  />
                </label>
                <label className={labelClass}>
                  Team size
                  <input
                    className={inputClass}
                    value={editTeamSize}
                    onChange={(e) => setEditTeamSize(e.target.value)}
                  />
                </label>
                <label className={labelClass}>
                  Region
                  <input
                    className={inputClass}
                    value={editRegion}
                    onChange={(e) => setEditRegion(e.target.value)}
                  />
                </label>
                <label className={labelClass}>
                  Website
                  <input
                    className={inputClass}
                    value={editWebsite}
                    onChange={(e) => setEditWebsite(e.target.value)}
                  />
                </label>
                <label className={labelClass}>
                  Source
                  <select
                    className={inputClass}
                    value={editSource}
                    onChange={(e) =>
                      setEditSource(e.target.value as ProspectSourceValue)
                    }
                  >
                    {PROSPECT_SOURCES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`${labelClass} sm:col-span-2`}>
                  Internal notes summary
                  <textarea
                    className={inputClass}
                    rows={3}
                    value={editNotesInternal}
                    onChange={(e) => setEditNotesInternal(e.target.value)}
                  />
                </label>
              </div>
            ) : null}

            {pendingAction === "status" ? (
              <label className={labelClass}>
                New status
                <select
                  className={inputClass}
                  value={nextStatus}
                  onChange={(e) =>
                    setNextStatus(e.target.value as ProspectStatusValue)
                  }
                >
                  {PROSPECT_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {pendingAction === "schedule" ? (
              <label className={labelClass}>
                Demo date / time
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </label>
            ) : null}

            {pendingAction === "note" ||
            pendingAction === "schedule" ||
            pendingAction === "complete" ||
            pendingAction === "no_show" ||
            pendingAction === "cancel" ? (
              <label className={`${labelClass} mt-3`}>
                {pendingAction === "note"
                  ? "Internal note"
                  : "Optional note"}
                <textarea
                  className={inputClass}
                  rows={3}
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                />
              </label>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={confirmDisabled}
                onClick={() => void submit()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {submitting ? "Working…" : "Confirm"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setPendingAction(null)}
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
