/**
 * Stage 3K.5.8E — Tenant Canary HOME_VALUATION push delivery canary.
 *
 * One controlled native FCM push to Agent B using an existing tenant-canary lead.
 * Server-side identity only. Email never invoked. Lead row never mutated.
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
  inspectFirebaseServiceAccountShape,
  isFirebasePushConfigured,
  isFirebaseServiceAccountReady,
  type FirebaseServiceAccountInspect,
  type FcmFailureCategory,
  type PushDeliveryResult,
  type PushDeliveryStatus,
} from "@/lib/notifications/push";
import { filterStaffRecipientsForLead } from "@/lib/workspace-notification-recipients";
import {
  countPushDeliveryStatuses,
  type TenantBPushDeliveryCounts,
} from "@/lib/workspace-canary/tenant-b-push-canary";

export const TENANT_CANARY_PUSH_DELIVERY_CONFIRM = "tenant-canary-push-delivery";
export const TENANT_CANARY_WORKSPACE_SLUG = "tenant-canary";
export const TENANT_CANARY_PUSH_DELIVERY_MARKER =
  "[CANARY][TENANT-CANARY-PUSH-DELIVERY]";
export const TENANT_CANARY_PUSH_DELIVERY_ACTIVITY = "canary_push_delivery";
export const TENANT_CANARY_PUSH_DELIVERY_TITLE = "[CANARY] Tenant Canary";
export const TENANT_CANARY_PUSH_DELIVERY_BODY = "Push delivery verification";
export const TENANT_CANARY_AGENT_B_EMAIL = "hadia_agent@yahoo.com";
export const TENANT_CANARY_EXPECTED_FIREBASE_PROJECT = "houzzat-aa1b0";

export type TenantCanaryPushDeliveryMarkerStatus =
  | "ATTEMPTED"
  | "SENT"
  | "FAILED";

export type TenantCanaryPushDeliveryMode = "dry-run" | "send";

export type TenantCanaryPushDeliveryBody = {
  mode: TenantCanaryPushDeliveryMode;
  confirm: string;
};

export const FORBIDDEN_PUSH_DELIVERY_CLIENT_KEYS = [
  "workspaceId",
  "leadId",
  "recipientId",
  "userId",
  "email",
  "deviceToken",
  "token",
  "pushToken",
  "firebaseProject",
  "projectId",
] as const;

export type TenantCanaryPushDeliveryAuthInput = {
  workspaceSlug: string | null;
  workspaceRole: "OWNER" | "ADMIN" | "AGENT" | string | null;
  membershipActive: boolean;
};

export type TenantCanaryPushDeliveryAuthResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Stage 3K.5.8H — pure auth decision for Tenant Canary push canary.
 * Hostname tenancy + ACTIVE OWNER/ADMIN membership. User.role is irrelevant.
 */
export function authorizeTenantCanaryPushDeliveryCanary(
  input: TenantCanaryPushDeliveryAuthInput,
): TenantCanaryPushDeliveryAuthResult {
  if (!input.workspaceSlug) {
    return { ok: false, reason: "workspace_not_resolved" };
  }
  if (input.workspaceSlug !== TENANT_CANARY_WORKSPACE_SLUG) {
    return { ok: false, reason: "workspace_slug_mismatch" };
  }
  if (!input.membershipActive) {
    return { ok: false, reason: "workspace_membership_required" };
  }
  if (input.workspaceRole !== "OWNER" && input.workspaceRole !== "ADMIN") {
    return { ok: false, reason: "workspace_owner_or_admin_required" };
  }
  return { ok: true };
}

export function isTenantCanaryPushDeliveryDryRunReady(result: {
  ok: boolean;
  status: string;
  authorizedRecipients: number;
  houzzatAuthorized: number;
  physicalTargets: number;
  firebaseConfigured: boolean;
  firebaseServiceAccountReady?: boolean;
}): boolean {
  return (
    result.ok &&
    result.status === "dry-run" &&
    result.authorizedRecipients === 1 &&
    result.houzzatAuthorized === 0 &&
    result.physicalTargets === 1 &&
    result.firebaseConfigured &&
    result.firebaseServiceAccountReady !== false
  );
}

type TenantCanaryPushDeliveryContext = {
  workspaceId: string;
  houzzatWorkspaceId: string;
  agentBId: string;
  agentBEmail: string;
};

export type TenantCanaryPushDeliveryResult = {
  ok: boolean;
  status:
    | "dry-run"
    | "sent"
    | "failed"
    | "already_sent"
    | "blocked"
    | "firebase_missing";
  mode: TenantCanaryPushDeliveryMode;
  workspace: typeof TENANT_CANARY_WORKSPACE_SLUG;
  leadIdPrefix: string | null;
  leadSource: string | null;
  href: string | null;
  authorizedRecipients: number;
  houzzatAuthorized: number;
  physicalTargets: number;
  priorMarkerStatus: TenantCanaryPushDeliveryMarkerStatus | null;
  firebaseConfigured: boolean;
  firebaseServiceAccountReady: boolean;
  firebaseServiceAccountInspect: FirebaseServiceAccountInspect | null;
  firebaseProjectExpected: typeof TENANT_CANARY_EXPECTED_FIREBASE_PROJECT;
  email: "SKIP";
  delivery: TenantBPushDeliveryCounts | null;
  providerErrorCategory?: FcmFailureCategory | null;
  providerHttpStatus?: number | null;
  error?: string;
};

function prefix(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.slice(0, 8);
}

export function readTenantCanaryPushDeliveryMarkerStatus(
  meta: unknown,
  body: string | null,
): TenantCanaryPushDeliveryMarkerStatus {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const status = (meta as Record<string, unknown>).status;
    if (status === "SENT" || status === "FAILED" || status === "ATTEMPTED") {
      return status;
    }
  }
  if (body?.includes(" SENT")) return "SENT";
  if (body?.includes(" FAILED")) return "FAILED";
  if (body?.includes(" ATTEMPTED")) return "ATTEMPTED";
  return "ATTEMPTED";
}

export function isRetryablePushDeliveryMarkerStatus(
  status: TenantCanaryPushDeliveryMarkerStatus,
): boolean {
  return status !== "SENT";
}

export function parseTenantCanaryPushDeliveryBody(
  raw: unknown,
):
  | { ok: true; value: TenantCanaryPushDeliveryBody }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Invalid JSON body" };
  }
  const record = raw as Record<string, unknown>;
  for (const key of FORBIDDEN_PUSH_DELIVERY_CLIENT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return {
        ok: false,
        error: `Rejected client targeting key: ${key}`,
      };
    }
  }
  if (record.confirm !== TENANT_CANARY_PUSH_DELIVERY_CONFIRM) {
    return {
      ok: false,
      error: `confirm must be "${TENANT_CANARY_PUSH_DELIVERY_CONFIRM}"`,
    };
  }
  if (record.mode !== "dry-run" && record.mode !== "send") {
    return { ok: false, error: 'mode must be "dry-run" or "send"' };
  }
  return {
    ok: true,
    value: {
      mode: record.mode,
      confirm: TENANT_CANARY_PUSH_DELIVERY_CONFIRM,
    },
  };
}

async function resolveTenantCanaryPushDeliveryContext(
  prisma: PrismaClient,
): Promise<TenantCanaryPushDeliveryContext> {
  const [workspace, houzzat] = await Promise.all([
    prisma.workspace.findUnique({
      where: { slug: TENANT_CANARY_WORKSPACE_SLUG },
      select: {
        id: true,
        status: true,
        primaryAgentId: true,
      },
    }),
    prisma.workspace.findUnique({
      where: { slug: HOUZZAT_WORKSPACE_SLUG },
      select: { id: true },
    }),
  ]);

  if (!houzzat) {
    throw new Error(`Houzzat workspace "${HOUZZAT_WORKSPACE_SLUG}" not found`);
  }
  if (!workspace || workspace.status !== "ACTIVE") {
    throw new Error(`Workspace "${TENANT_CANARY_WORKSPACE_SLUG}" not ACTIVE`);
  }

  const agentB = await prisma.user.findFirst({
    where: {
      email: TENANT_CANARY_AGENT_B_EMAIL,
      workspaceId: workspace.id,
    },
    select: {
      id: true,
      email: true,
      disabledAt: true,
      agentProfile: { select: { active: true } },
    },
  });

  if (!agentB || agentB.disabledAt) {
    throw new Error(`Agent B user missing or disabled`);
  }
  if (!agentB.agentProfile?.active) {
    throw new Error("Agent B AgentProfile inactive");
  }
  if (workspace.primaryAgentId !== agentB.id) {
    throw new Error("Workspace primaryAgentId != Agent B");
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: workspace.id,
      userId: agentB.id,
      status: "ACTIVE",
      role: "AGENT",
    },
    select: { id: true },
  });
  if (!membership) {
    throw new Error("Agent B missing ACTIVE AGENT WorkspaceMember");
  }

  const houzzatMembership = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: houzzat.id,
      userId: agentB.id,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (houzzatMembership) {
    throw new Error("Agent B must not be Houzzat WorkspaceMember");
  }

  return {
    workspaceId: workspace.id,
    houzzatWorkspaceId: houzzat.id,
    agentBId: agentB.id,
    agentBEmail: agentB.email ?? TENANT_CANARY_AGENT_B_EMAIL,
  };
}

async function resolveLatestHomeValuationTestLead(
  prisma: PrismaClient,
  context: TenantCanaryPushDeliveryContext,
) {
  const lead = await prisma.lead.findFirst({
    where: {
      workspaceId: context.workspaceId,
      source: "HOME_VALUATION",
      assignedAgentId: context.agentBId,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      workspaceId: true,
      assignedAgentId: true,
      source: true,
    },
  });
  if (!lead) {
    throw new Error(
      "No tenant-canary HOME_VALUATION lead assigned to Agent B",
    );
  }
  if (lead.workspaceId !== context.workspaceId) {
    throw new Error("Selected lead workspace mismatch");
  }
  if (lead.assignedAgentId !== context.agentBId) {
    throw new Error("Selected lead assignee != Agent B");
  }
  return lead;
}

async function findPushDeliveryMarkers(prisma: PrismaClient, leadId: string) {
  return prisma.leadActivity.findMany({
    where: {
      leadId,
      type: TENANT_CANARY_PUSH_DELIVERY_ACTIVITY,
      body: { contains: TENANT_CANARY_PUSH_DELIVERY_MARKER },
    },
    select: { id: true, body: true, meta: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

async function resolveAgentBOnlyPhysicalTarget(
  prisma: PrismaClient,
  context: TenantCanaryPushDeliveryContext,
  leadId: string,
): Promise<{
  authorized: string[];
  houzzatAuthorized: number;
  physicalTargets: string[];
}> {
  const authorized = await filterStaffRecipientsForLead(
    leadId,
    [context.agentBId],
    "canary_push_delivery",
  );

  const houzzatMembers = await prisma.workspaceMember.findMany({
    where: { workspaceId: context.houzzatWorkspaceId, status: "ACTIVE" },
    select: { userId: true },
  });
  const houzzatIds = new Set(houzzatMembers.map((m) => m.userId));
  const houzzatAuthorized = authorized.filter((id) => houzzatIds.has(id)).length;
  if (houzzatAuthorized > 0) {
    throw new Error(`${houzzatAuthorized} Houzzat user(s) in authorized set`);
  }

  if (authorized.length !== 1 || authorized[0] !== context.agentBId) {
    throw new Error("authorized recipient is not exactly Agent B");
  }

  const shell = shellForAudience(audienceForPushType("new_lead"));
  if (shell !== "houzzatpro") {
    throw new Error(`unexpected staff push shell=${shell}`);
  }

  const user = await prisma.user.findFirst({
    where: { id: context.agentBId },
    select: { pushNotificationPrefs: true },
  });
  if (!isPushTypeEnabled(user?.pushNotificationPrefs, "new_lead")) {
    throw new Error("Agent B new_lead push preference disabled");
  }

  const deviceCount = await prisma.pushDevice.count({
    where: { userId: context.agentBId, shell, platform: "android" },
  });
  if (deviceCount === 0) {
    throw new Error("Agent B has no houzzatpro android PushDevice");
  }

  return {
    authorized,
    houzzatAuthorized,
    physicalTargets: [context.agentBId],
  };
}

function baseResult(
  mode: TenantCanaryPushDeliveryMode,
  extras: Partial<TenantCanaryPushDeliveryResult> &
    Pick<TenantCanaryPushDeliveryResult, "ok" | "status" | "firebaseConfigured">,
): TenantCanaryPushDeliveryResult {
  const inspect = inspectFirebaseServiceAccountShape(
    TENANT_CANARY_EXPECTED_FIREBASE_PROJECT,
  );
  return {
    mode,
    workspace: TENANT_CANARY_WORKSPACE_SLUG,
    leadIdPrefix: null,
    leadSource: null,
    href: null,
    authorizedRecipients: 0,
    houzzatAuthorized: 0,
    physicalTargets: 0,
    priorMarkerStatus: null,
    firebaseServiceAccountReady: isFirebaseServiceAccountReady(
      TENANT_CANARY_EXPECTED_FIREBASE_PROJECT,
    ),
    firebaseServiceAccountInspect: inspect,
    firebaseProjectExpected: TENANT_CANARY_EXPECTED_FIREBASE_PROJECT,
    email: "SKIP",
    delivery: null,
    providerErrorCategory: null,
    providerHttpStatus: null,
    ...extras,
  };
}

function sanitizeDeliveryError(
  delivery: TenantBPushDeliveryCounts,
  category?: FcmFailureCategory | null,
): string {
  if (delivery.sent > 0) return "sent";
  if (category) return category;
  if (delivery.skipped > 0) return "FCM stubbed/skipped";
  if (delivery.unregistered > 0) return "FCM unregistered token";
  if (delivery.failed > 0) return "FCM delivery failed";
  if (delivery.other > 0) return "no_device_or_pref_off";
  return "FCM delivery failed";
}

export async function runTenantCanaryPushDeliveryCanary(
  prisma: PrismaClient,
  input: TenantCanaryPushDeliveryBody,
): Promise<TenantCanaryPushDeliveryResult> {
  const firebaseConfigured = isFirebasePushConfigured();
  const firebaseServiceAccountReady = isFirebaseServiceAccountReady(
    TENANT_CANARY_EXPECTED_FIREBASE_PROJECT,
  );
  const firebaseServiceAccountInspect = inspectFirebaseServiceAccountShape(
    TENANT_CANARY_EXPECTED_FIREBASE_PROJECT,
  );
  const firebaseFields = {
    firebaseConfigured,
    firebaseServiceAccountReady,
    firebaseServiceAccountInspect,
    firebaseProjectExpected: TENANT_CANARY_EXPECTED_FIREBASE_PROJECT,
  } as const;

  let context: TenantCanaryPushDeliveryContext;
  try {
    context = await resolveTenantCanaryPushDeliveryContext(prisma);
  } catch (error) {
    return baseResult(input.mode, {
      ok: false,
      status: "blocked",
      ...firebaseFields,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  let lead: { id: string; source: string };
  try {
    lead = await resolveLatestHomeValuationTestLead(prisma, context);
  } catch (error) {
    return baseResult(input.mode, {
      ok: false,
      status: "blocked",
      ...firebaseFields,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const href = openLeadHandoffHref(lead.id);
  const markers = await findPushDeliveryMarkers(prisma, lead.id);
  const sentMarker = markers.find(
    (row) =>
      readTenantCanaryPushDeliveryMarkerStatus(row.meta, row.body) === "SENT",
  );
  const priorMarkerStatus =
    markers.length > 0
      ? readTenantCanaryPushDeliveryMarkerStatus(
          markers[markers.length - 1]!.meta,
          markers[markers.length - 1]!.body,
        )
      : null;

  if (sentMarker) {
    return {
      ok: true,
      status: "already_sent",
      mode: input.mode,
      workspace: TENANT_CANARY_WORKSPACE_SLUG,
      leadIdPrefix: prefix(lead.id),
      leadSource: lead.source,
      href,
      authorizedRecipients: 0,
      houzzatAuthorized: 0,
      physicalTargets: 0,
      priorMarkerStatus: "SENT",
      ...firebaseFields,
      email: "SKIP",
      delivery: null,
      providerErrorCategory: null,
      providerHttpStatus: null,
      error: "ALREADY_SENT",
    };
  }

  let authorized: string[];
  let houzzatAuthorized: number;
  let physicalTargets: string[];
  try {
    ({ authorized, houzzatAuthorized, physicalTargets } =
      await resolveAgentBOnlyPhysicalTarget(prisma, context, lead.id));
  } catch (error) {
    return {
      ok: false,
      status: "blocked",
      mode: input.mode,
      workspace: TENANT_CANARY_WORKSPACE_SLUG,
      leadIdPrefix: prefix(lead.id),
      leadSource: lead.source,
      href,
      authorizedRecipients: 0,
      houzzatAuthorized: 0,
      physicalTargets: 0,
      priorMarkerStatus,
      ...firebaseFields,
      email: "SKIP",
      delivery: null,
      providerErrorCategory: null,
      providerHttpStatus: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (input.mode === "dry-run") {
    const ready = firebaseConfigured && firebaseServiceAccountReady;
    return {
      ok: ready,
      status: firebaseConfigured ? "dry-run" : "firebase_missing",
      mode: "dry-run",
      workspace: TENANT_CANARY_WORKSPACE_SLUG,
      leadIdPrefix: prefix(lead.id),
      leadSource: lead.source,
      href,
      authorizedRecipients: authorized.length,
      houzzatAuthorized,
      physicalTargets: physicalTargets.length,
      priorMarkerStatus,
      ...firebaseFields,
      email: "SKIP",
      delivery: null,
      providerErrorCategory: firebaseServiceAccountReady
        ? null
        : firebaseConfigured
          ? "firebase_service_account_invalid"
          : "firebase_service_account_missing",
      providerHttpStatus: null,
      error: !firebaseConfigured
        ? "FIREBASE_SERVICE_ACCOUNT missing on Worker"
        : !firebaseServiceAccountReady
          ? "FIREBASE_SERVICE_ACCOUNT present but shape/project invalid"
          : undefined,
    };
  }

  if (!firebaseConfigured || !firebaseServiceAccountReady) {
    return {
      ok: false,
      status: "firebase_missing",
      mode: "send",
      workspace: TENANT_CANARY_WORKSPACE_SLUG,
      leadIdPrefix: prefix(lead.id),
      leadSource: lead.source,
      href,
      authorizedRecipients: authorized.length,
      houzzatAuthorized,
      physicalTargets: physicalTargets.length,
      priorMarkerStatus,
      ...firebaseFields,
      email: "SKIP",
      delivery: null,
      providerErrorCategory: !firebaseConfigured
        ? "firebase_service_account_missing"
        : "firebase_service_account_invalid",
      providerHttpStatus: null,
      error: !firebaseConfigured
        ? "FIREBASE_SERVICE_ACCOUNT missing — refuse stub send"
        : "FIREBASE_SERVICE_ACCOUNT invalid/mismatched — refuse send",
    };
  }

  const attemptMeta = {
    kind: "tenant_canary_push_delivery",
    status: "ATTEMPTED" as const,
    physicalTargetPrefixes: physicalTargets.map((id) => prefix(id)),
    via: "worker",
  };

  const retryable = [...markers]
    .reverse()
    .find((row) =>
      isRetryablePushDeliveryMarkerStatus(
        readTenantCanaryPushDeliveryMarkerStatus(row.meta, row.body),
      ),
    );

  let markerId: string;
  if (retryable) {
    await prisma.leadActivity.update({
      where: { id: retryable.id },
      data: {
        body: `${TENANT_CANARY_PUSH_DELIVERY_MARKER} push delivery canary ATTEMPTED`,
        meta: attemptMeta,
      },
    });
    markerId = retryable.id;
  } else {
    const created = await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: context.agentBId,
        type: TENANT_CANARY_PUSH_DELIVERY_ACTIVITY,
        body: `${TENANT_CANARY_PUSH_DELIVERY_MARKER} push delivery canary ATTEMPTED`,
        meta: attemptMeta,
      },
    });
    markerId = created.id;
  }

  const results: PushDeliveryResult[] = await deliverPushToUsersNow(
    physicalTargets,
    {
      type: "new_lead",
      title: TENANT_CANARY_PUSH_DELIVERY_TITLE,
      body: TENANT_CANARY_PUSH_DELIVERY_BODY,
      href,
    },
  );
  const delivery = countPushDeliveryStatuses(results);
  const anySent = delivery.sent > 0;
  const firstFailure = results.find((r) => r.failureCategory);
  const providerErrorCategory = firstFailure?.failureCategory ?? null;
  const providerHttpStatus = firstFailure?.providerHttpStatus ?? null;

  if (anySent) {
    await prisma.leadActivity.update({
      where: { id: markerId },
      data: {
        body: `${TENANT_CANARY_PUSH_DELIVERY_MARKER} push delivery canary SENT`,
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
      workspace: TENANT_CANARY_WORKSPACE_SLUG,
      leadIdPrefix: prefix(lead.id),
      leadSource: lead.source,
      href,
      authorizedRecipients: authorized.length,
      houzzatAuthorized,
      physicalTargets: physicalTargets.length,
      priorMarkerStatus: "SENT",
      ...firebaseFields,
      email: "SKIP",
      delivery,
      providerErrorCategory: null,
      providerHttpStatus: null,
    };
  }

  await prisma.leadActivity.update({
    where: { id: markerId },
    data: {
      body: `${TENANT_CANARY_PUSH_DELIVERY_MARKER} push delivery canary FAILED`,
      meta: {
        ...attemptMeta,
        status: "FAILED",
        delivery,
        providerErrorCategory,
        providerHttpStatus,
      },
    },
  });

  return {
    ok: false,
    status: "failed",
    mode: "send",
    workspace: TENANT_CANARY_WORKSPACE_SLUG,
    leadIdPrefix: prefix(lead.id),
    leadSource: lead.source,
    href,
    authorizedRecipients: authorized.length,
    houzzatAuthorized,
    physicalTargets: physicalTargets.length,
    priorMarkerStatus: "FAILED",
    ...firebaseFields,
    email: "SKIP",
    delivery,
    providerErrorCategory,
    providerHttpStatus,
    error: sanitizeDeliveryError(delivery, providerErrorCategory),
  };
}

export type { PushDeliveryStatus };
