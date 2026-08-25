/**
 * Production canary: ONE new_lead notification via live PROPERTY_INQUIRY.
 *
 * Uses Cloudflare WORKSPACE_NOTIFICATION_SCOPE (assumed workspace per user).
 * Local resolver simulation sets the flag for read-only authorize checks only.
 *
 *   pnpm exec tsx scripts/workspace-notification-canary.ts
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const SITE = process.env.CANARY_SITE_URL?.trim() || "https://houzzat.com";

async function main() {
  // Local authorize simulation must match production flag for this canary.
  process.env.WORKSPACE_NOTIFICATION_SCOPE = "workspace";
  process.env.WORKSPACE_ROUTING_SCOPE = "workspace";

  const { prisma } = await import("../src/lib/prisma");
  const { parseCrmReadScope } = await import("../src/lib/crm-read-scope");
  const {
    parseWorkspaceRoutingScope,
    parseWorkspaceNotificationScope,
    parseWorkspaceTeamScope,
  } = await import("../src/lib/workspace-scope-flags");
  const { isWorkspaceDualWriteEnabled } = await import("../src/lib/crm-ownership");
  const {
    resolveLeadDeskNotifiers,
    filterStaffRecipientsForLead,
    authorizeStaffRecipientForLead,
  } = await import("../src/lib/workspace-notification-recipients");
  const { openLeadProfileHref } = await import("../src/lib/agent/lead-profile-query");
  const {
    isPushTypeEnabled,
    audienceForPushType,
    shellForAudience,
  } = await import("../src/lib/notifications/catalog");
  const {
    isStaffEmailCategoryEnabled,
  } = await import("../src/lib/notifications/staff-categories");

  // Forced for local authorize simulation to match production (user-reported).
  const flags = {
    WORKSPACE_READ_SCOPE: parseCrmReadScope(),
    WORKSPACE_ROUTING_SCOPE: parseWorkspaceRoutingScope(),
    WORKSPACE_NOTIFICATION_SCOPE: parseWorkspaceNotificationScope(),
    WORKSPACE_TEAM_SCOPE: parseWorkspaceTeamScope(),
    WORKSPACE_DUAL_WRITE: isWorkspaceDualWriteEnabled() ? "enabled" : "disabled",
  };

  if (flags.WORKSPACE_NOTIFICATION_SCOPE !== "workspace") {
    console.error("STOP: WORKSPACE_NOTIFICATION_SCOPE simulation != workspace");
    process.exit(1);
  }
  if (flags.WORKSPACE_ROUTING_SCOPE !== "workspace") {
    console.error("STOP: WORKSPACE_ROUTING_SCOPE simulation != workspace");
    process.exit(1);
  }
  if (flags.WORKSPACE_TEAM_SCOPE !== "legacy") {
    console.error("STOP: WORKSPACE_TEAM_SCOPE must remain legacy/unset");
    process.exit(1);
  }

  const workspace = await prisma.workspace.findUnique({
    where: { slug: "houzzat" },
    select: { id: true, status: true },
  });
  if (!workspace || workspace.status !== "ACTIVE") {
    console.error("STOP: houzzat workspace not ACTIVE");
    process.exit(1);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const canaryEmail = `notify-canary-${stamp}@houzzat-canary.invalid`;
  const canaryTag = `[CANARY] workspace-notification production canary ${stamp}`;

  const devicesBefore = await prisma.pushDevice.findMany({
    where: { shell: "houzzatpro" },
    select: { id: true, userId: true, updatedAt: true },
  });

  const listing = await prisma.listing.findFirst({
    where: { mlsNumber: { not: "" } },
    orderBy: { updatedAt: "desc" },
    select: { mlsNumber: true },
  });
  if (!listing) {
    console.error("STOP: no listing");
    process.exit(1);
  }

  const res = await fetch(`${SITE}/api/leads`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: SITE,
      "user-agent": "houzzat-workspace-notification-canary/1.0",
    },
    body: JSON.stringify({
      mlsNumber: listing.mlsNumber,
      name: "Workspace Notification Canary",
      email: canaryEmail,
      message: canaryTag,
      kind: "inquiry",
      contactConsent: true,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    leadId?: string;
    error?: string;
  };
  if (!res.ok || !body.leadId) {
    console.error("STOP: inquiry failed", { status: res.status, body });
    process.exit(1);
  }

  // Allow async waitUntil push/email side effects to settle.
  await new Promise((r) => setTimeout(r, 4000));

  const lead = await prisma.lead.findUnique({
    where: { id: body.leadId },
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
    },
  });
  if (!lead) {
    console.error("STOP: lead missing after create");
    process.exit(1);
  }

  const org = lead.organizationId
    ? await prisma.organization.findUnique({
        where: { id: lead.organizationId },
        select: { slug: true },
      })
    : null;

  const assigneeMember = lead.assignedAgentId
    ? await prisma.workspaceMember.findFirst({
        where: {
          workspaceId: lead.workspaceId ?? workspace.id,
          userId: lead.assignedAgentId,
          status: "ACTIVE",
        },
        select: { role: true },
      })
    : null;

  if (
    lead.workspaceId !== workspace.id ||
    org?.slug !== "demo-agent" ||
    !assigneeMember
  ) {
    console.error("STOP: lead tenancy wrong — not a notification canary", {
      workspaceIdPrefix: lead.workspaceId?.slice(0, 8),
      orgSlug: org?.slug,
      assigneeMember: Boolean(assigneeMember),
    });
    process.exit(1);
  }

  const desk = await resolveLeadDeskNotifiers({
    organizationId: lead.organizationId,
    workspaceId: lead.workspaceId,
  });
  const candidateIds = [
    ...new Set(
      [lead.assignedAgentId, ...desk.map((d) => d.user.id)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  const authorizedIds = await filterStaffRecipientsForLead(
    lead.id,
    candidateIds,
    "new_lead",
  );

  // Cross-workspace denial probes (synthetic — no Workspace #2 create).
  const foreignProbeUser =
    (
      await prisma.user.findFirst({
        where: {
          role: { in: ["AGENT", "ADMIN"] },
          disabledAt: null,
          workspaceMemberships: {
            none: {
              workspaceId: workspace.id,
              status: "ACTIVE",
            },
          },
        },
        select: { id: true },
      })
    )?.id ?? null;

  const foreignAuthorized = foreignProbeUser
    ? await authorizeStaffRecipientForLead({
        userId: foreignProbeUser,
        leadId: lead.id,
        event: "new_lead_probe",
      })
    : null;

  const users = await prisma.user.findMany({
    where: { id: { in: authorizedIds } },
    select: {
      id: true,
      role: true,
      pushNotificationPrefs: true,
      email: true,
    },
  });

  const shell = shellForAudience(audienceForPushType("new_lead"));
  const devices = await prisma.pushDevice.findMany({
    where: { userId: { in: authorizedIds }, shell },
    select: { userId: true, id: true, updatedAt: true },
  });
  const deviceUserIds = [...new Set(devices.map((d) => d.userId))];

  const devicesAfter = await prisma.pushDevice.findMany({
    where: { shell: "houzzatpro", userId: { in: authorizedIds } },
    select: { id: true, userId: true, updatedAt: true },
  });
  const beforeMap = new Map(
    devicesBefore.map((d) => [d.id, d.updatedAt.toISOString()]),
  );
  const deviceTouchEvidence = devicesAfter.filter((d) => {
    const prev = beforeMap.get(d.id);
    return !prev || prev !== d.updatedAt.toISOString();
  });

  const emailLogs = await prisma.leadEmailLog.findMany({
    where: { leadId: lead.id },
    select: {
      id: true,
      workspaceId: true,
      kind: true,
      createdAt: true,
    },
  });

  const preferenceRows = users.map((u) => ({
    userPrefix: u.id.slice(0, 8),
    newLeadPush: isPushTypeEnabled(u.pushNotificationPrefs, "new_lead"),
    newLeadsEmail: isStaffEmailCategoryEnabled(
      u.pushNotificationPrefs,
      "new_leads",
    ),
    prefsNull: u.pushNotificationPrefs == null,
  }));

  const href = openLeadProfileHref(lead.id);

  const report = {
    flags,
    productionFlagAssumption: {
      WORKSPACE_NOTIFICATION_SCOPE: "workspace",
      WORKSPACE_ROUTING_SCOPE: "workspace",
      WORKSPACE_READ_SCOPE: "shadow",
      WORKSPACE_TEAM_SCOPE: "unset→legacy",
    },
    canary: {
      leadIdPrefix: lead.id.slice(0, 8),
      leadId: lead.id,
      source: lead.source,
      status: lead.status,
      intent: lead.intent,
      createdAt: lead.createdAt.toISOString(),
      organizationSlug: org.slug,
      workspaceIdPrefix: lead.workspaceId.slice(0, 8),
      assignedAgentIdPrefix: lead.assignedAgentId?.slice(0, 8) ?? null,
      notesHasCanaryTag: (lead.notes ?? "").includes(
        "[CANARY] workspace-notification",
      ),
      href,
      emailCtaPath: href,
    },
    pipeline: {
      candidateCount: candidateIds.length,
      candidatePrefixes: candidateIds.map((id) => id.slice(0, 8)),
      authorizedCount: authorizedIds.length,
      authorizedPrefixes: authorizedIds.map((id) => id.slice(0, 8)),
      preferenceEnabledPush: preferenceRows.filter((r) => r.newLeadPush).length,
      preferenceEnabledEmail: preferenceRows.filter((r) => r.newLeadsEmail)
        .length,
      deviceBearingCount: deviceUserIds.length,
      deviceBearingPrefixes: deviceUserIds.map((id) => id.slice(0, 8)),
      pushShell: shell,
      preferenceRows,
    },
    isolation: {
      foreignProbeUserPrefix: foreignProbeUser?.slice(0, 8) ?? null,
      foreignAuthorized,
    },
    deliveryEvidence: {
      pushDeviceTouchesAfterCanary: deviceTouchEvidence.map((d) => ({
        devicePrefix: d.id.slice(0, 8),
        userPrefix: d.userId.slice(0, 8),
        updatedAt: d.updatedAt.toISOString(),
      })),
      leadEmailLogCount: emailLogs.length,
      leadEmailLogs: emailLogs.map((e) => ({
        idPrefix: e.id.slice(0, 8),
        workspaceIdPrefix: e.workspaceId?.slice(0, 8) ?? null,
        kind: e.kind,
      })),
      note: "Physical device / inbox not observed by this script — report NOT VERIFIED unless evidence appears",
    },
  };

  console.log(JSON.stringify(report, null, 2));

  const ok =
    flags.WORKSPACE_NOTIFICATION_SCOPE === "workspace" &&
    lead.workspaceId === workspace.id &&
    org.slug === "demo-agent" &&
    Boolean(assigneeMember) &&
    authorizedIds.includes(lead.assignedAgentId!) &&
    authorizedIds.every((id) => candidateIds.includes(id)) &&
    foreignAuthorized === false &&
    href === `/agent/leads?lead=${lead.id}` &&
    deviceUserIds.includes(lead.assignedAgentId!);

  if (!ok) {
    console.error(
      "CANARY FAILED — USER SHOULD SET WORKSPACE_NOTIFICATION_SCOPE=legacy",
    );
    process.exit(1);
  }
  console.log("CANARY STRUCTURAL PASS");
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
