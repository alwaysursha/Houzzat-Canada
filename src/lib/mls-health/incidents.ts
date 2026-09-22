import type {
  MlsHealthAlert,
  MlsHealthAlertLine,
  MlsHealthFinding,
  MlsHealthSignal,
  StoredMlsHealthIncident,
} from "@/lib/mls-health/types";

export const MLS_HEALTH_REMINDER_MS = 12 * 60 * 60 * 1000;

const SILENT_WHEN_PIPELINE = new Set<MlsHealthSignal>([
  "fast_silent",
  "full_silent",
  "full_stuck",
]);

function line(incident: {
  signal: MlsHealthSignal;
  severity: StoredMlsHealthIncident["severity"];
  summary: string;
}): MlsHealthAlertLine {
  return {
    signal: incident.signal,
    severity: incident.severity,
    summary: incident.summary,
  };
}

function batch(
  kind: MlsHealthAlert["kind"],
  lines: MlsHealthAlertLine[],
): MlsHealthAlert | null {
  if (lines.length === 0) return null;
  return {
    kind,
    severity: lines.some((item) => item.severity === "critical") ? "critical" : "warning",
    lines,
  };
}

function openIncident(
  finding: MlsHealthFinding,
  nowIso: string,
): StoredMlsHealthIncident {
  return {
    signal: finding.signal,
    severity: finding.severity,
    state: "open",
    openedAt: nowIso,
    recoveredAt: null,
    lastObservedAt: nowIso,
    notifiedAt: nowIso,
    reminded: false,
    summary: finding.summary,
    detail: finding.detail,
  };
}

/**
 * Open, escalate, remind, and recover incidents.
 * An unchanged open signal does not alert.
 * Fast/Full rows closed because the pipeline is silent do not send their own mail.
 */
export function transitionMlsHealthIncidents(
  existing: StoredMlsHealthIncident[],
  findings: MlsHealthFinding[],
  now: Date,
): { incidents: StoredMlsHealthIncident[]; alerts: MlsHealthAlert[] } {
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const findingBySignal = new Map(findings.map((item) => [item.signal, item]));
  const pipelineSilent = findingBySignal.has("pipeline_silent");
  const opened: MlsHealthAlertLine[] = [];
  const escalated: MlsHealthAlertLine[] = [];
  const reminders: MlsHealthAlertLine[] = [];
  const recovered: MlsHealthAlertLine[] = [];
  const incidents: StoredMlsHealthIncident[] = [];
  const touched = new Set<MlsHealthSignal>();

  for (const incident of existing) {
    if (incident.state !== "open") continue;
    const finding = findingBySignal.get(incident.signal);
    if (pipelineSilent && SILENT_WHEN_PIPELINE.has(incident.signal)) {
      incidents.push({
        ...incident,
        state: "recovered",
        recoveredAt: nowIso,
        lastObservedAt: nowIso,
      });
      touched.add(incident.signal);
      continue;
    }
    if (!finding) {
      const next = {
        ...incident,
        state: "recovered" as const,
        recoveredAt: nowIso,
        lastObservedAt: nowIso,
      };
      incidents.push(next);
      recovered.push(line(incident));
      touched.add(incident.signal);
      continue;
    }

    if (incident.severity === "warning" && finding.severity === "critical") {
      const next = openIncident(finding, nowIso);
      incidents.push({ ...next, openedAt: incident.openedAt });
      escalated.push(line(next));
      touched.add(incident.signal);
      continue;
    }

    let notifiedAt = incident.notifiedAt;
    let reminded = incident.reminded;
    if (
      finding.severity === "critical" &&
      incident.severity === "critical" &&
      !reminded &&
      notifiedAt &&
      nowMs - Date.parse(notifiedAt) >= MLS_HEALTH_REMINDER_MS
    ) {
      reminded = true;
      notifiedAt = nowIso;
      reminders.push(line({ ...incident, summary: finding.summary, severity: "critical" }));
    }
    incidents.push({
      ...incident,
      severity: finding.severity,
      summary: finding.summary,
      detail: finding.detail,
      lastObservedAt: nowIso,
      notifiedAt,
      reminded: finding.severity === incident.severity ? reminded : false,
    });
    touched.add(incident.signal);
  }

  for (const finding of findings) {
    if (touched.has(finding.signal)) continue;
    if (pipelineSilent && SILENT_WHEN_PIPELINE.has(finding.signal)) continue;
    const next = openIncident(finding, nowIso);
    incidents.push(next);
    opened.push(line(next));
  }

  const alerts = [
    batch("opened", opened),
    batch("escalated", escalated),
    batch("reminder", reminders),
    batch("recovered", recovered),
  ].filter((alert): alert is MlsHealthAlert => alert != null);

  return { incidents, alerts };
}
