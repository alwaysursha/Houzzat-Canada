/**
 * On-market reconciliation only (discovery + rotating audit).
 * Does not run the property/media sync. Not installed in launchd.
 *
 *   pnpm mls:on-market-reconcile
 *
 * Requires VOW credentials. Uses OnMarketDiscover / OnMarketRotate cursors.
 */
import { config } from "dotenv";
import { assertMlsSyncExecutionHost } from "../src/lib/proptx/mls-sync-host";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  assertMlsSyncExecutionHost();
  const { executeOnMarketReconciliation, formatOnMarketReconcileLog } =
    await import("../src/lib/proptx/mls-on-market-reconcile");
  const stats = await executeOnMarketReconciliation({ mode: "full" });
  console.log(formatOnMarketReconcileLog(stats));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
