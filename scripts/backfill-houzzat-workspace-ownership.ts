/**
 * Stage 3C — backfill Houzzat core CRM workspace ownership (data only).
 *
 *   pnpm workspace:backfill-houzzat           # dry-run
 *   pnpm workspace:backfill-houzzat -- --apply
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import {
  EXPECTED_EMAIL_LOG_COUNT,
  EXPECTED_LEAD_COUNT,
  EXPECTED_NOTE_COUNT,
  EXPECTED_TASK_COUNT,
  applyHouzzatWorkspaceOwnershipBackfill,
  buildBackfillPlan,
  captureAssigneeDistribution,
  countOwnership,
  sanitizeBackfillReport,
  validateBackfillPreconditions,
} from "./lib/houzzat-workspace-ownership";

const APPLY = process.argv.includes("--apply");

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  try {
    const assigneeBefore = await captureAssigneeDistribution(prisma);
    const plan = await buildBackfillPlan(prisma);
    const counts = {
      lead: await countOwnership(prisma, plan.ids, "lead"),
      task: await countOwnership(prisma, plan.ids, "agentTask"),
      note: await countOwnership(prisma, plan.ids, "leadNote"),
      email: await countOwnership(prisma, plan.ids, "leadEmailLog"),
    };

    const failures = validateBackfillPreconditions(plan, counts);
    const alreadyComplete =
      plan.leads.toUpdate === 0 &&
      plan.tasks.toUpdate === 0 &&
      plan.notes.toUpdate === 0 &&
      plan.emailLogs.toUpdate === 0 &&
      counts.lead.workspaceHouzzat === EXPECTED_LEAD_COUNT &&
      counts.task.workspaceHouzzat === EXPECTED_TASK_COUNT &&
      counts.note.workspaceHouzzat === EXPECTED_NOTE_COUNT &&
      counts.email.workspaceHouzzat === EXPECTED_EMAIL_LOG_COUNT;

    if (failures.length > 0 && !alreadyComplete) {
      console.error("PRECONDITION FAILURES:");
      for (const failure of failures) {
        console.error(`- ${failure}`);
      }
      process.exit(1);
    }

    if (!APPLY) {
      console.log(
        JSON.stringify(
          {
            ...sanitizeBackfillReport(plan, "dry-run"),
            ownershipState: {
              lead: counts.lead,
              task: counts.task,
              note: counts.note,
              email: counts.email,
            },
          },
          null,
          2,
        ),
      );
      if (alreadyComplete) {
        console.log("NO ACTION REQUIRED — ownership already backfilled");
      } else {
        console.log("DRY RUN — re-run with --apply to backfill");
      }
      return;
    }

    if (alreadyComplete) {
      console.log(
        JSON.stringify(sanitizeBackfillReport(plan, "already-complete"), null, 2),
      );
      console.log("NO ACTION REQUIRED — ownership already backfilled");
      return;
    }

    const expectedDryRun =
      plan.leads.toUpdate === EXPECTED_LEAD_COUNT &&
      plan.tasks.toUpdate === EXPECTED_TASK_COUNT &&
      plan.notes.toUpdate === EXPECTED_NOTE_COUNT &&
      plan.emailLogs.toUpdate === EXPECTED_EMAIL_LOG_COUNT;

    if (!expectedDryRun && !alreadyComplete) {
      console.error("DRY-RUN COUNTS MISMATCH — refusing apply");
      console.error(
        JSON.stringify(
          {
            expected: {
              leads: EXPECTED_LEAD_COUNT,
              tasks: EXPECTED_TASK_COUNT,
              notes: EXPECTED_NOTE_COUNT,
              emails: EXPECTED_EMAIL_LOG_COUNT,
            },
            plan: {
              leads: plan.leads.toUpdate,
              tasks: plan.tasks.toUpdate,
              notes: plan.notes.toUpdate,
              emails: plan.emailLogs.toUpdate,
            },
          },
          null,
          2,
        ),
      );
      process.exit(1);
    }

    const applied = await applyHouzzatWorkspaceOwnershipBackfill(prisma, plan);
    const assigneeAfter = await captureAssigneeDistribution(prisma);

    console.log(
      JSON.stringify(
        {
          ...sanitizeBackfillReport(plan, "apply"),
          applied,
          assigneeBefore,
          assigneeAfter,
        },
        null,
        2,
      ),
    );
    console.log("APPLIED — Houzzat core CRM workspace ownership backfilled");
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "workspace ownership backfill failed",
  );
  process.exit(1);
});
