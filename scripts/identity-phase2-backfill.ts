/**
 * Phase 2 — workspace identity backfill / Maria contamination cleanup / Omer split PLAN.
 *
 * DEFAULT: DRY-RUN (zero writes).
 *
 * Writes require BOTH:
 *   --apply
 *   --i-understand-production
 *
 * POST–PHASE 3: when Omer dual tenants + Platform/Houzzat staff split are already
 * live (Users=66 topology), this tooling reports PHASE3_COMPLETE / ALREADY_SPLIT
 * and proposes ZERO further mutations. It must never reverse Phase 3 identities.
 *
 * Historical (pre–Phase 3) statuses:
 *   RE/MAX Omer User creation was PENDING_PHASE3_SPLIT
 *   Platform Houzzat staff split was PENDING_PLATFORM_STAFF_SPLIT
 *
 * Run (dry-run only via package script):
 *   pnpm identity:phase2:dry-run
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_DIR = join(ROOT, "tmp", "identity-phase2");

/** Locked production IDs from identity topology audit. */
export const EXPECTED = {
  workspaces: {
    houzzat: "cmt7kfcth0000gvu0bqsycsvz",
    maria: "cmu7se7hu000l04l6015edpg0",
    remax: "cmtn5glsq0005psp7z8wk891q",
  },
  omerUserId: "cmsgv80pa0004psp7xl2l2yzj",
  omerEmail: "omsyed88@gmail.com",
  omerRemaxUserId: "cmucv4hg9y9ar0rzx2ukf47rx",
  platformUserId: "cmt8x6eoe0003psp7bq46fkam",
  platformEmail: "teamalisyed@gmail.com",
  platformHouzzatStaffUserId: "cmucwfk9q7ziauq5uebbqb21y",
  alwaysurshaEmail: "alwaysursha@gmail.com",
  mariaContaminationLeads: [
    {
      id: "cmubz4ceo000304jt91rmg3yj",
      customerEmail: "omsyed88@gmail.com",
      source: "OTHER",
    },
    {
      id: "cmubzef2p000b04js7zofdokz",
      customerEmail: "alwaysursha@gmail.com",
      source: "OTHER",
    },
  ] as const,
  /** Pre–Phase 3 audited baseline (Stage 2 era). */
  baseline: {
    users: 64,
    mariaLeads: 2,
    houzzatLeads: 49,
    remaxLeads: 1,
    workspaceMembers: 9,
    conversations: 7,
    leadActivities: 536,
  },
  /** Final Phase 3 closed topology (Stage 9/10). */
  phase3Final: {
    users: 66,
    tenantUsers: 54,
    nullUsers: 12,
    mariaLeads: 0,
  },
} as const;

const ORPHAN_USER_IDS = [
  "cmt4s4et60002psp7dptma5zo",
  "cmt4s4o660003psp7f2f8zhti",
  "cmt4s6xn00003psp7qybo2ve1",
  "cmt4siqo20004psp79ijyxelt",
  "cmtrkijhj000bpsp7batvwh3e",
  "cmtrkild8000cpsp79fbulq33",
  "cmtrkiljj000dpsp7acn14m0p",
  "cmtrkipgk000epsp7t4zdp621",
  "cmtrkipn4000fpsp7eyhm5te4",
  "cmtrkiuvp000gpsp7k0cblnax",
  "cmua9gy1k000804lbdc98h6rz",
] as const;

type PrismaLike = {
  $queryRaw: <T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<T>;
  $executeRaw: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<number>;
  $transaction: <T>(fn: (tx: PrismaLike) => Promise<T>) => Promise<T>;
  $disconnect: () => Promise<void>;
};

function parseArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const understand = argv.includes("--i-understand-production");
  const writesEnabled = apply && understand;
  return {
    apply,
    understand,
    writesEnabled,
    mode: writesEnabled ? ("APPLY" as const) : ("DRY_RUN" as const),
  };
}

function fail(message: string): never {
  throw new Error(`[identity-phase2] ${message}`);
}

async function columnExists(
  prisma: PrismaLike,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${table}
        AND column_name = ${column}
    ) AS "exists"
  `;
  return Boolean(rows[0]?.exists);
}

type PreflightLead = {
  id: string;
  workspaceId: string | null;
  source: string;
  status: string;
  customerId: string | null;
  customerEmail: string | null;
  assignedAgentId: string | null;
};

type ContamDeps = {
  leadId: string;
  conversations: number;
  messages: number;
  leadActivities: number;
  agentTasks: number;
  leadEmailLogs: number;
  smsDispatches: number;
  appointments: number;
  cmaReports: number;
  leadImportRows: number;
};

export type Phase2Report = {
  timestamp: string;
  mode: "DRY_RUN" | "APPLY";
  writeFlags: { apply: boolean; understandProduction: boolean };
  phase1ColumnsPresent: { userWorkspaceId: boolean; accountWorkspaceId: boolean };
  preflight: {
    ok: boolean;
    errors: string[];
    warnings: string[];
    workspaces: Record<string, { id: string; found: boolean; name?: string; slug?: string }>;
    omer: { id: string; email: string | null; role: string | null; found: boolean };
    mariaContamination: Array<{
      expectedId: string;
      status: "FOUND" | "ALREADY_CLEAN";
      lead: PreflightLead | null;
    }>;
  };
  topologyCounts: Record<string, number>;
  proposedDeletes: {
    status: "PLAN" | "ALREADY_CLEAN" | "APPLIED";
    leadIds: string[];
    explicit: Array<{ table: string; leadId: string; count: number }>;
    cascadeEstimates: ContamDeps[];
    setNullAssert: {
      appointments: number;
      cmaReports: number;
      leadImportRows: number;
      ok: boolean;
    };
  };
  proposedWorkspaceAssignments: Array<{
    userId: string;
    email: string;
    action:
      | "ASSIGN"
      | "ALREADY_ASSIGNED"
      | "SKIP_ORPHAN"
      | "SKIP_PLATFORM"
      | "MULTI_WORKSPACE_REQUIRES_SPLIT"
      | "PENDING_PHASE3_SPLIT"
      | "PHASE3_COMPLETE_NOOP";
    workspaceId: string | null;
    workspaceSlug: string | null;
    reasons: string[];
    currentWorkspaceId?: string | null;
  }>;
  skippedOrphans: Array<{
    userId: string;
    email: string;
    role: string;
    recommendation: string;
  }>;
  skippedPlatformUsers: Array<{ userId: string; email: string }>;
  pendingOmerRemaxSplit: {
    status: "PENDING_PHASE3_SPLIT" | "ALREADY_SPLIT";
    reason: string;
    oldUserId: string;
    houzzatWorkspaceId: string;
    remaxWorkspaceId: string;
    remaxUserId?: string;
    keepOnHouzzatUser: string[];
    moveToRemaxUserWhenAllowed: string[];
    createOnRemaxUser: string[];
    fkPreview: Record<string, unknown>;
  };
  pendingPlatformStaffSplit: {
    status: "PENDING_PLATFORM_STAFF_SPLIT" | "ALREADY_SPLIT";
    platformUserId: string;
    email: string;
    houzzatStaffUserId?: string;
    note: string;
  };
  /**
   * When Phase 3 identity splits are live, Phase 2 apply is obsolete.
   * Dry-run must report this and propose zero topology mutations.
   */
  toolingStatus:
    | "PHASE2_ACTIVE"
    | "PHASE3_COMPLETE_OBSOLETE_FOR_APPLY";
  expectedBeforeAfter: Record<
    string,
    { before: number; after: number; note?: string }
  >;
  applyBlockedReasons: string[];
};

async function loadWorkspace(
  prisma: PrismaLike,
  id: string,
): Promise<{ id: string; name: string; slug: string } | null> {
  const rows = await prisma.$queryRaw<
    Array<{ id: string; name: string; slug: string }>
  >`
    SELECT id, name, slug FROM "Workspace" WHERE id = ${id} LIMIT 1
  `;
  return rows[0] ?? null;
}

async function loadUser(
  prisma: PrismaLike,
  id: string,
): Promise<{ id: string; email: string; role: string } | null> {
  const rows = await prisma.$queryRaw<
    Array<{ id: string; email: string; role: string }>
  >`
    SELECT id, email, role::text AS role FROM "User" WHERE id = ${id} LIMIT 1
  `;
  return rows[0] ?? null;
}

async function loadLead(
  prisma: PrismaLike,
  id: string,
): Promise<PreflightLead | null> {
  const rows = await prisma.$queryRaw<PreflightLead[]>`
    SELECT
      l.id,
      l."workspaceId",
      l.source::text AS source,
      l.status::text AS status,
      l."customerId",
      u.email AS "customerEmail",
      l."assignedAgentId"
    FROM "Lead" l
    LEFT JOIN "User" u ON u.id = l."customerId"
    WHERE l.id = ${id}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function contamDeps(prisma: PrismaLike, leadId: string): Promise<ContamDeps> {
  const rows = await prisma.$queryRaw<ContamDeps[]>`
    SELECT
      ${leadId} AS "leadId",
      (SELECT COUNT(*)::int FROM "Conversation" c WHERE c."leadId" = ${leadId}) AS conversations,
      (SELECT COUNT(*)::int FROM "Message" m
        JOIN "Conversation" c ON c.id = m."conversationId"
        WHERE c."leadId" = ${leadId}) AS messages,
      (SELECT COUNT(*)::int FROM "LeadActivity" la WHERE la."leadId" = ${leadId}) AS "leadActivities",
      (SELECT COUNT(*)::int FROM "AgentTask" t WHERE t."leadId" = ${leadId}) AS "agentTasks",
      (SELECT COUNT(*)::int FROM "LeadEmailLog" e WHERE e."leadId" = ${leadId}) AS "leadEmailLogs",
      (SELECT COUNT(*)::int FROM "SmsAutomationDispatch" d WHERE d."leadId" = ${leadId}) AS "smsDispatches",
      (SELECT COUNT(*)::int FROM "Appointment" a WHERE a."leadId" = ${leadId}) AS appointments,
      (SELECT COUNT(*)::int FROM "CmaReport" r WHERE r."leadId" = ${leadId}) AS "cmaReports",
      (SELECT COUNT(*)::int FROM "LeadImportRow" r WHERE r."leadId" = ${leadId}) AS "leadImportRows"
  `;
  return (
    rows[0] ?? {
      leadId,
      conversations: 0,
      messages: 0,
      leadActivities: 0,
      agentTasks: 0,
      leadEmailLogs: 0,
      smsDispatches: 0,
      appointments: 0,
      cmaReports: 0,
      leadImportRows: 0,
    }
  );
}

async function topologyCountsSafe(prisma: PrismaLike) {
  const { houzzat, maria, remax } = EXPECTED.workspaces;
  const users = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM "User"`;
  const mariaLeads = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM "Lead" WHERE "workspaceId" = ${maria}`;
  const houzzatLeads = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM "Lead" WHERE "workspaceId" = ${houzzat}`;
  const remaxLeads = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM "Lead" WHERE "workspaceId" = ${remax}`;
  const workspaceMembers = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM "WorkspaceMember"`;
  const conversations = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM "Conversation"`;
  const leadActivities = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM "LeadActivity"`;
  const mariaConversations = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM "Conversation" WHERE "workspaceId" = ${maria}`;
  const mariaActivities = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM "LeadActivity" la
    JOIN "Lead" l ON l.id = la."leadId"
    WHERE l."workspaceId" = ${maria}`;
  return {
    users: Number(users[0]?.n ?? 0),
    mariaLeads: Number(mariaLeads[0]?.n ?? 0),
    houzzatLeads: Number(houzzatLeads[0]?.n ?? 0),
    remaxLeads: Number(remaxLeads[0]?.n ?? 0),
    workspaceMembers: Number(workspaceMembers[0]?.n ?? 0),
    conversations: Number(conversations[0]?.n ?? 0),
    leadActivities: Number(leadActivities[0]?.n ?? 0),
    mariaConversations: Number(mariaConversations[0]?.n ?? 0),
    mariaActivities: Number(mariaActivities[0]?.n ?? 0),
  };
}

type EdgeRow = { uid: string; wid: string; reason: string };

async function loadIdentityEdges(prisma: PrismaLike): Promise<EdgeRow[]> {
  return prisma.$queryRaw<EdgeRow[]>`
    SELECT wm."userId" AS uid, wm."workspaceId" AS wid,
           ('WorkspaceMember:' || wm.role::text || '/' || wm.status::text) AS reason
    FROM "WorkspaceMember" wm
    UNION ALL
    SELECT l."customerId", l."workspaceId", 'Lead.customer'
    FROM "Lead" l
    WHERE l."customerId" IS NOT NULL AND l."workspaceId" IS NOT NULL
    UNION ALL
    SELECT l."assignedAgentId", l."workspaceId", 'Lead.assignedAgent'
    FROM "Lead" l
    WHERE l."assignedAgentId" IS NOT NULL AND l."workspaceId" IS NOT NULL
    UNION ALL
    SELECT w."billingOwnerUserId", w.id, 'Workspace.billingOwner'
    FROM "Workspace" w
    WHERE w."billingOwnerUserId" IS NOT NULL
    UNION ALL
    SELECT w."primaryAgentId", w.id, 'Workspace.primaryAgent'
    FROM "Workspace" w
    WHERE w."primaryAgentId" IS NOT NULL
  `;
}

async function planOmerRemaxFkPreview(prisma: PrismaLike) {
  const omer = EXPECTED.omerUserId;
  const remax = EXPECTED.workspaces.remax;
  const member = await prisma.$queryRaw<
    Array<{ id: string; role: string; status: string }>
  >`
    SELECT id, role::text AS role, status::text AS status
    FROM "WorkspaceMember"
    WHERE "userId" = ${omer} AND "workspaceId" = ${remax}
  `;
  const billing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Workspace"
    WHERE id = ${remax} AND "billingOwnerUserId" = ${omer}
  `;
  const assigned = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Lead"
    WHERE "workspaceId" = ${remax} AND "assignedAgentId" = ${omer}
  `;
  const tasks = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM "AgentTask"
    WHERE "workspaceId" = ${remax}
      AND ("assigneeId" = ${omer} OR "createdById" = ${omer})
  `;
  const messages = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM "Message"
    WHERE "workspaceId" = ${remax} AND "senderUserId" = ${omer}
  `;
  const appts = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM "Appointment" a
    JOIN "Lead" l ON l.id = a."leadId"
    WHERE l."workspaceId" = ${remax} AND a."agentId" = ${omer}
  `;
  const notes = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM "LeadNote"
    WHERE "workspaceId" = ${remax} AND "authorId" = ${omer}
  `;
  return {
    workspaceMember: member,
    billingOwner: billing.length > 0,
    assignedLeads: assigned.map((row) => row.id),
    agentTasks: Number(tasks[0]?.n ?? 0),
    messagesSent: Number(messages[0]?.n ?? 0),
    appointmentsAsAgent: Number(appts[0]?.n ?? 0),
    leadNotesAuthored: Number(notes[0]?.n ?? 0),
  };
}

async function detectPhase3CompleteTopology(prisma: PrismaLike): Promise<{
  complete: boolean;
  omerHouzzatOk: boolean;
  omerRemaxTwinId: string | null;
  platformNullOk: boolean;
  houzzatStaffTwinId: string | null;
  users: number;
  mariaLeads: number;
}> {
  const omer = await loadUser(prisma, EXPECTED.omerUserId);
  const omerWs = await prisma.$queryRaw<Array<{ workspaceId: string | null }>>`
    SELECT "workspaceId" FROM "User" WHERE id = ${EXPECTED.omerUserId} LIMIT 1
  `;
  const remaxTwin = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "User"
    WHERE lower(email) = lower(${EXPECTED.omerEmail})
      AND "workspaceId" = ${EXPECTED.workspaces.remax}
      AND id <> ${EXPECTED.omerUserId}
    LIMIT 1
  `;
  const platform = await prisma.$queryRaw<
    Array<{ workspaceId: string | null }>
  >`
    SELECT "workspaceId" FROM "User" WHERE id = ${EXPECTED.platformUserId} LIMIT 1
  `;
  const operator = await prisma.$queryRaw<Array<{ userId: string }>>`
    SELECT "userId" FROM "PlatformOperator"
    WHERE "userId" = ${EXPECTED.platformUserId} AND status = 'ACTIVE'
    LIMIT 1
  `;
  const staffTwin = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "User"
    WHERE lower(email) = lower(${EXPECTED.platformEmail})
      AND "workspaceId" = ${EXPECTED.workspaces.houzzat}
      AND id <> ${EXPECTED.platformUserId}
    LIMIT 1
  `;
  const counts = await topologyCountsSafe(prisma);
  const omerHouzzatOk =
    Boolean(omer) &&
    omerWs[0]?.workspaceId === EXPECTED.workspaces.houzzat;
  const platformNullOk =
    platform[0]?.workspaceId == null && operator.length > 0;
  const complete =
    omerHouzzatOk &&
    Boolean(remaxTwin[0]) &&
    platformNullOk &&
    Boolean(staffTwin[0]) &&
    counts.users === EXPECTED.phase3Final.users &&
    counts.mariaLeads === EXPECTED.phase3Final.mariaLeads;
  return {
    complete,
    omerHouzzatOk,
    omerRemaxTwinId: remaxTwin[0]?.id ?? null,
    platformNullOk,
    houzzatStaffTwinId: staffTwin[0]?.id ?? null,
    users: counts.users,
    mariaLeads: counts.mariaLeads,
  };
}

async function buildReport(prisma: PrismaLike, mode: "DRY_RUN" | "APPLY", flags: {
  apply: boolean;
  understand: boolean;
}): Promise<Phase2Report> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const applyBlockedReasons: string[] = [];

  const phase3 = await detectPhase3CompleteTopology(prisma);
  if (phase3.complete) {
    warnings.push(
      "Phase 3 strict workspace identity is COMPLETE (Users=66 dual Omer + platform/Houzzat staff). Phase 2 apply is obsolete — proposing zero topology mutations.",
    );
    applyBlockedReasons.push("PHASE3_COMPLETE_OBSOLETE_FOR_APPLY");
  }

  const userWsCol = await columnExists(prisma, "User", "workspaceId");
  const accountWsCol = await columnExists(prisma, "Account", "workspaceId");
  if (!userWsCol || !accountWsCol) {
    warnings.push(
      "Phase 1 columns not present on this database (User.workspaceId / Account.workspaceId). Backfill ASSIGN is planned only; apply must wait until Phase 1 is applied.",
    );
    applyBlockedReasons.push("PHASE1_COLUMNS_MISSING");
  }

  const wsEntries: Phase2Report["preflight"]["workspaces"] = {};
  for (const [key, id] of Object.entries(EXPECTED.workspaces)) {
    const row = await loadWorkspace(prisma, id);
    wsEntries[key] = {
      id,
      found: Boolean(row),
      name: row?.name,
      slug: row?.slug,
    };
    if (!row) errors.push(`Missing expected workspace ${key}=${id}`);
  }

  const omer = await loadUser(prisma, EXPECTED.omerUserId);
  if (!omer) {
    errors.push(`Missing Omer user ${EXPECTED.omerUserId}`);
  } else if (omer.email !== EXPECTED.omerEmail) {
    errors.push(
      `Omer email drift: expected ${EXPECTED.omerEmail}, got ${omer.email}`,
    );
  }

  const mariaContamination: Phase2Report["preflight"]["mariaContamination"] = [];
  for (const expected of EXPECTED.mariaContaminationLeads) {
    const lead = await loadLead(prisma, expected.id);
    if (!lead) {
      mariaContamination.push({
        expectedId: expected.id,
        status: "ALREADY_CLEAN",
        lead: null,
      });
      continue;
    }
    mariaContamination.push({
      expectedId: expected.id,
      status: "FOUND",
      lead,
    });
    if (lead.workspaceId !== EXPECTED.workspaces.maria) {
      errors.push(
        `Contamination lead ${expected.id} workspaceId=${lead.workspaceId} (expected Maria)`,
      );
    }
    if (lead.source !== expected.source) {
      errors.push(
        `Contamination lead ${expected.id} source=${lead.source} (expected ${expected.source})`,
      );
    }
    if (lead.customerEmail !== expected.customerEmail) {
      errors.push(
        `Contamination lead ${expected.id} customerEmail=${lead.customerEmail} (expected ${expected.customerEmail})`,
      );
    }
  }

  const deps: ContamDeps[] = [];
  const explicit: Phase2Report["proposedDeletes"]["explicit"] = [];
  for (const entry of mariaContamination) {
    if (entry.status !== "FOUND" || !entry.lead) continue;
    const d = await contamDeps(prisma, entry.lead.id);
    deps.push(d);
    if (d.smsDispatches > 0) {
      explicit.push({
        table: "SmsAutomationDispatch",
        leadId: d.leadId,
        count: d.smsDispatches,
      });
    }
    explicit.push({ table: "Lead", leadId: d.leadId, count: 1 });
  }

  const setNullAssert = {
    appointments: deps.reduce((n, d) => n + d.appointments, 0),
    cmaReports: deps.reduce((n, d) => n + d.cmaReports, 0),
    leadImportRows: deps.reduce((n, d) => n + d.leadImportRows, 0),
    ok: true,
  };
  setNullAssert.ok =
    setNullAssert.appointments === 0 &&
    setNullAssert.cmaReports === 0 &&
    setNullAssert.leadImportRows === 0;
  if (!setNullAssert.ok) {
    errors.push(
      `SET NULL dependents not zero (appointments=${setNullAssert.appointments}, cma=${setNullAssert.cmaReports}, importRows=${setNullAssert.leadImportRows})`,
    );
    applyBlockedReasons.push("SET_NULL_DEPENDENTS_PRESENT");
  }

  const counts = await topologyCountsSafe(prisma);
  // Soft drift on totals is a warning; security-relevant ID mismatches already error.
  if (
    !phase3.complete &&
    counts.users !== EXPECTED.baseline.users
  ) {
    warnings.push(
      `User count ${counts.users} != audited baseline ${EXPECTED.baseline.users}`,
    );
  }
  if (
    phase3.complete &&
    counts.users !== EXPECTED.phase3Final.users
  ) {
    errors.push(
      `Phase 3 final User count ${counts.users} != expected ${EXPECTED.phase3Final.users}`,
    );
  }

  const edges = await loadIdentityEdges(prisma);
  const byUser = new Map<string, { wids: Set<string>; reasons: string[] }>();
  for (const edge of edges) {
    if (!edge.uid || !edge.wid) continue;
    const cur = byUser.get(edge.uid) ?? { wids: new Set(), reasons: [] };
    cur.wids.add(edge.wid);
    cur.reasons.push(`${edge.reason}@${edge.wid}`);
    byUser.set(edge.uid, cur);
  }

  const platformOps = await prisma.$queryRaw<
    Array<{ userId: string; email: string }>
  >`
    SELECT po."userId", u.email
    FROM "PlatformOperator" po
    JOIN "User" u ON u.id = po."userId"
  `;
  const platformIds = new Set(platformOps.map((row) => row.userId));

  const allUsers = await prisma.$queryRaw<
    Array<{
      id: string;
      email: string;
      role: string;
      workspaceId: string | null;
    }>
  >`
    SELECT id, email, role::text AS role, "workspaceId"
    FROM "User"
    ORDER BY "createdAt"
  `;

  const slugById = new Map(
    Object.entries(EXPECTED.workspaces).map(([slug, id]) => [id, slug]),
  );
  // Prefer DB slugs when present
  for (const [key, meta] of Object.entries(wsEntries)) {
    if (meta.slug) slugById.set(meta.id, meta.slug);
    void key;
  }

  const proposedWorkspaceAssignments: Phase2Report["proposedWorkspaceAssignments"] =
    [];
  const skippedOrphans: Phase2Report["skippedOrphans"] = [];

  for (const user of allUsers) {
    if (platformIds.has(user.id)) {
      if (user.workspaceId != null) {
        errors.push(
          `PlatformOperator ${user.email} has workspaceId=${user.workspaceId} (must remain NULL)`,
        );
      }
      proposedWorkspaceAssignments.push({
        userId: user.id,
        email: user.email,
        action: "SKIP_PLATFORM",
        workspaceId: null,
        workspaceSlug: null,
        currentWorkspaceId: user.workspaceId,
        reasons: ["PlatformOperator — workspaceId must remain NULL"],
      });
      continue;
    }

    if (user.id === EXPECTED.omerUserId) {
      // Post–Phase 3: Houzzat consumer identity is already assigned — never revert to NULL.
      if (
        phase3.omerHouzzatOk &&
        phase3.omerRemaxTwinId &&
        user.workspaceId === EXPECTED.workspaces.houzzat
      ) {
        proposedWorkspaceAssignments.push({
          userId: user.id,
          email: user.email,
          action: "PHASE3_COMPLETE_NOOP",
          workspaceId: EXPECTED.workspaces.houzzat,
          workspaceSlug: slugById.get(EXPECTED.workspaces.houzzat) ?? "houzzat",
          currentWorkspaceId: user.workspaceId,
          reasons: [
            "Phase 3 complete — Omer Houzzat consumer identity; do not move to NULL",
            `RE/MAX twin already exists: ${phase3.omerRemaxTwinId}`,
          ],
        });
        continue;
      }
      if (user.workspaceId != null) {
        errors.push(
          `Omer ${user.email} has workspaceId=${user.workspaceId} (must remain NULL until Phase 3 split)`,
        );
      }
      proposedWorkspaceAssignments.push({
        userId: user.id,
        email: user.email,
        action: "PENDING_PHASE3_SPLIT",
        workspaceId: null,
        workspaceSlug: null,
        currentWorkspaceId: user.workspaceId,
        reasons: [
          "workspaceId stays NULL until Phase 3 — cannot assign Houzzat while RE/MAX staff FKs remain on this User",
          "RE/MAX staff clone PENDING_PHASE3_SPLIT — cannot create same-email User while global unique remains",
        ],
      });
      continue;
    }

    // Post–Phase 3 RE/MAX Omer twin — never merge/delete/reassign back to Houzzat/NULL.
    if (
      phase3.omerRemaxTwinId &&
      user.id === phase3.omerRemaxTwinId &&
      user.workspaceId === EXPECTED.workspaces.remax
    ) {
      proposedWorkspaceAssignments.push({
        userId: user.id,
        email: user.email,
        action: "PHASE3_COMPLETE_NOOP",
        workspaceId: EXPECTED.workspaces.remax,
        workspaceSlug: slugById.get(EXPECTED.workspaces.remax) ?? "re-max-realty",
        currentWorkspaceId: user.workspaceId,
        reasons: [
          "Phase 3 complete — Omer RE/MAX staff identity; do not merge with Houzzat consumer",
        ],
      });
      continue;
    }

    // Post–Phase 3 Houzzat staff twin for platform email — never move onto PlatformOperator.
    if (
      phase3.houzzatStaffTwinId &&
      user.id === phase3.houzzatStaffTwinId &&
      user.workspaceId === EXPECTED.workspaces.houzzat
    ) {
      proposedWorkspaceAssignments.push({
        userId: user.id,
        email: user.email,
        action: "PHASE3_COMPLETE_NOOP",
        workspaceId: EXPECTED.workspaces.houzzat,
        workspaceSlug: slugById.get(EXPECTED.workspaces.houzzat) ?? "houzzat",
        currentWorkspaceId: user.workspaceId,
        reasons: [
          "Phase 3 complete — Houzzat staff identity for platform email; do not merge onto PlatformOperator NULL User",
        ],
      });
      continue;
    }

    const edge = byUser.get(user.id);
    const wids = edge ? [...edge.wids] : [];

    // If user's only Maria link is contaminated customer Lead(s), drop Maria from ownership set.
    const mariaCustomerLeads = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Lead"
      WHERE "customerId" = ${user.id}
        AND "workspaceId" = ${EXPECTED.workspaces.maria}
    `;
    const contamIds = new Set(
      EXPECTED.mariaContaminationLeads.map((row) => row.id as string),
    );
    const nonContamMaria = mariaCustomerLeads.filter(
      (row) => !contamIds.has(row.id),
    );
    const hasMariaStaff = (edge?.reasons ?? []).some(
      (r) =>
        r.includes(EXPECTED.workspaces.maria) &&
        (r.startsWith("WorkspaceMember:") ||
          r.startsWith("Lead.assignedAgent") ||
          r.startsWith("Workspace.")),
    );
    const effectiveWids = wids.filter((wid) => {
      if (wid !== EXPECTED.workspaces.maria) return true;
      return nonContamMaria.length > 0 || hasMariaStaff;
    });

    if (effectiveWids.length === 0) {
      if (user.workspaceId != null) {
        errors.push(
          `Orphan ${user.email} has unexpected workspaceId=${user.workspaceId}`,
        );
      }
      proposedWorkspaceAssignments.push({
        userId: user.id,
        email: user.email,
        action: "SKIP_ORPHAN",
        workspaceId: null,
        workspaceSlug: null,
        currentWorkspaceId: user.workspaceId,
        reasons: [
          "No determinable workspace relationship — manual classification required",
        ],
      });
      skippedOrphans.push({
        userId: user.id,
        email: user.email,
        role: user.role,
        recommendation:
          user.role === "AGENT"
            ? "STAFF_ORPHAN_NEED_MANUAL_APPROVAL"
            : "QUARANTINE",
      });
      continue;
    }

    if (effectiveWids.length > 1) {
      proposedWorkspaceAssignments.push({
        userId: user.id,
        email: user.email,
        action: "MULTI_WORKSPACE_REQUIRES_SPLIT",
        workspaceId: null,
        workspaceSlug: null,
        currentWorkspaceId: user.workspaceId,
        reasons: effectiveWids.map(
          (wid) =>
            `${slugById.get(wid) ?? wid}: ${(edge?.reasons ?? [])
              .filter((r) => r.includes(wid))
              .join(", ")}`,
        ),
      });
      continue;
    }

    const only = effectiveWids[0]!;
    const reasons = (edge?.reasons ?? []).filter((r) => r.includes(only));
    if (user.workspaceId === only) {
      proposedWorkspaceAssignments.push({
        userId: user.id,
        email: user.email,
        action: "ALREADY_ASSIGNED",
        workspaceId: only,
        workspaceSlug: slugById.get(only) ?? null,
        currentWorkspaceId: user.workspaceId,
        reasons: [
          `Already correctly assigned to ${slugById.get(only) ?? only}`,
          ...reasons,
        ],
      });
      continue;
    }
    if (user.workspaceId != null) {
      errors.push(
        `User ${user.email} (${user.id}) has workspaceId=${user.workspaceId} but deterministic home is ${only} — topology drift`,
      );
      applyBlockedReasons.push("WORKSPACE_ID_DRIFT");
      continue;
    }
    proposedWorkspaceAssignments.push({
      userId: user.id,
      email: user.email,
      action: "ASSIGN",
      workspaceId: only,
      workspaceSlug: slugById.get(only) ?? null,
      currentWorkspaceId: user.workspaceId,
      reasons,
    });
  }

  // Deduplicate skipped orphans to audited 11 when present
  const skippedOrphansUnique = new Map(
    skippedOrphans.map((row) => [row.userId, row]),
  );

  // Audited orphan IDs should appear in SKIP_ORPHAN; warn if missing from live topology.
  for (const orphanId of ORPHAN_USER_IDS) {
    if (!skippedOrphansUnique.has(orphanId)) {
      warnings.push(
        `Audited orphan ${orphanId} not present in SKIP_ORPHAN set (topology may have changed)`,
      );
    }
  }

  const fkPreview = await planOmerRemaxFkPreview(prisma);
  const contamLeadIdsFound = mariaContamination
    .filter((row) => row.status === "FOUND")
    .map((row) => row.expectedId);

  const deleteStatus =
    contamLeadIdsFound.length === 0 ? "ALREADY_CLEAN" : "PLAN";

  const afterMariaLeads = Math.max(
    0,
    counts.mariaLeads - contamLeadIdsFound.length,
  );
  const afterConversations =
    counts.conversations - deps.reduce((n, d) => n + d.conversations, 0);
  const afterActivities =
    counts.leadActivities - deps.reduce((n, d) => n + d.leadActivities, 0);

  if (errors.length > 0) {
    applyBlockedReasons.push("PREFLIGHT_ERRORS");
  }

  // Security: unexpected Maria leads beyond the two contamination IDs
  const otherMaria = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Lead"
    WHERE "workspaceId" = ${EXPECTED.workspaces.maria}
      AND id NOT IN (
        ${EXPECTED.mariaContaminationLeads[0].id},
        ${EXPECTED.mariaContaminationLeads[1].id}
      )
  `;
  if (otherMaria.length > 0) {
    errors.push(
      `Unexpected Maria Lead(s) beyond contamination set: ${otherMaria.map((r) => r.id).join(", ")}`,
    );
    applyBlockedReasons.push("UNEXPECTED_MARIA_LEADS");
  }

  let report: Phase2Report = {
    timestamp: new Date().toISOString(),
    mode,
    writeFlags: {
      apply: flags.apply,
      understandProduction: flags.understand,
    },
    phase1ColumnsPresent: {
      userWorkspaceId: userWsCol,
      accountWorkspaceId: accountWsCol,
    },
    preflight: {
      ok: errors.length === 0,
      errors,
      warnings,
      workspaces: wsEntries,
      omer: {
        id: EXPECTED.omerUserId,
        email: omer?.email ?? null,
        role: omer?.role ?? null,
        found: Boolean(omer),
      },
      mariaContamination,
    },
    topologyCounts: counts,
    proposedDeletes: {
      status: deleteStatus,
      leadIds: contamLeadIdsFound,
      explicit,
      cascadeEstimates: deps,
      setNullAssert,
    },
    proposedWorkspaceAssignments,
    skippedOrphans: [...skippedOrphansUnique.values()].sort((a, b) =>
      a.email.localeCompare(b.email),
    ),
    skippedPlatformUsers: platformOps.map((row) => ({
      userId: row.userId,
      email: row.email,
    })),
    pendingOmerRemaxSplit: phase3.complete
      ? {
          status: "ALREADY_SPLIT" as const,
          reason:
            "Phase 3 Omer Houzzat/RE/MAX split is complete. Phase 2 must not reverse or re-plan it.",
          oldUserId: EXPECTED.omerUserId,
          houzzatWorkspaceId: EXPECTED.workspaces.houzzat,
          remaxWorkspaceId: EXPECTED.workspaces.remax,
          remaxUserId: phase3.omerRemaxTwinId ?? EXPECTED.omerRemaxUserId,
          keepOnHouzzatUser: [
            "Lead.customer cmsgv826x0008psp7jzcfjk3j + conversation/activity/appointments",
            "SavedListing / SavedSearch / ListingNote / ListingView / PropertyMonitor",
            "PushDevice / ConsentEvent / ActivityEvent / SiteVisitor",
            "Consumer password + VOW/CASL + alert preferences",
            "workspaceId = Houzzat (final)",
          ],
          moveToRemaxUserWhenAllowed: [],
          createOnRemaxUser: [],
          fkPreview: { alreadyMoved: true },
        }
      : {
          status: "PENDING_PHASE3_SPLIT" as const,
          reason:
            "User.email remains globally unique until Phase 3. Do not create a second omsyed88@gmail.com User and do not use a staged/fake email.",
          oldUserId: EXPECTED.omerUserId,
          houzzatWorkspaceId: EXPECTED.workspaces.houzzat,
          remaxWorkspaceId: EXPECTED.workspaces.remax,
          keepOnHouzzatUser: [
            "Lead.customer cmsgv826x0008psp7jzcfjk3j + conversation/activity/appointments",
            "SavedListing / SavedSearch / ListingNote / ListingView / PropertyMonitor",
            "PushDevice / ConsentEvent / ActivityEvent / SiteVisitor",
            "Consumer password + VOW/CASL + alert preferences",
            "workspaceId remains NULL until Phase 3 split (then Houzzat home)",
          ],
          moveToRemaxUserWhenAllowed: [
            "WorkspaceMember OWNER on RE/MAX",
            "Workspace.billingOwnerUserId on RE/MAX",
            "Lead.assignedAgentId on RE/MAX leads",
            "RE/MAX-scoped AgentTask / Message.sender / Appointment.agent / LeadNote.author",
          ],
          createOnRemaxUser: [
            "AgentProfile (new row; none on Omer today)",
            "Independent staff role/preferences (no consumer history copy)",
          ],
          fkPreview,
        },
    pendingPlatformStaffSplit: phase3.complete
      ? {
          status: "ALREADY_SPLIT" as const,
          platformUserId: EXPECTED.platformUserId,
          email: EXPECTED.platformEmail,
          houzzatStaffUserId:
            phase3.houzzatStaffTwinId ?? EXPECTED.platformHouzzatStaffUserId,
          note: "Phase 3 PlatformOperator / Houzzat staff split is complete. Platform User stays NULL; Houzzat staff User is separate. Phase 2 must not reverse.",
        }
      : {
          status: "PENDING_PLATFORM_STAFF_SPLIT" as const,
          platformUserId: platformOps[0]?.userId ?? EXPECTED.platformUserId,
          email: platformOps[0]?.email ?? EXPECTED.platformEmail,
          note: "Keep PlatformOperator User workspaceId=NULL. Houzzat WorkspaceMember/primaryAgent/assigned Leads require a separate Houzzat staff User under an explicit future flag — not part of default Phase 2 apply.",
        },
    toolingStatus: phase3.complete
      ? ("PHASE3_COMPLETE_OBSOLETE_FOR_APPLY" as const)
      : ("PHASE2_ACTIVE" as const),
    expectedBeforeAfter: {
      users: {
        before: counts.users,
        after: counts.users,
        note: phase3.complete
          ? "Phase 3 closed — no further User creates/deletes from Phase 2"
          : "No User create until Phase 3 Omer split; Maria cleanup deletes Leads only",
      },
      mariaLeads: {
        before: counts.mariaLeads,
        after: afterMariaLeads,
      },
      houzzatLeads: {
        before: counts.houzzatLeads,
        after: counts.houzzatLeads,
      },
      remaxLeads: {
        before: counts.remaxLeads,
        after: counts.remaxLeads,
      },
      workspaceMembers: {
        before: counts.workspaceMembers,
        after: counts.workspaceMembers,
        note: phase3.complete
          ? "Phase 3 closed — membership topology frozen for Phase 2"
          : "Omer RE/MAX membership repoint deferred to Phase 3",
      },
      conversations: {
        before: counts.conversations,
        after: afterConversations,
      },
      leadActivities: {
        before: counts.leadActivities,
        after: afterActivities,
      },
    },
    applyBlockedReasons: [...new Set(applyBlockedReasons)],
  };

  // Safety: never propose ASSIGN/deletes that reverse Phase 3 once complete.
  if (phase3.complete) {
    const dangerous = report.proposedWorkspaceAssignments.filter(
      (row) =>
        row.action === "ASSIGN" ||
        row.action === "PENDING_PHASE3_SPLIT" ||
        row.action === "MULTI_WORKSPACE_REQUIRES_SPLIT",
    );
    if (dangerous.length > 0) {
      report.preflight.errors.push(
        `Phase 3 complete but Phase 2 still proposed mutating actions: ${dangerous
          .map((d) => `${d.email}:${d.action}`)
          .join(", ")}`,
      );
      report.preflight.ok = false;
      report.applyBlockedReasons.push("PHASE3_COMPLETE_MUTATION_PROPOSED");
    }
    if (report.proposedDeletes.status === "PLAN") {
      report.preflight.errors.push(
        "Phase 3 complete but Phase 2 still proposed Maria Lead deletes",
      );
      report.preflight.ok = false;
    }
  }

  return report;
}

/**
 * Future apply path — only reachable when both write flags are set.
 * Currently refuses unless Phase 1 exists and preflight is clean.
 *
 * Writes:
 *   - Maria contamination Lead deletes (if still FOUND)
 *   - ASSIGN rows only (WHERE workspaceId IS NULL); exact count enforced
 *
 * Never writes:
 *   - Omer (PENDING_PHASE3_SPLIT)
 *   - PlatformOperator
 *   - Orphans
 *   - ALREADY_ASSIGNED rows
 */
async function applyPhase2(
  prisma: PrismaLike,
  report: Phase2Report,
): Promise<{ assigned: number; deletedLeads: number }> {
  if (report.mode !== "APPLY") {
    fail("applyPhase2 called without APPLY mode");
  }
  if (report.applyBlockedReasons.length > 0) {
    fail(`Apply blocked: ${report.applyBlockedReasons.join(", ")}`);
  }
  if (!report.preflight.ok) {
    fail(`Preflight failed: ${report.preflight.errors.join("; ")}`);
  }
  if (report.toolingStatus === "PHASE3_COMPLETE_OBSOLETE_FOR_APPLY") {
    fail(
      "Phase 3 identity cutover is complete. Phase 2 apply is obsolete and refuses all writes.",
    );
  }
  if (!report.phase1ColumnsPresent.userWorkspaceId) {
    fail("Phase 1 User.workspaceId missing — refuse apply");
  }

  const assignRows = report.proposedWorkspaceAssignments.filter(
    (row) => row.action === "ASSIGN" && row.workspaceId,
  );
  const expectedAssign = assignRows.length;

  return prisma.$transaction(async (tx) => {
    let deletedLeads = 0;

    // Maria cleanup — skip when ALREADY_CLEAN; do NOT early-return (assignments still run).
    if (report.proposedDeletes.status !== "ALREADY_CLEAN") {
      for (const leadId of report.proposedDeletes.leadIds) {
        await tx.$executeRaw`
          DELETE FROM "SmsAutomationDispatch" WHERE "leadId" = ${leadId}
        `;
        const deleted = await tx.$executeRaw`
          DELETE FROM "Lead"
          WHERE id = ${leadId}
            AND "workspaceId" = ${EXPECTED.workspaces.maria}
        `;
        if (deleted !== 1) {
          fail(`Expected to delete Maria lead ${leadId}, deleted=${deleted}`);
        }
        deletedLeads += 1;
      }
    }

    let assigned = 0;
    for (const row of assignRows) {
      if (row.userId === EXPECTED.omerUserId) {
        fail("Refuse to ASSIGN Omer — PENDING_PHASE3_SPLIT");
      }
      if (!row.workspaceId) continue;
      const updated = await tx.$executeRaw`
        UPDATE "User"
        SET "workspaceId" = ${row.workspaceId}
        WHERE id = ${row.userId}
          AND "workspaceId" IS NULL
      `;
      if (updated !== 1) {
        fail(
          `Expected 1 update for ${row.userId} (${row.email}), got ${updated}`,
        );
      }
      assigned += 1;
    }

    if (assigned !== expectedAssign) {
      fail(
        `ASSIGN count mismatch: expected ${expectedAssign}, updated ${assigned} — rolling back`,
      );
    }

    return { assigned, deletedLeads };
  });
}

function writeReport(report: Phase2Report) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = report.timestamp.replace(/[:.]/g, "-");
  const path = join(REPORT_DIR, `phase2-${report.mode.toLowerCase()}-${stamp}.json`);
  const body = JSON.stringify(report, null, 2);
  writeFileSync(path, body, "utf8");
  const digest = createHash("sha256").update(body).digest("hex").slice(0, 16);
  return { path, digest };
}

function printSummary(report: Phase2Report, artifact: { path: string; digest: string }) {
  console.log("\n=== identity-phase2 ===");
  console.log(`mode=${report.mode}`);
  console.log(
    `writesEnabled=${report.writeFlags.apply && report.writeFlags.understandProduction}`,
  );
  console.log(
    `phase1 columns: User.workspaceId=${report.phase1ColumnsPresent.userWorkspaceId} Account.workspaceId=${report.phase1ColumnsPresent.accountWorkspaceId}`,
  );
  console.log(`preflight.ok=${report.preflight.ok}`);
  if (report.preflight.errors.length) {
    console.log("preflight.errors:");
    for (const err of report.preflight.errors) console.log(`  - ${err}`);
  }
  if (report.preflight.warnings.length) {
    console.log("preflight.warnings:");
    for (const warn of report.preflight.warnings) console.log(`  - ${warn}`);
  }
  console.log("topologyCounts:", report.topologyCounts);
  console.log(
    `mariaCleanup=${report.proposedDeletes.status} leads=${report.proposedDeletes.leadIds.join(",") || "(none)"}`,
  );
  console.log(
    `setNullAssert ok=${report.proposedDeletes.setNullAssert.ok}`,
    report.proposedDeletes.setNullAssert,
  );
  const byAction = report.proposedWorkspaceAssignments.reduce(
    (acc, row) => {
      acc[row.action] = (acc[row.action] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  console.log("assignmentActions:", byAction);
  console.log(
    `skippedOrphans=${report.skippedOrphans.length} skippedPlatform=${report.skippedPlatformUsers.length}`,
  );
  console.log("pendingOmerRemaxSplit:", report.pendingOmerRemaxSplit.status);
  console.log(
    "pendingPlatformStaffSplit:",
    report.pendingPlatformStaffSplit.status,
  );
  console.log("toolingStatus:", report.toolingStatus);
  console.log("expectedBeforeAfter:", report.expectedBeforeAfter);
  if (report.applyBlockedReasons.length) {
    console.log("applyBlockedReasons:", report.applyBlockedReasons);
  }
  console.log(`report=${artifact.path}`);
  console.log(`reportSha256_16=${artifact.digest}`);
  console.log("=== end ===\n");
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.apply && !flags.understand) {
    fail(
      "Refusing writes: --apply requires --i-understand-production. No writes performed.",
    );
  }
  if (flags.understand && !flags.apply) {
    console.warn(
      "[identity-phase2] --i-understand-production without --apply is ignored (still DRY-RUN).",
    );
  }

  const { prisma } = (await import("../src/lib/prisma")) as {
    prisma: PrismaLike;
  };

  try {
    const report = await buildReport(prisma, flags.mode, {
      apply: flags.apply,
      understand: flags.understand,
    });
    const artifact = writeReport(report);
    printSummary(report, artifact);

    if (flags.writesEnabled) {
      console.error(
        "[identity-phase2] APPLY requested — executing transactional writes…",
      );
      const result = await applyPhase2(prisma, report);
      console.log(
        `[identity-phase2] APPLY completed. assigned=${result.assigned} deletedLeads=${result.deletedLeads}`,
      );
    } else {
      console.log(
        "[identity-phase2] DRY-RUN complete. Zero database writes. No User/Lead mutations.",
      );
    }

    if (!report.preflight.ok && flags.writesEnabled) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
