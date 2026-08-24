/**
 * Stage 3C — rollback Houzzat workspace ownership backfill (data only).
 *
 *   pnpm workspace:rollback-houzzat-ownership           # dry-run
 *   pnpm workspace:rollback-houzzat-ownership -- --apply
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import {
  buildBackfillPlan,
  countOwnership,
  resolveOwnershipIds,
  rollbackHouzzatWorkspaceOwnership,
} from "./lib/houzzat-workspace-ownership";

const APPLY = process.argv.includes("--apply");

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  try {
    const ids = await resolveOwnershipIds(prisma);
    const plan = await buildBackfillPlan(prisma);

    const counts = {
      lead: await countOwnership(prisma, ids, "lead"),
      task: await countOwnership(prisma, ids, "agentTask"),
      note: await countOwnership(prisma, ids, "leadNote"),
      email: await countOwnership(prisma, ids, "leadEmailLog"),
    };

    const toRollback = {
      leads: counts.lead.workspaceHouzzat,
      tasks: counts.task.workspaceHouzzat,
      notes: counts.note.workspaceHouzzat,
      emails: counts.email.workspaceHouzzat,
    };

    const report = {
      mode: APPLY ? "apply" : "dry-run",
      demoAgentOrgIdPrefix: ids.demoAgentOrgId.slice(0, 8),
      houzzatWorkspaceIdPrefix: ids.houzzatWorkspaceId.slice(0, 8),
      toRollback,
      audits: plan.audits,
    };

    if (
      toRollback.leads === 0 &&
      toRollback.tasks === 0 &&
      toRollback.notes === 0 &&
      toRollback.emails === 0
    ) {
      console.log(JSON.stringify(report, null, 2));
      console.log("NO ACTION REQUIRED — no Houzzat ownership rows to rollback");
      return;
    }

    if (!APPLY) {
      console.log(JSON.stringify(report, null, 2));
      console.log("DRY RUN — re-run with --apply to rollback ownership backfill");
      return;
    }

    const rolledBack = await rollbackHouzzatWorkspaceOwnership(prisma, ids);
    console.log(JSON.stringify({ ...report, rolledBack }, null, 2));
    console.log("ROLLED BACK — Houzzat workspace ownership cleared");
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "workspace ownership rollback failed",
  );
  process.exit(1);
});
