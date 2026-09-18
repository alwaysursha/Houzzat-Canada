/**
 * Canonical Customer Chat identity → Workspace → Lead resolver.
 *
 * AUTHORIZATION BOUNDARY
 * Workspace comes from trusted request hostname
 * (`extractTrustedRequestHostname` → `resolveWorkspaceFromRequest`).
 * Customer comes from the Auth.js session User id.
 * Lead is `Lead.customerId === session.user.id` AND
 * `Lead.workspaceId === hostname workspace`.
 *
 * Client `leadId`, `workspaceId`, `conversationId`, `senderUserId`,
 * `senderName`, `email`, and `assignedAgentId` are never identity authority.
 *
 * Read-only `resolveCustomerChatLead` does not create a Lead or assign.
 * `ensureCustomerChatLead` may create via `captureWebsiteLead` and assign
 * via hostname-bound `resolveLeadDeskAssignmentForRequest`.
 *
 * Do NOT call `routeExistingLead` — it drops Workspace context.
 * Do NOT call `applyLeadAssignment` — it can rewrite `Lead.workspaceId`
 * through org→workspace mapping. Assignment uses a workspace-preserving
 * `updateMany` (`id` + `workspaceId` + `assignedAgentId: null`).
 *
 * This module does not create Conversation or Message rows, mark read,
 * alter consent, or send Chat notifications.
 */
import type { LeadIntent, LeadSource, Role } from "@prisma/client";
import {
  captureWebsiteLead,
  resolveLeadDeskAssignmentForRequest,
} from "@/lib/agent/lead-intake";
import { selectPrimaryLeadsByCustomer } from "@/lib/agent/select-primary-leads-by-customer";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isConsumerRole } from "@/lib/roles";
import type {
  HostResolutionDenyReason,
  ResolvedWorkspaceHost,
} from "@/lib/tenancy/host-resolution-types";
import {
  resolveWorkspaceFromRequest,
  type HostResolutionDeps,
} from "@/lib/tenancy/resolve-workspace-host";
import {
  assertAssigneeEligibleForWorkspace,
  PublicLeadRoutingError,
  type ResolvedPublicLeadDesk,
} from "@/lib/workspace-lead-desk";
import { listWorkspaceRoutableAgents } from "@/lib/workspace-routing";

export const CUSTOMER_CHAT_UNTRUSTED_IDENTITY_KEYS = [
  "leadId",
  "workspaceId",
  "workspaceSlug",
  "conversationId",
  "senderUserId",
  "senderName",
  "email",
  "assignedAgentId",
  "userId",
  "customerId",
  "hostname",
  "domain",
  "tenant",
  "tenantSlug",
] as const;

export type CustomerChatUntrustedIdentityKey =
  (typeof CUSTOMER_CHAT_UNTRUSTED_IDENTITY_KEYS)[number];

/**
 * Inherited from `selectPrimaryLeadsByCustomer`:
 * 1. latest `updatedAt`
 * 2. higher `score`
 * 3. lexicographically smaller `id`
 */
export const CUSTOMER_CHAT_PRIMARY_LEAD_TIEBREAK = [
  "latest updatedAt",
  "higher score",
  "lexicographically smaller id",
] as const;

export type CustomerChatResolverMode = "resolve" | "ensure";

export type CustomerChatAssignmentState =
  | "ASSIGNED"
  | "UNASSIGNED"
  | "NO_ELIGIBLE_AGENT"
  | "ASSIGNED_AGENT_INELIGIBLE";

export type CustomerChatLeadFailureReason =
  | "UNAUTHENTICATED"
  | "STAFF_FORBIDDEN"
  | "CUSTOMER_DISABLED"
  | "WORKSPACE_UNAVAILABLE"
  | "PLATFORM_SURFACE"
  | "LEAD_NOT_FOUND"
  | "NO_ELIGIBLE_AGENT"
  | "ROUTING_UNAVAILABLE";

export type CustomerChatLeadRow = {
  id: string;
  workspaceId: string;
  customerId: string | null;
  assignedAgentId: string | null;
  intent: LeadIntent;
  score: number;
  updatedAt: Date;
};

export type CustomerChatUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  disabledAt: Date | null;
};

export type CustomerChatLeadSuccess = {
  ok: true;
  workspaceId: string;
  workspaceSlug: string;
  customerUserId: string;
  customerDisplayName: string;
  customerEmail: string;
  leadId: string;
  assignedAgentId: string | null;
  assignmentState: CustomerChatAssignmentState;
  assignedAgentEligible: boolean;
  leadExisted: boolean;
  leadCreated: boolean;
  canSend: boolean;
};

export type CustomerChatLeadFailure = {
  ok: false;
  reason: CustomerChatLeadFailureReason;
  workspaceId?: string | null;
  workspaceSlug?: string | null;
  customerUserId?: string | null;
  leadId?: string | null;
  assignedAgentId?: string | null;
  assignmentState?: CustomerChatAssignmentState;
  hostDenyReason?: HostResolutionDenyReason;
};

export type CustomerChatLeadResult =
  | CustomerChatLeadSuccess
  | CustomerChatLeadFailure;

export type CustomerChatAssignIfUnassignedInput = {
  leadId: string;
  workspaceId: string;
  assigneeId: string;
  actorId: string | null;
};

export type CustomerChatLeadResolverDeps = {
  auth: () => Promise<{
    user?: { id?: string | null; email?: string | null } | null;
  } | null>;
  resolveWorkspaceFromRequest: (
    request: Request,
    deps?: HostResolutionDeps,
  ) => Promise<ResolvedWorkspaceHost>;
  findCustomerUser: (userId: string) => Promise<CustomerChatUser | null>;
  listCustomerWorkspaceLeads: (
    workspaceId: string,
    customerId: string,
  ) => Promise<CustomerChatLeadRow[]>;
  loadLead: (
    workspaceId: string,
    leadId: string,
  ) => Promise<CustomerChatLeadRow | null>;
  captureWebsiteLead: typeof captureWebsiteLead;
  resolveLeadDeskAssignmentForRequest: (
    request: Request,
    intent: LeadIntent,
    deps?: HostResolutionDeps,
  ) => Promise<ResolvedPublicLeadDesk>;
  assertAssigneeEligibleForWorkspace: (
    workspaceId: string,
    assigneeId: string | null | undefined,
  ) => Promise<void>;
  listRoutableAgentIds: (workspaceId: string) => Promise<string[]>;
  assignIfUnassigned: (
    input: CustomerChatAssignIfUnassignedInput,
  ) => Promise<{ wrote: boolean }>;
};

export type CustomerChatLeadResolverInput = {
  request: Request;
  /**
   * Optional request body/query. Identity keys are ignored.
   * Present so future APIs can pass the raw payload through for tests.
   */
  untrustedClientHints?: Record<string, unknown> | null;
  hostDeps?: HostResolutionDeps;
  deps?: Partial<CustomerChatLeadResolverDeps>;
};

function fail(
  reason: CustomerChatLeadFailureReason,
  extra: Omit<CustomerChatLeadFailure, "ok" | "reason"> = {},
): CustomerChatLeadFailure {
  return { ok: false, reason, ...extra };
}

export function frozenCustomerChatDisplayName(user: {
  name: string | null;
  email: string | null;
}): string {
  const name = user.name?.trim();
  if (name) return name;
  const email = user.email?.trim();
  if (email) return email;
  return "Lead";
}

export function selectPrimaryCustomerChatLead<
  T extends {
    id: string;
    customerId?: string | null;
    updatedAt: Date | string;
    score: number;
  },
>(leads: T[]): T | null {
  const [primary] = selectPrimaryLeadsByCustomer(leads);
  return primary ?? null;
}

function ignoreUntrustedClientIdentity(
  hints: Record<string, unknown> | null | undefined,
): void {
  void hints;
}

function mapHostFailure(
  host: Extract<ResolvedWorkspaceHost, { ok: false }>,
): CustomerChatLeadFailure {
  if (host.reason === "platform_surface") {
    return fail("PLATFORM_SURFACE", { hostDenyReason: host.reason });
  }
  return fail("WORKSPACE_UNAVAILABLE", { hostDenyReason: host.reason });
}

function mapPublicLeadRoutingError(
  error: PublicLeadRoutingError,
  extra: Omit<CustomerChatLeadFailure, "ok" | "reason"> = {},
): CustomerChatLeadFailure {
  if (error.reason === "platform_surface") {
    return fail("PLATFORM_SURFACE", extra);
  }
  if (error.reason === "workspace_not_resolved") {
    return fail("WORKSPACE_UNAVAILABLE", extra);
  }
  if (
    error.reason === "lead_desk_not_configured" ||
    error.reason === "assignee_not_allowed" ||
    error.reason === "organization_not_allowed"
  ) {
    return fail("NO_ELIGIBLE_AGENT", extra);
  }
  return fail("ROUTING_UNAVAILABLE", extra);
}

function successFromLead(input: {
  host: Extract<ResolvedWorkspaceHost, { ok: true }>;
  user: CustomerChatUser;
  lead: CustomerChatLeadRow;
  assignedAgentEligible: boolean;
  leadExisted: boolean;
  leadCreated: boolean;
}): CustomerChatLeadSuccess {
  const assignedAgentId = input.lead.assignedAgentId;
  let assignmentState: CustomerChatAssignmentState;
  if (!assignedAgentId) {
    assignmentState = "UNASSIGNED";
  } else if (!input.assignedAgentEligible) {
    assignmentState = "ASSIGNED_AGENT_INELIGIBLE";
  } else {
    assignmentState = "ASSIGNED";
  }
  return {
    ok: true,
    workspaceId: input.host.workspaceId,
    workspaceSlug: input.host.workspaceSlug,
    customerUserId: input.user.id,
    customerDisplayName: frozenCustomerChatDisplayName(input.user),
    customerEmail: input.user.email,
    leadId: input.lead.id,
    assignedAgentId,
    assignmentState,
    assignedAgentEligible: Boolean(assignedAgentId) && input.assignedAgentEligible,
    leadExisted: input.leadExisted,
    leadCreated: input.leadCreated,
    canSend: Boolean(assignedAgentId),
  };
}

function pondUnavailable(input: {
  host: Extract<ResolvedWorkspaceHost, { ok: true }>;
  user: CustomerChatUser;
  lead: CustomerChatLeadRow | null;
}): CustomerChatLeadFailure {
  return fail("NO_ELIGIBLE_AGENT", {
    workspaceId: input.host.workspaceId,
    workspaceSlug: input.host.workspaceSlug,
    customerUserId: input.user.id,
    leadId: input.lead?.id ?? null,
    assignedAgentId: null,
    assignmentState: "NO_ELIGIBLE_AGENT",
  });
}

async function defaultFindCustomerUser(
  userId: string,
): Promise<CustomerChatUser | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      disabledAt: true,
    },
  });
}

function toCustomerChatLeadRow(row: {
  id: string;
  workspaceId: string | null;
  customerId: string | null;
  assignedAgentId: string | null;
  intent: LeadIntent;
  score: number;
  updatedAt: Date;
}): CustomerChatLeadRow | null {
  if (!row.workspaceId) return null;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    customerId: row.customerId,
    assignedAgentId: row.assignedAgentId,
    intent: row.intent,
    score: row.score,
    updatedAt: row.updatedAt,
  };
}

async function defaultListCustomerWorkspaceLeads(
  workspaceId: string,
  customerId: string,
): Promise<CustomerChatLeadRow[]> {
  const rows = await prisma.lead.findMany({
    where: { workspaceId, customerId },
    select: {
      id: true,
      workspaceId: true,
      customerId: true,
      assignedAgentId: true,
      intent: true,
      score: true,
      updatedAt: true,
    },
  });
  return rows.flatMap((row) => {
    const mapped = toCustomerChatLeadRow(row);
    return mapped ? [mapped] : [];
  });
}

async function defaultLoadLead(
  workspaceId: string,
  leadId: string,
): Promise<CustomerChatLeadRow | null> {
  const row = await prisma.lead.findUnique({
    where: { workspaceId_id: { workspaceId, id: leadId } },
    select: {
      id: true,
      workspaceId: true,
      customerId: true,
      assignedAgentId: true,
      intent: true,
      score: true,
      updatedAt: true,
    },
  });
  return row ? toCustomerChatLeadRow(row) : null;
}

async function defaultListRoutableAgentIds(
  workspaceId: string,
): Promise<string[]> {
  const agents = await listWorkspaceRoutableAgents(workspaceId);
  return agents.map((agent) => agent.id);
}

/**
 * Workspace-preserving assign. Does not call `applyLeadAssignment`
 * (that helper can overwrite `workspaceId` via org mapping).
 */
async function defaultAssignIfUnassigned(
  input: CustomerChatAssignIfUnassignedInput,
): Promise<{ wrote: boolean }> {
  const result = await prisma.lead.updateMany({
    where: {
      id: input.leadId,
      workspaceId: input.workspaceId,
      assignedAgentId: null,
    },
    data: { assignedAgentId: input.assigneeId },
  });
  if (result.count === 0) return { wrote: false };

  await prisma.leadActivity.create({
    data: {
      leadId: input.leadId,
      type: "assigned",
      userId: input.actorId ?? undefined,
      body: `Assigned to agent ${input.assigneeId}`,
    },
  });

  return { wrote: true };
}

function mergeDeps(
  overrides?: Partial<CustomerChatLeadResolverDeps>,
): CustomerChatLeadResolverDeps {
  return {
    auth,
    resolveWorkspaceFromRequest,
    findCustomerUser: defaultFindCustomerUser,
    listCustomerWorkspaceLeads: defaultListCustomerWorkspaceLeads,
    loadLead: defaultLoadLead,
    captureWebsiteLead,
    resolveLeadDeskAssignmentForRequest,
    assertAssigneeEligibleForWorkspace: (workspaceId, assigneeId) =>
      assertAssigneeEligibleForWorkspace(workspaceId, assigneeId),
    listRoutableAgentIds: defaultListRoutableAgentIds,
    assignIfUnassigned: defaultAssignIfUnassigned,
    ...overrides,
  };
}

async function presentAssignedLead(input: {
  deps: CustomerChatLeadResolverDeps;
  host: Extract<ResolvedWorkspaceHost, { ok: true }>;
  user: CustomerChatUser;
  lead: CustomerChatLeadRow;
  leadExisted: boolean;
  leadCreated: boolean;
}): Promise<CustomerChatLeadResult> {
  const routable = await input.deps.listRoutableAgentIds(input.host.workspaceId);
  const assignedAgentEligible = Boolean(
    input.lead.assignedAgentId &&
      routable.includes(input.lead.assignedAgentId),
  );
  return successFromLead({
    host: input.host,
    user: input.user,
    lead: input.lead,
    assignedAgentEligible,
    leadExisted: input.leadExisted,
    leadCreated: input.leadCreated,
  });
}

async function ensureAssignmentForUnassignedLead(input: {
  request: Request;
  deps: CustomerChatLeadResolverDeps;
  hostDeps?: HostResolutionDeps;
  host: Extract<ResolvedWorkspaceHost, { ok: true }>;
  user: CustomerChatUser;
  lead: CustomerChatLeadRow;
  leadExisted: boolean;
  leadCreated: boolean;
}): Promise<CustomerChatLeadResult> {
  const { deps, host, user } = input;

  const beforeRoute = await deps.loadLead(host.workspaceId, input.lead.id);
  if (!beforeRoute || beforeRoute.customerId !== user.id) {
    return fail("LEAD_NOT_FOUND", {
      workspaceId: host.workspaceId,
      workspaceSlug: host.workspaceSlug,
      customerUserId: user.id,
    });
  }
  if (beforeRoute.assignedAgentId) {
    return presentAssignedLead({
      deps,
      host,
      user,
      lead: beforeRoute,
      leadExisted: input.leadExisted,
      leadCreated: input.leadCreated,
    });
  }

  let desk: ResolvedPublicLeadDesk;
  try {
    desk = await deps.resolveLeadDeskAssignmentForRequest(
      input.request,
      beforeRoute.intent,
      input.hostDeps,
    );
  } catch (error) {
    if (error instanceof PublicLeadRoutingError) {
      return mapPublicLeadRoutingError(error, {
        workspaceId: host.workspaceId,
        workspaceSlug: host.workspaceSlug,
        customerUserId: user.id,
        leadId: beforeRoute.id,
        assignedAgentId: null,
        assignmentState: "NO_ELIGIBLE_AGENT",
      });
    }
    throw error;
  }

  if (!desk.workspaceId || desk.workspaceId !== host.workspaceId) {
    return fail("ROUTING_UNAVAILABLE", {
      workspaceId: host.workspaceId,
      workspaceSlug: host.workspaceSlug,
      customerUserId: user.id,
      leadId: beforeRoute.id,
      assignedAgentId: null,
      assignmentState: "NO_ELIGIBLE_AGENT",
    });
  }

  if (!desk.assigneeId) {
    return pondUnavailable({ host, user, lead: beforeRoute });
  }

  try {
    await deps.assertAssigneeEligibleForWorkspace(
      host.workspaceId,
      desk.assigneeId,
    );
  } catch (error) {
    if (error instanceof PublicLeadRoutingError) {
      return mapPublicLeadRoutingError(error, {
        workspaceId: host.workspaceId,
        workspaceSlug: host.workspaceSlug,
        customerUserId: user.id,
        leadId: beforeRoute.id,
        assignedAgentId: null,
        assignmentState: "NO_ELIGIBLE_AGENT",
      });
    }
    throw error;
  }

  const beforeAssign = await deps.loadLead(host.workspaceId, beforeRoute.id);
  if (!beforeAssign || beforeAssign.customerId !== user.id) {
    return fail("LEAD_NOT_FOUND", {
      workspaceId: host.workspaceId,
      workspaceSlug: host.workspaceSlug,
      customerUserId: user.id,
    });
  }
  if (beforeAssign.assignedAgentId) {
    return presentAssignedLead({
      deps,
      host,
      user,
      lead: beforeAssign,
      leadExisted: input.leadExisted,
      leadCreated: input.leadCreated,
    });
  }

  await deps.assignIfUnassigned({
    leadId: beforeAssign.id,
    workspaceId: host.workspaceId,
    assigneeId: desk.assigneeId,
    actorId: user.id,
  });

  const afterAssign = await deps.loadLead(host.workspaceId, beforeAssign.id);
  if (!afterAssign || afterAssign.customerId !== user.id) {
    return fail("LEAD_NOT_FOUND", {
      workspaceId: host.workspaceId,
      workspaceSlug: host.workspaceSlug,
      customerUserId: user.id,
    });
  }
  if (!afterAssign.assignedAgentId) {
    return pondUnavailable({ host, user, lead: afterAssign });
  }

  return presentAssignedLead({
    deps,
    host,
    user,
    lead: afterAssign,
    leadExisted: input.leadExisted,
    leadCreated: input.leadCreated,
  });
}

async function ensureLeadExists(input: {
  request: Request;
  deps: CustomerChatLeadResolverDeps;
  hostDeps?: HostResolutionDeps;
  host: Extract<ResolvedWorkspaceHost, { ok: true }>;
  user: CustomerChatUser;
}): Promise<
  | { ok: true; lead: CustomerChatLeadRow; created: boolean }
  | CustomerChatLeadFailure
> {
  const existing = selectPrimaryCustomerChatLead(
    await input.deps.listCustomerWorkspaceLeads(
      input.host.workspaceId,
      input.user.id,
    ),
  );
  if (existing) return { ok: true, lead: existing, created: false };

  const intent: LeadIntent = input.user.role === "SELLER" ? "SELLER" : "BUYER";
  const source: LeadSource = "SIGNUP";

  try {
    await input.deps.captureWebsiteLead({
      source,
      intent,
      isBuyer: intent === "BUYER",
      isSeller: intent === "SELLER",
      customerId: input.user.id,
      name: input.user.name,
      email: input.user.email,
      actorId: input.user.id,
      request: input.request,
      deps: input.hostDeps,
    });
  } catch (error) {
    if (error instanceof PublicLeadRoutingError) {
      return mapPublicLeadRoutingError(error, {
        workspaceId: input.host.workspaceId,
        workspaceSlug: input.host.workspaceSlug,
        customerUserId: input.user.id,
      });
    }
    throw error;
  }

  const after = selectPrimaryCustomerChatLead(
    await input.deps.listCustomerWorkspaceLeads(
      input.host.workspaceId,
      input.user.id,
    ),
  );
  if (!after) {
    return fail("LEAD_NOT_FOUND", {
      workspaceId: input.host.workspaceId,
      workspaceSlug: input.host.workspaceSlug,
      customerUserId: input.user.id,
    });
  }
  return { ok: true, lead: after, created: true };
}

async function runCustomerChatLeadResolver(
  input: CustomerChatLeadResolverInput,
  mode: CustomerChatResolverMode,
): Promise<CustomerChatLeadResult> {
  ignoreUntrustedClientIdentity(input.untrustedClientHints);
  const deps = mergeDeps(input.deps);

  const session = await deps.auth();
  const sessionUserId = session?.user?.id?.trim() ?? "";
  if (!sessionUserId) {
    return fail("UNAUTHENTICATED");
  }

  const user = await deps.findCustomerUser(sessionUserId);
  if (!user) {
    return fail("UNAUTHENTICATED");
  }
  if (user.disabledAt) {
    return fail("CUSTOMER_DISABLED", { customerUserId: user.id });
  }
  if (!isConsumerRole(user.role)) {
    return fail("STAFF_FORBIDDEN", { customerUserId: user.id });
  }

  const host = await deps.resolveWorkspaceFromRequest(
    input.request,
    input.hostDeps,
  );
  if (!host.ok) {
    return mapHostFailure(host);
  }

  let lead = selectPrimaryCustomerChatLead(
    await deps.listCustomerWorkspaceLeads(host.workspaceId, user.id),
  );
  let leadCreated = false;
  let leadExisted = Boolean(lead);

  if (!lead) {
    if (mode === "resolve") {
      return fail("LEAD_NOT_FOUND", {
        workspaceId: host.workspaceId,
        workspaceSlug: host.workspaceSlug,
        customerUserId: user.id,
      });
    }
    const ensured = await ensureLeadExists({
      request: input.request,
      deps,
      hostDeps: input.hostDeps,
      host,
      user,
    });
    if (!ensured.ok) return ensured;
    lead = ensured.lead;
    leadCreated = ensured.created;
    leadExisted = !ensured.created;
  }

  if (lead.assignedAgentId) {
    return presentAssignedLead({
      deps,
      host,
      user,
      lead,
      leadExisted,
      leadCreated,
    });
  }

  if (mode === "resolve") {
    return successFromLead({
      host,
      user,
      lead,
      assignedAgentEligible: false,
      leadExisted,
      leadCreated,
    });
  }

  return ensureAssignmentForUnassignedLead({
    request: input.request,
    deps,
    hostDeps: input.hostDeps,
    host,
    user,
    lead,
    leadExisted,
    leadCreated,
  });
}

/** Read-only: existing workspace Lead only. No create, no routing, no assign. */
export async function resolveCustomerChatLead(
  input: CustomerChatLeadResolverInput,
): Promise<CustomerChatLeadResult> {
  return runCustomerChatLeadResolver(input, "resolve");
}

/**
 * Send-path: create Lead via `captureWebsiteLead` if missing, then
 * hostname-bound routing + workspace-preserving assign if unassigned.
 */
export async function ensureCustomerChatLead(
  input: CustomerChatLeadResolverInput,
): Promise<CustomerChatLeadResult> {
  return runCustomerChatLeadResolver(input, "ensure");
}
