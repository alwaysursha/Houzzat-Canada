"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { EntityAlertSwitchRow } from "@/components/account/EntityAlertSwitchRow";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { Button } from "@/components/ui/button";
import {
  areaEmailAlertsHint,
  buildAreaAlertFieldPatch,
  buildPropertyEmailAlertsPatch,
  GLOBAL_EMAIL_PAUSED_BANNER,
  isCurrentMutationGeneration,
  nextMutationGeneration,
  propertyEmailAlertsHint,
  resolveToggleMutationOutcome,
  type AreaAlertField,
} from "@/lib/account/entity-alert-mutations";
import { SITE_MESSAGES } from "@/lib/site-messages";

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
  propertyMonitors: initialPropertyMonitors,
  areaMonitors: initialAreaMonitors,
  alerts,
  globalEmailPaused = false,
}: {
  propertyMonitors: PropertyMonitorRow[];
  areaMonitors: AreaMonitorRow[];
  alerts: AlertRow[];
  /** Stored User.emailAlertsEnabled === false (legacy global pause). */
  globalEmailPaused?: boolean;
}) {
  const router = useRouter();
  const { confirm, toast } = useSiteAlert();
  const [tab, setTab] = useState<"homes" | "areas" | "alerts">("homes");
  const [busyDelete, setBusyDelete] = useState(false);
  const [propertyMonitors, setPropertyMonitors] = useState(
    initialPropertyMonitors,
  );
  const [areaMonitors, setAreaMonitors] = useState(initialAreaMonitors);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set());
  const generations = useRef(new Map<string, number>());
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    setPropertyMonitors(initialPropertyMonitors);
  }, [initialPropertyMonitors]);

  useEffect(() => {
    setAreaMonitors(initialAreaMonitors);
  }, [initialAreaMonitors]);

  function markPending(key: string, on: boolean) {
    if (on) inFlight.current.add(key);
    else inFlight.current.delete(key);
    setPendingKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function patchPropertyEmail(mlsNumber: string, emailAlerts: boolean) {
    const key = `property:${mlsNumber}:emailAlerts`;
    // Same-key toggles serialize via pending disable; generation still
    // protects if overlapping responses ever arrive.
    if (inFlight.current.has(key)) return;

    const previousRow = propertyMonitors.find((m) => m.mlsNumber === mlsNumber);
    if (!previousRow) return;
    const previousValue = previousRow.emailAlerts;

    const generation = nextMutationGeneration(generations.current, key);
    markPending(key, true);
    setPropertyMonitors((rows) =>
      rows.map((row) =>
        row.mlsNumber === mlsNumber ? { ...row, emailAlerts } : row,
      ),
    );

    try {
      const res = await fetch("/api/account/property-monitors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPropertyEmailAlertsPatch(mlsNumber, emailAlerts),
        ),
      });
      const json = res.ok
        ? ((await res.json()) as { ok?: boolean; item?: PropertyMonitorRow })
        : null;
      const serverConfirmed =
        res.ok && typeof json?.item?.emailAlerts === "boolean"
          ? json.item.emailAlerts
          : null;

      if (!isCurrentMutationGeneration(generations.current, key, generation)) {
        return;
      }

      const resolved = resolveToggleMutationOutcome({
        generation,
        latestGeneration: generations.current.get(key) ?? generation,
        previous: previousValue,
        serverConfirmed,
      });
      if (resolved !== null) {
        setPropertyMonitors((rows) =>
          rows.map((row) =>
            row.mlsNumber === mlsNumber
              ? { ...row, emailAlerts: resolved }
              : row,
          ),
        );
      }
      if (serverConfirmed === null) {
        toast({
          message: "Could not update email alerts. Please try again.",
          tone: "error",
        });
        return;
      }
      toast({
        message: emailAlerts
          ? "Email alerts turned on for this home."
          : "Email alerts paused for this home.",
        tone: "success",
      });
    } catch {
      if (isCurrentMutationGeneration(generations.current, key, generation)) {
        setPropertyMonitors((rows) =>
          rows.map((row) =>
            row.mlsNumber === mlsNumber
              ? { ...row, emailAlerts: previousValue }
              : row,
          ),
        );
        toast({
          message: "Could not update email alerts. Please try again.",
          tone: "error",
        });
      }
    } finally {
      if (isCurrentMutationGeneration(generations.current, key, generation)) {
        markPending(key, false);
      }
    }
  }

  async function patchAreaField(
    id: string,
    field: AreaAlertField,
    value: boolean,
  ) {
    // Per-field keys: notifyNew / notifySold / emailAlerts do not block each other.
    const key = `area:${id}:${field}`;
    if (inFlight.current.has(key)) return;

    const previousRow = areaMonitors.find((m) => m.id === id);
    if (!previousRow) return;
    const previousValue = previousRow[field];

    const generation = nextMutationGeneration(generations.current, key);
    markPending(key, true);
    setAreaMonitors((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );

    try {
      const res = await fetch("/api/account/area-monitors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildAreaAlertFieldPatch(id, field, value)),
      });
      const json = res.ok
        ? ((await res.json()) as { ok?: boolean; item?: AreaMonitorRow })
        : null;
      const serverConfirmed =
        res.ok && json?.item && typeof json.item[field] === "boolean"
          ? json.item[field]
          : null;

      if (!isCurrentMutationGeneration(generations.current, key, generation)) {
        return;
      }

      const resolved = resolveToggleMutationOutcome({
        generation,
        latestGeneration: generations.current.get(key) ?? generation,
        previous: previousValue,
        serverConfirmed,
      });
      // Merge only this field so concurrent sibling-field toggles are preserved.
      if (resolved !== null) {
        setAreaMonitors((rows) =>
          rows.map((row) =>
            row.id === id ? { ...row, [field]: resolved } : row,
          ),
        );
      }
      if (serverConfirmed === null) {
        toast({
          message: "Could not update this setting. Please try again.",
          tone: "error",
        });
        return;
      }
      const labels: Record<AreaAlertField, [string, string]> = {
        emailAlerts: [
          "Email alerts turned on for this area.",
          "Email alerts paused for this area.",
        ],
        notifyNew: [
          "New listing alerts turned on.",
          "New listing alerts turned off.",
        ],
        notifySold: [
          "Sold / leased alerts turned on.",
          "Sold / leased alerts turned off.",
        ],
      };
      toast({
        message: value ? labels[field][0] : labels[field][1],
        tone: "success",
      });
    } catch {
      if (isCurrentMutationGeneration(generations.current, key, generation)) {
        setAreaMonitors((rows) =>
          rows.map((row) =>
            row.id === id ? { ...row, [field]: previousValue } : row,
          ),
        );
        toast({
          message: "Could not update this setting. Please try again.",
          tone: "error",
        });
      }
    } finally {
      if (isCurrentMutationGeneration(generations.current, key, generation)) {
        markPending(key, false);
      }
    }
  }

  async function unwatchHome(mlsNumber: string) {
    const ok = await confirm({
      ...SITE_MESSAGES.stopWatchingHome,
      destructive: true,
    });
    if (!ok) return;

    setBusyDelete(true);
    const res = await fetch("/api/account/property-monitors", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mlsNumber }),
    });
    setBusyDelete(false);
    if (!res.ok) {
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
      return;
    }
    toast({ message: SITE_MESSAGES.watchRemovedToast, tone: "info" });
    setPropertyMonitors((rows) =>
      rows.filter((row) => row.mlsNumber !== mlsNumber),
    );
    router.refresh();
  }

  async function unwatchArea(id: string) {
    const ok = await confirm({
      ...SITE_MESSAGES.removeAreaWatch,
      destructive: true,
    });
    if (!ok) return;

    setBusyDelete(true);
    const res = await fetch("/api/account/area-monitors", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setBusyDelete(false);
    if (!res.ok) {
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
      return;
    }
    toast({ message: SITE_MESSAGES.areaRemovedToast, tone: "info" });
    setAreaMonitors((rows) => rows.filter((row) => row.id !== id));
    router.refresh();
  }

  async function runCheck() {
    setBusyDelete(true);
    const res = await fetch("/api/account/monitors/check", { method: "POST" });
    setBusyDelete(false);
    if (!res.ok) {
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
      return;
    }
    toast({ message: "Watchlist refreshed.", tone: "success" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {globalEmailPaused ? (
        <div
          role="status"
          className="rounded-xl border border-signal/30 bg-signal/[0.08] px-4 py-3 text-sm text-ink/80"
        >
          {GLOBAL_EMAIL_PAUSED_BANNER}{" "}
          <Link
            href="/preferences/email"
            className="font-semibold text-canopy underline-offset-2 hover:underline"
          >
            Communication Preferences
          </Link>
        </div>
      ) : null}

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
          disabled={busyDelete}
          onClick={() => void runCheck()}
        >
          Refresh alerts
        </Button>
      </div>

      {tab === "homes" ? (
        <ul className="space-y-3">
          {propertyMonitors.map((m) => {
            const emailKey = `property:${m.mlsNumber}:emailAlerts`;
            return (
              <li
                key={m.id}
                className="rounded-xl border border-line bg-surface px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/listing/${m.mlsNumber}`}
                      className="font-semibold text-canopy"
                    >
                      {m.mlsNumber}
                    </Link>
                    <p className="text-ink/55">
                      {m.lastKnownStatus} · $
                      {m.lastKnownPrice.toLocaleString("en-CA")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busyDelete}
                    onClick={() => void unwatchHome(m.mlsNumber)}
                  >
                    Stop watching
                  </Button>
                </div>
                <div className="mt-3 border-t border-line pt-3">
                  <EntityAlertSwitchRow
                    id={`property-email-${m.id}`}
                    label="Email alerts"
                    hint={propertyEmailAlertsHint(m.emailAlerts)}
                    checked={m.emailAlerts}
                    pending={pendingKeys.has(emailKey)}
                    onCheckedChange={(next) =>
                      void patchPropertyEmail(m.mlsNumber, next)
                    }
                  />
                  <p className="mt-1 text-[11px] text-ink/40">
                    Pausing email keeps this home on your watchlist. Stop
                    watching removes it entirely.
                  </p>
                </div>
              </li>
            );
          })}
          {propertyMonitors.length === 0 ? (
            <p className="text-sm text-ink/55">
              No watched homes yet. Open a listing and tap Watch.
            </p>
          ) : null}
        </ul>
      ) : null}

      {tab === "areas" ? (
        <ul className="space-y-3">
          {areaMonitors.map((m) => (
            <li
              key={m.id}
              className="rounded-xl border border-line bg-surface px-4 py-3 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{m.name}</p>
                  <p className="text-ink/55">
                    {m.city}
                    {m.community ? ` · ${m.community}` : ""} ·{" "}
                    {m.transactionType}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busyDelete}
                  onClick={() => void unwatchArea(m.id)}
                >
                  Stop watching
                </Button>
              </div>
              <div className="mt-3 space-y-1 border-t border-line pt-3">
                <EntityAlertSwitchRow
                  id={`area-email-${m.id}`}
                  label="Email alerts"
                  hint={areaEmailAlertsHint(m.emailAlerts)}
                  checked={m.emailAlerts}
                  pending={pendingKeys.has(`area:${m.id}:emailAlerts`)}
                  onCheckedChange={(next) =>
                    void patchAreaField(m.id, "emailAlerts", next)
                  }
                />
                <EntityAlertSwitchRow
                  id={`area-new-${m.id}`}
                  label="New listings"
                  hint="Alerts when new homes match this area"
                  checked={m.notifyNew}
                  pending={pendingKeys.has(`area:${m.id}:notifyNew`)}
                  onCheckedChange={(next) =>
                    void patchAreaField(m.id, "notifyNew", next)
                  }
                />
                <EntityAlertSwitchRow
                  id={`area-sold-${m.id}`}
                  label="Sold / leased"
                  hint="Alerts when matching homes sell or lease"
                  checked={m.notifySold}
                  pending={pendingKeys.has(`area:${m.id}:notifySold`)}
                  onCheckedChange={(next) =>
                    void patchAreaField(m.id, "notifySold", next)
                  }
                />
                <p className="pt-1 text-[11px] text-ink/40">
                  Pausing email keeps this area watch. Stop watching removes it.
                </p>
              </div>
            </li>
          ))}
          {areaMonitors.length === 0 ? (
            <p className="text-sm text-ink/55">
              No watched areas yet. On Search, set a city and tap Watch this
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
