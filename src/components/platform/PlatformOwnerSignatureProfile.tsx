"use client";

import { useState } from "react";

type OwnerSignatureProfile = {
  userId: string;
  role: string;
  name: string;
  email: string;
  phone: string;
  designation: string;
  brokerageName: string;
  jurisdiction: string;
  recoLicenseNumber: string;
  recoLicenseExpiresAt: string;
  registrationNumber: string;
  hasPhoto: boolean;
  hasAgentProfile: boolean;
  completion: {
    complete: boolean;
    missingLabels: string[];
    designationOptions: string[];
  };
};

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

export function PlatformOwnerSignatureProfile({ workspaceId }: { workspaceId: string }) {
  const [view, setView] = useState<OwnerSignatureProfile | null>(null);
  const [designation, setDesignation] = useState("");
  const [brokerageName, setBrokerageName] = useState("");
  const [phone, setPhone] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [recoLicenseNumber, setRecoLicenseNumber] = useState("");
  const [recoLicenseExpiresAt, setRecoLicenseExpiresAt] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/platform/v1/workspaces/${encodeURIComponent(workspaceId)}/owner-signature-profile`;

  function apply(data: OwnerSignatureProfile) {
    setView(data);
    setDesignation(data.designation);
    setBrokerageName(data.brokerageName);
    setPhone(data.phone);
    setJurisdiction(data.jurisdiction);
    setRegistrationNumber(data.registrationNumber);
    setRecoLicenseNumber(data.recoLicenseNumber);
    setRecoLicenseExpiresAt(data.recoLicenseExpiresAt);
  }

  async function load() {
    setPending("load");
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(base, { headers: { Accept: "application/json" } });
      const body = (await response.json()) as ApiEnvelope<OwnerSignatureProfile>;
      if (!response.ok || !body.ok) {
        setError(body.ok === false ? body.message : "Owner profile could not be loaded.");
        return;
      }
      apply(body.data);
    } catch {
      setError("Network error.");
    } finally {
      setPending(null);
    }
  }

  async function save() {
    setPending("save");
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(base, {
        method: "PATCH",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          designation,
          jurisdiction,
          ...(brokerageName.trim() ? { brokerageName } : {}),
          ...(phone.trim() ? { phone } : {}),
          ...(registrationNumber.trim() ? { registrationNumber } : {}),
          ...(recoLicenseNumber.trim() || recoLicenseExpiresAt.trim()
            ? { recoLicenseNumber, recoLicenseExpiresAt }
            : {}),
        }),
      });
      const body = (await response.json()) as ApiEnvelope<OwnerSignatureProfile>;
      if (!response.ok || !body.ok) {
        setError(body.ok === false ? body.message : "Owner profile could not be saved.");
        return;
      }
      apply(body.data);
      setFeedback("Owner signature profile saved.");
    } catch {
      setError("Network error.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <h2 className="text-sm font-semibold text-slate-100">Owner agent signature</h2>
      <p className="mt-1 text-xs text-slate-400">
        Uses the existing owner account. Blank brokerage or phone fields are left unchanged.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending != null}
          onClick={() => void load()}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-60"
        >
          {pending === "load" ? "Loading…" : "Show owner profile"}
        </button>
        {view ? (
          <button
            type="button"
            disabled={pending != null}
            onClick={() => void save()}
            className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
          >
            {pending === "save" ? "Saving…" : "Save signature details"}
          </button>
        ) : null}
      </div>
      {view ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <p className="text-sm text-slate-300 sm:col-span-2">
            {view.name || "Unnamed owner"} · {view.email || "No email"} ·{" "}
            {view.hasAgentProfile ? "Agent profile linked" : "No agent profile"} ·{" "}
            {view.hasPhoto ? "Photo saved" : "No photo"}
          </p>
          <p className="text-sm text-slate-300 sm:col-span-2">
            {view.completion.complete
              ? "Professional profile complete. A photograph and licensing details are optional."
              : `Still needed: ${view.completion.missingLabels.join(", ")}.`}
          </p>
          <label className="text-xs text-slate-400">
            Title / designation
            <input
              value={designation}
              onChange={(event) => setDesignation(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-400">
            Brokerage name
            <input
              value={brokerageName}
              onChange={(event) => setBrokerageName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-400">
            Licensing jurisdiction
            <select
              value={jurisdiction}
              onChange={(event) => setJurisdiction(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">Select a jurisdiction</option>
              <option value="CA-ON">Ontario</option>
              <option value="CA-BC">British Columbia</option>
              <option value="CA-AB">Alberta</option>
              <option value="CA-SK">Saskatchewan</option>
              <option value="CA-MB">Manitoba</option>
              <option value="CA-QC">Quebec</option>
              <option value="CA-NS">Nova Scotia</option>
              <option value="CA-NB">New Brunswick</option>
              <option value="CA-PE">Prince Edward Island</option>
              <option value="CA-NL">Newfoundland and Labrador</option>
              <option value="OTHER">Another jurisdiction</option>
            </select>
          </label>
          {jurisdiction === "CA-ON" ? (
            <>
              <label className="text-xs text-slate-400">
                RECO registration number
                <input
                  value={recoLicenseNumber}
                  onChange={(event) => setRecoLicenseNumber(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="text-xs text-slate-400">
                RECO registration expiry
                <input
                  type="date"
                  value={recoLicenseExpiresAt}
                  onChange={(event) => setRecoLicenseExpiresAt(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </label>
            </>
          ) : jurisdiction ? (
            <label className="text-xs text-slate-400">
              Registration / licence number
              <input
                value={registrationNumber}
                onChange={(event) => setRegistrationNumber(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </label>
          ) : null}
          <label className="text-xs text-slate-400">
            Cell phone
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
        </div>
      ) : null}
      {feedback ? <p className="mt-3 text-sm text-emerald-300">{feedback}</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
    </section>
  );
}
