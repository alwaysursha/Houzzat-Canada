/**
 * MLS health check.
 * Reads Neon and, unless --dry-run, writes health rows and sends Resend mail.
 * Does not sync MLS and does not call PropTx.
 *
 *   pnpm mls:health:check --dry-run
 *   pnpm mls:health:check --apply
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const apply = process.argv.includes("--apply");
  if (dryRun === apply) {
    console.error("Pass one of --dry-run or --apply.");
    process.exitCode = 1;
    return;
  }
  const { runMlsHealthCheck } = await import("../src/lib/mls-health/run");
  const result = await runMlsHealthCheck({ dryRun });
  console.log(
    JSON.stringify(
      {
        dryRun: result.dryRun,
        findings: result.findings,
        alerts: result.alerts.map((alert) => ({
          kind: alert.kind,
          severity: alert.severity,
          signals: alert.lines.map((line) => line.signal),
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "MLS health check failed");
  process.exitCode = 1;
});
