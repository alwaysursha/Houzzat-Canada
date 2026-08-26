/**
 * Stage 3J.11.2 — Worker-hosted Tenant B push canary (production-safe).
 *
 * Resolves canary identity server-side. Never accepts workspace/lead/recipient
 * ids or device tokens from the client. Email is never invoked.
 */
import type { PrismaClient } from "@prisma/client";
import { openLeadHandoffHref } from "@/lib/agent/lead-profile-query";
import {
  HOUZZAT_WORKSPACE_SLUG,
  LEGACY_CRM_ORGANIZATION_SLUG,
} from "@/lib/crm-ownership";
import {
  audienceForPushType,
  isPushTypeEnabled,
  shellForAudience,
} from "@/lib/notifications/catalog";
import {
  deliverPushToUsersNow,
  isFirebasePushConfigured,
  type PushDeliveryResult,
  type PushDeliveryStatus,
} from "@/lib/notifications/push";
import {
  filterStaffRecipientsForLead,
  resolveLeadDeskNotifiers,
} from "@/lib/workspace-notification-recipients";

export const TENANT_B_PUSH_CONFIRM = "tenant-canary-push";
export const TENANT_B_WORKSPACE_SLUG = "tenant-canary";
export const TENANT_B_LEAD_MARKER = "[CANARY][TENANT-B]";
export const TENANT_B_PUSH_MARKER = "[CANARY][TENANT-B-PUSH]";
export const TENANT_B_PUSH_ACTIVITY_TYPE = "canary_push";
export const TENANT_B_PUSH_TITLE = "[CANARY] New lead (Tenant B)";
export const TENANT_B_PUSH_BODY =
  "Tenant-canary Lead_B push isolation check — open this lead in workspace B.";
export const TENANT_B_ROUTING_SETTINGS_ID = "tenant-canary-routing";

export type TenantBPushMarkerStatus = "ATTEMPTED" | "SENT" | "FAILED";
export type TenantBPushCanaryMode = "dry-run" | "send";

export type TenantBPushCanaryBody = {
  mode: TenantBPushCanaryMode;
  confirm: string;
};

/** Client keys that must never drive canary targeting. */
export const FORBIDDEN_CLIENT_TARGET_KEYS = [
  "workspaceId",
  "leadId",
  "recipientId",
  "userId",
  "deviceToken",
  "token",
  "pushToken",
] as const;

type TenantBPushContext = {
  workspaceId: string;
  workspaceSlug: string;
  houzzatWorkspaceId: string;
  compatOrgId: string;
  agentBId: string;
  ownerBId: string;
};

export type TenantBPushDeliveryCounts = {
  sent: number;
  failed: number;
  unregistered: number;
  skipped: number;
  other: number;
};

export type TenantBPushCanaryResult = {
  ok: boolean;
  status:
    | "dry-run"
    | "sent"
    | "failed"
    | "already_sent"
    | "blocked"
    | "firebase_missing";
  mode: TenantBPushCanaryMode;
  workspace: typeof TENANT_B_WORKSPACE_SLUG;
  leadIdPrefix: string | null;
  href: string | null;
  authorizedRecipients: number;
  houzzatAuthorized: number;
  physicalTargets: number;
  priorMarkerStatus: TenantBPushMarkerStatus | null;
  firebaseConfigured: boolean;
  delivery: TenantBPushDeliveryCounts | null;
  error?: string;
};

function prefix(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.slice(0, 8);
}

export function readTenantBPushMarkerStatus(
  meta: unknown,
  body: string | null,
): TenantBPushMarkerStatus {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const status = (meta as Record<string, unknown>).status;
    if (status === "SENT" || status === "FAILED" || status === "ATTEMPTED") {
      return status;
    }
  }
  // Legacy Stage 3J.11 marker wrote "scheduled" before FCM — treat as FAILED/retryable.
  if (body?.includes(" scheduled")) return "FAILED";
  if (body?.includes(" SENT")) return "SENT";
  if (body?.includes(" FAILED")) return "FAILED";
  return "ATTEMPTED";
}

export function isRetryableTenantBPushMarkerStatus(
  status: TenantBPushMarkerStatus,
): boolean {
  return status !== "SENT";
}

export function countPushDeliveryStatuses(
  results: Array<{ status: PushDeliveryStatus }>,
): TenantBPushDeliveryCounts {
  const counts: TenantBPushDeliveryCounts = {
    sent: 0,
    failed: 0,
    unregistered: 0,
    skipped: 0,
    other: 0,
  };
  for (const row of results) {
    switch (row.status) {
      case "sent":
        counts.sent += 1;
        break;
      case "failed":
        counts.failed += 1;
        break;
      case "unregistered":
        counts.unregistered += 1;
        break;
      case "skipped":
        counts.skipped += 1;
        break;
      case "no_device":
      case "pref_off":
      case "disabled":
        counts.other += 1;
        break;
      default: {
        const _exhaustive: never = row.status;
        void _exhaustive;
        counts.other += 1;
        break;
      }
    }
  }
  return counts;
}

export function parseTenantBPushCanaryBody(
  raw: unknown,
):
  | { ok: true; value: TenantBPushCanaryBody }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Invalid JSON body" };
  }
  const record = raw as Record<string, unknown>;
  for (const key of FORBIDDEN_CLIENT_TARGET_KEYS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return {
        ok: false,
        error: `Rejected client targeting key: ${key}`,
      };
    }
  }
  if (record.confirm !== TENANT_B_PUSH_CONFIRM) {
    return {
      ok: false,
      error: `confirm must be "${TENANT_B_PUSH_CONFIRM}"`,
    };
  }
  if (record.mode !== "dry-run" && record.mode !== "send") {
    return { ok: false, error: 'mode must be "dry-run" or "send"' };
  }
  return {
    ok: true,
    value: {
      mode: record.mode,
      confirm: TENANT_B_PUSH_CONFIRM,
    },
  };
}

async function resolveTenantBPushContext(
  prisma: PrismaClient,
): Promise<TenantBPushContext> {
  const [workspace, houzzat, compatOrg] = await Promise.all([
    prisma.workspace.findUnique({
      where: { slug: TENANT_B_WORKSPACE_SLUG },
      select: {
        id: true,
        slug: true,
        status: true,
        primaryAgentId: true,
      },
    }),
    prisma.workspace.findUnique({
      where: { slug: HOUZZAT_WORKSPACE_SLUG },
      select: { id: true },
    }),
    prisma.organization.findUnique({
      where: { slug: LEGACY_CRM_ORGANIZATION_SLUG },
      select: { id: true },
    }),
  ]);

  if (!houzzat) {
    throw new Error(`Houzzat workspace "${HOUZZAT_WORKSPACE_SLUG}" not found`);
  }
  if (!workspace) {
    throw new Error(`Workspace B slug "${TENANT_B_WORKSPACE_SLUG}" not found`);
  }
  if (workspace.id === houzzat.id) {
    throw new Error("tenant-canary workspace id equals Houzzat id");
  }
  if (workspace.status !== "ACTIVE") {
    throw new Error(`Workspace B status=${workspace.status}`);
  }
  if (!compatOrg) {
    throw new Error(
      `Compatibility org "${LEGACY_CRM_ORGANIZATION_SLUG}" not found`,
    );
  }
  if (!workspace.primaryAgentId) {
    throw new Error("Workspace B primaryAgentId missing");
  }

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id, status: "ACTIVE" },
    select: {
      role: true,
      userId: true,
      user: { select: { agentProfile: { select: { active: true } } } },
    },
  });
  if (members.length !== 2) {
    throw new Error(
      `Workspace B ACTIVE member count=${members.length} (expected 2)`,
    );
  }
  const owner = members.find((m) => m.role === "OWNER");
  const agent = members.find((m) => m.role === "AGENT");
  if (!owner || !agent) {
    throw new Error("Workspace B missing OWNER or AGENT member");
  }
  if (!agent.user.agentProfile?.active) {
    throw new Error("AGENT_B AgentProfile missing or inactive");
  }
  if (workspace.primaryAgentId !== agent.userId) {
    throw new Error("primaryAgentId does not equal AGENT_B");
  }

  const routing = await prisma.crmRoutingSettings.findUnique({
    where: { id: TENANT_B_ROUTING_SETTINGS_ID },
    select: { workspaceId: true, listingAgentId: true },
  });
  if (!routing || routing.workspaceId !== workspace.id) {
    throw new Error("tenant-canary-routing missing or foreign workspace");
  }
  if (routing.listingAgentId !== agent.userId) {
    throw new Error("routing listingAgentId != AGENT_B");
  }

  return {
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    houzzatWorkspaceId: houzzat.id,
    compatOrgId: compatOrg.id,
    agentBId: agent.userId,
    ownerBId: owner.userId,
  };
}

async function resolveExactLeadB(
  prisma: PrismaClient,
  context: TenantBPushContext,
) {
  const leads = await prisma.lead.findMany({
    where: {
      workspaceId: context.workspaceId,
      notes: { contains: TENANT_B_LEAD_MARKER },
    },
    select: {
      id: true,
      workspaceId: true,
      assignedAgentId: true,
      notes: true,
    },
  });
  if (leads.length !== 1) {
    throw new Error(`expected exactly 1 Lead_B, found ${leads.length}`);
  }
  const lead = leads[0]!;
  if (lead.workspaceId !== context.workspaceId) {
    throw new Error("Lead_B workspace mismatch");
  }
  if (lead.assignedAgentId !== context.agentBId) {
    throw new Error("Lead_B assignee != AGENT_B");
  }
  if (!lead.notes?.includes(TENANT_B_LEAD_MARKER)) {
    throw new Error("Lead_B missing canary marker");
  }
  return lead;
}

async function findCanaryPushMarkers(prisma: PrismaClient, leadId: string) {
  return prisma.leadActivity.findMany({
    where: {
      leadId,
      type: TENANT_B_PUSH_ACTIVITY_TYPE,
      body: { contains: TENANT_B_PUSH_MARKER },
    },
    select: { id: true, body: true, meta: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

async function resolveAuthorizedPhysicalTargets(
  prisma: PrismaClient,
  context: TenantBPushContext,
  leadId: string,
): Promise<{
  authorized: string[];
  houzzatAuthorized: number;
  physicalTargets: string[];
}> {
  const desk = await resolveLeadDeskNotifiers({
    organizationId: context.compatOrgId,
    workspaceId: context.workspaceId,
  });
  const candidates = [
    ...new Set(
      [context.agentBId, ...desk.map((d) => d.user.id)].filter(Boolean),
    ),
  ];
  const authorized = await filterStaffRecipientsForLead(
    leadId,
    candidates,
    "new_lead",
  );

  const [houzzatMembers, bMembers] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: context.houzzatWorkspaceId, status: "ACTIVE" },
      select: { userId: true },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId: context.workspaceId, status: "ACTIVE" },
      select: { userId: true },
    }),
  ]);
  const houzzatIds = new Set(houzzatMembers.map((m) => m.userId));
  const bMemberIds = new Set(bMembers.map((m) => m.userId));

  const houzzatAuthorized = authorized.filter((id) => houzzatIds.has(id)).length;
  if (houzzatAuthorized > 0) {
    throw new Error(`${houzzatAuthorized} Houzzat user(s) in authorized set`);
  }
  const foreign = authorized.filter((id) => !bMemberIds.has(id));
  if (foreign.length > 0) {
    throw new Error(
      `${foreign.length} foreign workspace user(s) in authorized set`,
    );
  }

  const shell = shellForAudience(audienceForPushType("new_lead"));
  if (shell !== "houzzatpro") {
    throw new Error(`unexpected staff push shell=${shell}`);
  }

  const physicalTargets: string[] = [];
  for (const userId of authorized) {
    if (houzzatIds.has(userId)) {
      throw new Error("Houzzat user in physical targets");
    }
    if (!bMemberIds.has(userId)) {
      throw new Error("foreign workspace user in physical targets");
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pushNotificationPrefs: true },
    });
    if (!isPushTypeEnabled(user?.pushNotificationPrefs, "new_lead")) continue;
    const devices = await prisma.pushDevice.count({
      where: { userId, shell },
    });
    if (devices > 0) physicalTargets.push(userId);
  }

  if (physicalTargets.length !== 1) {
    throw new Error(
      `physical target count=${physicalTargets.length} (expected exactly 1)`,
    );
  }
  if (physicalTargets[0] !== context.agentBId) {
    throw new Error("physical target is not AGENT_B");
  }

  return { authorized, houzzatAuthorized, physicalTargets };
}

function baseResult(
  mode: TenantBPushCanaryMode,
  extras: Partial<TenantBPushCanaryResult> &
    Pick<
      TenantBPushCanaryResult,
      "ok" | "status" | "firebaseConfigured"
    >,
): TenantBPushCanaryResult {
  return {
    mode,
    workspace: TENANT_B_WORKSPACE_SLUG,
    leadIdPrefix: null,
    href: null,
    authorizedRecipients: 0,
    houzzatAuthorized: 0,
    physicalTargets: 0,
    priorMarkerStatus: null,
    delivery: null,
    ...extras,
  };
}

/**
 * Dry-run or send Tenant B push canary. Call only after platform ADMIN + CSRF gates.
 */
export async function runTenantBPushCanary(
  prisma: PrismaClient,
  input: TenantBPushCanaryBody,
): Promise<TenantBPushCanaryResult> {
  const firebaseConfigured = isFirebasePushConfigured();

  let context: TenantBPushContext;
  try {
    context = await resolveTenantBPushContext(prisma);
  } catch (error) {
    return baseResult(input.mode, {
      ok: false,
      status: "blocked",
      firebaseConfigured,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  let lead: { id: string };
  try {
    lead = await resolveExactLeadB(prisma, context);
  } catch (error) {
    return baseResult(input.mode, {
      ok: false,
      status: "blocked",
      firebaseConfigured,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const href = openLeadHandoffHref(lead.id);
  const markers = await findCanaryPushMarkers(prisma, lead.id);
  const sentMarker = markers.find(
    (row) => readTenantBPushMarkerStatus(row.meta, row.body) === "SENT",
  );
  const priorMarkerStatus =
    markers.length > 0
      ? readTenantBPushMarkerStatus(
          markers[markers.length - 1]!.meta,
          markers[markers.length - 1]!.body,
        )
      : null;

  if (sentMarker) {
    return {
      ok: true,
      status: "already_sent",
      mode: input.mode,
      workspace: TENANT_B_WORKSPACE_SLUG,
      leadIdPrefix: prefix(lead.id),
      href,
      authorizedRecipients: 0,
      houzzatAuthorized: 0,
      physicalTargets: 0,
      priorMarkerStatus: "SENT",
      firebaseConfigured,
      delivery: null,
      error: "ALREADY_SENT",
    };
  }

  let authorized: string[];
  let houzzatAuthorized: number;
  let physicalTargets: string[];
  try {
    ({ authorized, houzzatAuthorized, physicalTargets } =
      await resolveAuthorizedPhysicalTargets(prisma, context, lead.id));
  } catch (error) {
    return {
      ok: false,
      status: "blocked",
      mode: input.mode,
      workspace: TENANT_B_WORKSPACE_SLUG,
      leadIdPrefix: prefix(lead.id),
      href,
      authorizedRecipients: 0,
      houzzatAuthorized: 0,
      physicalTargets: 0,
      priorMarkerStatus,
      firebaseConfigured,
      delivery: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (input.mode === "dry-run") {
    return {
      ok: firebaseConfigured,
      status: firebaseConfigured ? "dry-run" : "firebase_missing",
      mode: "dry-run",
      workspace: TENANT_B_WORKSPACE_SLUG,
      leadIdPrefix: prefix(lead.id),
      href,
      authorizedRecipients: authorized.length,
      houzzatAuthorized,
      physicalTargets: physicalTargets.length,
      priorMarkerStatus,
      firebaseConfigured,
      delivery: null,
      error: firebaseConfigured
        ? undefined
        : "FIREBASE_SERVICE_ACCOUNT missing on Worker",
    };
  }

  // mode === "send"
  if (!firebaseConfigured) {
    return {
      ok: false,
      status: "firebase_missing",
      mode: "send",
      workspace: TENANT_B_WORKSPACE_SLUG,
      leadIdPrefix: prefix(lead.id),
      href,
      authorizedRecipients: authorized.length,
      houzzatAuthorized,
      physicalTargets: physicalTargets.length,
      priorMarkerStatus,
      firebaseConfigured,
      delivery: null,
      error: "FIREBASE_SERVICE_ACCOUNT missing — refuse stub send",
    };
  }

  const attemptMeta = {
    kind: "tenant_b_push_canary",
    status: "ATTEMPTED" as const,
    physicalTargetPrefixes: physicalTargets.map((id) => prefix(id)),
    via: "worker",
  };

  const retryable = [...markers]
    .reverse()
    .find((row) =>
      isRetryableTenantBPushMarkerStatus(
        readTenantBPushMarkerStatus(row.meta, row.body),
      ),
    );

  let markerId: string;
  if (retryable) {
    await prisma.leadActivity.update({
      where: { id: retryable.id },
      data: {
        body: `${TENANT_B_PUSH_MARKER} new_lead push canary ATTEMPTED`,
        meta: attemptMeta,
      },
    });
    markerId = retryable.id;
  } else {
    const created = await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: context.agentBId,
        type: TENANT_B_PUSH_ACTIVITY_TYPE,
        body: `${TENANT_B_PUSH_MARKER} new_lead push canary ATTEMPTED`,
        meta: attemptMeta,
      },
    });
    markerId = created.id;
  }

  const results: PushDeliveryResult[] = await deliverPushToUsersNow(
    physicalTargets,
    {
      type: "new_lead",
      title: TENANT_B_PUSH_TITLE,
      body: TENANT_B_PUSH_BODY,
      href,
    },
  );
  const delivery = countPushDeliveryStatuses(results);
  const anySent = delivery.sent > 0;

  if (anySent) {
    await prisma.leadActivity.update({
      where: { id: markerId },
      data: {
        body: `${TENANT_B_PUSH_MARKER} new_lead push canary SENT`,
        meta: {
          ...attemptMeta,
          status: "SENT",
          delivery,
        },
      },
    });
    return {
      ok: true,
      status: "sent",
      mode: "send",
      workspace: TENANT_B_WORKSPACE_SLUG,
      leadIdPrefix: prefix(lead.id),
      href,
      authorizedRecipients: authorized.length,
      houzzatAuthorized,
      physicalTargets: physicalTargets.length,
      priorMarkerStatus: "SENT",
      firebaseConfigured,
      delivery,
    };
  }

  await prisma.leadActivity.update({
    where: { id: markerId },
    data: {
      body: `${TENANT_B_PUSH_MARKER} new_lead push canary FAILED`,
      meta: {
        ...attemptMeta,
        status: "FAILED",
        delivery,
      },
    },
  });

  return {
    ok: false,
    status: "failed",
    mode: "send",
    workspace: TENANT_B_WORKSPACE_SLUG,
    leadIdPrefix: prefix(lead.id),
    href,
    authorizedRecipients: authorized.length,
    houzzatAuthorized,
    physicalTargets: physicalTargets.length,
    priorMarkerStatus: "FAILED",
    firebaseConfigured,
    delivery,
    error:
      delivery.skipped > 0
        ? "FCM stubbed/skipped"
        : delivery.unregistered > 0
          ? "FCM unregistered"
          : "FCM delivery failed",
  };
}
