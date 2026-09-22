/**
 * Phase 3 — PlatformOperator / Houzzat staff split PLAN (dry-run by default).
 *
 * APPLY is HARD-BLOCKED in this tooling wave (plan / ALREADY_SPLIT detection only).
 *
 * Cutover (already executed in Stage 7 production window when status=ALREADY_SPLIT):
 *   - Keep existing User NULL + PlatformOperator
 *   - Create Houzzat staff User (same email, password hash copied once)
 *   - Move ONLY verified Houzzat staff FKs
 *
 * Run:
 *   pnpm identity:phase3:platform-staff-split:dry-run
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

export const PLATFORM_STAFF_SPLIT = {
  platformUserId: "cmt8x6eoe0003psp7bq46fkam",
  platformEmail: "teamalisyed@gmail.com",
  houzzatWorkspaceId: "cmt7kfcth0000gvu0bqsycsvz",
  houzzatMembershipId: "cmt8x6eyr0008psp70mlgztqm",
  agentProfileId: "cmt8x6eqp0004psp774496rig",
  orgMembershipId: "cmt8x6iup000hpsp7t0tyc0ew",
  /** Known after Stage 7 apply; detection also finds any twin by email+workspace. */
  expectedHouzzatStaffUserId: "cmucwfk9q7ziauq5uebbqb21y",
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
    writesEnabled: false,
    mode: "DRY_RUN" as const,
  };
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.apply || flags.understand) {
    console.error(
      "[identity-phase3-platform-staff-split] APPLY is HARD-BLOCKED. Plan only.",
    );
  }

  const { prisma } = (await import("../src/lib/prisma")) as {
    prisma: PrismaLike;
  };

  try {
    const platform = await prisma.$queryRaw<
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
      WHERE id = ${PLATFORM_STAFF_SPLIT.platformUserId}
      LIMIT 1
    `;

    const operator = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "PlatformOperator"
      WHERE "userId" = ${PLATFORM_STAFF_SPLIT.platformUserId}
    `;

    const houzzatTwin = await prisma.$queryRaw<
      Array<{ id: string; workspaceId: string | null; role: string }>
    >`
      SELECT id, "workspaceId", role::text AS role
      FROM "User"
      WHERE lower(email) = lower(${PLATFORM_STAFF_SPLIT.platformEmail})
        AND "workspaceId" = ${PLATFORM_STAFF_SPLIT.houzzatWorkspaceId}
        AND id <> ${PLATFORM_STAFF_SPLIT.platformUserId}
      LIMIT 1
    `;

    const membershipOnTwin = houzzatTwin[0]
      ? await prisma.$queryRaw<Array<{ id: string; userId: string }>>`
          SELECT id, "userId" FROM "WorkspaceMember"
          WHERE id = ${PLATFORM_STAFF_SPLIT.houzzatMembershipId}
            AND "userId" = ${houzzatTwin[0].id}
        `
      : [];

    const primaryOnTwin = houzzatTwin[0]
      ? await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "Workspace"
          WHERE id = ${PLATFORM_STAFF_SPLIT.houzzatWorkspaceId}
            AND "primaryAgentId" = ${houzzatTwin[0].id}
        `
      : [];

    const membershipPending = await prisma.$queryRaw<
      Array<{ id: string; role: string; status: string }>
    >`
      SELECT id, role::text AS role, status::text AS status
      FROM "WorkspaceMember"
      WHERE id = ${PLATFORM_STAFF_SPLIT.houzzatMembershipId}
         OR ("userId" = ${PLATFORM_STAFF_SPLIT.platformUserId}
             AND "workspaceId" = ${PLATFORM_STAFF_SPLIT.houzzatWorkspaceId})
    `;

    const assignedPending = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Lead"
      WHERE "workspaceId" = ${PLATFORM_STAFF_SPLIT.houzzatWorkspaceId}
        AND "assignedAgentId" = ${PLATFORM_STAFF_SPLIT.platformUserId}
    `;

    const tasksPending = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM "AgentTask"
      WHERE "workspaceId" = ${PLATFORM_STAFF_SPLIT.houzzatWorkspaceId}
        AND "assigneeId" = ${PLATFORM_STAFF_SPLIT.platformUserId}
    `;

    const status =
      platform[0]?.workspaceId === null &&
      operator.length > 0 &&
      Boolean(houzzatTwin[0]) &&
      membershipOnTwin.length > 0 &&
      primaryOnTwin.length > 0
        ? ("ALREADY_SPLIT" as const)
        : ("PENDING_PLATFORM_STAFF_SPLIT_PLAN" as const);

    const plan = {
      timestamp: new Date().toISOString(),
      mode: "DRY_RUN",
      applyHardBlocked: true,
      currentPlatform: platform[0] ?? null,
      platformOperatorAttached: operator.length > 0,
      houzzatTwin: houzzatTwin[0] ?? null,
      proposedWrites: status === "ALREADY_SPLIT" ? [] : undefined,
      writeCount: status === "ALREADY_SPLIT" ? 0 : undefined,
      keepOnPlatformUser: {
        userId: PLATFORM_STAFF_SPLIT.platformUserId,
        workspaceId: null,
        keep: [
          "PlatformOperator",
          "NULL workspaceId (platform auth only)",
          "ConsentEvent / ActivityEvent / SiteVisitor / ListingView telemetry",
          "null-workspace ViewingTour draft (not Houzzat staff)",
        ],
      },
      createHouzzatStaffUser:
        status === "ALREADY_SPLIT"
          ? {
              alreadyExistsId: houzzatTwin[0]!.id,
              workspaceId: PLATFORM_STAFF_SPLIT.houzzatWorkspaceId,
              email: PLATFORM_STAFF_SPLIT.platformEmail,
              role: houzzatTwin[0]!.role,
              create: [],
            }
          : {
              workspaceId: PLATFORM_STAFF_SPLIT.houzzatWorkspaceId,
              email: PLATFORM_STAFF_SPLIT.platformEmail,
              role: "AGENT",
              passwordStrategy:
                "Copy current password hash once as transition only; passwords must be independently changeable after split",
              create: ["Move existing AgentProfile row to new User"],
            },
      moveToHouzzatStaffUser:
        status === "ALREADY_SPLIT"
          ? {
              workspaceMember: [],
              primaryAgent: false,
              assignedLeads: [],
              agentTasks: 0,
            }
          : {
              workspaceMember: membershipPending,
              primaryAgent: true,
              assignedLeads: assignedPending.map((r) => r.id),
              agentTasks: Number(tasksPending[0]?.n ?? 0),
            },
      doNotMove: [
        "PlatformOperator",
        "PlatformAuditEvent (operator-scoped)",
        "ActivityEvent / ListingView / SiteVisitor telemetry",
        "ConsentEvent identity history",
        "null-workspace ViewingTour draft",
      ],
      status,
    };

    mkdirSync(REPORT_DIR, { recursive: true });
    const stamp = plan.timestamp.replace(/[:.]/g, "-");
    const path = join(REPORT_DIR, `platform-staff-split-plan-${stamp}.json`);
    const body = JSON.stringify(plan, null, 2);
    writeFileSync(path, body, "utf8");
    const digest = createHash("sha256").update(body).digest("hex").slice(0, 16);

    console.log("\n=== identity-phase3-platform-staff-split ===");
    console.log("mode=DRY_RUN applyHardBlocked=true");
    console.log("status:", plan.status);
    console.log("writeCount:", plan.writeCount ?? "(pending plan)");
    console.log("currentPlatform:", plan.currentPlatform);
    console.log("houzzatTwin:", plan.houzzatTwin);
    console.log(`report=${path}`);
    console.log(`reportSha256_16=${digest}`);
    console.log("=== end ===\n");
    console.log(
      plan.status === "ALREADY_SPLIT"
        ? "[identity-phase3-platform-staff-split] ALREADY_SPLIT. Proposed writes: 0."
        : "[identity-phase3-platform-staff-split] PLAN complete. Zero database writes.",
    );
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
