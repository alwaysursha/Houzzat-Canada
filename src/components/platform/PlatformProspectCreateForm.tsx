"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  PROSPECT_SOURCES,
  type ProspectSourceValue,
} from "@/lib/platform/prospects/constants";

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-700 bg-[#0f172a] px-3 py-2 text-sm text-slate-100";
const labelClass = "block text-xs uppercase tracking-wide text-slate-500";

export function PlatformProspectCreateForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [brokerageName, setBrokerageName] = useState("");
  const [estimatedTeamSize, setEstimatedTeamSize] = useState("");
  const [region, setRegion] = useState("");
  const [website, setWebsite] = useState("");
  const [source, setSource] = useState<ProspectSourceValue>("WEBSITE_DEMO");
  const [notesInternal, setNotesInternal] = useState("");

  function resetForm() {
    setContactName("");
    setEmail("");
    setBusinessName("");
    setPhone("");
    setBrokerageName("");
    setEstimatedTeamSize("");
    setRegion("");
    setWebsite("");
    setSource("WEBSITE_DEMO");
    setNotesInternal("");
  }

  async function submit() {
    setSubmitting(true);
    setFeedback(null);
    try {
      const teamSizeRaw = estimatedTeamSize.trim();
      const response = await fetch("/api/platform/v1/prospects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          contactName,
          email,
          businessName: businessName.trim() || null,
          phone: phone.trim() || null,
          brokerageName: brokerageName.trim() || null,
          estimatedTeamSize: teamSizeRaw ? Number(teamSizeRaw) : null,
          region: region.trim() || null,
          website: website.trim() || null,
          source,
          notesInternal: notesInternal.trim() || null,
        }),
      });
      const body = (await response.json()) as ApiEnvelope<{
        action: { outcome: string; prospectId: string };
        prospect: { id: string } | null;
      }>;
      if (!response.ok || !body.ok) {
        setFeedback({
          tone: "error",
          message:
            body.ok === false ? body.message : "Unable to create prospect.",
        });
        return;
      }

      const prospectId = body.data.prospect?.id ?? body.data.action.prospectId;
      const outcome = body.data.action.outcome;
      setFeedback({
        tone: "success",
        message:
          outcome === "reopened"
            ? "Existing LOST prospect reopened."
            : outcome === "existing"
              ? "Prospect already exists — opening existing record."
              : "Prospect created.",
      });
      resetForm();
      setOpen(false);
      router.push(`/platform/prospects/${encodeURIComponent(prospectId)}`);
      router.refresh();
    } catch {
      setFeedback({
        tone: "error",
        message: "Network error while creating prospect.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setOpen((value) => !value);
            setFeedback(null);
          }}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          {open ? "Close" : "+ New Prospect"}
        </button>
      </div>

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

      {open ? (
        <section className="rounded-xl border border-slate-800 bg-[#111827] p-4">
          <h2 className="text-sm font-semibold text-slate-200">New prospect</h2>
          <p className="mt-1 text-xs text-slate-500">
            Platform sales prospect only — never creates a tenant CRM lead.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              Contact name *
              <input
                className={inputClass}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </label>
            <label className={labelClass}>
              Email *
              <input
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className={labelClass}>
              Business name
              <input
                className={inputClass}
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </label>
            <label className={labelClass}>
              Phone
              <input
                className={inputClass}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label className={labelClass}>
              Brokerage
              <input
                className={inputClass}
                value={brokerageName}
                onChange={(e) => setBrokerageName(e.target.value)}
              />
            </label>
            <label className={labelClass}>
              Estimated team size
              <input
                className={inputClass}
                inputMode="numeric"
                value={estimatedTeamSize}
                onChange={(e) => setEstimatedTeamSize(e.target.value)}
              />
            </label>
            <label className={labelClass}>
              Region
              <input
                className={inputClass}
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
            </label>
            <label className={labelClass}>
              Website
              <input
                className={inputClass}
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://"
              />
            </label>
            <label className={labelClass}>
              Source
              <select
                className={inputClass}
                value={source}
                onChange={(e) =>
                  setSource(e.target.value as ProspectSourceValue)
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
              Internal notes (summary)
              <textarea
                className={inputClass}
                rows={3}
                value={notesInternal}
                onChange={(e) => setNotesInternal(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              disabled={submitting || !contactName.trim() || !email.trim()}
              onClick={() => void submit()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Create prospect"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
