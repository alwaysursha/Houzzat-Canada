/**
 * Phase 0B — read-only Houzzat tenancy protection baseline.
 * NO writes. NO PII (emails, phones, tokens).
 *
 * Run: pnpm tenancy:baseline
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

async function main() {
  const started = Date.now();
  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? "development",
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
    defaultOrganizationIdEnv: process.env.DEFAULT_ORGANIZATION_ID?.trim() || null,
    readOnly: true,
  };

  const { prisma } = await import("../src/lib/prisma");

  const [
    organizationCount,
    membershipCount,
    membershipByRole,
    userCountByRole,
    disabledStaffCount,
    leadCount,
    leadNullOrgCount,
    leadByStatus,
    leadBySourceTop,
    leadUnassignedCount,
    taskCount,
    taskOpenCount,
    noteCount,
    emailLogCount,
    activityCount,
    appointmentCount,
    routingSettingsCount,
    routingWeightCount,
    routingWeightByLane,
    savedListingCount,
    savedSearchCount,
    propertyMonitorCount,
    areaMonitorCount,
    customerAlertCount,
    pushDeviceByShell,
    agentProfileActiveCount,
    agentProfileInactiveCount,
    consentEventCount,
    landingPageCount,
    adCampaignCount,
    workspaceCount,
    workspaceMemberCount,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.organizationMembership.count(),
    prisma.organizationMembership.groupBy({
      by: ["role"],
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ["role"],
      _count: { _all: true },
      where: { disabledAt: null },
    }),
    prisma.user.count({
      where: {
        disabledAt: { not: null },
        role: { in: ["AGENT", "ADMIN"] },
      },
    }),
    prisma.lead.count(),
    prisma.lead.count({ where: { organizationId: null } }),
    prisma.lead.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["source"],
      _count: { _all: true },
      orderBy: { _count: { source: "desc" } },
      take: 12,
    }),
    prisma.lead.count({ where: { assignedAgentId: null } }),
    prisma.agentTask.count(),
    prisma.agentTask.count({ where: { status: "OPEN" } }),
    prisma.leadNote.count(),
    prisma.leadEmailLog.count(),
    prisma.leadActivity.count(),
    prisma.appointment.count(),
    prisma.crmRoutingSettings.count(),
    prisma.crmRoutingWeight.count(),
    prisma.crmRoutingWeight.groupBy({
      by: ["lane"],
      _count: { _all: true },
    }),
    prisma.savedListing.count(),
    prisma.savedSearch.count(),
    prisma.propertyMonitor.count(),
    prisma.areaMonitor.count(),
    prisma.customerAlert.count(),
    prisma.pushDevice.groupBy({
      by: ["shell"],
      _count: { _all: true },
    }),
    prisma.agentProfile.count({ where: { active: true } }),
    prisma.agentProfile.count({ where: { active: false } }),
    prisma.consentEvent.count(),
    prisma.landingPage.count(),
    prisma.adCampaign.count(),
    prisma.workspace.count(),
    prisma.workspaceMember.count(),
  ]);

  const assigneeDistribution = await prisma.lead.groupBy({
    by: ["assignedAgentId"],
    _count: { _all: true },
    where: { assignedAgentId: { not: null } },
    orderBy: { _count: { assignedAgentId: "desc" } },
    take: 20,
  });

  const orgLeadCounts = await prisma.lead.groupBy({
    by: ["organizationId"],
    _count: { _all: true },
    orderBy: { _count: { organizationId: "desc" } },
    take: 10,
  });

  const routingSettings = await prisma.crmRoutingSettings.findUnique({
    where: { id: "default" },
    select: {
      id: true,
      sellerAssignMode: true,
      listingAgentId: true,
      updatedAt: true,
      _count: { select: { weights: true } },
    },
  });

  const brokerageOrg = await (async () => {
    const fromEnv = process.env.DEFAULT_ORGANIZATION_ID?.trim();
    if (fromEnv) {
      const org = await prisma.organization.findUnique({
        where: { id: fromEnv },
        select: { id: true, name: true, slug: true, seatLimit: true, createdAt: true },
      });
      if (org) return { source: "DEFAULT_ORGANIZATION_ID", org };
    }
    const first = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, slug: true, seatLimit: true, createdAt: true },
    });
    return first ? { source: "first_by_createdAt", org: first } : null;
  })();

  report.data = {
    organizations: organizationCount,
    organizationMemberships: membershipCount,
    membershipByRole: Object.fromEntries(
      membershipByRole.map((r) => [r.role, r._count._all]),
    ),
    usersByRoleActive: Object.fromEntries(
      userCountByRole.map((r) => [r.role, r._count._all]),
    ),
    disabledStaff: disabledStaffCount,
    leads: {
      total: leadCount,
      nullOrganizationId: leadNullOrgCount,
      unassignedAgent: leadUnassignedCount,
      byStatus: Object.fromEntries(
        leadByStatus.map((r) => [r.status, r._count._all]),
      ),
      topSources: Object.fromEntries(
        leadBySourceTop.map((r) => [r.source, r._count._all]),
      ),
      assigneeBucketCount: assigneeDistribution.length,
      topAssigneeLeadCounts: assigneeDistribution.map((row) => ({
        assigneeIdPrefix: row.assignedAgentId?.slice(0, 8) ?? null,
        count: row._count._all,
      })),
      organizationBucketCount: orgLeadCounts.length,
      leadsByOrganization: orgLeadCounts.map((row) => ({
        organizationIdPrefix: row.organizationId?.slice(0, 8) ?? "null",
        count: row._count._all,
      })),
    },
    crmChildren: {
      agentTasks: taskCount,
      openAgentTasks: taskOpenCount,
      leadNotes: noteCount,
      leadEmailLogs: emailLogCount,
      leadActivities: activityCount,
      appointments: appointmentCount,
    },
    routing: {
      settingsRows: routingSettingsCount,
      weightRows: routingWeightCount,
      weightsByLane: Object.fromEntries(
        routingWeightByLane.map((r) => [r.lane, r._count._all]),
      ),
      singleton: routingSettings
        ? {
            id: routingSettings.id,
            sellerAssignMode: routingSettings.sellerAssignMode,
            hasListingAgent: Boolean(routingSettings.listingAgentId),
            listingAgentIdPrefix:
              routingSettings.listingAgentId?.slice(0, 8) ?? null,
            weightCount: routingSettings._count.weights,
            updatedAt: routingSettings.updatedAt.toISOString(),
          }
        : null,
    },
    consumer: {
      savedListings: savedListingCount,
      savedSearches: savedSearchCount,
      propertyMonitors: propertyMonitorCount,
      areaMonitors: areaMonitorCount,
      customerAlerts: customerAlertCount,
    },
    notifications: {
      pushDevicesByShell: Object.fromEntries(
        pushDeviceByShell.map((r) => [r.shell, r._count._all]),
      ),
    },
    staff: {
      activeAgentProfiles: agentProfileActiveCount,
      inactiveAgentProfiles: agentProfileInactiveCount,
    },
    marketing: {
      landingPages: landingPageCount,
      adCampaigns: adCampaignCount,
      consentEvents: consentEventCount,
    },
    workspaceFoundation: {
      workspaces: workspaceCount,
      workspaceMembers: workspaceMemberCount,
    },
    resolvedBrokerageOrg: brokerageOrg
      ? {
          resolution: brokerageOrg.source,
          idPrefix: brokerageOrg.org.id.slice(0, 8),
          slug: brokerageOrg.org.slug,
          seatLimit: brokerageOrg.org.seatLimit,
          createdAt: brokerageOrg.org.createdAt.toISOString(),
        }
      : null,
  };

  report.integrityChecks = {
    leadsWithoutOrg: leadNullOrgCount,
    multipleOrganizations: organizationCount > 1,
    singletonRoutingPresent: routingSettingsCount === 1,
    routingIdIsDefault: routingSettings?.id === "default",
  };

  report.durationMs = Date.now() - started;
  report.stats = {
    assigneeDistributionMedian: median(
      assigneeDistribution.map((r) => r._count._all),
    ),
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "type" in error
          ? "Database connection failed (check DATABASE_URL / network)"
          : String(error);
    console.error(
      JSON.stringify({
        error: "tenancy-baseline failed",
        message,
        hint: "Read-only script — requires DATABASE_URL and network access to Neon.",
      }),
    );
    process.exit(1);
  })
  .finally(async () => {
    try {
      const { prisma } = await import("../src/lib/prisma");
      await prisma.$disconnect();
    } catch {
      // ignore disconnect errors
    }
  });
