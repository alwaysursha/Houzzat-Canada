/**
 * Production canary: ONE workspace-routing lead via live listing inquiry API.
 *
 * Prefer: POST https://houzzat.com/api/leads (uses Cloudflare WORKSPACE_ROUTING_SCOPE)
 * Fallback: local captureWebsiteLead with WORKSPACE_ROUTING_SCOPE=workspace
 *
 *   pnpm exec tsx scripts/workspace-routing-canary.ts
 *   CANARY_VIA=local pnpm exec tsx scripts/workspace-routing-canary.ts
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const SITE = process.env.CANARY_SITE_URL?.trim() || "https://houzzat.com";
const VIA = (process.env.CANARY_VIA?.trim() || "http").toLowerCase();

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const {
    listWorkspaceRoutableAgents,
    resolveDefaultWorkspaceIdForRouting,
    resolveWorkspaceRoutedAssignee,
    loadWorkspaceCrmRoutingSettings,
  } = await import("../src/lib/workspace-routing");
  const { parseCrmReadScope } = await import("../src/lib/crm-read-scope");
  const {
    parseWorkspaceRoutingScope,
    parseWorkspaceNotificationScope,
    parseWorkspaceTeamScope,
  } = await import("../src/lib/workspace-scope-flags");
  const { isWorkspaceDualWriteEnabled } = await import("../src/lib/crm-ownership");
  const { CRM_ROUTING_SETTINGS_ID } = await import("../src/lib/agent/routing-types");

  // Local process flags (for report + optional local path). Production HTTP path
  // uses Cloudflare env; do not require local WORKSPACE_ROUTING_SCOPE for http mode.
  if (VIA === "local") {
    process.env.WORKSPACE_ROUTING_SCOPE = "workspace";
  }

  const flagsLocal = {
    WORKSPACE_READ_SCOPE: parseCrmReadScope(),
    WORKSPACE_ROUTING_SCOPE: parseWorkspaceRoutingScope(),
    WORKSPACE_NOTIFICATION_SCOPE: parseWorkspaceNotificationScope(),
    WORKSPACE_TEAM_SCOPE: parseWorkspaceTeamScope(),
    WORKSPACE_DUAL_WRITE: isWorkspaceDualWriteEnabled() ? "enabled" : "disabled",
    canaryVia: VIA,
  };

  const workspaceId = await resolveDefaultWorkspaceIdForRouting();
  if (!workspaceId) {
    console.error("STOP: houzzat workspace missing/inactive");
    process.exit(1);
  }

  async function snapshotRouting() {
    const settings = await prisma.crmRoutingSettings.findUnique({
      where: { id: CRM_ROUTING_SETTINGS_ID },
      include: {
        weights: {
          select: {
            id: true,
            lane: true,
            percent: true,
            assignedCount: true,
            agentId: true,
          },
          orderBy: { lane: "asc" },
        },
      },
    });
    const foreign = await prisma.crmRoutingSettings.count({
      where: {
        OR: [
          { workspaceId: { not: workspaceId } },
          { AND: [{ workspaceId: null }, { id: { not: CRM_ROUTING_SETTINGS_ID } }] },
        ],
      },
    });
    return {
      id: settings?.id ?? null,
      workspaceId: settings?.workspaceId ?? null,
      listingAgentIdPrefix: settings?.listingAgentId?.slice(0, 8) ?? null,
      sellerAssignMode: settings?.sellerAssignMode ?? null,
      updatedAt: settings?.updatedAt?.toISOString() ?? null,
      foreignSettingsCount: foreign,
      weights: (settings?.weights ?? []).map((w) => ({
        lane: w.lane,
        percent: w.percent,
        assignedCount: w.assignedCount,
        agentIdPrefix: w.agentId.slice(0, 8),
      })),
    };
  }

  const before = await snapshotRouting();
  if (
    before.id !== CRM_ROUTING_SETTINGS_ID ||
    before.workspaceId !== workspaceId ||
    before.foreignSettingsCount !== 0 ||
    before.weights.length !== 2
  ) {
    console.error("STOP: routing config differs from expected", before);
    process.exit(1);
  }

  const pool = await listWorkspaceRoutableAgents(workspaceId);
  // Single-agent pool: resolve returns early with no assignedCount mutation.
  const resolvedBuyer = await resolveWorkspaceRoutedAssignee(workspaceId, "BUYER");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const canaryEmail = `routing-canary-${stamp}@houzzat-canary.invalid`;
  const canaryTag = `[CANARY] workspace-routing production canary ${stamp}`;

  let leadId: string;
  let sourceMode: "http_property_inquiry" | "local_signup";

  if (VIA === "local") {
    const { captureWebsiteLead } = await import("../src/lib/agent/lead-intake");
    const customer = await prisma.user.upsert({
      where: { email: canaryEmail },
      create: {
        email: canaryEmail,
        name: "Workspace Routing Canary",
        role: "BUYER",
        isBuyer: true,
        isSeller: false,
      },
      update: {
        name: "Workspace Routing Canary",
        role: "BUYER",
        disabledAt: null,
      },
      select: { id: true },
    });
    const captured = await captureWebsiteLead({
      source: "SIGNUP",
      intent: "BUYER",
      isBuyer: true,
      isSeller: false,
      customerId: customer.id,
      name: "Workspace Routing Canary",
      email: canaryEmail,
      notes: canaryTag,
      score: 1,
    });
    leadId = captured.lead.id;
    sourceMode = "local_signup";
  } else {
    const listing = await prisma.listing.findFirst({
      where: { mlsNumber: { not: "" } },
      orderBy: { updatedAt: "desc" },
      select: { mlsNumber: true },
    });
    if (!listing) {
      console.error("STOP: no listing for property inquiry canary");
      process.exit(1);
    }

    const sessionCookie = process.env.CANARY_SESSION_COOKIE?.trim();
    if (!sessionCookie) {
      console.error(
        "STOP: POST /api/leads requires a signed-in customer. Set CANARY_SESSION_COOKIE, or run CANARY_VIA=local. This script will not create a guest user.",
      );
      process.exit(1);
    }

    const res = await fetch(`${SITE}/api/leads`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: SITE,
        cookie: sessionCookie,
        "user-agent": "houzzat-workspace-routing-canary/1.0",
      },
      body: JSON.stringify({
        mlsNumber: listing.mlsNumber,
        name: "Workspace Routing Canary",
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
      console.error("STOP: production inquiry failed", {
        status: res.status,
        body,
      });
      process.exit(1);
    }
    leadId = body.leadId;
    sourceMode = "http_property_inquiry";
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
    console.error("STOP: canary lead not found after create");
    process.exit(1);
  }

  const after = await snapshotRouting();
  const org = lead.organizationId
    ? await prisma.organization.findUnique({
        where: { id: lead.organizationId },
        select: { slug: true },
      })
    : null;

  const member = lead.assignedAgentId
    ? await prisma.workspaceMember.findFirst({
        where: {
          workspaceId: lead.workspaceId ?? workspaceId,
          userId: lead.assignedAgentId,
          status: "ACTIVE",
        },
        select: { role: true, status: true },
      })
    : null;

  const tasks = await prisma.agentTask.findMany({
    where: { leadId: lead.id },
    select: {
      id: true,
      title: true,
      organizationId: true,
      workspaceId: true,
      assigneeId: true,
    },
  });

  const report = {
    flagsLocal,
    productionFlagAssumption: {
      WORKSPACE_ROUTING_SCOPE: "workspace",
      WORKSPACE_READ_SCOPE: "shadow",
      WORKSPACE_NOTIFICATION_SCOPE: "unset→legacy",
      WORKSPACE_TEAM_SCOPE: "unset→legacy",
    },
    workspaceIdPrefix: workspaceId.slice(0, 8),
    settingsLoaded: Boolean(await loadWorkspaceCrmRoutingSettings(workspaceId)),
    pool: pool.map((a) => ({ idPrefix: a.id.slice(0, 8) })),
    poolCount: pool.length,
    resolvedBuyerPrefix: resolvedBuyer?.slice(0, 8) ?? null,
    before,
    after,
    canary: {
      via: sourceMode,
      site: VIA === "local" ? "local" : SITE,
      leadIdPrefix: lead.id.slice(0, 8),
      leadId: lead.id,
      source: lead.source,
      status: lead.status,
      intent: lead.intent,
      createdAt: lead.createdAt.toISOString(),
      organizationIdPrefix: lead.organizationId?.slice(0, 8) ?? null,
      organizationSlug: org?.slug ?? null,
      workspaceIdPrefix: lead.workspaceId?.slice(0, 8) ?? null,
      assignedAgentIdPrefix: lead.assignedAgentId?.slice(0, 8) ?? null,
      listingMls: lead.listingMls,
      notesHasCanaryTag: (lead.notes ?? "").includes("[CANARY] workspace-routing"),
      assigneeIsActiveMember: Boolean(member),
      assigneeMemberRole: member?.role ?? null,
      childTasks: tasks.map((t) => ({
        idPrefix: t.id.slice(0, 8),
        title: t.title,
        organizationIdPrefix: t.organizationId?.slice(0, 8) ?? null,
        workspaceIdPrefix: t.workspaceId?.slice(0, 8) ?? null,
        assigneeIdPrefix: t.assigneeId?.slice(0, 8) ?? null,
        workspaceMatchesLead: t.workspaceId === lead.workspaceId,
      })),
    },
  };

  console.log(JSON.stringify(report, null, 2));

  const weightsStable = before.weights.every((w, i) => {
    const a = after.weights[i];
    return (
      a &&
      w.lane === a.lane &&
      w.percent === a.percent &&
      w.agentIdPrefix === a.agentIdPrefix
      // assignedCount may change when multi-agent fair-share path runs
    );
  });

  const ok =
    lead.workspaceId === workspaceId &&
    org?.slug === "demo-agent" &&
    Boolean(lead.assignedAgentId) &&
    Boolean(member) &&
    pool.length === 1 &&
    resolvedBuyer === lead.assignedAgentId &&
    before.id === after.id &&
    before.workspaceId === after.workspaceId &&
    before.listingAgentIdPrefix === after.listingAgentIdPrefix &&
    before.sellerAssignMode === after.sellerAssignMode &&
    weightsStable &&
    after.foreignSettingsCount === 0;

  if (!ok) {
    console.error(
      "CANARY FAILED — USER SHOULD SET WORKSPACE_ROUTING_SCOPE=legacy (Cursor will not change it)",
    );
    process.exit(1);
  }

  console.log("CANARY PASSED");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  });
