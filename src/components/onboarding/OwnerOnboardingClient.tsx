"use client";

import { useEffect, useState } from "react";

type WorkspaceRow = {
  workspaceId: string;
  name: string;
  displayName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  replyToEmail: string | null;
  senderDisplayName: string | null;
  onboarding: {
    templateThemeStatus: string;
    businessProfileStatus: string;
    emailIdentityStatus: string;
  };
};

/**
 * Stage 6.10C.1 — host-bound onboarding UI.
 * Workspace is resolved from request hostname by the API — no cross-tenant picker.
 */
export function OwnerOnboardingClient() {
  const [item, setItem] = useState<WorkspaceRow | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [senderDisplayName, setSenderDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        headers: { Accept: "application/json" },
      });
      const body = (await res.json()) as {
        ok: boolean;
        message?: string;
        data?: { items: WorkspaceRow[] };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.message ?? "Unable to load onboarding.");
        setItem(null);
        return;
      }
      const first = body.data.items[0] ?? null;
      setItem(first);
      if (first) {
        setDisplayName(first.displayName ?? first.name);
        setContactEmail(first.contactEmail ?? "");
        setContactPhone(first.contactPhone ?? "");
        setReplyToEmail(first.replyToEmail ?? first.contactEmail ?? "");
        setSenderDisplayName(first.senderDisplayName ?? first.displayName ?? "");
      }
    } catch {
      setError("Network error loading onboarding.");
      setItem(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    if (!item) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Compatibility only — server resolves authority from hostname.
          workspaceId: item.workspaceId,
          displayName,
          contactEmail,
          contactPhone,
          replyToEmail,
          senderDisplayName,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        message?: string;
      };
      if (!res.ok || !body.ok) {
        setError(body.message ?? "Unable to save.");
        return;
      }
      setMessage("Business profile saved.");
      await load();
    } catch {
      setError("Network error while saving.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-600">Loading onboarding…</p>;
  }

  if (error && !item) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!item) {
    return (
      <p className="text-sm text-slate-600">
        No OWNER workspace available for this hostname.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Workspace setup</h1>
        <p className="mt-2 text-sm text-slate-600">
          Complete non-design business details for{" "}
          <span className="font-medium text-slate-800">
            {item.displayName ?? item.name}
          </span>
          . Website templates and visual themes are not available yet.
        </p>
      </div>

      {item.onboarding.templateThemeStatus !== "NOT_STARTED" ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          OWNER TENANT TEMPLATE DESIGN DECISION REQUIRED
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          Template / theme selection is reserved for a later owner decision
          (status: NOT_STARTED).
        </p>
      )}

      <form
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
        onSubmit={onSave}
      >
        <label className="block text-sm text-slate-700">
          Business display name
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm text-slate-700">
          Contact email
          <input
            type="email"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm text-slate-700">
          Business phone
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
          />
        </label>
        <label className="block text-sm text-slate-700">
          Reply-to email
          <input
            type="email"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={replyToEmail}
            onChange={(e) => setReplyToEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm text-slate-700">
          Sender display name
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={senderDisplayName}
            onChange={(e) => setSenderDisplayName(e.target.value)}
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-canopy px-4 py-2 text-sm font-medium text-white hover:bg-canopy-deep disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save business profile"}
        </button>
      </form>
    </div>
  );
}
