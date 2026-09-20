/**
 * 14-day inactive Lead SMS automations (local Mac / QA).
 *
 *   pnpm sms-automations:run
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  const { runInactiveLeadSmsAutomations } = await import(
    "../src/lib/sms/automations"
  );
  const result = await runInactiveLeadSmsAutomations();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
