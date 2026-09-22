/**
 * MLS health evaluator, incidents, and checker boundaries.
 * Fixtures only. No database, no PropTx, no email send.
 * Run: pnpm mls:health:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderMlsHealthAlert } from "../src/lib/mls-health/alert";
import {
  evaluateMlsHealth,
  MLS_HEALTH_FAST_CRITICAL_MS,
  MLS_HEALTH_FAST_WARNING_MS,
  MLS_HEALTH_FULL_CRITICAL_MS,
  MLS_HEALTH_FULL_WARNING_MS,
} from "../src/lib/mls-health/evaluate";
import {
  MLS_HEALTH_REMINDER_MS,
  transitionMlsHealthIncidents,
} from "../src/lib/mls-health/incidents";
import { toMlsHealthRun } from "../src/lib/mls-health/parse-run";
import { runMlsHealthCheck } from "../src/lib/mls-health/run";
import type {
  MlsHealthFinding,
  MlsHealthRun,
  MlsHealthSnapshot,
  StoredMlsHealthIncident,
} from "../src/lib/mls-health/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const NOW = Date.parse("2026-09-21T22:00:00.000Z");
const now = new Date(NOW);

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function healthRun(partial: Partial<MlsHealthRun> & Pick<MlsHealthRun, "id">): MlsHealthRun {
  return {
    resource: "fast",
    status: "ok",
    startedAt: ago(60 * 60 * 1000),
    finishedAt: ago(5 * 60 * 1000),
    pages: 1,
    proptxRetriesExhausted: 0,
    proptx429: 0,
    proptx5xx: 0,
    proptxTimeouts: 0,
    proptxNetworkErrors: 0,
    typesenseFailed: 0,
    mediaFetches: 1,
    mediaErrorCount: 0,
    onMarketReconcile: null,
    credentialReason: null,
    ...partial,
  };
}

function snapshot(partial: Partial<MlsHealthSnapshot> = {}): MlsHealthSnapshot {
  return {
    now: now.toISOString(),
    runs: [
      healthRun({ id: "fast-ok", finishedAt: ago(5 * 60 * 1000) }),
      healthRun({
        id: "full-ok",
        resource: "all",
        finishedAt: ago(30 * 60 * 1000),
        pages: 4,
      }),
    ],
    propertyCursor: { cursor: ago(60 * 60 * 1000), updatedAt: ago(30 * 60 * 1000) },
    maxUpdatedAtMls: ago(30 * 60 * 1000),
    discoverCursorUpdatedAt: ago(60 * 60 * 1000),
    rotateCursorUpdatedAt: ago(60 * 60 * 1000),
    typesenseRetryCount: 0,
    activeZeroPhotos: 28,
    sample: {
      zeroPhotoBaseline: 28,
      zeroPhotoElevatedStreak: 0,
      reconcileRetryCount: 0,
      reconcileRetryHighSince: null,
    },
    ...partial,
  };
}

function signalSet(partial: Partial<MlsHealthSnapshot>): Set<string> {
  return new Set(evaluateMlsHealth(snapshot(partial)).findings.map((item) => item.signal));
}

function incident(
  partial: Partial<StoredMlsHealthIncident> & Pick<StoredMlsHealthIncident, "signal">,
): StoredMlsHealthIncident {
  return {
    severity: "warning",
    state: "open",
    openedAt: ago(60 * 60 * 1000),
    recoveredAt: null,
    lastObservedAt: ago(15 * 60 * 1000),
    notifiedAt: ago(60 * 60 * 1000),
    reminded: false,
    summary: "open",
    detail: {},
    ...partial,
  };
}

function finding(
  partial: Partial<MlsHealthFinding> & Pick<MlsHealthFinding, "signal" | "severity">,
): MlsHealthFinding {
  return { summary: partial.signal, detail: {}, ...partial };
}

async function main() {
  console.log("\n=== MLS HEALTH ===\n");

  {
    const signals = signalSet({
      runs: [
        healthRun({ id: "fast-old", finishedAt: ago(80 * 60 * 1000) }),
        healthRun({
          id: "full-live",
          resource: "all",
          status: "running",
          startedAt: ago(30 * 60 * 1000),
          finishedAt: null,
          pages: 0,
        }),
      ],
    });
    assert.equal(signals.has("fast_silent"), false);
    console.log("[1] Fast silence during a live Full run stays quiet... PASS");
  }

  {
    const signals = signalSet({
      runs: [
        healthRun({ id: "fast", finishedAt: ago(MLS_HEALTH_FAST_WARNING_MS + 60_000) }),
        healthRun({
          id: "full",
          resource: "all",
          finishedAt: ago(2 * 60 * 60 * 1000),
          pages: 3,
        }),
      ],
    });
    assert.equal(signals.has("fast_silent"), true);
    assert.equal(signals.has("pipeline_silent"), false);
    const fast = evaluateMlsHealth(
      snapshot({
        runs: [
          healthRun({ id: "fast", finishedAt: ago(MLS_HEALTH_FAST_WARNING_MS + 60_000) }),
          healthRun({
            id: "full",
            resource: "all",
            finishedAt: ago(2 * 60 * 60 * 1000),
            pages: 3,
          }),
        ],
      }),
    ).findings.find((item) => item.signal === "fast_silent");
    assert.equal(fast?.severity, "warning");
    console.log("[2] Fast silent past 30 minutes with no live Full run warns... PASS");
  }

  {
    const result = evaluateMlsHealth(
      snapshot({
        runs: [
          healthRun({ id: "fast", finishedAt: ago(MLS_HEALTH_FAST_CRITICAL_MS + 60_000) }),
          healthRun({
            id: "full",
            resource: "all",
            finishedAt: ago(60 * 60 * 1000),
            pages: 3,
          }),
        ],
      }),
    );
    const fast = result.findings.find((item) => item.signal === "fast_silent");
    assert.equal(fast?.severity, "critical");
    assert.equal(result.findings.some((item) => item.signal === "pipeline_silent"), false);
    console.log("[3] Fast silent past 90 minutes is critical... PASS");
  }

  {
    const signals = signalSet({
      runs: [
        healthRun({ id: "fast", finishedAt: ago(2 * 60 * 60 * 1000) }),
        healthRun({
          id: "full",
          resource: "all",
          finishedAt: ago(10 * 60 * 1000),
          pages: 2,
        }),
      ],
    });
    assert.equal(signals.has("fast_silent"), false);
    console.log("[4] A Full success 10 minutes ago suppresses the Fast warning... PASS");
  }

  {
    const signals = signalSet({
      runs: [
        healthRun({ id: "fast", finishedAt: ago(40 * 60 * 1000) }),
        healthRun({
          id: "full-ok",
          resource: "all",
          finishedAt: ago(60 * 60 * 1000),
          pages: 2,
        }),
        healthRun({
          id: "stuck",
          resource: "all",
          status: "running",
          startedAt: ago(4 * 60 * 60 * 1000),
          finishedAt: null,
          pages: 0,
        }),
      ],
    });
    assert.equal(signals.has("full_stuck"), true);
    assert.equal(signals.has("fast_silent"), true);
    assert.equal(signals.has("pipeline_silent"), false);
    console.log("[5] A Full run stuck over 3 hours does not hide Fast... PASS");
  }

  {
    const signals = signalSet({
      runs: [
        healthRun({ id: "fast", finishedAt: ago(5 * 60 * 1000) }),
        healthRun({
          id: "full-old",
          resource: "all",
          finishedAt: ago(4 * 60 * 60 * 1000),
          pages: 8,
        }),
        healthRun({
          id: "media-as-all",
          resource: "all",
          finishedAt: ago(60 * 1000),
          pages: 0,
          mediaFetches: 40,
        }),
        healthRun({
          id: "media",
          resource: "media",
          finishedAt: ago(60 * 1000),
          pages: 12,
          mediaFetches: 40,
        }),
      ],
    });
    assert.equal(signals.has("full_silent"), true);
    const full = evaluateMlsHealth(
      snapshot({
        runs: [
          healthRun({ id: "fast", finishedAt: ago(5 * 60 * 1000) }),
          healthRun({
            id: "full-old",
            resource: "all",
            finishedAt: ago(4 * 60 * 60 * 1000),
            pages: 8,
          }),
          healthRun({
            id: "media-as-all",
            resource: "all",
            finishedAt: ago(60 * 1000),
            pages: 0,
          }),
        ],
      }),
    ).findings.find((item) => item.signal === "full_silent");
    assert.equal(full?.severity, "warning");
    console.log("[6] A media-only run cannot satisfy Full health... PASS");
  }

  {
    assert.equal(
      signalSet({
        runs: [
          healthRun({ id: "fast", finishedAt: ago(5 * 60 * 1000) }),
          healthRun({
            id: "full",
            resource: "all",
            status: "degraded",
            finishedAt: ago(3 * 60 * 60 * 1000),
            pages: 2,
          }),
        ],
      }).has("full_silent"),
      false,
    );
    assert.equal(
      signalSet({
        runs: [
          healthRun({ id: "fast", finishedAt: ago(5 * 60 * 1000) }),
          healthRun({
            id: "full",
            resource: "all",
            finishedAt: ago(MLS_HEALTH_FULL_WARNING_MS + 60_000),
            pages: 2,
          }),
        ],
      }).has("full_silent"),
      true,
    );
    const critical = evaluateMlsHealth(
      snapshot({
        runs: [
          healthRun({ id: "fast", finishedAt: ago(5 * 60 * 1000) }),
          healthRun({
            id: "full",
            resource: "all",
            finishedAt: ago(MLS_HEALTH_FULL_CRITICAL_MS + 60_000),
            pages: 2,
          }),
        ],
      }),
    ).findings.find((item) => item.signal === "full_silent");
    assert.equal(critical?.severity, "critical");
    console.log("[7] Full Property silence warns at 3.5 hours and is critical at 6... PASS");
  }

  {
    const signals = signalSet({
      runs: [
        healthRun({ id: "fast", finishedAt: ago(2 * 60 * 60 * 1000) }),
        healthRun({
          id: "full",
          resource: "all",
          finishedAt: ago(7 * 60 * 60 * 1000),
          pages: 2,
        }),
      ],
    });
    assert.deepEqual([...signals], ["pipeline_silent"]);
    console.log("[8] Fast and Full both critical collapse into pipeline_silent... PASS");
  }

  {
    const lag = evaluateMlsHealth(
      snapshot({
        propertyCursor: { cursor: ago(13 * 60 * 60 * 1000), updatedAt: ago(60 * 60 * 1000) },
        maxUpdatedAtMls: now.toISOString(),
      }),
    ).findings.find((item) => item.signal === "cursor_lag");
    assert.equal(lag?.severity, "warning");
    const stale = signalSet({
      propertyCursor: { cursor: ago(13 * 60 * 60 * 1000), updatedAt: ago(5 * 60 * 60 * 1000) },
      maxUpdatedAtMls: now.toISOString(),
    });
    assert.equal(stale.has("cursor_lag"), false);
    console.log("[9] Cursor lag uses stored MLS time and ignores a stale cursor row... PASS");
  }

  {
    const quiet = signalSet({
      runs: [
        healthRun({
          id: "fast",
          finishedAt: ago(5 * 60 * 1000),
          proptxRetriesExhausted: 1,
        }),
        healthRun({
          id: "full",
          resource: "all",
          finishedAt: ago(30 * 60 * 1000),
          pages: 2,
        }),
      ],
    });
    assert.equal(quiet.has("transport_degraded"), false);
    const warning = evaluateMlsHealth(
      snapshot({
        runs: [
          healthRun({
            id: "fast",
            finishedAt: ago(5 * 60 * 1000),
            proptxRetriesExhausted: 3,
          }),
          healthRun({
            id: "full",
            resource: "all",
            finishedAt: ago(30 * 60 * 1000),
            pages: 2,
          }),
        ],
      }),
    ).findings.find((item) => item.signal === "transport_degraded");
    assert.equal(warning?.severity, "warning");
    const critical = evaluateMlsHealth(
      snapshot({
        runs: [
          healthRun({ id: "e1", status: "error", finishedAt: ago(60_000) }),
          healthRun({
            id: "e2",
            resource: "all",
            status: "error",
            finishedAt: ago(120_000),
            pages: 1,
          }),
          healthRun({ id: "e3", status: "error", finishedAt: ago(180_000) }),
          healthRun({ id: "ok-fast", finishedAt: ago(10 * 60 * 1000) }),
          healthRun({
            id: "ok-full",
            resource: "all",
            finishedAt: ago(40 * 60 * 1000),
            pages: 2,
          }),
        ],
      }),
    ).findings.find((item) => item.signal === "transport_degraded");
    assert.equal(critical?.severity, "critical");
    const limited = evaluateMlsHealth(
      snapshot({
        runs: [
          healthRun({ id: "fast", finishedAt: ago(5 * 60 * 1000), proptx429: 20 }),
          healthRun({
            id: "full",
            resource: "all",
            finishedAt: ago(30 * 60 * 1000),
            pages: 2,
          }),
        ],
      }),
    ).findings.find((item) => item.signal === "transport_degraded");
    assert.equal(limited?.severity, "warning");
    console.log("[10] Retries, consecutive failures, and 429s classify transport health... PASS");
  }

  {
    const parsed = toMlsHealthRun({
      id: "cred",
      resource: "all",
      status: "error",
      startedAt: now,
      finishedAt: now,
      message: "PropTx 401 for Property SECRET_BODY",
      stats: { pages: 1, errors: ["media fetch failed SECRET_BODY"] },
    });
    assert.equal(parsed.credentialReason, "http_401");
    assert.equal(parsed.mediaErrorCount, 1);
    assert.equal(JSON.stringify(parsed).includes("SECRET_BODY"), false);
    const result = evaluateMlsHealth(
      snapshot({
        runs: [
          healthRun({
            id: "bad",
            resource: "all",
            status: "error",
            finishedAt: ago(60_000),
            pages: 1,
            credentialReason: "http_401",
          }),
          healthRun({ id: "fast", finishedAt: ago(5 * 60 * 1000) }),
          healthRun({
            id: "full",
            resource: "all",
            finishedAt: ago(40 * 60 * 1000),
            pages: 2,
          }),
        ],
      }),
    );
    const credentials = result.findings.find((item) => item.signal === "credentials");
    assert.equal(credentials?.severity, "critical");
    assert.equal(credentials?.detail.reason, "http_401");
    assert.equal(JSON.stringify(result.findings).includes("SECRET_BODY"), false);
    console.log("[11] Credential failures alert without keeping the response text... PASS");
  }

  {
    const dormant = signalSet({
      discoverCursorUpdatedAt: ago(48 * 60 * 60 * 1000),
      rotateCursorUpdatedAt: ago(48 * 60 * 60 * 1000),
      typesenseRetryCount: 40,
    });
    assert.equal(dormant.has("reconcile_discovery"), false);
    assert.equal(dormant.has("reconcile_rotation"), false);
    assert.equal(dormant.has("reconcile_typesense_retry"), false);
    const discovery = signalSet({
      discoverCursorUpdatedAt: ago(25 * 60 * 60 * 1000),
      runs: [
        healthRun({ id: "fast", finishedAt: ago(5 * 60 * 1000) }),
        healthRun({
          id: "full",
          resource: "all",
          finishedAt: ago(2 * 60 * 60 * 1000),
          pages: 3,
          onMarketReconcile: { discoveryComplete: true, rotationBudget: 10 },
        }),
      ],
    });
    assert.equal(discovery.has("reconcile_discovery"), true);
    const rotation = signalSet({
      rotateCursorUpdatedAt: ago(25 * 60 * 60 * 1000),
      runs: [
        healthRun({ id: "fast", finishedAt: ago(5 * 60 * 1000) }),
        healthRun({
          id: "full",
          resource: "all",
          finishedAt: ago(2 * 60 * 60 * 1000),
          pages: 3,
          onMarketReconcile: { discoveryComplete: true, rotationBudget: 10 },
        }),
      ],
    });
    assert.equal(rotation.has("reconcile_rotation"), true);
    const retry = evaluateMlsHealth(
      snapshot({
        typesenseRetryCount: 30,
        sample: {
          zeroPhotoBaseline: 28,
          zeroPhotoElevatedStreak: 0,
          reconcileRetryCount: 20,
          reconcileRetryHighSince: ago(2 * 60 * 60 * 1000),
        },
        runs: [
          healthRun({ id: "fast", finishedAt: ago(5 * 60 * 1000) }),
          healthRun({
            id: "full",
            resource: "all",
            finishedAt: ago(2 * 60 * 60 * 1000),
            pages: 3,
            onMarketReconcile: { discoveryComplete: true, rotationBudget: 1 },
          }),
        ],
      }),
    ).findings.find((item) => item.signal === "reconcile_typesense_retry");
    assert.equal(retry?.severity, "critical");
    const stopped = signalSet({
      discoverCursorUpdatedAt: ago(30 * 60 * 60 * 1000),
      runs: [
        healthRun({ id: "fast", finishedAt: ago(5 * 60 * 1000) }),
        healthRun({
          id: "full-now",
          resource: "all",
          finishedAt: ago(2 * 60 * 60 * 1000),
          pages: 3,
        }),
        healthRun({
          id: "full-old",
          resource: "all",
          startedAt: ago(3 * 24 * 60 * 60 * 1000),
          finishedAt: ago(3 * 24 * 60 * 60 * 1000),
          pages: 3,
          onMarketReconcile: { discoveryComplete: false, rotationBudget: 10 },
        }),
      ],
    });
    assert.equal(stopped.has("reconcile_stopped"), true);
    assert.equal(stopped.has("reconcile_discovery"), false);
    console.log("[12] Reconciliation stays quiet until it has run, then watches progress... PASS");
  }

  {
    const first = evaluateMlsHealth(
      snapshot({
        activeZeroPhotos: 40,
        sample: {
          zeroPhotoBaseline: null,
          zeroPhotoElevatedStreak: 0,
          reconcileRetryCount: null,
          reconcileRetryHighSince: null,
        },
      }),
    );
    assert.equal(first.findings.some((item) => item.signal === "media_zero_photos"), false);
    assert.equal(first.sample.zeroPhotoBaseline, 40);
    const second = evaluateMlsHealth(
      snapshot({
        activeZeroPhotos: 70,
        sample: {
          zeroPhotoBaseline: 40,
          zeroPhotoElevatedStreak: 0,
          reconcileRetryCount: 0,
          reconcileRetryHighSince: null,
        },
      }),
    );
    assert.equal(second.findings.some((item) => item.signal === "media_zero_photos"), false);
    assert.equal(second.sample.zeroPhotoElevatedStreak, 1);
    const third = evaluateMlsHealth(
      snapshot({
        activeZeroPhotos: 70,
        sample: {
          zeroPhotoBaseline: 40,
          zeroPhotoElevatedStreak: 1,
          reconcileRetryCount: 0,
          reconcileRetryHighSince: null,
        },
      }),
    );
    assert.equal(
      third.findings.find((item) => item.signal === "media_zero_photos")?.severity,
      "warning",
    );
    const spiked = evaluateMlsHealth(
      snapshot({
        activeZeroPhotos: 150,
        sample: {
          zeroPhotoBaseline: 40,
          zeroPhotoElevatedStreak: 0,
          reconcileRetryCount: 0,
          reconcileRetryHighSince: null,
        },
      }),
    ).findings.find((item) => item.signal === "media_zero_photos");
    assert.equal(spiked?.severity, "critical");
    console.log("[13] The first photo sample is a baseline; later jumps alert... PASS");
  }

  {
    const open = incident({ signal: "fast_silent", summary: "Fast is quiet" });
    const same = transitionMlsHealthIncidents(
      [open],
      [finding({ signal: "fast_silent", severity: "warning", summary: "Fast is quiet" })],
      now,
    );
    assert.equal(same.alerts.length, 0);
    assert.equal(same.incidents[0]?.lastObservedAt, now.toISOString());
    assert.equal(same.incidents[0]?.notifiedAt, open.notifiedAt);

    const recovered = transitionMlsHealthIncidents([open], [], now);
    assert.equal(recovered.alerts.length, 1);
    assert.equal(recovered.alerts[0]?.kind, "recovered");

    const escalated = transitionMlsHealthIncidents(
      [incident({ signal: "fast_silent", notifiedAt: ago(MLS_HEALTH_REMINDER_MS + 60_000) })],
      [finding({ signal: "fast_silent", severity: "critical" })],
      now,
    );
    assert.equal(escalated.alerts.length, 1);
    assert.equal(escalated.alerts[0]?.kind, "escalated");
    assert.equal(escalated.incidents[0]?.reminded, false);

    const reminded = transitionMlsHealthIncidents(
      [
        incident({
          signal: "pipeline_silent",
          severity: "critical",
          notifiedAt: ago(MLS_HEALTH_REMINDER_MS + 60_000),
        }),
      ],
      [finding({ signal: "pipeline_silent", severity: "critical" })],
      now,
    );
    assert.equal(reminded.alerts.length, 1);
    assert.equal(reminded.alerts[0]?.kind, "reminder");
    const quietReminder = transitionMlsHealthIncidents(
      [{ ...reminded.incidents[0]!, notifiedAt: ago(MLS_HEALTH_REMINDER_MS + 60_000) }],
      [finding({ signal: "pipeline_silent", severity: "critical" })],
      now,
    );
    assert.equal(quietReminder.alerts.length, 0);

    const batched = transitionMlsHealthIncidents(
      [],
      [
        finding({ signal: "fast_silent", severity: "warning" }),
        finding({ signal: "cursor_lag", severity: "warning" }),
      ],
      now,
    );
    assert.equal(batched.alerts.length, 1);
    assert.equal(batched.alerts[0]?.lines.length, 2);

    const collapsed = transitionMlsHealthIncidents(
      [incident({ signal: "fast_silent" }), incident({ signal: "full_silent" })],
      [finding({ signal: "pipeline_silent", severity: "critical" })],
      now,
    );
    assert.equal(collapsed.alerts.length, 1);
    assert.equal(collapsed.alerts[0]?.lines[0]?.signal, "pipeline_silent");
    assert.equal(
      collapsed.incidents.filter((item) => item.state === "recovered").length,
      2,
    );
    console.log("[14] Incidents open once, escalate, remind once, and recover... PASS");
  }

  {
    const alerting = snapshot({
      runs: [
        healthRun({ id: "fast", finishedAt: ago(2 * 60 * 60 * 1000) }),
        healthRun({
          id: "full",
          resource: "all",
          finishedAt: ago(7 * 60 * 60 * 1000),
          pages: 2,
        }),
      ],
    });
    let saves = 0;
    let sends = 0;
    const dry = await runMlsHealthCheck({
      dryRun: true,
      now,
      loadSnapshot: async () => alerting,
      loadIncidents: async () => [],
      persist: async () => {
        saves += 1;
      },
      sendAlerts: async () => {
        sends += 1;
      },
    });
    assert.equal(dry.dryRun, true);
    assert.equal(saves, 0);
    assert.equal(sends, 0);
    assert.equal(dry.alerts[0]?.lines[0]?.signal, "pipeline_silent");

    const sent: string[] = [];
    let persisted = 0;
    await runMlsHealthCheck({
      dryRun: false,
      now,
      loadSnapshot: async () => alerting,
      loadIncidents: async () => [],
      persist: async () => {
        persisted += 1;
      },
      sendAlerts: async (alerts) => {
        sent.push(alerts[0]!.kind);
      },
    });
    assert.deepEqual(sent, ["opened"]);
    assert.equal(persisted, 1);

    let persistedAfterFailure = 0;
    await assert.rejects(
      () =>
        runMlsHealthCheck({
          dryRun: false,
          now,
          loadSnapshot: async () => alerting,
          loadIncidents: async () => [],
          persist: async () => {
            persistedAfterFailure += 1;
          },
          sendAlerts: async () => {
            throw new Error("mail down");
          },
        }),
      /mail down/,
    );
    assert.equal(persistedAfterFailure, 0);
    const rendered = renderMlsHealthAlert(dry.alerts[0]!);
    assert.match(rendered.subject, /^\[Houzzat MLS\] critical: pipeline silent$/);
    assert.equal(rendered.text.includes("SECRET_BODY"), false);
    console.log("[15] Dry-run does not write or send; a failed send does not persist... PASS");
  }

  {
    const files = [
      "src/lib/mls-health/evaluate.ts",
      "src/lib/mls-health/incidents.ts",
      "src/lib/mls-health/parse-run.ts",
      "src/lib/mls-health/alert.ts",
      "src/lib/mls-health/load-snapshot.ts",
      "src/lib/mls-health/run.ts",
      "scripts/mls-health-check.ts",
    ].map(read);
    const joined = files.join("\n");
    assert.equal(joined.includes('from "@/lib/proptx/client"'), false);
    assert.equal(joined.includes('from "@/lib/proptx/sync"'), false);
    assert.equal(joined.includes("runPropTxMlsSync"), false);
    assert.equal(joined.includes("executeOnMarketReconciliation"), false);
    assert.equal(joined.includes("proptxFetch"), false);
    assert.equal(joined.includes("/api/admin/mls"), false);
    const loader = read("src/lib/mls-health/load-snapshot.ts");
    assert.match(loader, /l\.status = 'ACTIVE'::"ListingStatus"/);
    assert.equal(loader.includes("SOLD_CONDITIONAL"), false);
    assert.equal(loader.includes('resource: "Media"'), false);
    assert.equal(read("src/lib/mls-health/evaluate.ts").includes('resource === "Media"'), false);
    const sync = read("src/lib/proptx/sync.ts");
    assert.ok(
      sync.includes('resource: isFast ? "fast" : options?.mediaBackfillOnly ? "media" : "all"'),
    );
    assert.equal(read("scripts/mls-health-check.ts").includes("workflow_dispatch"), false);
    console.log("[16] The checker cannot start MLS sync or call PropTx... PASS");
  }

  console.log("\nMLS HEALTH SELFTEST PASSED\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
