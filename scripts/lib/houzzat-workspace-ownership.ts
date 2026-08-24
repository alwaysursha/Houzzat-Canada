/**
 * Stage 3C — Houzzat core CRM workspace ownership backfill helpers.
 * Data-only; runtime remains organizationId-authoritative.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  EXPECTED_LEAD_COUNT,
  HOUZZAT_WORKSPACE_SLUG,
  LEGACY_CRM_ORGANIZATION_SLUG,
} from "./houzzat-workspace-provisioning";

export {
  EXPECTED_LEAD_COUNT,
} from "./houzzat-workspace-provisioning";

export const EXPECTED_TASK_COUNT = 25;
export const EXPECTED_NOTE_COUNT = 4;
export const EXPECTED_EMAIL_LOG_COUNT = 76;

export type OwnershipIds = {
  demoAgentOrgId: string;
  houzzatWorkspaceId: string;
};

export type OwnershipCounts = {
  total: number;
  workspaceNull: number;
  workspaceHouzzat: number;
  workspaceOther: number;
};

export type BackfillPlan = {
  ids: OwnershipIds;
  leads: { toUpdate: number; alreadyCorrect: number; mismatch: number };
  tasks: { toUpdate: number; alreadyCorrect: number; mismatch: number };
  notes: { toUpdate: number; alreadyCorrect: number; mismatch: number };
  emailLogs: { toUpdate: number; alreadyCorrect: number; mismatch: number };
  audits: {
    leadsNotDemoAgent: number;
    taskOrgNeLead: number;
    noteOrgNeLead: number;
    emailOrgNeLead: number;
    danglingTaskLead: number;
    danglingNoteLead: number;
    danglingEmailLead: number;
    wrongOrgWorkspacePair: number;
  };
};

function prefix(id: string): string {
  return id.slice(0, 8);
}

export async function resolveOwnershipIds(
  prisma: PrismaClient,
): Promise<OwnershipIds> {
  const [demoAgentOrg, houzzatWorkspace] = await Promise.all([
    prisma.organization.findUnique({
      where: { slug: LEGACY_CRM_ORGANIZATION_SLUG },
      select: { id: true },
    }),
    prisma.workspace.findUnique({
      where: { slug: HOUZZAT_WORKSPACE_SLUG },
      select: { id: true, status: true, primaryAgentId: true },
    }),
  ]);

  if (!demoAgentOrg) {
    throw new Error(`Legacy organization "${LEGACY_CRM_ORGANIZATION_SLUG}" not found`);
  }
  if (!houzzatWorkspace) {
    throw new Error(`Workspace "${HOUZZAT_WORKSPACE_SLUG}" not found`);
  }
  if (houzzatWorkspace.status !== "ACTIVE") {
    throw new Error(`Workspace "${HOUZZAT_WORKSPACE_SLUG}" is not ACTIVE`);
  }
  if (!houzzatWorkspace.primaryAgentId) {
    throw new Error(`Workspace "${HOUZZAT_WORKSPACE_SLUG}" missing primaryAgentId`);
  }

  const primaryMember = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: houzzatWorkspace.id,
        userId: houzzatWorkspace.primaryAgentId,
      },
    },
    select: { status: true, role: true },
  });
  if (!primaryMember || primaryMember.status !== "ACTIVE") {
    throw new Error("Primary agent is not an ACTIVE Houzzat WorkspaceMember");
  }

  return {
    demoAgentOrgId: demoAgentOrg.id,
    houzzatWorkspaceId: houzzatWorkspace.id,
  };
}

export async function countOwnership(
  prisma: PrismaClient,
  ids: OwnershipIds,
  model: "lead" | "agentTask" | "leadNote" | "leadEmailLog",
): Promise<OwnershipCounts> {
  const whereBase = model === "lead" ? {} : {};
  void whereBase;

  switch (model) {
    case "lead": {
      const [total, workspaceNull, workspaceHouzzat, workspaceOther] =
        await Promise.all([
          prisma.lead.count(),
          prisma.lead.count({ where: { workspaceId: null } }),
          prisma.lead.count({
            where: { workspaceId: ids.houzzatWorkspaceId },
          }),
          prisma.lead.count({
            where: {
              workspaceId: { not: null },
              NOT: { workspaceId: ids.houzzatWorkspaceId },
            },
          }),
        ]);
      return { total, workspaceNull, workspaceHouzzat, workspaceOther };
    }
    case "agentTask": {
      const [total, workspaceNull, workspaceHouzzat, workspaceOther] =
        await Promise.all([
          prisma.agentTask.count(),
          prisma.agentTask.count({ where: { workspaceId: null } }),
          prisma.agentTask.count({
            where: { workspaceId: ids.houzzatWorkspaceId },
          }),
          prisma.agentTask.count({
            where: {
              workspaceId: { not: null },
              NOT: { workspaceId: ids.houzzatWorkspaceId },
            },
          }),
        ]);
      return { total, workspaceNull, workspaceHouzzat, workspaceOther };
    }
    case "leadNote": {
      const [total, workspaceNull, workspaceHouzzat, workspaceOther] =
        await Promise.all([
          prisma.leadNote.count(),
          prisma.leadNote.count({ where: { workspaceId: null } }),
          prisma.leadNote.count({
            where: { workspaceId: ids.houzzatWorkspaceId },
          }),
          prisma.leadNote.count({
            where: {
              workspaceId: { not: null },
              NOT: { workspaceId: ids.houzzatWorkspaceId },
            },
          }),
        ]);
      return { total, workspaceNull, workspaceHouzzat, workspaceOther };
    }
    case "leadEmailLog": {
      const [total, workspaceNull, workspaceHouzzat, workspaceOther] =
        await Promise.all([
          prisma.leadEmailLog.count(),
          prisma.leadEmailLog.count({ where: { workspaceId: null } }),
          prisma.leadEmailLog.count({
            where: { workspaceId: ids.houzzatWorkspaceId },
          }),
          prisma.leadEmailLog.count({
            where: {
              workspaceId: { not: null },
              NOT: { workspaceId: ids.houzzatWorkspaceId },
            },
          }),
        ]);
      return { total, workspaceNull, workspaceHouzzat, workspaceOther };
    }
    default: {
      const _exhaustive: never = model;
      throw new Error(`Unknown model: ${_exhaustive}`);
    }
  }
}

export async function buildBackfillPlan(
  prisma: PrismaClient,
): Promise<BackfillPlan> {
  const ids = await resolveOwnershipIds(prisma);

  const [
    leadCounts,
    taskCounts,
    noteCounts,
    emailCounts,
    leadsNotDemoAgent,
    taskOrgNeLead,
    noteOrgNeLead,
    emailOrgNeLead,
    danglingTaskLead,
    danglingNoteLead,
    danglingEmailLead,
    wrongOrgWorkspacePair,
    leadsToUpdate,
    leadsAlreadyCorrect,
    leadMismatch,
    tasksToUpdate,
    tasksAlreadyCorrect,
    taskMismatch,
    notesToUpdate,
    notesAlreadyCorrect,
    noteMismatch,
    emailsToUpdate,
    emailsAlreadyCorrect,
    emailMismatch,
  ] = await Promise.all([
    countOwnership(prisma, ids, "lead"),
    countOwnership(prisma, ids, "agentTask"),
    countOwnership(prisma, ids, "leadNote"),
    countOwnership(prisma, ids, "leadEmailLog"),
    prisma.lead.count({
      where: { NOT: { organizationId: ids.demoAgentOrgId } },
    }),
    prisma.$queryRaw<[{ count: bigint }]>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "AgentTask" t
        JOIN "Lead" l ON l.id = t."leadId"
        WHERE t."organizationId" <> l."organizationId"
      `,
    ).then((rows) => Number(rows[0]?.count ?? 0)),
    prisma.$queryRaw<[{ count: bigint }]>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "LeadNote" n
        JOIN "Lead" l ON l.id = n."leadId"
        WHERE n."organizationId" <> l."organizationId"
      `,
    ).then((rows) => Number(rows[0]?.count ?? 0)),
    prisma.$queryRaw<[{ count: bigint }]>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "LeadEmailLog" e
        JOIN "Lead" l ON l.id = e."leadId"
        WHERE e."organizationId" <> l."organizationId"
      `,
    ).then((rows) => Number(rows[0]?.count ?? 0)),
    prisma.agentTask.count({ where: { leadId: null } }),
    prisma.$queryRaw<[{ count: bigint }]>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "LeadNote" n
        LEFT JOIN "Lead" l ON l.id = n."leadId"
        WHERE l.id IS NULL
      `,
    ).then((rows) => Number(rows[0]?.count ?? 0)),
    prisma.$queryRaw<[{ count: bigint }]>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "LeadEmailLog" e
        LEFT JOIN "Lead" l ON l.id = e."leadId"
        WHERE l.id IS NULL
      `,
    ).then((rows) => Number(rows[0]?.count ?? 0)),
    prisma.$queryRaw<[{ count: bigint }]>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count FROM (
          SELECT id FROM "Lead"
          WHERE ("organizationId" = ${ids.demoAgentOrgId} AND "workspaceId" IS NOT NULL AND "workspaceId" <> ${ids.houzzatWorkspaceId})
             OR ("organizationId" <> ${ids.demoAgentOrgId} AND "workspaceId" = ${ids.houzzatWorkspaceId})
          UNION ALL
          SELECT id FROM "AgentTask"
          WHERE ("organizationId" = ${ids.demoAgentOrgId} AND "workspaceId" IS NOT NULL AND "workspaceId" <> ${ids.houzzatWorkspaceId})
             OR ("organizationId" <> ${ids.demoAgentOrgId} AND "workspaceId" = ${ids.houzzatWorkspaceId})
          UNION ALL
          SELECT id FROM "LeadNote"
          WHERE ("organizationId" = ${ids.demoAgentOrgId} AND "workspaceId" IS NOT NULL AND "workspaceId" <> ${ids.houzzatWorkspaceId})
             OR ("organizationId" <> ${ids.demoAgentOrgId} AND "workspaceId" = ${ids.houzzatWorkspaceId})
          UNION ALL
          SELECT id FROM "LeadEmailLog"
          WHERE ("organizationId" = ${ids.demoAgentOrgId} AND "workspaceId" IS NOT NULL AND "workspaceId" <> ${ids.houzzatWorkspaceId})
             OR ("organizationId" <> ${ids.demoAgentOrgId} AND "workspaceId" = ${ids.houzzatWorkspaceId})
        ) x
      `,
    ).then((rows) => Number(rows[0]?.count ?? 0)),
    prisma.lead.count({
      where: {
        organizationId: ids.demoAgentOrgId,
        workspaceId: null,
      },
    }),
    prisma.lead.count({
      where: {
        organizationId: ids.demoAgentOrgId,
        workspaceId: ids.houzzatWorkspaceId,
      },
    }),
    prisma.lead.count({
      where: {
        organizationId: ids.demoAgentOrgId,
        workspaceId: { not: null },
        NOT: { workspaceId: ids.houzzatWorkspaceId },
      },
    }),
    prisma.agentTask.count({
      where: {
        organizationId: ids.demoAgentOrgId,
        workspaceId: null,
        lead: { organizationId: ids.demoAgentOrgId },
      },
    }),
    prisma.agentTask.count({
      where: {
        organizationId: ids.demoAgentOrgId,
        workspaceId: ids.houzzatWorkspaceId,
      },
    }),
    prisma.agentTask.count({
      where: {
        organizationId: ids.demoAgentOrgId,
        workspaceId: { not: null },
        NOT: { workspaceId: ids.houzzatWorkspaceId },
      },
    }),
    prisma.leadNote.count({
      where: {
        organizationId: ids.demoAgentOrgId,
        workspaceId: null,
        lead: { organizationId: ids.demoAgentOrgId },
      },
    }),
    prisma.leadNote.count({
      where: {
        organizationId: ids.demoAgentOrgId,
        workspaceId: ids.houzzatWorkspaceId,
      },
    }),
    prisma.leadNote.count({
      where: {
        organizationId: ids.demoAgentOrgId,
        workspaceId: { not: null },
        NOT: { workspaceId: ids.houzzatWorkspaceId },
      },
    }),
    prisma.leadEmailLog.count({
      where: {
        organizationId: ids.demoAgentOrgId,
        workspaceId: null,
        lead: { organizationId: ids.demoAgentOrgId },
      },
    }),
    prisma.leadEmailLog.count({
      where: {
        organizationId: ids.demoAgentOrgId,
        workspaceId: ids.houzzatWorkspaceId,
      },
    }),
    prisma.leadEmailLog.count({
      where: {
        organizationId: ids.demoAgentOrgId,
        workspaceId: { not: null },
        NOT: { workspaceId: ids.houzzatWorkspaceId },
      },
    }),
  ]);

  void leadCounts;
  void taskCounts;
  void noteCounts;
  void emailCounts;

  return {
    ids,
    leads: {
      toUpdate: leadsToUpdate,
      alreadyCorrect: leadsAlreadyCorrect,
      mismatch: leadMismatch,
    },
    tasks: {
      toUpdate: tasksToUpdate,
      alreadyCorrect: tasksAlreadyCorrect,
      mismatch: taskMismatch,
    },
    notes: {
      toUpdate: notesToUpdate,
      alreadyCorrect: notesAlreadyCorrect,
      mismatch: noteMismatch,
    },
    emailLogs: {
      toUpdate: emailsToUpdate,
      alreadyCorrect: emailsAlreadyCorrect,
      mismatch: emailMismatch,
    },
    audits: {
      leadsNotDemoAgent,
      taskOrgNeLead,
      noteOrgNeLead,
      emailOrgNeLead,
      danglingTaskLead,
      danglingNoteLead,
      danglingEmailLead,
      wrongOrgWorkspacePair,
    },
  };
}

export function validateBackfillPreconditions(
  plan: BackfillPlan,
  counts: {
    lead: OwnershipCounts;
    task: OwnershipCounts;
    note: OwnershipCounts;
    email: OwnershipCounts;
  },
): string[] {
  const failures: string[] = [];

  if (counts.lead.total !== EXPECTED_LEAD_COUNT) {
    failures.push(`Lead total expected ${EXPECTED_LEAD_COUNT}, got ${counts.lead.total}`);
  }
  if (counts.task.total !== EXPECTED_TASK_COUNT) {
    failures.push(`AgentTask total expected ${EXPECTED_TASK_COUNT}, got ${counts.task.total}`);
  }
  if (counts.note.total !== EXPECTED_NOTE_COUNT) {
    failures.push(`LeadNote total expected ${EXPECTED_NOTE_COUNT}, got ${counts.note.total}`);
  }
  if (counts.email.total !== EXPECTED_EMAIL_LOG_COUNT) {
    failures.push(
      `LeadEmailLog total expected ${EXPECTED_EMAIL_LOG_COUNT}, got ${counts.email.total}`,
    );
  }

  if (plan.audits.leadsNotDemoAgent > 0) {
    failures.push(`${plan.audits.leadsNotDemoAgent} leads not in demo-agent org`);
  }
  if (plan.audits.taskOrgNeLead > 0) {
    failures.push(`${plan.audits.taskOrgNeLead} tasks with org != lead org`);
  }
  if (plan.audits.noteOrgNeLead > 0) {
    failures.push(`${plan.audits.noteOrgNeLead} notes with org != lead org`);
  }
  if (plan.audits.emailOrgNeLead > 0) {
    failures.push(`${plan.audits.emailOrgNeLead} email logs with org != lead org`);
  }
  if (plan.audits.danglingNoteLead > 0) {
    failures.push(`${plan.audits.danglingNoteLead} notes with dangling leadId`);
  }
  if (plan.audits.danglingEmailLead > 0) {
    failures.push(`${plan.audits.danglingEmailLead} email logs with dangling leadId`);
  }
  if (plan.leads.mismatch > 0 || plan.tasks.mismatch > 0 || plan.notes.mismatch > 0 || plan.emailLogs.mismatch > 0) {
    failures.push("Unexpected workspaceId values on demo-agent rows");
  }
  if (counts.lead.workspaceOther > 0 || counts.task.workspaceOther > 0 || counts.note.workspaceOther > 0 || counts.email.workspaceOther > 0) {
    failures.push("Rows assigned to non-Houzzat workspaceId");
  }
  if (plan.audits.wrongOrgWorkspacePair > 0) {
    failures.push(`${plan.audits.wrongOrgWorkspacePair} wrong org/workspace pairs`);
  }

  for (const [name, mismatch] of [
    ["lead", plan.leads.mismatch],
    ["task", plan.tasks.mismatch],
    ["note", plan.notes.mismatch],
    ["email", plan.emailLogs.mismatch],
  ] as const) {
    if (mismatch > 0) {
      failures.push(`${name} mismatch count ${mismatch}`);
    }
  }

  return failures;
}

export function sanitizeBackfillReport(plan: BackfillPlan, mode: string) {
  return {
    mode,
    demoAgentOrgIdPrefix: prefix(plan.ids.demoAgentOrgId),
    houzzatWorkspaceIdPrefix: prefix(plan.ids.houzzatWorkspaceId),
    leads: plan.leads,
    tasks: plan.tasks,
    notes: plan.notes,
    emailLogs: plan.emailLogs,
    audits: plan.audits,
    timestampPreservation:
      "Raw SQL UPDATE workspaceId only — updatedAt/createdAt untouched",
  };
}

async function assertCounts(
  prisma: PrismaClient,
  ids: OwnershipIds,
  expected: { leads: number; tasks: number; notes: number; emails: number },
) {
  const [leads, tasks, notes, emails] = await Promise.all([
    prisma.lead.count({
      where: {
        organizationId: ids.demoAgentOrgId,
        workspaceId: ids.houzzatWorkspaceId,
      },
    }),
    prisma.agentTask.count({
      where: {
        organizationId: ids.demoAgentOrgId,
        workspaceId: ids.houzzatWorkspaceId,
      },
    }),
    prisma.leadNote.count({
      where: {
        organizationId: ids.demoAgentOrgId,
        workspaceId: ids.houzzatWorkspaceId,
      },
    }),
    prisma.leadEmailLog.count({
      where: {
        organizationId: ids.demoAgentOrgId,
        workspaceId: ids.houzzatWorkspaceId,
      },
    }),
  ]);

  if (leads !== expected.leads) {
    throw new Error(`Lead backfill count ${leads} != ${expected.leads}`);
  }
  if (tasks !== expected.tasks) {
    throw new Error(`AgentTask backfill count ${tasks} != ${expected.tasks}`);
  }
  if (notes !== expected.notes) {
    throw new Error(`LeadNote backfill count ${notes} != ${expected.notes}`);
  }
  if (emails !== expected.emails) {
    throw new Error(`LeadEmailLog backfill count ${emails} != ${expected.emails}`);
  }
}

/**
 * Raw SQL updates preserve business timestamps (Prisma @updatedAt would bump rows).
 */
export async function applyHouzzatWorkspaceOwnershipBackfill(
  prisma: PrismaClient,
  plan: BackfillPlan,
): Promise<{ leads: number; tasks: number; notes: number; emailLogs: number }> {
  const { demoAgentOrgId, houzzatWorkspaceId } = plan.ids;

  if (
    plan.leads.toUpdate === 0 &&
    plan.tasks.toUpdate === 0 &&
    plan.notes.toUpdate === 0 &&
    plan.emailLogs.toUpdate === 0
  ) {
    await assertCounts(prisma, plan.ids, {
      leads: EXPECTED_LEAD_COUNT,
      tasks: EXPECTED_TASK_COUNT,
      notes: EXPECTED_NOTE_COUNT,
      emails: EXPECTED_EMAIL_LOG_COUNT,
    });
    return { leads: 0, tasks: 0, notes: 0, emailLogs: 0 };
  }

  return prisma.$transaction(async (tx) => {
    const leadResult =
      plan.leads.toUpdate > 0
        ? await tx.$executeRaw`
            UPDATE "Lead"
            SET "workspaceId" = ${houzzatWorkspaceId}
            WHERE "organizationId" = ${demoAgentOrgId}
              AND "workspaceId" IS NULL
          `
        : 0;

    if (plan.leads.toUpdate > 0) {
      const leadBackfilled = await tx.lead.count({
        where: {
          organizationId: demoAgentOrgId,
          workspaceId: houzzatWorkspaceId,
        },
      });
      if (leadBackfilled !== EXPECTED_LEAD_COUNT) {
        throw new Error(`Lead backfill expected ${EXPECTED_LEAD_COUNT}, got ${leadBackfilled}`);
      }
    }

    const taskResult =
      plan.tasks.toUpdate > 0 || plan.tasks.alreadyCorrect < EXPECTED_TASK_COUNT
        ? await tx.$executeRaw`
            UPDATE "AgentTask" t
            SET "workspaceId" = ${houzzatWorkspaceId}
            FROM "Lead" l
            WHERE t."leadId" = l.id
              AND t."organizationId" = ${demoAgentOrgId}
              AND l."organizationId" = ${demoAgentOrgId}
              AND l."workspaceId" = ${houzzatWorkspaceId}
              AND t."workspaceId" IS NULL
          `
        : 0;

    const noteResult =
      plan.notes.toUpdate > 0 || plan.notes.alreadyCorrect < EXPECTED_NOTE_COUNT
        ? await tx.$executeRaw`
            UPDATE "LeadNote" n
            SET "workspaceId" = ${houzzatWorkspaceId}
            FROM "Lead" l
            WHERE n."leadId" = l.id
              AND n."organizationId" = ${demoAgentOrgId}
              AND l."organizationId" = ${demoAgentOrgId}
              AND l."workspaceId" = ${houzzatWorkspaceId}
              AND n."workspaceId" IS NULL
          `
        : 0;

    const emailResult =
      plan.emailLogs.toUpdate > 0 ||
      plan.emailLogs.alreadyCorrect < EXPECTED_EMAIL_LOG_COUNT
        ? await tx.$executeRaw`
            UPDATE "LeadEmailLog" e
            SET "workspaceId" = ${houzzatWorkspaceId}
            FROM "Lead" l
            WHERE e."leadId" = l.id
              AND e."organizationId" = ${demoAgentOrgId}
              AND l."organizationId" = ${demoAgentOrgId}
              AND l."workspaceId" = ${houzzatWorkspaceId}
              AND e."workspaceId" IS NULL
          `
        : 0;

    await assertCounts(tx as PrismaClient, plan.ids, {
      leads: EXPECTED_LEAD_COUNT,
      tasks: EXPECTED_TASK_COUNT,
      notes: EXPECTED_NOTE_COUNT,
      emails: EXPECTED_EMAIL_LOG_COUNT,
    });

    const nullCounts = await Promise.all([
      tx.lead.count({ where: { workspaceId: null } }),
      tx.agentTask.count({ where: { workspaceId: null } }),
      tx.leadNote.count({ where: { workspaceId: null } }),
      tx.leadEmailLog.count({ where: { workspaceId: null } }),
    ]);
    if (nullCounts.some((n) => n > 0)) {
      throw new Error(
        `Backfill incomplete — remaining NULL workspaceId: ${nullCounts.join(",")}`,
      );
    }

    return {
      leads: Number(leadResult),
      tasks: Number(taskResult),
      notes: Number(noteResult),
      emailLogs: Number(emailResult),
    };
  });
}

export async function rollbackHouzzatWorkspaceOwnership(
  prisma: PrismaClient,
  ids: OwnershipIds,
): Promise<{ leads: number; tasks: number; notes: number; emailLogs: number }> {
  const { demoAgentOrgId, houzzatWorkspaceId } = ids;

  return prisma.$transaction(async (tx) => {
    const leads = await tx.$executeRaw`
      UPDATE "Lead"
      SET "workspaceId" = NULL
      WHERE "organizationId" = ${demoAgentOrgId}
        AND "workspaceId" = ${houzzatWorkspaceId}
    `;
    const tasks = await tx.$executeRaw`
      UPDATE "AgentTask"
      SET "workspaceId" = NULL
      WHERE "organizationId" = ${demoAgentOrgId}
        AND "workspaceId" = ${houzzatWorkspaceId}
    `;
    const notes = await tx.$executeRaw`
      UPDATE "LeadNote"
      SET "workspaceId" = NULL
      WHERE "organizationId" = ${demoAgentOrgId}
        AND "workspaceId" = ${houzzatWorkspaceId}
    `;
    const emails = await tx.$executeRaw`
      UPDATE "LeadEmailLog"
      SET "workspaceId" = NULL
      WHERE "organizationId" = ${demoAgentOrgId}
        AND "workspaceId" = ${houzzatWorkspaceId}
    `;
    return {
      leads: Number(leads),
      tasks: Number(tasks),
      notes: Number(notes),
      emailLogs: Number(emails),
    };
  });
}

export type ShadowValidationResult = {
  model: string;
  legacyCount: number;
  workspaceCount: number;
  missing: number;
  extra: number;
  ok: boolean;
};

export async function runShadowOwnershipValidation(
  prisma: PrismaClient,
): Promise<ShadowValidationResult[]> {
  const ids = await resolveOwnershipIds(prisma);

  const models = [
    {
      model: "Lead",
      legacy: await prisma.lead.findMany({
        where: { organizationId: ids.demoAgentOrgId },
        select: { id: true },
      }),
      workspace: await prisma.lead.findMany({
        where: { workspaceId: ids.houzzatWorkspaceId },
        select: { id: true },
      }),
    },
    {
      model: "AgentTask",
      legacy: await prisma.agentTask.findMany({
        where: { organizationId: ids.demoAgentOrgId },
        select: { id: true },
      }),
      workspace: await prisma.agentTask.findMany({
        where: { workspaceId: ids.houzzatWorkspaceId },
        select: { id: true },
      }),
    },
    {
      model: "LeadNote",
      legacy: await prisma.leadNote.findMany({
        where: { organizationId: ids.demoAgentOrgId },
        select: { id: true },
      }),
      workspace: await prisma.leadNote.findMany({
        where: { workspaceId: ids.houzzatWorkspaceId },
        select: { id: true },
      }),
    },
    {
      model: "LeadEmailLog",
      legacy: await prisma.leadEmailLog.findMany({
        where: { organizationId: ids.demoAgentOrgId },
        select: { id: true },
      }),
      workspace: await prisma.leadEmailLog.findMany({
        where: { workspaceId: ids.houzzatWorkspaceId },
        select: { id: true },
      }),
    },
  ];

  return models.map(({ model, legacy, workspace }) => {
    const legacyIds = new Set(legacy.map((r) => r.id));
    const workspaceIds = new Set(workspace.map((r) => r.id));
    let missing = 0;
    let extra = 0;
    for (const id of legacyIds) {
      if (!workspaceIds.has(id)) missing += 1;
    }
    for (const id of workspaceIds) {
      if (!legacyIds.has(id)) extra += 1;
    }
    return {
      model,
      legacyCount: legacyIds.size,
      workspaceCount: workspaceIds.size,
      missing,
      extra,
      ok: missing === 0 && extra === 0,
    };
  });
}

export async function captureAssigneeDistribution(prisma: PrismaClient) {
  const rows = await prisma.lead.groupBy({
    by: ["assignedAgentId"],
    _count: { _all: true },
    where: { assignedAgentId: { not: null } },
    orderBy: { _count: { assignedAgentId: "desc" } },
  });
  return rows.map((row) => ({
    assigneeIdPrefix: row.assignedAgentId?.slice(0, 8) ?? null,
    count: row._count._all,
  }));
}
