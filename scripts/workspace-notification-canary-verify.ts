/**
 * Verify existing notification canary lead (no create).
 *
 *   CANARY_LEAD_ID=... pnpm exec tsx scripts/workspace-notification-canary-verify.ts
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

  process.env.WORKSPACE_NOTIFICATION_SCOPE = "workspace";
  process.env.WORKSPACE_ROUTING_SCOPE = "workspace";

  const { prisma } = await import("../src/lib/prisma");
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
  const { isStaffEmailCategoryEnabled } = await import(
    "../src/lib/notifications/staff-categories"
  );
  const {
    parseWorkspaceNotificationScope,
    parseWorkspaceTeamScope,
    parseWorkspaceRoutingScope,
  } = await import("../src/lib/workspace-scope-flags");
  const { parseCrmReadScope } = await import("../src/lib/crm-read-scope");
  const { isWorkspaceDualWriteEnabled } = await import("../src/lib/crm-ownership");

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
    },
  });
  if (!lead?.workspaceId || !lead.assignedAgentId) {
    console.error("lead missing workspace/assignee");
    process.exit(1);
  }

  const org = await prisma.organization.findUnique({
    where: { id: lead.organizationId! },
    select: { slug: true },
  });
  const member = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: lead.workspaceId,
      userId: lead.assignedAgentId,
      status: "ACTIVE",
    },
    select: { role: true },
  });

  const desk = await resolveLeadDeskNotifiers({
    organizationId: lead.organizationId,
    workspaceId: lead.workspaceId,
  });
  const candidates = [
    ...new Set([lead.assignedAgentId, ...desk.map((d) => d.user.id)]),
  ];
  const authorized = await filterStaffRecipientsForLead(
    lead.id,
    candidates,
    "new_lead",
  );

  // Synthetic foreign recipient (non-member BUYER) — proves membership gate.
  const foreign = await prisma.user.findFirst({
    where: {
      role: "BUYER",
      disabledAt: null,
      workspaceMemberships: { none: { workspaceId: lead.workspaceId } },
    },
    select: { id: true },
  });
  const foreignOk = foreign
    ? await authorizeStaffRecipientForLead({
        userId: foreign.id,
        leadId: lead.id,
        event: "new_lead_probe",
      })
    : null;

  // Same-brokerage but prove authorize uses workspace membership not org.
  // All demo-agent owners are also houzzat members today — still assert authorized ⊆ members.
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: lead.workspaceId, status: "ACTIVE" },
    select: { userId: true },
  });
  const memberSet = new Set(members.map((m) => m.userId));
  const unauthorizedLeak = authorized.filter((id) => !memberSet.has(id));

  const users = await prisma.user.findMany({
    where: { id: { in: authorized } },
    select: { id: true, pushNotificationPrefs: true },
  });
  const shell = shellForAudience(audienceForPushType("new_lead"));
  const devices = await prisma.pushDevice.findMany({
    where: { userId: { in: authorized }, shell },
    select: { userId: true },
  });
  const deviceUsers = [...new Set(devices.map((d) => d.userId))];

  const emailLogs = await prisma.leadEmailLog.findMany({
    where: { leadId: lead.id },
    select: { id: true, workspaceId: true },
  });

  const href = openLeadProfileHref(lead.id);

  const report = {
    flagsSimulated: {
      WORKSPACE_READ_SCOPE: parseCrmReadScope(),
      WORKSPACE_ROUTING_SCOPE: parseWorkspaceRoutingScope(),
      WORKSPACE_NOTIFICATION_SCOPE: parseWorkspaceNotificationScope(),
      WORKSPACE_TEAM_SCOPE: parseWorkspaceTeamScope(),
      WORKSPACE_DUAL_WRITE: isWorkspaceDualWriteEnabled() ? "enabled" : "disabled",
    },
    tenancy: {
      orgSlug: org?.slug ?? null,
      workspaceIdPrefix: lead.workspaceId.slice(0, 8),
      assignedPrefix: lead.assignedAgentId.slice(0, 8),
      assigneeMemberRole: member?.role ?? null,
    },
    canary: {
      leadIdPrefix: lead.id.slice(0, 8),
      source: lead.source,
      status: lead.status,
      intent: lead.intent,
      createdAt: lead.createdAt.toISOString(),
      href,
      notesHasCanary: (lead.notes ?? "").includes(
        "[CANARY] workspace-notification",
      ),
    },
    pipeline: {
      candidates: candidates.map((id) => id.slice(0, 8)),
      authorized: authorized.map((id) => id.slice(0, 8)),
      prefs: users.map((u) => ({
        userPrefix: u.id.slice(0, 8),
        push: isPushTypeEnabled(u.pushNotificationPrefs, "new_lead"),
        email: isStaffEmailCategoryEnabled(
          u.pushNotificationPrefs,
          "new_leads",
        ),
      })),
      deviceBearing: deviceUsers.map((id) => id.slice(0, 8)),
      pushShell: shell,
    },
    isolation: {
      foreignPrefix: foreign?.id.slice(0, 8) ?? null,
      foreignAuthorized: foreignOk,
      unauthorizedLeakPrefixes: unauthorizedLeak.map((id) => id.slice(0, 8)),
    },
    delivery: {
      leadEmailLogCount: emailLogs.length,
      emailLogWorkspaceOk: emailLogs.every(
        (e) => e.workspaceId === lead.workspaceId,
      ),
    },
  };

  console.log(JSON.stringify(report, null, 2));

  const ok =
    org?.slug === "demo-agent" &&
    Boolean(member) &&
    authorized.includes(lead.assignedAgentId) &&
    unauthorizedLeak.length === 0 &&
    foreignOk === false &&
    href === `/agent/leads?lead=${lead.id}` &&
    deviceUsers.includes(lead.assignedAgentId);

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
