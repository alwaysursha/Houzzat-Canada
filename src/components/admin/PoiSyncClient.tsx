"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function PoiSyncClient() {
  const [stats, setStats] = useState<{
    total: number;
    byType: Record<string, number>;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/poi/sync");
    if (!res.ok) return;
    const data = (await res.json()) as {
      total: number;
      byType: Record<string, number>;
    };
    setStats(data);
  }

  useEffect(() => {
    void load();
  }, []);

  async function sync() {
    setPending(true);
    setMessage(null);
    const res = await fetch("/api/admin/poi/sync", { method: "POST" });
    const data = (await res.json()) as { message?: string; error?: string };
    setPending(false);
    setMessage(data.message ?? data.error ?? "Done");
    await load();
  }

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div>
        <h2 className="font-semibold text-ink">POI catalogue</h2>
        <p className="mt-1 text-sm text-ink/60">
          Schools, parks, transit, grocery. Seed sync for now — weekly open-data
          import later.
        </p>
      </div>
      {stats ? (
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <div>
            <dt className="text-ink/45">Total</dt>
            <dd className="font-display text-2xl text-canopy">{stats.total}</dd>
          </div>
          {Object.entries(stats.byType).map(([type, count]) => (
            <div key={type}>
              <dt className="text-ink/45">{type}</dt>
              <dd className="font-medium">{count}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <Button type="button" onClick={() => void sync()} disabled={pending}>
        {pending ? "Syncing…" : "Re-import seed POIs"}
      </Button>
      {message ? <p className="text-sm text-ink/65">{message}</p> : null}
    </div>
  );
}
