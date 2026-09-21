/**
 * APPROVED production execute for the four Houzzat duplicate groups.
 * Requires the exact confirm token as argv[2].
 *
 * Does not add a unique index. Does not touch null-customerId Leads.
 */
import { config } from "dotenv";
import {
  EXECUTE_LEAD_DUPLICATE_RECONCILIATION,
  executeLeadDuplicateReconciliation,
  planLeadDuplicateReconciliation,
} from "../src/lib/agent/lead-duplicate-reconciliation";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const APPROVED_CANONICAL_LEAD_IDS = new Set([
  "cmsgv826x0008psp7jzcfjk3j", // Omer Ali
  "cms7g3c9300dwfvu0pb50q91a", // Haider Syed
  "cmt6phtz70005psp7wviervcy", // Demo Buyer
  "cms7fzp7000dufvu0ac1yb5me", // Houzzat Admin
]);

async function main() {
  const token = process.argv[2];
  if (token !== EXECUTE_LEAD_DUPLICATE_RECONCILIATION) {
    console.error("Refusing: missing or invalid confirm token");
    process.exit(2);
  }

  const { prisma } = await import("../src/lib/prisma");
  const planned = await planLeadDuplicateReconciliation(prisma, {
    workspaceId: "cmt7kfcth0000gvu0bqsycsvz",
  });
  const extra = planned.filter(
    (plan) => !APPROVED_CANONICAL_LEAD_IDS.has(plan.canonicalLeadId),
  );
  if (extra.length) {
    console.error(
      JSON.stringify({
        error: "Unapproved extra duplicate groups present; aborting",
        extra: extra.map((plan) => ({
          customerLabel: plan.customerLabel,
          canonicalLeadId: plan.canonicalLeadId,
        })),
      }),
    );
    process.exit(3);
  }

  const plans = planned.filter((plan) =>
    APPROVED_CANONICAL_LEAD_IDS.has(plan.canonicalLeadId),
  );
  if (plans.length !== APPROVED_CANONICAL_LEAD_IDS.size) {
    console.error(
      JSON.stringify({
        error: "Approved canonical set mismatch",
        found: plans.map((plan) => plan.canonicalLeadId),
        expected: [...APPROVED_CANONICAL_LEAD_IDS],
      }),
    );
    process.exit(3);
  }

  const result = await executeLeadDuplicateReconciliation(prisma, {
    confirm: EXECUTE_LEAD_DUPLICATE_RECONCILIATION,
    plans,
  });

  console.log(
    JSON.stringify(
      {
        mode: "execute",
        result,
        plans: plans.map((plan) => ({
          customerLabel: plan.customerLabel,
          customerId: plan.customerId,
          canonicalLeadId: plan.canonicalLeadId,
          survivingAgentEmail: plan.survivingAgentEmail,
          duplicateLeadIds: plan.duplicateLeadIds,
          after: plan.after,
          moves: plan.moves,
        })),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect().catch(() => undefined);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
