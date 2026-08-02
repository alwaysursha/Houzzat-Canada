"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SavedSearchEditor({
  leadId,
  search,
  onUpdated,
}: {
  leadId: string;
  search: {
    id: string;
    name: string;
    emailAlerts: boolean;
    smsAlerts: boolean;
    query: unknown;
  };
  onUpdated?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(search.name);
  const [emailAlerts, setEmailAlerts] = useState(search.emailAlerts);
  const [smsAlerts, setSmsAlerts] = useState(search.smsAlerts);
  const [queryText, setQueryText] = useState(
    JSON.stringify(search.query ?? {}, null, 2),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    try {
      let query: Record<string, unknown>;
      try {
        query = JSON.parse(queryText) as Record<string, unknown>;
      } catch {
        setError("Query must be valid JSON");
        return;
      }
      const res = await fetch("/api/agent/searches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          searchId: search.id,
          name,
          emailAlerts,
          smsAlerts,
          query,
        }),
      });
      if (!res.ok) {
        setError("Save failed");
        return;
      }
      router.refresh();
      onUpdated?.();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-line bg-white p-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-line px-2 py-1.5 text-sm font-medium"
      />
      <div className="flex flex-wrap gap-3 text-xs">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={emailAlerts}
            onChange={(e) => setEmailAlerts(e.target.checked)}
          />
          Email alerts
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={smsAlerts}
            onChange={(e) => setSmsAlerts(e.target.checked)}
          />
          SMS alerts
        </label>
      </div>
      <textarea
        value={queryText}
        onChange={(e) => setQueryText(e.target.value)}
        rows={6}
        className="w-full rounded-lg border border-line px-2 py-1.5 font-mono text-[11px]"
      />
      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="rounded-lg bg-canopy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        Update criteria
      </button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
