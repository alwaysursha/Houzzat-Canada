/**
 * Manual digest runner for local smoke tests.
 *
 *   pnpm digests:run -- --dry-run
 *   pnpm digests:run -- --userId=<id> --force-seller
 *   pnpm digests:run -- --dry-run --userId=<id>
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run") || args.includes("--dryRun");
  const forceSeller =
    args.includes("--force-seller") || args.includes("--forceSeller");
  const userIdArg = args.find((a) => a.startsWith("--userId="));
  const userId = userIdArg?.slice("--userId=".length) || undefined;

  const { runDigestJobs } = await import("../src/lib/email/digests");
  const result = await runDigestJobs({
    userId,
    dryRun,
    forceSeller: forceSeller || Boolean(userId),
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
