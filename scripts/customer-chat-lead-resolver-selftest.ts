/**
 * Customer Chat Workspace + Lead resolver — in-memory selftest.
 * Does not connect to production. Does not create production rows.
 * Run: pnpm customer-chat-lead-resolver:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Role } from "@prisma/client";
import {
  CUSTOMER_CHAT_PRIMARY_LEAD_TIEBREAK,
  CUSTOMER_CHAT_UNTRUSTED_IDENTITY_KEYS,
  ensureCustomerChatLead,
  frozenCustomerChatDisplayName,
  resolveCustomerChatLead,
  selectPrimaryCustomerChatLead,
  type CustomerChatLeadResolverDeps,
  type CustomerChatLeadRow,
  type CustomerChatUser,
} from "../src/lib/conversations/customer-chat-lead";
import { selectPrimaryLeadsByCustomer } from "../src/lib/agent/select-primary-leads-by-customer";
import {
  PublicLeadRoutingError,
  type ResolvedPublicLeadDesk,
} from "../src/lib/workspace-lead-desk";
import {
  clearHostResolutionCacheForTests,
  createFixtureHostResolutionDeps,
  type HostResolutionDeps,
} from "../src/lib/tenancy/resolve-workspace-host";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_tenant_a";
const WS_B = "ws_tenant_b";
const CUSTOMER_A = "user_customer_a";
const CUSTOMER_B = "user_customer_b";
const AGENT_A = "user_agent_a";
const AGENT_B = "user_agent_b";
const DISABLED_AGENT = "user_agent_disabled";
const HOST_A = "tenant-a.houzzatpro.com";
const HOST_B = "tenant-b.houzzatpro.com";
const T0 = new Date("2026-09-01T00:00:00.000Z");
const T1 = new Date("2026-09-02T00:00:00.000Z");
const T2 = new Date("2026-09-03T00:00:00.000Z");

function withWorkspaceScope<T>(fn: () => Promise<T> | T): Promise<T> {
  const prevDomain = process.env.TENANT_DOMAIN_SCOPE;
  const prevLead = process.env.TENANT_PUBLIC_LEAD_SCOPE;
  process.env.TENANT_DOMAIN_SCOPE = "workspace";
  process.env.TENANT_PUBLIC_LEAD_SCOPE = "workspace";
  clearHostResolutionCacheForTests();
  return Promise.resolve(fn()).finally(() => {
    clearHostResolutionCacheForTests();
    if (prevDomain === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prevDomain;
    if (prevLead === undefined) delete process.env.TENANT_PUBLIC_LEAD_SCOPE;
    else process.env.TENANT_PUBLIC_LEAD_SCOPE = prevLead;
  });
}

function hostDeps(): HostResolutionDeps {
  return createFixtureHostResolutionDeps([
    {
      hostname: HOST_A,
      kind: "PLATFORM",
      role: "CANONICAL",
      workspaceId: WS_A,
      workspaceSlug: "tenant-a",
      domainStatus: "ACTIVE",
      workspaceStatus: "ACTIVE",
    },
    {
      hostname: HOST_B,
      kind: "PLATFORM",
      role: "CANONICAL",
      workspaceId: WS_B,
      workspaceSlug: "tenant-b",
      domainStatus: "ACTIVE",
      workspaceStatus: "ACTIVE",
    },
    {
      hostname: "suspended.houzzatpro.com",
      kind: "PLATFORM",
      role: "CANONICAL",
      workspaceId: "ws_suspended",
      workspaceSlug: "suspended",
      domainStatus: "ACTIVE",
      workspaceStatus: "SUSPENDED",
    },
  ]);
}

function requestForHost(hostname: string): Request {
  return new Request(`https://${hostname}/account`, {
    headers: { host: hostname },
  });
}

function consumer(
  overrides: Partial<CustomerChatUser> & { id?: string } = {},
): CustomerChatUser {
  return {
    id: overrides.id ?? CUSTOMER_A,
    email: overrides.email ?? "customer-a@test.local",
    name: overrides.name ?? "Customer A",
    role: (overrides.role ?? "BUYER") as Role,
    disabledAt: overrides.disabledAt ?? null,
  };
}

type FakeLead = CustomerChatLeadRow & { organizationId?: string | null };

class FakeResolverWorld {
  users = new Map<string, CustomerChatUser>();
  leads: FakeLead[] = [];
  sessionUserId: string | null = CUSTOMER_A;
  routableByWorkspace = new Map<string, string[]>([
    [WS_A, [AGENT_A]],
    [WS_B, [AGENT_B]],
  ]);
  deskAssigneeByWorkspace = new Map<string, string | null>([
    [WS_A, AGENT_A],
    [WS_B, AGENT_B],
  ]);
  deskWorkspaceOverride: string | null = null;
  throwDeskError: PublicLeadRoutingError | null = null;
  captureCalls = 0;
  routingCalls = 0;
  assignCalls: Array<{ leadId: string; assigneeId: string }> = [];
  conversationCreates = 0;
  messageCreates = 0;
  notificationSends = 0;
  emailSends = 0;
  smsSends = 0;
  consentWrites = 0;
  nextLeadId = 1;

  seedUser(user: CustomerChatUser) {
    this.users.set(user.id, user);
  }

  seedLead(row: Omit<FakeLead, "updatedAt" | "score" | "intent"> & Partial<FakeLead>) {
    const lead: FakeLead = {
      id: row.id,
      workspaceId: row.workspaceId,
      customerId: row.customerId,
      assignedAgentId: row.assignedAgentId,
      intent: row.intent ?? "BUYER",
      score: row.score ?? 15,
      updatedAt: row.updatedAt ?? T0,
      organizationId: row.organizationId ?? "org_a",
    };
    this.leads.push(lead);
    return lead;
  }

  deps(): Partial<CustomerChatLeadResolverDeps> {
    return {
      auth: async () =>
        this.sessionUserId ? { user: { id: this.sessionUserId } } : null,
      findCustomerUser: async (userId) => this.users.get(userId) ?? null,
      listCustomerWorkspaceLeads: async (workspaceId, customerId) =>
        this.leads.filter(
          (lead) =>
            lead.workspaceId === workspaceId && lead.customerId === customerId,
        ),
      loadLead: async (workspaceId, leadId) =>
        this.leads.find(
          (lead) => lead.workspaceId === workspaceId && lead.id === leadId,
        ) ?? null,
      captureWebsiteLead: async (input) => {
        this.captureCalls += 1;
        const id = `lead_captured_${this.nextLeadId++}`;
        const assignedAgentId =
          this.deskAssigneeByWorkspace.get(WS_A) &&
          input.request &&
          new URL(input.request.url).hostname === HOST_A
            ? this.deskAssigneeByWorkspace.get(WS_A) ?? null
            : this.deskAssigneeByWorkspace.get(WS_B) &&
                input.request &&
                new URL(input.request.url).hostname === HOST_B
              ? this.deskAssigneeByWorkspace.get(WS_B) ?? null
              : this.deskAssigneeByWorkspace.get(WS_A) ?? null;
        const requestHost = input.request
          ? new URL(input.request.url).hostname
          : HOST_A;
        const workspaceId = requestHost === HOST_B ? WS_B : WS_A;
        const lead = this.seedLead({
          id,
          workspaceId,
          customerId: input.customerId,
          assignedAgentId,
          intent: input.intent ?? "BUYER",
          score: input.score ?? 20,
          updatedAt: T2,
        });
        return {
          lead: lead as never,
          assignedAgentId,
          organizationId: "org_a",
          created: true,
        };
      },
      resolveLeadDeskAssignmentForRequest: async (request) => {
        this.routingCalls += 1;
        if (this.throwDeskError) throw this.throwDeskError;
        const hostname = new URL(request.url).hostname;
        const workspaceId =
          this.deskWorkspaceOverride ??
          (hostname === HOST_B ? WS_B : WS_A);
        const assigneeId = this.deskAssigneeByWorkspace.get(workspaceId) ?? null;
        const desk: ResolvedPublicLeadDesk = {
          workspaceId,
          organizationId: "org_a",
          assigneeId,
          workspaceSlug: workspaceId === WS_B ? "tenant-b" : "tenant-a",
          isHouzzatWorkspace: false,
        };
        return desk;
      },
      assertAssigneeEligibleForWorkspace: async (workspaceId, assigneeId) => {
        if (!assigneeId) return;
        const pool = this.routableByWorkspace.get(workspaceId) ?? [];
        if (!pool.includes(assigneeId)) {
          throw new PublicLeadRoutingError(
            "assignee_not_allowed",
            "Assignee is not an eligible agent for workspace",
          );
        }
      },
      listRoutableAgentIds: async (workspaceId) =>
        this.routableByWorkspace.get(workspaceId) ?? [],
      assignIfUnassigned: async (input) => {
        this.assignCalls.push({
          leadId: input.leadId,
          assigneeId: input.assigneeId,
        });
        const lead = this.leads.find(
          (row) =>
            row.id === input.leadId && row.workspaceId === input.workspaceId,
        );
        if (!lead || lead.assignedAgentId) return { wrote: false };
        lead.assignedAgentId = input.assigneeId;
        lead.updatedAt = T2;
        return { wrote: true };
      },
    };
  }
}

function untrustedHints() {
  return {
    leadId: "lead_forged",
    workspaceId: WS_B,
    workspaceSlug: "tenant-b",
    conversationId: "conv_forged",
    senderUserId: CUSTOMER_B,
    senderName: "Forged Name",
    email: "forged@test.local",
    assignedAgentId: AGENT_B,
    userId: CUSTOMER_B,
    customerId: CUSTOMER_B,
    hostname: HOST_B,
    domain: HOST_B,
    tenant: "tenant-b",
    tenantSlug: "tenant-b",
  };
}

async function testAssignedLeadUnchanged() {
  const world = new FakeResolverWorld();
  world.seedUser(consumer());
  world.seedLead({
    id: "lead_assigned",
    workspaceId: WS_A,
    customerId: CUSTOMER_A,
    assignedAgentId: AGENT_A,
  });
  const result = await ensureCustomerChatLead({
    request: requestForHost(HOST_A),
    untrustedClientHints: untrustedHints(),
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.leadId, "lead_assigned");
  assert.equal(result.assignedAgentId, AGENT_A);
  assert.equal(result.assignmentState, "ASSIGNED");
  assert.equal(result.canSend, true);
  assert.equal(result.leadCreated, false);
  assert.equal(world.routingCalls, 0);
  assert.equal(world.assignCalls.length, 0);
  assert.equal(world.captureCalls, 0);
}

async function testPrimaryAmongDuplicates() {
  const world = new FakeResolverWorld();
  world.seedUser(consumer());
  world.seedLead({
    id: "lead_older",
    workspaceId: WS_A,
    customerId: CUSTOMER_A,
    assignedAgentId: AGENT_A,
    score: 90,
    updatedAt: T0,
  });
  world.seedLead({
    id: "lead_newer",
    workspaceId: WS_A,
    customerId: CUSTOMER_A,
    assignedAgentId: AGENT_A,
    score: 10,
    updatedAt: T1,
  });
  const result = await resolveCustomerChatLead({
    request: requestForHost(HOST_A),
    untrustedClientHints: { leadId: "lead_older" },
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.leadId, "lead_newer");
}

function testPrimaryTieBreakMatchesHelper() {
  const leads = [
    {
      id: "b",
      customerId: CUSTOMER_A,
      updatedAt: T1,
      score: 10,
    },
    {
      id: "a",
      customerId: CUSTOMER_A,
      updatedAt: T1,
      score: 10,
    },
    {
      id: "c",
      customerId: CUSTOMER_A,
      updatedAt: T0,
      score: 99,
    },
  ];
  const fromHelper = selectPrimaryLeadsByCustomer(leads)[0];
  const fromResolver = selectPrimaryCustomerChatLead(leads);
  assert.equal(fromResolver?.id, "a");
  assert.equal(fromHelper?.id, fromResolver?.id);
  assert.deepEqual(CUSTOMER_CHAT_PRIMARY_LEAD_TIEBREAK, [
    "latest updatedAt",
    "higher score",
    "lexicographically smaller id",
  ]);
}

async function testHostnameChoosesWorkspace() {
  const world = new FakeResolverWorld();
  world.seedUser(consumer());
  world.seedLead({
    id: "lead_a",
    workspaceId: WS_A,
    customerId: CUSTOMER_A,
    assignedAgentId: AGENT_A,
  });
  world.seedLead({
    id: "lead_b",
    workspaceId: WS_B,
    customerId: CUSTOMER_A,
    assignedAgentId: AGENT_B,
  });
  const onA = await resolveCustomerChatLead({
    request: requestForHost(HOST_A),
    untrustedClientHints: { workspaceId: WS_B, leadId: "lead_b" },
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  const onB = await resolveCustomerChatLead({
    request: requestForHost(HOST_B),
    untrustedClientHints: { workspaceId: WS_A, leadId: "lead_a" },
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  assert.equal(onA.ok, true);
  assert.equal(onB.ok, true);
  if (!onA.ok || !onB.ok) return;
  assert.equal(onA.workspaceId, WS_A);
  assert.equal(onA.leadId, "lead_a");
  assert.equal(onB.workspaceId, WS_B);
  assert.equal(onB.leadId, "lead_b");
}

async function testOtherCustomerLeadIgnored() {
  const world = new FakeResolverWorld();
  world.seedUser(consumer());
  world.seedUser(consumer({ id: CUSTOMER_B, email: "b@test.local", name: "B" }));
  world.seedLead({
    id: "lead_b",
    workspaceId: WS_A,
    customerId: CUSTOMER_B,
    assignedAgentId: AGENT_A,
  });
  const result = await resolveCustomerChatLead({
    request: requestForHost(HOST_A),
    untrustedClientHints: { leadId: "lead_b", customerId: CUSTOMER_B },
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "LEAD_NOT_FOUND");
}

async function testStaffRejected() {
  const world = new FakeResolverWorld();
  world.sessionUserId = "user_agent_session";
  world.seedUser({
    id: "user_agent_session",
    email: "agent@test.local",
    name: "Agent",
    role: "AGENT",
    disabledAt: null,
  });
  const result = await resolveCustomerChatLead({
    request: requestForHost(HOST_A),
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "STAFF_FORBIDDEN");
}

async function testAdminRejected() {
  const world = new FakeResolverWorld();
  world.sessionUserId = "user_admin";
  world.seedUser({
    id: "user_admin",
    email: "admin@test.local",
    name: "Admin",
    role: "ADMIN",
    disabledAt: null,
  });
  const result = await ensureCustomerChatLead({
    request: requestForHost(HOST_A),
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "STAFF_FORBIDDEN");
  assert.equal(world.captureCalls, 0);
}

async function testUnsignedRejected() {
  const world = new FakeResolverWorld();
  world.sessionUserId = null;
  const result = await resolveCustomerChatLead({
    request: requestForHost(HOST_A),
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "UNAUTHENTICATED");
}

async function testDisabledCustomerRejected() {
  const world = new FakeResolverWorld();
  world.seedUser(consumer({ disabledAt: T0 }));
  const result = await resolveCustomerChatLead({
    request: requestForHost(HOST_A),
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "CUSTOMER_DISABLED");
}

async function testInactiveWorkspaceRejected() {
  const world = new FakeResolverWorld();
  world.seedUser(consumer());
  const result = await resolveCustomerChatLead({
    request: requestForHost("suspended.houzzatpro.com"),
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "WORKSPACE_UNAVAILABLE");
  assert.equal(result.hostDenyReason, "workspace_suspended");
}

async function testPlatformHostRejected() {
  const world = new FakeResolverWorld();
  world.seedUser(consumer());
  const result = await resolveCustomerChatLead({
    request: requestForHost("app.houzzatpro.com"),
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "PLATFORM_SURFACE");
}

async function testUnassignedUsesHostnameRouting() {
  const world = new FakeResolverWorld();
  world.seedUser(consumer());
  world.seedLead({
    id: "lead_pond",
    workspaceId: WS_A,
    customerId: CUSTOMER_A,
    assignedAgentId: null,
  });
  const result = await ensureCustomerChatLead({
    request: requestForHost(HOST_A),
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.leadId, "lead_pond");
  assert.equal(result.assignedAgentId, AGENT_A);
  assert.equal(world.routingCalls, 1);
  assert.equal(world.assignCalls.length, 1);
  assert.equal(world.assignCalls[0]?.assigneeId, AGENT_A);
}

async function testResolveDoesNotRouteUnassigned() {
  const world = new FakeResolverWorld();
  world.seedUser(consumer());
  world.seedLead({
    id: "lead_pond",
    workspaceId: WS_A,
    customerId: CUSTOMER_A,
    assignedAgentId: null,
  });
  const result = await resolveCustomerChatLead({
    request: requestForHost(HOST_A),
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.assignmentState, "UNASSIGNED");
  assert.equal(result.canSend, false);
  assert.equal(world.routingCalls, 0);
  assert.equal(world.assignCalls.length, 0);
}

async function testNoEligibleAgent() {
  const world = new FakeResolverWorld();
  world.seedUser(consumer());
  world.seedLead({
    id: "lead_pond",
    workspaceId: WS_A,
    customerId: CUSTOMER_A,
    assignedAgentId: null,
  });
  world.deskAssigneeByWorkspace.set(WS_A, null);
  world.routableByWorkspace.set(WS_A, []);
  const result = await ensureCustomerChatLead({
    request: requestForHost(HOST_A),
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "NO_ELIGIBLE_AGENT");
  assert.equal(result.leadId, "lead_pond");
  assert.equal(world.assignCalls.length, 0);
}

async function testDeskNotConfigured() {
  const world = new FakeResolverWorld();
  world.seedUser(consumer());
  world.seedLead({
    id: "lead_pond",
    workspaceId: WS_A,
    customerId: CUSTOMER_A,
    assignedAgentId: null,
  });
  world.throwDeskError = new PublicLeadRoutingError(
    "lead_desk_not_configured",
  );
  const result = await ensureCustomerChatLead({
    request: requestForHost(HOST_A),
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "NO_ELIGIBLE_AGENT");
  assert.equal(world.assignCalls.length, 0);
}

async function testEnsureCreatesViaCapture() {
  const world = new FakeResolverWorld();
  world.seedUser(consumer());
  const result = await ensureCustomerChatLead({
    request: requestForHost(HOST_A),
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(world.captureCalls, 1);
  assert.equal(result.leadCreated, true);
  assert.equal(result.leadExisted, false);
  assert.equal(result.workspaceId, WS_A);
  assert.equal(result.assignedAgentId, AGENT_A);
}

async function testResolveDoesNotCreateLead() {
  const world = new FakeResolverWorld();
  world.seedUser(consumer());
  const result = await resolveCustomerChatLead({
    request: requestForHost(HOST_A),
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "LEAD_NOT_FOUND");
  assert.equal(world.captureCalls, 0);
}

async function testConcurrentAssignmentDoesNotOverwrite() {
  const world = new FakeResolverWorld();
  world.seedUser(consumer());
  world.seedLead({
    id: "lead_pond",
    workspaceId: WS_A,
    customerId: CUSTOMER_A,
    assignedAgentId: null,
  });
  let routing = 0;
  const deps = world.deps();
  deps.resolveLeadDeskAssignmentForRequest = async () => {
    routing += 1;
    return {
      workspaceId: WS_A,
      organizationId: "org_a",
      assigneeId: routing === 1 ? AGENT_A : "user_agent_other",
      workspaceSlug: "tenant-a",
      isHouzzatWorkspace: false,
    };
  };
  world.routableByWorkspace.set(WS_A, [AGENT_A, "user_agent_other"]);

  const first = ensureCustomerChatLead({
    request: requestForHost(HOST_A),
    hostDeps: hostDeps(),
    deps,
  });
  const second = ensureCustomerChatLead({
    request: requestForHost(HOST_A),
    hostDeps: hostDeps(),
    deps,
  });
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  if (!a.ok || !b.ok) return;
  assert.equal(a.assignedAgentId, AGENT_A);
  assert.equal(b.assignedAgentId, AGENT_A);
  const lead = world.leads.find((row) => row.id === "lead_pond");
  assert.equal(lead?.assignedAgentId, AGENT_A);
}

async function testConcurrentLeadCreatePicksPrimary() {
  const world = new FakeResolverWorld();
  world.seedUser(consumer());
  const [a, b] = await Promise.all([
    ensureCustomerChatLead({
      request: requestForHost(HOST_A),
      hostDeps: hostDeps(),
      deps: world.deps(),
    }),
    ensureCustomerChatLead({
      request: requestForHost(HOST_A),
      hostDeps: hostDeps(),
      deps: world.deps(),
    }),
  ]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  if (!a.ok || !b.ok) return;
  assert.ok(world.captureCalls >= 1);
  assert.ok(
    world.leads.every(
      (lead) =>
        lead.workspaceId === WS_A && lead.customerId === CUSTOMER_A,
    ),
  );
  const after = await resolveCustomerChatLead({
    request: requestForHost(HOST_A),
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  assert.equal(after.ok, true);
  if (!after.ok) return;
  const primary = selectPrimaryCustomerChatLead(world.leads);
  assert.ok(primary);
  assert.equal(after.leadId, primary.id);
}

async function testForeignAgentNeverAssigned() {
  const world = new FakeResolverWorld();
  world.seedUser(consumer());
  world.seedLead({
    id: "lead_pond",
    workspaceId: WS_A,
    customerId: CUSTOMER_A,
    assignedAgentId: null,
  });
  world.deskWorkspaceOverride = WS_B;
  world.deskAssigneeByWorkspace.set(WS_B, AGENT_B);
  const result = await ensureCustomerChatLead({
    request: requestForHost(HOST_A),
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "ROUTING_UNAVAILABLE");
  assert.equal(world.assignCalls.length, 0);
  const lead = world.leads.find((row) => row.id === "lead_pond");
  assert.equal(lead?.assignedAgentId, null);
}

async function testForeignAgentInSameDeskRejectedByEligibility() {
  const world = new FakeResolverWorld();
  world.seedUser(consumer());
  world.seedLead({
    id: "lead_pond",
    workspaceId: WS_A,
    customerId: CUSTOMER_A,
    assignedAgentId: null,
  });
  const deps = world.deps();
  deps.resolveLeadDeskAssignmentForRequest = async () => ({
    workspaceId: WS_A,
    organizationId: "org_a",
    assigneeId: AGENT_B,
    workspaceSlug: "tenant-a",
    isHouzzatWorkspace: false,
  });
  const result = await ensureCustomerChatLead({
    request: requestForHost(HOST_A),
    hostDeps: hostDeps(),
    deps,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "NO_ELIGIBLE_AGENT");
  assert.equal(world.assignCalls.length, 0);
}

async function testDisabledAssignedAgentNotRerouted() {
  const world = new FakeResolverWorld();
  world.seedUser(consumer());
  world.seedLead({
    id: "lead_assigned",
    workspaceId: WS_A,
    customerId: CUSTOMER_A,
    assignedAgentId: DISABLED_AGENT,
  });
  world.routableByWorkspace.set(WS_A, [AGENT_A]);
  const result = await ensureCustomerChatLead({
    request: requestForHost(HOST_A),
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.assignedAgentId, DISABLED_AGENT);
  assert.equal(result.assignmentState, "ASSIGNED_AGENT_INELIGIBLE");
  assert.equal(result.assignedAgentEligible, false);
  assert.equal(result.canSend, true);
  assert.equal(world.routingCalls, 0);
}

async function testNoConversationOrMessageOrNotify() {
  const world = new FakeResolverWorld();
  world.seedUser(consumer());
  await ensureCustomerChatLead({
    request: requestForHost(HOST_A),
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  assert.equal(world.conversationCreates, 0);
  assert.equal(world.messageCreates, 0);
  assert.equal(world.notificationSends, 0);
  assert.equal(world.emailSends, 0);
  assert.equal(world.smsSends, 0);
  assert.equal(world.consentWrites, 0);
}

async function testXForwardedHostIgnored() {
  const world = new FakeResolverWorld();
  world.seedUser(consumer());
  world.seedLead({
    id: "lead_a",
    workspaceId: WS_A,
    customerId: CUSTOMER_A,
    assignedAgentId: AGENT_A,
  });
  world.seedLead({
    id: "lead_b",
    workspaceId: WS_B,
    customerId: CUSTOMER_A,
    assignedAgentId: AGENT_B,
  });
  const spoofed = new Request(`https://${HOST_A}/account`, {
    headers: {
      host: HOST_A,
      "x-forwarded-host": HOST_B,
    },
  });
  const result = await resolveCustomerChatLead({
    request: spoofed,
    hostDeps: hostDeps(),
    deps: world.deps(),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.workspaceId, WS_A);
  assert.equal(result.leadId, "lead_a");
}

function testDisplayName() {
  assert.equal(
    frozenCustomerChatDisplayName({ name: "  Ali  ", email: "a@x.com" }),
    "Ali",
  );
  assert.equal(
    frozenCustomerChatDisplayName({ name: "  ", email: "a@x.com" }),
    "a@x.com",
  );
}

function testSourceDoesNotTrustClientIdentity() {
  const src = read("src/lib/conversations/customer-chat-lead.ts");
  assert.ok(src.includes("resolveWorkspaceFromRequest"));
  assert.ok(src.includes("selectPrimaryLeadsByCustomer"));
  assert.ok(src.includes("resolveLeadDeskAssignmentForRequest"));
  assert.ok(src.includes("captureWebsiteLead"));
  assert.ok(!src.includes("routeExistingLead("));
  assert.doesNotMatch(src, /import\s*\{[^}]*routeExistingLead/);
  assert.ok(!src.includes("applyLeadAssignment("));
  assert.doesNotMatch(src, /import\s*\{[^}]*applyLeadAssignment/);
  assert.ok(!src.includes("getOrCreateLeadConversation"));
  assert.ok(!src.includes("createConversationMessage"));
  assert.ok(!src.includes("markConversationRead"));
  assert.ok(!src.includes("notifyNewLead"));
  assert.ok(!src.includes("X-Forwarded-Host"));

  for (const key of CUSTOMER_CHAT_UNTRUSTED_IDENTITY_KEYS) {
    assert.ok(
      src.includes(`"${key}"`) || src.includes(`'${key}'`),
      `untrusted key ${key} must be listed`,
    );
  }

  assert.ok(src.includes("ignoreUntrustedClientIdentity"));
  assert.ok(src.includes("untrustedClientHints"));
  assert.doesNotMatch(
    src,
    /untrustedClientHints\??\.(leadId|workspaceId|conversationId|senderUserId|senderName|email)/,
  );
  assert.ok(!src.includes("hints.leadId"));
  assert.ok(!src.includes("hints.workspaceId"));
}

function testNoApiOrUiAdded() {
  const src = read("src/lib/conversations/customer-chat-lead.ts");
  assert.ok(!src.includes("NextResponse"));
  assert.ok(!src.includes("/api/account/conversation"));
}

async function main() {
  await withWorkspaceScope(async () => {
    testPrimaryTieBreakMatchesHelper();
    testDisplayName();
    testSourceDoesNotTrustClientIdentity();
    testNoApiOrUiAdded();
    await testAssignedLeadUnchanged();
    await testPrimaryAmongDuplicates();
    await testHostnameChoosesWorkspace();
    await testOtherCustomerLeadIgnored();
    await testStaffRejected();
    await testAdminRejected();
    await testUnsignedRejected();
    await testDisabledCustomerRejected();
    await testInactiveWorkspaceRejected();
    await testPlatformHostRejected();
    await testUnassignedUsesHostnameRouting();
    await testResolveDoesNotRouteUnassigned();
    await testNoEligibleAgent();
    await testDeskNotConfigured();
    await testEnsureCreatesViaCapture();
    await testResolveDoesNotCreateLead();
    await testConcurrentAssignmentDoesNotOverwrite();
    await testConcurrentLeadCreatePicksPrimary();
    await testForeignAgentNeverAssigned();
    await testForeignAgentInSameDeskRejectedByEligibility();
    await testDisabledAssignedAgentNotRerouted();
    await testNoConversationOrMessageOrNotify();
    await testXForwardedHostIgnored();
  });
  console.log("customer-chat-lead-resolver selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
