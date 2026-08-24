/**
 * Stage 3E — read-only shadow comparison between legacy Organization scope
 * and proposed Workspace scope. Validation only; no runtime effect.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AgentOrgContext } from "../../src/lib/agent";
import { canAccessLead, leadScopeWhere } from "../../src/lib/agent";
import {
  type OwnershipIds,
  resolveOwnershipIds,
} from "./houzzat-workspace-ownership";

export type IdSetComparison = {
  surface: string;
  legacyCount: number;
  workspaceCount: number;
  missing: number;
  extra: number;
  ok: boolean;
};

export type AccessMatrixRow = {
  userPrefix: string;
  workspaceRole: string;
  surface: string;
  legacyCount: number;
  workspaceCount: number;
  match: boolean;
};

export type ShadowReadReport = {
  ids: OwnershipIds;
  comparisons: IdSetComparison[];
  accessMatrix: AccessMatrixRow[];
  canAccessMismatches: number;
  taskParentMismatches: number;
  platformAdminsWithoutWorkspace: number;
  statisticsMismatches: string[];
};

function prefix(id: string): string {
  return id.slice(0, 8);
}

function compareIdSets(
  surface: string,
  legacyIds: string[],
  workspaceIds: string[],
): IdSetComparison {
  const legacy = new Set(legacyIds);
  const workspace = new Set(workspaceIds);
  let missing = 0;
  let extra = 0;
  for (const id of legacy) {
    if (!workspace.has(id)) missing += 1;
  }
  for (const id of workspace) {
    if (!legacy.has(id)) extra += 1;
  }
  return {
    surface,
    legacyCount: legacy.size,
    workspaceCount: workspace.size,
    missing,
    extra,
    ok: missing === 0 && extra === 0,
  };
}

/** Workspace-equivalent of `leadScopeWhere` for Houzzat shadow reads. */
export function leadScopeWhereWorkspace(
  ctx: Pick<
    AgentOrgContext,
    "user" | "organizationIds" | "canSeeTeamLeads"
  >,
  workspaceId: string,
  view: "mine" | "pond" | "team" = "mine",
): Prisma.LeadWhereInput {
  const ws = { workspaceId };

  if (view === "pond") {
    return { ...ws, assignedAgentId: null };
  }

  if (view === "team" && ctx.canSeeTeamLeads) {
    return ws;
  }

  return {
    ...ws,
    OR: [{ assignedAgentId: ctx.user.id }, { assignedAgentId: null }],
  };
}

/** Workspace-equivalent of desk activity `leadWhereForDesk`. */
export function leadWhereForDeskWorkspace(
  ctx: Pick<
    AgentOrgContext,
    "user" | "organizationIds" | "canSeeTeamLeads"
  >,
  workspaceId: string,
  deskAgentId: string | null,
): Prisma.LeadWhereInput {
  const ws = { workspaceId };
  if (ctx.canSeeTeamLeads) {
    if (deskAgentId) return { ...ws, assignedAgentId: deskAgentId };
    return ws;
  }
  return { ...ws, assignedAgentId: ctx.user.id };
}

/** Proposed future access check (not production). */
export function canAccessLeadWorkspaceProposed(
  ctx: Pick<
    AgentOrgContext,
    "user" | "organizationIds" | "canSeeTeamLeads" | "isPlatformAdmin"
  >,
  lead: {
    workspaceId: string | null;
    assignedAgentId: string | null;
  },
  workspaceId: string,
  isActiveWorkspaceMember: boolean,
): boolean {
  if (lead.workspaceId !== workspaceId) return false;
  if (!isActiveWorkspaceMember) return false;
  if (ctx.isPlatformAdmin || ctx.canSeeTeamLeads) return true;
  if (!lead.assignedAgentId) return true;
  return lead.assignedAgentId === ctx.user.id;
}

export type ShadowAgentContext = AgentOrgContext & {
  workspaceRole: string;
  isActiveWorkspaceMember: boolean;
};

export async function buildHouzzatShadowContexts(
  prisma: PrismaClient,
  ids: OwnershipIds,
): Promise<ShadowAgentContext[]> {
  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: ids.houzzatWorkspaceId,
      status: "ACTIVE",
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          phone: true,
          role: true,
        },
      },
    },
    orderBy: [{ role: "asc" }, { userId: "asc" }],
  });

  const contexts: ShadowAgentContext[] = [];

  for (const member of members) {
    const isPlatformAdmin = member.user.role === "ADMIN";
    const orgMembership = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: ids.demoAgentOrgId,
          userId: member.userId,
        },
      },
      select: { role: true },
    });

    const canSeeTeamLeads =
      isPlatformAdmin ||
      member.role === "OWNER" ||
      member.role === "ADMIN" ||
      orgMembership?.role === "OWNER" ||
      orgMembership?.role === "ADMIN";

    contexts.push({
      user: {
        id: member.user.id,
        email: member.user.email,
        name: member.user.name,
        image: member.user.image,
        phone: member.user.phone,
        role: member.user.role,
      },
      organizationId: ids.demoAgentOrgId,
      organizationName: "demo-agent",
      organizationIds: [ids.demoAgentOrgId],
      membershipRole: orgMembership?.role ?? "AGENT",
      canSeeTeamLeads,
      isPlatformAdmin,
      workspaceRole: member.role,
      isActiveWorkspaceMember: true,
    });
  }

  return contexts;
}

async function compareDeskLevelSets(
  prisma: PrismaClient,
  ids: OwnershipIds,
): Promise<IdSetComparison[]> {
  const org = ids.demoAgentOrgId;
  const ws = ids.houzzatWorkspaceId;

  const [
    legacyLeads,
    workspaceLeads,
    legacyTasks,
    workspaceTasks,
    legacyNotes,
    workspaceNotes,
    legacyEmails,
    workspaceEmails,
  ] = await Promise.all([
    prisma.lead.findMany({ where: { organizationId: org }, select: { id: true } }),
    prisma.lead.findMany({ where: { workspaceId: ws }, select: { id: true } }),
    prisma.agentTask.findMany({
      where: { organizationId: org },
      select: { id: true },
    }),
    prisma.agentTask.findMany({
      where: { workspaceId: ws },
      select: { id: true },
    }),
    prisma.leadNote.findMany({
      where: { organizationId: org },
      select: { id: true },
    }),
    prisma.leadNote.findMany({
      where: { workspaceId: ws },
      select: { id: true },
    }),
    prisma.leadEmailLog.findMany({
      where: { organizationId: org },
      select: { id: true },
    }),
    prisma.leadEmailLog.findMany({
      where: { workspaceId: ws },
      select: { id: true },
    }),
  ]);

  const houzzatLeadIds = legacyLeads.map((r) => r.id);

  const [legacyActivities, workspaceActivities, legacyAppointments, workspaceAppointments] =
    await Promise.all([
      prisma.leadActivity.findMany({
        where: { leadId: { in: houzzatLeadIds } },
        select: { id: true },
      }),
      prisma.leadActivity.findMany({
        where: { lead: { workspaceId: ws } },
        select: { id: true },
      }),
      prisma.appointment.findMany({
        where: { leadId: { in: houzzatLeadIds } },
        select: { id: true },
      }),
      prisma.appointment.findMany({
        where: { lead: { workspaceId: ws } },
        select: { id: true },
      }),
    ]);

  return [
    compareIdSets("Lead.desk", legacyLeads.map((r) => r.id), workspaceLeads.map((r) => r.id)),
    compareIdSets(
      "AgentTask.desk",
      legacyTasks.map((r) => r.id),
      workspaceTasks.map((r) => r.id),
    ),
    compareIdSets(
      "LeadNote.desk",
      legacyNotes.map((r) => r.id),
      workspaceNotes.map((r) => r.id),
    ),
    compareIdSets(
      "LeadEmailLog.desk",
      legacyEmails.map((r) => r.id),
      workspaceEmails.map((r) => r.id),
    ),
    compareIdSets(
      "LeadActivity.viaLead",
      legacyActivities.map((r) => r.id),
      workspaceActivities.map((r) => r.id),
    ),
    compareIdSets(
      "Appointment.viaLead",
      legacyAppointments.map((r) => r.id),
      workspaceAppointments.map((r) => r.id),
    ),
  ];
}

async function compareAgentScopedLeads(
  prisma: PrismaClient,
  ids: OwnershipIds,
  contexts: ShadowAgentContext[],
): Promise<{ comparisons: IdSetComparison[]; matrix: AccessMatrixRow[] }> {
  const comparisons: IdSetComparison[] = [];
  const matrix: AccessMatrixRow[] = [];
  const ws = ids.houzzatWorkspaceId;

  for (const ctx of contexts) {
    for (const view of ["mine", "team", "pond"] as const) {
      if (view === "team" && !ctx.canSeeTeamLeads) continue;

      const legacyWhere = leadScopeWhere(ctx, view);
      const workspaceWhere = leadScopeWhereWorkspace(ctx, ws, view);

      const [legacyRows, workspaceRows] = await Promise.all([
        prisma.lead.findMany({ where: legacyWhere, select: { id: true } }),
        prisma.lead.findMany({ where: workspaceWhere, select: { id: true } }),
      ]);

      const surface = `Lead.agent.${prefix(ctx.user.id)}.${view}`;
      comparisons.push(
        compareIdSets(
          surface,
          legacyRows.map((r) => r.id),
          workspaceRows.map((r) => r.id),
        ),
      );
      const row = comparisons[comparisons.length - 1]!;
      matrix.push({
        userPrefix: prefix(ctx.user.id),
        workspaceRole: ctx.workspaceRole,
        surface: `leads/${view}`,
        legacyCount: row.legacyCount,
        workspaceCount: row.workspaceCount,
        match: row.ok,
      });
    }

    const deskWhere = leadWhereForDeskWorkspace(ctx, ws, null);
    const legacyDeskWhere = {
      organizationId: { in: ctx.organizationIds },
      ...(ctx.canSeeTeamLeads
        ? {}
        : { assignedAgentId: ctx.user.id }),
    };

    const [legacyDesk, workspaceDesk] = await Promise.all([
      prisma.lead.findMany({ where: legacyDeskWhere, select: { id: true } }),
      prisma.lead.findMany({ where: deskWhere, select: { id: true } }),
    ]);

    comparisons.push(
      compareIdSets(
        `Lead.deskActivity.${prefix(ctx.user.id)}`,
        legacyDesk.map((r) => r.id),
        workspaceDesk.map((r) => r.id),
      ),
    );
    const deskRow = comparisons[comparisons.length - 1]!;
    matrix.push({
      userPrefix: prefix(ctx.user.id),
      workspaceRole: ctx.workspaceRole,
      surface: "desk-activity",
      legacyCount: deskRow.legacyCount,
      workspaceCount: deskRow.workspaceCount,
      match: deskRow.ok,
    });
  }

  return { comparisons, matrix };
}

async function compareAgentScopedTasks(
  prisma: PrismaClient,
  ids: OwnershipIds,
  contexts: ShadowAgentContext[],
): Promise<IdSetComparison[]> {
  const comparisons: IdSetComparison[] = [];
  const ws = ids.houzzatWorkspaceId;

  for (const ctx of contexts) {
    const legacyWhere: Prisma.AgentTaskWhereInput = {
      organizationId: ctx.organizationId,
      status: "OPEN",
      ...(ctx.canSeeTeamLeads ? {} : { assigneeId: ctx.user.id }),
    };
    const workspaceWhere: Prisma.AgentTaskWhereInput = {
      workspaceId: ws,
      status: "OPEN",
      ...(ctx.canSeeTeamLeads ? {} : { assigneeId: ctx.user.id }),
    };

    const [legacyRows, workspaceRows] = await Promise.all([
      prisma.agentTask.findMany({ where: legacyWhere, select: { id: true } }),
      prisma.agentTask.findMany({ where: workspaceWhere, select: { id: true } }),
    ]);

    comparisons.push(
      compareIdSets(
        `AgentTask.agent.${prefix(ctx.user.id)}`,
        legacyRows.map((r) => r.id),
        workspaceRows.map((r) => r.id),
      ),
    );
  }

  return comparisons;
}

async function compareCanAccessLead(
  prisma: PrismaClient,
  ids: OwnershipIds,
  contexts: ShadowAgentContext[],
): Promise<number> {
  const leads = await prisma.lead.findMany({
    where: { organizationId: ids.demoAgentOrgId },
    select: {
      id: true,
      organizationId: true,
      workspaceId: true,
      assignedAgentId: true,
    },
  });

  let mismatches = 0;
  for (const ctx of contexts) {
    for (const lead of leads) {
      const legacy = canAccessLead(ctx, lead);
      const proposed = canAccessLeadWorkspaceProposed(
        ctx,
        lead,
        ids.houzzatWorkspaceId,
        ctx.isActiveWorkspaceMember,
      );
      if (legacy !== proposed) mismatches += 1;
    }
  }
  return mismatches;
}

async function compareStatisticsCounts(
  prisma: PrismaClient,
  ids: OwnershipIds,
  contexts: ShadowAgentContext[],
): Promise<string[]> {
  const mismatches: string[] = [];
  const ws = ids.houzzatWorkspaceId;
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - 29);
  periodStart.setHours(0, 0, 0, 0);

  for (const ctx of contexts) {
    const legacyWhere = leadScopeWhere(
      ctx,
      ctx.canSeeTeamLeads ? "team" : "mine",
    );
    const workspaceWhere = leadScopeWhereWorkspace(
      ctx,
      ws,
      ctx.canSeeTeamLeads ? "team" : "mine",
    );

    const [
      legacyTotal,
      workspaceTotal,
      legacyPeriod,
      workspacePeriod,
      legacyPipeline,
      workspacePipeline,
    ] = await Promise.all([
      prisma.lead.count({ where: legacyWhere }),
      prisma.lead.count({ where: workspaceWhere }),
      prisma.lead.count({
        where: { ...legacyWhere, createdAt: { gte: periodStart } },
      }),
      prisma.lead.count({
        where: { ...workspaceWhere, createdAt: { gte: periodStart } },
      }),
      prisma.lead.groupBy({
        by: ["status"],
        where: legacyWhere,
        _count: { _all: true },
      }),
      prisma.lead.groupBy({
        by: ["status"],
        where: workspaceWhere,
        _count: { _all: true },
      }),
    ]);

    const label = prefix(ctx.user.id);
    if (legacyTotal !== workspaceTotal) {
      mismatches.push(`${label}: lead total ${legacyTotal} vs ${workspaceTotal}`);
    }
    if (legacyPeriod !== workspacePeriod) {
      mismatches.push(`${label}: period leads ${legacyPeriod} vs ${workspacePeriod}`);
    }

    const legacyMap = new Map(
      legacyPipeline.map((r) => [r.status, r._count._all]),
    );
    const workspaceMap = new Map(
      workspacePipeline.map((r) => [r.status, r._count._all]),
    );
    for (const [status, count] of legacyMap) {
      if (workspaceMap.get(status) !== count) {
        mismatches.push(
          `${label}: pipeline ${status} ${count} vs ${workspaceMap.get(status) ?? 0}`,
        );
      }
    }
  }

  return mismatches;
}

async function compareHotnessCohorts(
  prisma: PrismaClient,
  ids: OwnershipIds,
  contexts: ShadowAgentContext[],
): Promise<IdSetComparison[]> {
  const comparisons: IdSetComparison[] = [];
  const ws = ids.houzzatWorkspaceId;

  for (const ctx of contexts) {
    const legacyWhere = leadScopeWhere(
      ctx,
      ctx.canSeeTeamLeads ? "team" : "mine",
    );
    const workspaceWhere = leadScopeWhereWorkspace(
      ctx,
      ws,
      ctx.canSeeTeamLeads ? "team" : "mine",
    );

    const [legacyRows, workspaceRows] = await Promise.all([
      prisma.lead.findMany({
        where: legacyWhere,
        select: { id: true, customerId: true },
      }),
      prisma.lead.findMany({
        where: workspaceWhere,
        select: { id: true, customerId: true },
      }),
    ]);

    comparisons.push(
      compareIdSets(
        `Hotness.cohort.${prefix(ctx.user.id)}`,
        legacyRows.map((r) => r.id),
        workspaceRows.map((r) => r.id),
      ),
    );
  }

  return comparisons;
}

async function countTaskParentMismatches(
  prisma: PrismaClient,
  ids: OwnershipIds,
): Promise<number> {
  const rows = await prisma.agentTask.findMany({
    where: {
      organizationId: ids.demoAgentOrgId,
      leadId: { not: null },
    },
    select: {
      workspaceId: true,
      lead: { select: { workspaceId: true } },
    },
  });

  return rows.filter(
    (row) =>
      row.lead?.workspaceId != null &&
      row.workspaceId !== row.lead.workspaceId,
  ).length;
}

async function countPlatformAdminsWithoutWorkspace(
  prisma: PrismaClient,
  ids: OwnershipIds,
): Promise<number> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", disabledAt: null },
    select: { id: true },
  });

  let missing = 0;
  for (const admin of admins) {
    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: ids.houzzatWorkspaceId,
          userId: admin.id,
        },
      },
      select: { status: true },
    });
    if (!member || member.status !== "ACTIVE") missing += 1;
  }
  return missing;
}

export async function runWorkspaceReadShadowValidation(
  prisma: PrismaClient,
): Promise<ShadowReadReport> {
  const ids = await resolveOwnershipIds(prisma);
  const contexts = await buildHouzzatShadowContexts(prisma, ids);

  const deskComparisons = await compareDeskLevelSets(prisma, ids);
  const { comparisons: agentLeadComparisons, matrix } =
    await compareAgentScopedLeads(prisma, ids, contexts);
  const taskComparisons = await compareAgentScopedTasks(prisma, ids, contexts);
  const hotnessComparisons = await compareHotnessCohorts(prisma, ids, contexts);

  const [
    canAccessMismatches,
    taskParentMismatches,
    platformAdminsWithoutWorkspace,
    statisticsMismatches,
  ] = await Promise.all([
    compareCanAccessLead(prisma, ids, contexts),
    countTaskParentMismatches(prisma, ids),
    countPlatformAdminsWithoutWorkspace(prisma, ids),
    compareStatisticsCounts(prisma, ids, contexts),
  ]);

  return {
    ids,
    comparisons: [
      ...deskComparisons,
      ...agentLeadComparisons,
      ...taskComparisons,
      ...hotnessComparisons,
    ],
    accessMatrix: matrix,
    canAccessMismatches,
    taskParentMismatches,
    platformAdminsWithoutWorkspace,
    statisticsMismatches,
  };
}

export function summarizeShadowReadReport(report: ShadowReadReport): {
  ok: boolean;
  failedSurfaces: string[];
} {
  const failedSurfaces: string[] = [];

  for (const row of report.comparisons) {
    if (!row.ok) failedSurfaces.push(row.surface);
  }
  if (report.canAccessMismatches > 0) {
    failedSurfaces.push(`canAccessLead (${report.canAccessMismatches} mismatches)`);
  }
  if (report.taskParentMismatches > 0) {
    failedSurfaces.push(`AgentTask.parent (${report.taskParentMismatches} mismatches)`);
  }
  if (report.platformAdminsWithoutWorkspace > 0) {
    failedSurfaces.push(
      `platformAdmin.workspaceMember (${report.platformAdminsWithoutWorkspace} missing)`,
    );
  }
  for (const msg of report.statisticsMismatches) {
    failedSurfaces.push(`statistics:${msg}`);
  }

  return { ok: failedSurfaces.length === 0, failedSurfaces };
}
