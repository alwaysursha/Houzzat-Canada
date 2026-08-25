/**
 * Verify an existing workspace-routing canary lead (no create).
 *
 *   CANARY_LEAD_ID=... pnpm exec tsx scripts/workspace-routing-canary-verify.ts
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const leadId = process.env.CANARY_LEAD_ID?.trim();
  if (!leadId) {
    console.error("CANARY_LEAD_ID required");
    process.exit(1);
  }

  const { prisma } = await import("../src/lib/prisma");
  const {
    listWorkspaceRoutableAgents,
    resolveDefaultWorkspaceIdForRouting,
    loadWorkspaceCrmRoutingSettings,
  } = await import("../src/lib/workspace-routing");
  const { parseCrmReadScope } = await import("../src/lib/crm-read-scope");
  const {
    parseWorkspaceRoutingScope,
    parseWorkspaceNotificationScope,
    parseWorkspaceTeamScope,
  } = await import("../src/lib/workspace-scope-flags");
  const {
    isWorkspaceDualWriteEnabled,
    HOUZZAT_WORKSPACE_SLUG,
  } = await import("../src/lib/crm-ownership");
  const { CRM_ROUTING_SETTINGS_ID } = await import("../src/lib/agent/routing-types");

  const workspaceId = await resolveDefaultWorkspaceIdForRouting();
  if (!workspaceId) {
    console.error("houzzat workspace missing");
    process.exit(1);
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      source: true,
      status: true,
      intent: true,
      createdAt: true,
      organizationId: true,
      workspaceId: true,
      assignedAgentId: true,
      notes: true,
      listingMls: true,
    },
  });
  if (!lead) {
    console.error("lead not found");
    process.exit(1);
  }

  const [org, member, pool, settings, foreignSettings, allHouzzatLeads, childTasks] =
    await Promise.all([
      lead.organizationId
        ? prisma.organization.findUnique({
            where: { id: lead.organizationId },
            select: { slug: true },
          })
        : Promise.resolve(null),
      lead.assignedAgentId
        ? prisma.workspaceMember.findFirst({
            where: {
              workspaceId: lead.workspaceId ?? workspaceId,
              userId: lead.assignedAgentId,
              status: "ACTIVE",
            },
            select: { role: true, status: true },
          })
        : Promise.resolve(null),
      listWorkspaceRoutableAgents(workspaceId),
      loadWorkspaceCrmRoutingSettings(workspaceId),
      prisma.crmRoutingSettings.count({
        where: {
          NOT: { id: CRM_ROUTING_SETTINGS_ID, workspaceId },
        },
      }),
      prisma.lead.findMany({
        where: { workspaceId },
        select: {
          id: true,
          assignedAgentId: true,
          workspaceId: true,
          organizationId: true,
        },
      }),
      prisma.agentTask.findMany({
        where: { leadId: lead.id },
        select: {
          id: true,
          title: true,
          organizationId: true,
          workspaceId: true,
          assigneeId: true,
        },
      }),
    ]);

  const memberIds = new Set(
    (
      await prisma.workspaceMember.findMany({
        where: { workspaceId, status: "ACTIVE" },
        select: { userId: true },
      })
    ).map((m) => m.userId),
  );

  const assignedOutside = allHouzzatLeads.filter(
    (l) => l.assignedAgentId && !memberIds.has(l.assignedAgentId),
  );
  const nullWorkspace = allHouzzatLeads.filter((l) => !l.workspaceId);

  const routableMemberRows = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: {
      status: true,
      role: true,
      user: {
        select: {
          id: true,
          role: true,
          disabledAt: true,
          agentProfile: { select: { active: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const eligibility = routableMemberRows.map((m) => {
    const active = m.status === "ACTIVE";
    const platformOk =
      (m.user.role === "AGENT" || m.user.role === "ADMIN") &&
      m.user.disabledAt === null &&
      m.user.agentProfile?.active === true;
    const eligible =
      active &&
      (m.role === "AGENT" || m.role === "ADMIN" || m.role === "OWNER") &&
      platformOk;
    return {
      agentPrefix: m.user.id.slice(0, 8),
      workspaceMember: true,
      memberStatus: m.status,
      memberRole: m.role,
      active,
      eligible,
    };
  });

  const report = {
    flagsLocal: {
      WORKSPACE_READ_SCOPE: parseCrmReadScope(),
      WORKSPACE_ROUTING_SCOPE: parseWorkspaceRoutingScope(),
      WORKSPACE_NOTIFICATION_SCOPE: parseWorkspaceNotificationScope(),
      WORKSPACE_TEAM_SCOPE: parseWorkspaceTeamScope(),
      WORKSPACE_DUAL_WRITE: isWorkspaceDualWriteEnabled() ? "enabled" : "disabled",
    },
    workspaceSlug: HOUZZAT_WORKSPACE_SLUG,
    workspaceIdPrefix: workspaceId.slice(0, 8),
    poolPrefixes: pool.map((a) => a.id.slice(0, 8)),
    settings: settings
      ? {
          id: CRM_ROUTING_SETTINGS_ID,
          workspaceIdPrefix: settings.workspaceId?.slice(0, 8) ?? null,
          listingAgentIdPrefix: settings.listingAgentId?.slice(0, 8) ?? null,
          sellerAssignMode: settings.sellerAssignMode,
          weights: settings.weights.map((w) => ({
            lane: w.lane,
            percent: w.percent,
            assignedCount: w.assignedCount,
            agentIdPrefix: w.agentId.slice(0, 8),
          })),
        }
      : null,
    foreignSettingsCount: foreignSettings,
    canary: {
      leadIdPrefix: lead.id.slice(0, 8),
      source: lead.source,
      status: lead.status,
      intent: lead.intent,
      createdAt: lead.createdAt.toISOString(),
      organizationSlug: org?.slug ?? null,
      organizationIdPrefix: lead.organizationId?.slice(0, 8) ?? null,
      workspaceIdPrefix: lead.workspaceId?.slice(0, 8) ?? null,
      assignedAgentIdPrefix: lead.assignedAgentId?.slice(0, 8) ?? null,
      listingMls: lead.listingMls,
      notesHasCanaryTag: (lead.notes ?? "").includes("[CANARY] workspace-routing"),
      assigneeIsActiveMember: Boolean(member),
      assigneeMemberRole: member?.role ?? null,
      childTasks: childTasks.map((t) => ({
        idPrefix: t.id.slice(0, 8),
        title: t.title,
        organizationIdPrefix: t.organizationId?.slice(0, 8) ?? null,
        workspaceIdPrefix: t.workspaceId?.slice(0, 8) ?? null,
        assigneeIdPrefix: t.assigneeId?.slice(0, 8) ?? null,
        workspaceMatchesLead: t.workspaceId === lead.workspaceId,
      })),
    },
    postCanarySafety: {
      houzzatLeadCount: allHouzzatLeads.length,
      assignedOutsideMemberCount: assignedOutside.length,
      nullWorkspaceCount: nullWorkspace.length,
      assignedOutsidePrefixes: assignedOutside
        .slice(0, 5)
        .map((l) => ({
          leadPrefix: l.id.slice(0, 8),
          agentPrefix: l.assignedAgentId?.slice(0, 8) ?? null,
        })),
    },
    eligibility,
  };

  console.log(JSON.stringify(report, null, 2));

  const ok =
    lead.workspaceId === workspaceId &&
    org?.slug === "demo-agent" &&
    Boolean(member) &&
    pool.length === 1 &&
    lead.assignedAgentId === pool[0]?.id &&
    assignedOutside.length === 0 &&
    nullWorkspace.length === 0 &&
    foreignSettings === 0;

  if (!ok) {
    console.error("VERIFY FAILED");
    process.exit(1);
  }
  console.log("VERIFY PASSED");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  });
