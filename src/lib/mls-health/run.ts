import { sendMlsHealthAlerts } from "@/lib/mls-health/alert";
import { evaluateMlsHealth } from "@/lib/mls-health/evaluate";
import { transitionMlsHealthIncidents } from "@/lib/mls-health/incidents";
import {
  loadMlsHealthIncidents,
  loadMlsHealthSnapshot,
  persistMlsHealth,
} from "@/lib/mls-health/load-snapshot";
import type {
  MlsHealthAlert,
  MlsHealthEvaluation,
  MlsHealthFinding,
  MlsHealthSnapshot,
  StoredMlsHealthIncident,
} from "@/lib/mls-health/types";

export type MlsHealthCheckResult = {
  dryRun: boolean;
  findings: MlsHealthFinding[];
  alerts: MlsHealthAlert[];
  incidents: StoredMlsHealthIncident[];
  sample: MlsHealthEvaluation["sample"];
};

export type RunMlsHealthCheckOptions = {
  now?: Date;
  dryRun?: boolean;
  loadSnapshot?: (now: Date) => Promise<MlsHealthSnapshot>;
  loadIncidents?: () => Promise<StoredMlsHealthIncident[]>;
  persist?: (input: {
    incidents: StoredMlsHealthIncident[];
    sample: MlsHealthEvaluation["sample"];
    now: Date;
  }) => Promise<void>;
  sendAlerts?: (alerts: MlsHealthAlert[]) => Promise<void>;
};

/**
 * Evaluate MLS health, then open, escalate, remind, or recover incidents.
 * Dry-run returns the same decisions and does not write or send mail.
 */
export async function runMlsHealthCheck(
  options: RunMlsHealthCheckOptions = {},
): Promise<MlsHealthCheckResult> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun === true;
  const snapshot = await (options.loadSnapshot ?? loadMlsHealthSnapshot)(now);
  const evaluation = evaluateMlsHealth(snapshot);
  const existing = await (options.loadIncidents ?? loadMlsHealthIncidents)();
  const transition = transitionMlsHealthIncidents(existing, evaluation.findings, now);
  if (!dryRun) {
    if (transition.alerts.length > 0) {
      await (options.sendAlerts ?? sendMlsHealthAlerts)(transition.alerts);
    }
    await (options.persist ?? persistMlsHealth)({
      incidents: transition.incidents,
      sample: evaluation.sample,
      now,
    });
  }
  return {
    dryRun,
    findings: evaluation.findings,
    alerts: transition.alerts,
    incidents: transition.incidents,
    sample: evaluation.sample,
  };
}
