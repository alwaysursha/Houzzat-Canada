"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type PropertyMonitorRow = {
  id: string;
  mlsNumber: string;
  emailAlerts: boolean;
  lastKnownPrice: number;
  lastKnownStatus: string;
};

type AreaMonitorRow = {
  id: string;
  name: string;
  city: string;
  community: string | null;
  transactionType: string;
  notifyNew: boolean;
  notifySold: boolean;
  emailAlerts: boolean;
};

type AlertRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  mlsNumber: string | null;
  createdAt: string;
  readAt: string | null;
};

export function MonitorsClient({
  propertyMonitors,
  areaMonitors,
  alerts,
}: {
  propertyMonitors: PropertyMonitorRow[];
  areaMonitors: AreaMonitorRow[];
  alerts: AlertRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"homes" | "areas" | "alerts">("homes");
  const [busy, setBusy] = useState(false);

  async function unwatchHome(mlsNumber: string) {
    setBusy(true);
    await fetch("/api/account/property-monitors", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mlsNumber }),
    });
    setBusy(false);
    router.refresh();
  }

  async function unwatchArea(id: string) {
    setBusy(true);
    await fetch("/api/account/area-monitors", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setBusy(false);
    router.refresh();
  }

  async function runCheck() {
    setBusy(true);
    await fetch("/api/account/monitors/check", { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(
            [
              ["homes", "Watched homes"],
              ["areas", "Areas"],
              ["alerts", "Alerts"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              id={id === "areas" ? "areas" : undefined}
              onClick={() => setTab(id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                tab === id
                  ? "bg-canopy text-white"
                  : "border border-line text-ink/70"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => void runCheck()}
        >
          Check for updates
        </Button>
      </div>

      {tab === "homes" ? (
        <ul className="space-y-2">
          {propertyMonitors.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm"
            >
              <div>
                <Link
                  href={`/listing/${m.mlsNumber}`}
                  className="font-semibold text-canopy"
                >
                  {m.mlsNumber}
                </Link>
                <p className="text-ink/55">
                  {m.lastKnownStatus} · $
                  {m.lastKnownPrice.toLocaleString("en-CA")}
                  {m.emailAlerts ? " · email on" : ""}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void unwatchHome(m.mlsNumber)}
              >
                Stop watching
              </Button>
            </li>
          ))}
          {propertyMonitors.length === 0 ? (
            <p className="text-sm text-ink/55">
              No watched homes yet. Open a listing and tap Watch.
            </p>
          ) : null}
        </ul>
      ) : null}

      {tab === "areas" ? (
        <ul className="space-y-2">
          {areaMonitors.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm"
            >
              <div>
                <p className="font-semibold text-ink">{m.name}</p>
                <p className="text-ink/55">
                  {m.city}
                  {m.community ? ` · ${m.community}` : ""} · {m.transactionType}
                  {m.notifyNew ? " · new" : ""}
                  {m.notifySold ? " · sold" : ""}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void unwatchArea(m.id)}
              >
                Remove
              </Button>
            </li>
          ))}
          {areaMonitors.length === 0 ? (
            <p className="text-sm text-ink/55">
              No area monitors yet. On Search, set a city and tap Watch this
              area.
            </p>
          ) : null}
        </ul>
      ) : null}

      {tab === "alerts" ? (
        <ul className="space-y-2">
          {alerts.map((a) => (
            <li
              key={a.id}
              className="rounded-xl border border-line bg-surface px-4 py-3 text-sm"
            >
              <p className="font-semibold text-ink">{a.title}</p>
              <p className="mt-1 whitespace-pre-wrap text-ink/65">{a.body}</p>
              <p className="mt-1 text-xs text-ink/40">
                {a.kind} · {new Date(a.createdAt).toLocaleString("en-CA")}
                {a.mlsNumber ? (
                  <>
                    {" · "}
                    <Link
                      href={`/listing/${a.mlsNumber}`}
                      className="text-canopy"
                    >
                      View
                    </Link>
                  </>
                ) : null}
              </p>
            </li>
          ))}
          {alerts.length === 0 ? (
            <p className="text-sm text-ink/55">No alerts yet.</p>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
