/**
 * Phase 3 — Omer RE/MAX staff split PLAN (dry-run by default).
 *
 * DO NOT EXECUTE against production without an explicit future apply flag window.
 * This script NEVER writes unless BOTH --apply AND --i-understand-production are set,
 * and even then APPLY is currently HARD-BLOCKED (plan-only tooling for this wave).
 *
 * ============================================================
 * EXACT PRODUCTION CUTOVER ORDER (do not reorder)
 * ============================================================
 *
 * A. Deploy Phase 3 app code (workspace-scoped signup/login/reset/verify/JWT).
 *    - Safe while email is still globally unique (at most one row per email).
 *    - NULL-workspace Users cannot tenant-login (orphans/platform/pre-split Omer).
 *    - Brief Omer tenant outage until step C completes — schedule a maintenance window.
 *
 * B. Apply Phase 3 uniqueness migration
 *    prisma/migrations/20260922170000_phase3_workspace_email_uniqueness
 *    (drop User_email_key; add partial uniques). Still no duplicate emails yet.
 *
 * C. Execute Omer split (this script's future apply path):
 *    - Set existing User.workspaceId = Houzzat
 *    - Create new User (RE/MAX, same email, copy password hash once)
 *    - Move ONLY RE/MAX staff FKs to new User
 *    - Do NOT copy Houzzat consumer data
 *
 * D. Auth cutover is already live from A; verify passwords diverge after reset.
 *
 * E. Invalidate sessions for Omer user ids (JWT sub change for RE/MAX staff).
 *
 * Unsafe windows to avoid:
 * - Duplicate emails exist while authorize still uses global findUnique(email)
 * - Auth requires workspaceId before migration/split ready for Omer
 *
 * Rollback:
 * - App: redeploy prior auth build
 * - DB uniqueness: restore from Neon snapshot taken before B/C
 * - Omer split: restore snapshot (FK moves are not trivially reversible)
 *
 * Run (plan only):
 *   pnpm identity:phase3:omer-split:dry-run
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_DIR = join(ROOT, "tmp", "identity-phase3");

export const OMER_SPLIT = {
  omerUserId: "cmsgv80pa0004psp7xl2l2yzj",
  omerEmail: "omsyed88@gmail.com",
  houzzatWorkspaceId: "cmt7kfcth0000gvu0bqsycsvz",
  remaxWorkspaceId: "cmtn5glsq0005psp7z8wk891q",
  houzzatLeadId: "cmsgv826x0008psp7jzcfjk3j",
  remaxOwnerMembershipId: "cmtn5gmuh0009psp7j0dl3ads",
  remaxAssignedLeadId: "cmtz91ez300070agmy8exh0my",
} as const;

type PrismaLike = {
  $queryRaw: <T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<T>;
  $disconnect: () => Promise<void>;
};

function parseArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const understand = argv.includes("--i-understand-production");
  return {
    apply,
    understand,
    writesEnabled: false, // HARD BLOCK for this wave
    mode: "DRY_RUN" as const,
  };
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.apply || flags.understand) {
    console.error(
      "[identity-phase3-omer-split] APPLY is HARD-BLOCKED in this tooling wave. Plan only.",
    );
  }

  const { prisma } = (await import("../src/lib/prisma")) as {
    prisma: PrismaLike;
  };

  try {
    const omer = await prisma.$queryRaw<
      Array<{
        id: string;
        email: string;
        workspaceId: string | null;
        role: string;
        hasPassword: boolean;
      }>
    >`
      SELECT id, email, "workspaceId", role::text AS role,
             (password IS NOT NULL) AS "hasPassword"
      FROM "User"
      WHERE id = ${OMER_SPLIT.omerUserId}
      LIMIT 1
    `;

    const member = await prisma.$queryRaw<
      Array<{ id: string; role: string; status: string }>
    >`
      SELECT id, role::text AS role, status::text AS status
      FROM "WorkspaceMember"
      WHERE id = ${OMER_SPLIT.remaxOwnerMembershipId}
         OR ("userId" = ${OMER_SPLIT.omerUserId}
             AND "workspaceId" = ${OMER_SPLIT.remaxWorkspaceId})
    `;

    const billing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Workspace"
      WHERE id = ${OMER_SPLIT.remaxWorkspaceId}
        AND "billingOwnerUserId" = ${OMER_SPLIT.omerUserId}
    `;

    const assigned = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Lead"
      WHERE "workspaceId" = ${OMER_SPLIT.remaxWorkspaceId}
        AND "assignedAgentId" = ${OMER_SPLIT.omerUserId}
    `;

    const houzzatLead = await prisma.$queryRaw<
      Array<{ id: string; customerId: string | null }>
    >`
      SELECT id, "customerId" FROM "Lead"
      WHERE id = ${OMER_SPLIT.houzzatLeadId}
    `;

    const tasks = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM "AgentTask"
      WHERE "workspaceId" = ${OMER_SPLIT.remaxWorkspaceId}
        AND ("assigneeId" = ${OMER_SPLIT.omerUserId}
             OR "createdById" = ${OMER_SPLIT.omerUserId})
    `;
    const messages = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM "Message"
      WHERE "workspaceId" = ${OMER_SPLIT.remaxWorkspaceId}
        AND "senderUserId" = ${OMER_SPLIT.omerUserId}
    `;
    const notes = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM "LeadNote"
      WHERE "workspaceId" = ${OMER_SPLIT.remaxWorkspaceId}
        AND "authorId" = ${OMER_SPLIT.omerUserId}
    `;
    const appts = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM "Appointment" a
      JOIN "Lead" l ON l.id = a."leadId"
      WHERE l."workspaceId" = ${OMER_SPLIT.remaxWorkspaceId}
        AND a."agentId" = ${OMER_SPLIT.omerUserId}
    `;

    const remaxTwin = await prisma.$queryRaw<
      Array<{ id: string; workspaceId: string | null; role: string }>
    >`
      SELECT id, "workspaceId", role::text AS role
      FROM "User"
      WHERE lower(email) = lower(${OMER_SPLIT.omerEmail})
        AND "workspaceId" = ${OMER_SPLIT.remaxWorkspaceId}
        AND id <> ${OMER_SPLIT.omerUserId}
      LIMIT 1
    `;

    const membershipOnTwin = remaxTwin[0]
      ? await prisma.$queryRaw<Array<{ id: string; userId: string }>>`
          SELECT id, "userId" FROM "WorkspaceMember"
          WHERE id = ${OMER_SPLIT.remaxOwnerMembershipId}
            AND "userId" = ${remaxTwin[0].id}
        `
      : [];

    const billingOnTwin = remaxTwin[0]
      ? await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "Workspace"
          WHERE id = ${OMER_SPLIT.remaxWorkspaceId}
            AND "billingOwnerUserId" = ${remaxTwin[0].id}
        `
      : [];

    const status =
      omer[0]?.workspaceId === OMER_SPLIT.houzzatWorkspaceId &&
      Boolean(remaxTwin[0]) &&
      membershipOnTwin.length > 0 &&
      billingOnTwin.length > 0
        ? ("ALREADY_SPLIT" as const)
        : ("PENDING_PHASE3_SPLIT_PLAN" as const);

    const plan = {
      timestamp: new Date().toISOString(),
      mode: "DRY_RUN",
      applyHardBlocked: true,
      currentOmer: omer[0] ?? null,
      remaxTwin: remaxTwin[0] ?? null,
      proposedWrites: status === "ALREADY_SPLIT" ? [] : undefined,
      writeCount: status === "ALREADY_SPLIT" ? 0 : undefined,
      keepOnHouzzatUser: {
        userId: OMER_SPLIT.omerUserId,
        setWorkspaceId: OMER_SPLIT.houzzatWorkspaceId,
        email: OMER_SPLIT.omerEmail,
        keep: [
          "Lead.customer (Houzzat)",
          "SavedListing / SavedSearch / ListingNote / ListingView",
          "PropertyMonitor / AreaMonitor / CustomerAlert",
          "PushDevice / ConsentEvent / ActivityEvent / SiteVisitor",
          "Consumer password + VOW/CASL + alert preferences",
        ],
        houzzatLead: houzzatLead[0] ?? null,
      },
      createRemaxUser:
        status === "ALREADY_SPLIT"
          ? {
              alreadyExistsId: remaxTwin[0]!.id,
              workspaceId: OMER_SPLIT.remaxWorkspaceId,
              email: OMER_SPLIT.omerEmail,
              role: remaxTwin[0]!.role,
              create: [],
            }
          : {
              workspaceId: OMER_SPLIT.remaxWorkspaceId,
              email: OMER_SPLIT.omerEmail,
              role: "AGENT",
              passwordStrategy:
                "Copy current password hash once as transition only; passwords must be independently changeable after split",
              create: ["AgentProfile (new row if missing)"],
            },
      moveToRemaxUser:
        status === "ALREADY_SPLIT"
          ? {
              workspaceMember: [],
              billingOwner: false,
              assignedLeads: [],
              agentTasks: 0,
              messagesSent: 0,
              leadNotesAuthored: 0,
              appointmentsAsAgent: 0,
            }
          : {
              workspaceMember: member,
              billingOwner: billing.length > 0,
              assignedLeads: assigned.map((r) => r.id),
              agentTasks: Number(tasks[0]?.n ?? 0),
              messagesSent: Number(messages[0]?.n ?? 0),
              leadNotesAuthored: Number(notes[0]?.n ?? 0),
              appointmentsAsAgent: Number(appts[0]?.n ?? 0),
            },
      doNotCopyFromHouzzat: [
        "Leads",
        "saves/searches",
        "listing notes/views",
        "monitors",
        "consumer preferences",
        "VOW/CASL history",
        "consumer ActivityEvents/SiteVisitors",
      ],
      status,
    };

    mkdirSync(REPORT_DIR, { recursive: true });
    const stamp = plan.timestamp.replace(/[:.]/g, "-");
    const path = join(REPORT_DIR, `omer-split-plan-${stamp}.json`);
    const body = JSON.stringify(plan, null, 2);
    writeFileSync(path, body, "utf8");
    const digest = createHash("sha256").update(body).digest("hex").slice(0, 16);

    console.log("\n=== identity-phase3-omer-split ===");
    console.log("mode=DRY_RUN applyHardBlocked=true");
    console.log("status:", plan.status);
    console.log("writeCount:", plan.writeCount ?? "(pending plan)");
    console.log("currentOmer:", plan.currentOmer);
    console.log("remaxTwin:", plan.remaxTwin);
    console.log("moveToRemaxUser:", plan.moveToRemaxUser);
    console.log(`report=${path}`);
    console.log(`reportSha256_16=${digest}`);
    console.log("=== end ===\n");
    console.log(
      plan.status === "ALREADY_SPLIT"
        ? "[identity-phase3-omer-split] ALREADY_SPLIT. Proposed writes: 0."
        : "[identity-phase3-omer-split] PLAN complete. Zero database writes.",
    );
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
