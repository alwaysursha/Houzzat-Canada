/**
 * 14-day inactive Lead SMS automations (local Mac / QA).
 *
 *   pnpm sms-automations:run
 *
 * Does not print SMS bodies, destinations, or secrets.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  const started = Date.now();
  const { runInactiveLeadSmsAutomations, SMS_AUTOMATION_CRON } = await import(
    "../src/lib/sms/automations"
  );
  const result = await runInactiveLeadSmsAutomations();
  console.log(
    JSON.stringify(
      {
        ok: true,
        job: SMS_AUTOMATION_CRON.job,
        durationMs: Date.now() - started,
        scanned: result.scanned,
        sent: result.sent,
        skipped: result.skipped,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("[sms:automation:run] failed", {
    error: err instanceof Error ? err.name : "ERROR",
  });
  process.exit(1);
});
