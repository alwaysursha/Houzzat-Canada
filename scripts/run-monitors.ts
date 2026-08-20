/**
 * Watch Property / Area monitor runner (local Mac / QA).
 *
 *   pnpm monitors:run
 *   pnpm monitors:run -- --userId=<id>
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  const args = process.argv.slice(2);
  const userIdArg = args.find((a) => a.startsWith("--userId="));
  const userId = userIdArg?.slice("--userId=".length) || undefined;

  const { runAllMonitorChecks } = await import("../src/lib/account/monitors");
  const result = await runAllMonitorChecks(userId);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
