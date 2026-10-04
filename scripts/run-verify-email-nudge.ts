/**
 * Automatic delayed Verify-your-email runner (Sync Mac / QA).
 *
 *   pnpm verify-email-nudge:run
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  const { runVerifyEmailNudgeJob } = await import(
    "../src/lib/auth/verify-email-nudge"
  );
  const result = await runVerifyEmailNudgeJob();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
