/**
 * Manual digest runner for local smoke tests.
 *
 *   pnpm digests:run -- --dry-run
 *   pnpm digests:run -- --userId=<id> --force-seller
 *   pnpm digests:run -- --dry-run --userId=<id>
 *   pnpm digests:run -- --buyer-only --userId=<id>
 *   pnpm digests:run -- --buyer-only --dry-run --userId=<id>
 *   pnpm digests:run -- --seller-only --userId=<id>
 *   pnpm digests:run -- --seller-only --dry-run --userId=<id>
 *   pnpm digests:run -- --seller-only --force-seller --userId=<id>
 *   pnpm digests:run -- --seller-only --dry-run --force-seller --userId=<id>
 */
import { config } from "dotenv";
import {
  executeDigestCliPlan,
  parseDigestRunArgs,
} from "./run-digests-cli";

config({ path: ".env.local" });
config();

async function main() {
  const plan = parseDigestRunArgs(process.argv.slice(2));
  if (!plan.ok) {
    console.error(plan.error);
    process.exit(1);
  }

  const {
    runDigestJobs,
    runBuyerSavedSearchDigests,
    runSellerNeighborhoodReports,
  } = await import("../src/lib/email/digests");

  const result = await executeDigestCliPlan(plan, {
    runDigestJobs,
    runBuyerSavedSearchDigests,
    runSellerNeighborhoodReports,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
