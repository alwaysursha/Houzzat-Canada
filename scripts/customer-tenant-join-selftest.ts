/**
 * Existing customer joins a second tenant workspace.
 * One global Customer, one independent Lead per Workspace.
 *
 * Run: pnpm customer-tenant-join:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LeadIntent, LeadSource, PrismaClient } from "@prisma/client";
import {
  customerWorkspaceActivityWhere,
  customerWorkspaceAppointmentWhere,
  customerWorkspaceLeadWhere,
} from "../src/lib/account/customer-workspace-scope";
import { EXISTING_ACCOUNT_SIGN_IN_MESSAGE } from "../src/lib/auth/existing-account-message";
import { joinConsumerToTenantWorkspaceLead } from "../src/lib/auth/join-tenant-workspace-lead";
import {
  resetLeadIdentityLocksForTests,
  resolveOrCreateWorkspaceLead,
} from "../src/lib/agent/resolve-workspace-lead";
import { leadTenantWhere, type CrmScopeContext } from "../src/lib/crm-read-scope";
import { customerOnlineLeadWhere } from "../src/lib/notifications/staff-events";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const HOUZZAT = "ws_houzzat";
const MARIA = "ws_maria";
const HOUZZAT_AGENT = "agent_houzzat";
const MARIA_AGENT = "agent_maria";
const CUSTOMER = "customer_om";

type FakeUser = {
  id: string;
  email: string;
  name: string | null;
  phoneE164: string | null;
  role: string;
};

type FakeLead = {
  id: string;
  workspaceId: string;
  customerId: string | null;
  assignedAgentId: string | null;
  source: LeadSource;
  status: string;
  intent: LeadIntent;
  isBuyer: boolean;
  isSeller: boolean;
  score: number;
  notes: string | null;
  listingMls: string | null;
  organizationId: string | null;
  contactConsentAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
};

type FakeActivity = { id: string; leadId: string; type: string; body: string | null };
type FakeConversation = {
  id: string;
  workspaceId: string;
  leadId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date | null;
  customerLastReadAt: Date | null;
  agentLastReadAt: Date | null;
  agentLastReadByUserId: string | null;
};

type FakeState = {
  users: FakeUser[];
  leads: FakeLead[];
  activities: FakeActivity[];
  conversations: FakeConversation[];
  userCreates: number;
  next: number;
};

function emptyState(): FakeState {
  return {
    users: [],
    leads: [],
    activities: [],
    conversations: [],
    userCreates: 0,
    next: 0,
  };
}

function nid(prefix: string, state: FakeState) {
  state.next += 1;
  return `${prefix}_${state.next}`;
}

function pickSelect<T extends Record<string, unknown>>(
  row: T,
  select?: Record<string, unknown>,
) {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    if (select[key]) out[key] = row[key];
  }
  return out;
}

function createFakeDb(state: FakeState): PrismaClient {
  return {
    user: {
      async findUnique({
        where,
        select,
      }: {
        where: { email?: string; id?: string };
        select?: Record<string, unknown>;
      }) {
        const user = where.email
          ? state.users.find((row) => row.email === where.email)
          : state.users.find((row) => row.id === where.id);
        if (!user) return null;
        return pickSelect(user as unknown as Record<string, unknown>, select);
      },
      async findMany() {
        return [];
      },
      async create() {
        state.userCreates += 1;
        throw new Error("customer join must not create a User");
      },
    },
    lead: {
      async findUnique({
        where,
        select,
      }: {
        where: {
          id?: string;
          workspaceId_id?: { workspaceId: string; id: string };
        };
        select?: Record<string, unknown>;
      }) {
        const lead = where.workspaceId_id
          ? state.leads.find(
              (row) =>
                row.workspaceId === where.workspaceId_id!.workspaceId &&
                row.id === where.workspaceId_id!.id,
            )
          : state.leads.find((row) => row.id === where.id);
        if (!lead) return null;
        return pickSelect(lead as unknown as Record<string, unknown>, select);
      },
      async findMany({
        where,
        select,
      }: {
        where?: { workspaceId?: string; customerId?: string };
        select?: Record<string, unknown>;
      }) {
        let rows = state.leads;
        if (where?.workspaceId) {
          rows = rows.filter((row) => row.workspaceId === where.workspaceId);
        }
        if (where?.customerId) {
          rows = rows.filter((row) => row.customerId === where.customerId);
        }
        return rows.map((row) =>
          pickSelect(row as unknown as Record<string, unknown>, select),
        );
      },
      async create({
        data,
        select,
      }: {
        data: Record<string, unknown>;
        select?: Record<string, unknown>;
      }) {
        const customerId = (data.customerId as string | null) ?? null;
        if (
          customerId &&
          state.leads.some(
            (row) =>
              row.workspaceId === String(data.workspaceId) &&
              row.customerId === customerId,
          )
        ) {
          const err = new Error("Unique") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const now = new Date();
        const lead: FakeLead = {
          id: nid("lead", state),
          workspaceId: String(data.workspaceId),
          customerId,
          assignedAgentId: (data.assignedAgentId as string | null) ?? null,
          source: data.source as LeadSource,
          status: "NEW_LEAD",
          intent: data.intent as LeadIntent,
          isBuyer: Boolean(data.isBuyer),
          isSeller: Boolean(data.isSeller),
          score: Number(data.score ?? 15),
          notes: (data.notes as string | null) ?? null,
          listingMls: null,
          organizationId: (data.organizationId as string | null) ?? null,
          contactConsentAt: (data.contactConsentAt as Date | null) ?? null,
          updatedAt: now,
          createdAt: now,
        };
        state.leads.push(lead);
        return pickSelect(lead as unknown as Record<string, unknown>, select);
      },
      async update({
        where,
        data,
        select,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
        select?: Record<string, unknown>;
      }) {
        const lead = state.leads.find((row) => row.id === where.id);
        if (!lead) throw new Error("lead missing");
        Object.assign(lead, data, { updatedAt: new Date() });
        return pickSelect(lead as unknown as Record<string, unknown>, select);
      },
    },
    leadActivity: {
      async create({ data }: { data: Record<string, unknown> }) {
        const row: FakeActivity = {
          id: nid("act", state),
          leadId: String(data.leadId),
          type: String(data.type),
          body: (data.body as string | null) ?? null,
        };
        state.activities.push(row);
        return { ...row };
      },
    },
    conversation: {
      async findUnique({
        where,
        select,
      }: {
        where: { workspaceId_leadId?: { workspaceId: string; leadId: string } };
        select?: Record<string, unknown>;
      }) {
        const key = where.workspaceId_leadId;
        if (!key) return null;
        const row = state.conversations.find(
          (item) =>
            item.workspaceId === key.workspaceId && item.leadId === key.leadId,
        );
        if (!row) return null;
        return pickSelect(row as unknown as Record<string, unknown>, select);
      },
      async create({
        data,
        select,
      }: {
        data: Record<string, unknown>;
        select?: Record<string, unknown>;
      }) {
        const workspaceId = String(data.workspaceId);
        const leadId = String(data.leadId);
        if (
          state.conversations.some(
            (item) => item.workspaceId === workspaceId && item.leadId === leadId,
          )
        ) {
          const err = new Error("Unique") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const now = new Date();
        const row: FakeConversation = {
          id: nid("conv", state),
          workspaceId,
          leadId,
          status: String(data.status ?? "OPEN"),
          createdAt: now,
          updatedAt: now,
          lastMessageAt: null,
          customerLastReadAt: null,
          agentLastReadAt: null,
          agentLastReadByUserId: null,
        };
        state.conversations.push(row);
        return pickSelect(row as unknown as Record<string, unknown>, select);
      },
    },
  } as unknown as PrismaClient;
}

function snapshotLead(lead: FakeLead) {
  return {
    id: lead.id,
    workspaceId: lead.workspaceId,
    customerId: lead.customerId,
    assignedAgentId: lead.assignedAgentId,
    source: lead.source,
    status: lead.status,
    isBuyer: lead.isBuyer,
    isSeller: lead.isSeller,
  };
}

const customer = {
  id: CUSTOMER,
  email: "omsyed88@gmail.com",
  name: "Om Syed",
  role: "BUYER",
  isBuyer: true,
  isSeller: true,
};

async function signIntoWorkspace(
  state: FakeState,
  workspaceId: string,
  assigneeId: string,
) {
  let routed = false;
  const db = createFakeDb(state);
  const result = await joinConsumerToTenantWorkspaceLead(
    {
      user: customer,
      request: new Request(`https://${workspaceId}.example/auth/sign-in`),
    },
    {
      resolveTenancy: async () => ({ ok: true, workspaceId }),
      hasActiveWorkspaceMembership: async () => false,
      capture: async (input) => {
        assert.equal(input.customerId, CUSTOMER);
        assert.equal(input.activityOnReuse, false);
        const resolved = await resolveOrCreateWorkspaceLead({
          workspaceId,
          organizationId: "org",
          customerId: input.customerId,
          email: input.email,
          name: input.name,
          isBuyer: input.isBuyer,
          isSeller: input.isSeller,
          source: input.source,
          notes: input.notes,
          actorId: input.actorId,
          upsertCustomer: false,
          activityOnReuse: input.activityOnReuse,
          contactConsentAt: new Date(),
          db,
          activity: {
            type: "created",
            body: `Lead captured via ${input.source}`,
          },
          resolveCreateDesk: async () => {
            routed = true;
            return { assigneeId, organizationId: "org" };
          },
        });
        return {
          lead: resolved.lead,
          assignedAgentId: resolved.assignedAgentId,
          organizationId: resolved.organizationId,
          created: resolved.created,
        };
      },
    },
  );
  return { result, routed };
}

async function testTwoWorkspaceJoin() {
  resetLeadIdentityLocksForTests();
  const state = emptyState();
  state.users.push({
    id: CUSTOMER,
    email: customer.email,
    name: customer.name,
    phoneE164: null,
    role: "BUYER",
  });

  const seeded = await resolveOrCreateWorkspaceLead({
    workspaceId: HOUZZAT,
    organizationId: "org_houzzat",
    customerId: CUSTOMER,
    email: customer.email,
    name: customer.name,
    isBuyer: true,
    isSeller: true,
    source: "SIGNUP",
    upsertCustomer: false,
    db: createFakeDb(state),
    resolveCreateDesk: async () => ({
      assigneeId: HOUZZAT_AGENT,
      organizationId: "org_houzzat",
    }),
    activity: { type: "created", body: "Houzzat signup" },
  });
  const houzzat = state.leads.find((row) => row.id === seeded.lead.id)!;
  houzzat.status = "CONTACTED";
  const houzzatBefore = snapshotLead(houzzat);
  const houzzatConversation = state.conversations.find(
    (row) => row.leadId === houzzat.id,
  )!;
  const houzzatActivityCount = state.activities.filter(
    (row) => row.leadId === houzzat.id,
  ).length;

  const first = await signIntoWorkspace(state, MARIA, MARIA_AGENT);
  assert.equal(first.result.created, true);
  assert.equal(first.routed, true);
  assert.equal(first.result.assignedAgentId, MARIA_AGENT);
  assert.equal(first.result.workspaceId, MARIA);
  assert.equal(state.users.length, 1);
  assert.equal(state.userCreates, 0);
  assert.equal(state.leads.length, 2);

  const mariaLeads = state.leads.filter(
    (row) => row.workspaceId === MARIA && row.customerId === CUSTOMER,
  );
  assert.equal(mariaLeads.length, 1);
  assert.equal(mariaLeads[0]!.assignedAgentId, MARIA_AGENT);
  assert.equal(mariaLeads[0]!.status, "NEW_LEAD");
  const mariaConversation = state.conversations.find(
    (row) => row.leadId === mariaLeads[0]!.id,
  );
  assert.ok(mariaConversation);
  assert.equal(mariaConversation!.workspaceId, MARIA);

  assert.deepEqual(snapshotLead(houzzat), houzzatBefore);
  assert.equal(
    state.conversations.find((row) => row.leadId === houzzat.id)?.id,
    houzzatConversation.id,
  );
  assert.equal(
    state.activities.filter((row) => row.leadId === houzzat.id).length,
    houzzatActivityCount,
  );

  const second = await signIntoWorkspace(state, MARIA, MARIA_AGENT);
  assert.equal(second.result.created, false);
  assert.equal(second.routed, false);
  assert.equal(second.result.leadId, mariaLeads[0]!.id);
  assert.equal(
    state.leads.filter((row) => row.workspaceId === MARIA).length,
    1,
  );
  assert.equal(
    state.conversations.filter((row) => row.workspaceId === MARIA).length,
    1,
  );
  assert.equal(mariaLeads[0]!.assignedAgentId, MARIA_AGENT);
  assert.equal(mariaLeads[0]!.source, "OTHER");
  assert.deepEqual(snapshotLead(houzzat), houzzatBefore);

  const previousRead = process.env.WORKSPACE_READ_SCOPE;
  const previousDomain = process.env.TENANT_DOMAIN_SCOPE;
  process.env.WORKSPACE_READ_SCOPE = "workspace";
  process.env.TENANT_DOMAIN_SCOPE = "workspace";
  try {
    const mariaCrm = leadTenantWhere(crmCtx(MARIA_AGENT, MARIA));
    const houzzatCrm = leadTenantWhere(crmCtx(HOUZZAT_AGENT, HOUZZAT));
    assert.deepEqual(
      state.leads
        .filter((row) => row.workspaceId === mariaCrm.workspaceId)
        .map((row) => row.id),
      [mariaLeads[0]!.id],
    );
    assert.deepEqual(
      state.leads
        .filter((row) => row.workspaceId === houzzatCrm.workspaceId)
        .map((row) => row.id),
      [houzzat.id],
    );
  } finally {
    if (previousRead === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = previousRead;
    if (previousDomain === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = previousDomain;
  }

  const mariaAccount = state.leads.filter(
    (row) =>
      row.customerId === customerWorkspaceLeadWhere(CUSTOMER, MARIA).customerId &&
      row.workspaceId === customerWorkspaceLeadWhere(CUSTOMER, MARIA).workspaceId,
  );
  const houzzatAccount = state.leads.filter(
    (row) =>
      row.customerId ===
        customerWorkspaceLeadWhere(CUSTOMER, HOUZZAT).customerId &&
      row.workspaceId ===
        customerWorkspaceLeadWhere(CUSTOMER, HOUZZAT).workspaceId,
  );
  assert.deepEqual(
    mariaAccount.map((row) => row.id),
    [mariaLeads[0]!.id],
  );
  assert.deepEqual(
    houzzatAccount.map((row) => row.id),
    [houzzat.id],
  );

  const mariaActivityWhere = customerWorkspaceActivityWhere(CUSTOMER, MARIA);
  assert.equal(mariaActivityWhere.lead.workspaceId, MARIA);
  assert.equal(mariaActivityWhere.lead.customerId, CUSTOMER);
  const houzzatActivityWhere = customerWorkspaceActivityWhere(CUSTOMER, HOUZZAT);
  assert.equal(
    state.activities.filter((row) => row.leadId === houzzat.id).every((row) => {
      const lead = state.leads.find((item) => item.id === row.leadId);
      return lead?.workspaceId === houzzatActivityWhere.lead.workspaceId;
    }),
    true,
  );
  assert.equal(
    state.activities.some(
      (row) =>
        row.leadId === houzzat.id &&
        state.leads.find((item) => item.id === row.leadId)?.workspaceId ===
          MARIA,
    ),
    false,
  );
  assert.equal(
    customerWorkspaceAppointmentWhere(CUSTOMER, MARIA).lead.workspaceId,
    MARIA,
  );

  const onlineWhere = customerOnlineLeadWhere(CUSTOMER, MARIA);
  const notified = state.leads.filter(
    (row) =>
      row.customerId === onlineWhere.customerId &&
      row.assignedAgentId != null &&
      row.workspaceId === onlineWhere.workspaceId,
  );
  assert.deepEqual(
    notified.map((row) => row.assignedAgentId),
    [MARIA_AGENT],
  );
  assert.equal(
    notified.some((row) => row.assignedAgentId === HOUZZAT_AGENT),
    false,
  );

  console.log("[customer-tenant-join] two workspaces... PASS");
}

async function testStaffMembershipOnHostSkipsCapture() {
  let captured = 0;
  const result = await joinConsumerToTenantWorkspaceLead(
    {
      user: customer,
      request: new Request("https://remax.example/auth/sign-in"),
    },
    {
      resolveTenancy: async () => ({ ok: true, workspaceId: "ws_remax" }),
      hasActiveWorkspaceMembership: async () => true,
      capture: async () => {
        captured += 1;
        throw new Error("staff membership on host must not capture");
      },
    },
  );
  assert.equal(captured, 0);
  assert.equal(result.created, false);
  assert.equal(result.workspaceId, "ws_remax");
  console.log("[customer-tenant-join] staff membership skip... PASS");
}

async function testStaffSignInDoesNotCapture() {
  let captured = 0;
  const result = await joinConsumerToTenantWorkspaceLead(
    {
      user: { ...customer, role: "AGENT" },
      request: new Request("https://maria.example/auth/sign-in"),
    },
    {
      resolveTenancy: async () => ({ ok: true, workspaceId: MARIA }),
      capture: async () => {
        captured += 1;
        throw new Error("staff sign-in must not capture a customer lead");
      },
    },
  );
  assert.equal(captured, 0);
  assert.equal(result.created, false);
  assert.equal(result.leadId, null);
  console.log("[customer-tenant-join] staff skip... PASS");
}

function testSignupCopyAndIsolationSources() {
  const message = EXISTING_ACCOUNT_SIGN_IN_MESSAGE;
  assert.equal(
    message,
    "An account with this email already exists. Sign in to continue.",
  );
  assert.equal(message.includes("use a different email"), false);

  const route = read("src/app/api/auth/sign-up/route.ts");
  const signup = read("src/components/auth/SignUpForm.tsx");
  const modal = read("src/components/auth/AuthModalProvider.tsx");
  const join = read("src/lib/auth/join-tenant-workspace-lead.ts");
  const capture = read("src/lib/agent/lead-intake.ts");
  const auth = read("src/lib/auth.ts");
  const notify = read("src/lib/notifications/staff-events.ts");
  const activity = read("src/app/(account)/account/activity/page.tsx");
  const account = read("src/app/(account)/account/page.tsx");

  assert.ok(route.includes("EXISTING_ACCOUNT_SIGN_IN_MESSAGE"));
  assert.ok(route.includes("status: 409"));
  assert.equal(route.includes("use a different email"), false);
  const duplicateAt = route.indexOf("findUnique");
  const createAt = route.indexOf("prisma.user.create");
  assert.ok(duplicateAt > 0 && createAt > duplicateAt);

  const conflict = signup.slice(
    signup.indexOf("response.status === 409"),
    signup.indexOf("response.status === 400"),
  );
  assert.equal(conflict.includes("signIn("), false);
  assert.ok(signup.includes("onExistingAccount"));
  assert.ok(modal.includes("setPrefillEmail(email)"));
  assert.ok(modal.includes('setMode("sign-in")'));
  assert.equal(modal.includes("signIn("), false);

  assert.ok(join.includes("captureWebsiteLead"));
  assert.ok(join.includes("activityOnReuse: false"));
  assert.ok(join.includes("workspaceMember.findFirst"));
  assert.equal(join.includes("agentProfile"), false);
  assert.equal(join.includes("user.create"), false);
  assert.equal(join.includes("workspaceMember.create"), false);
  assert.ok(capture.includes("upsertCustomer: false"));
  assert.ok(capture.includes("resolveOrCreateWorkspaceLead"));

  const joinAt = auth.indexOf("joinConsumerToTenantWorkspaceLead");
  const notifyAt = auth.indexOf("scheduleNotifyCustomerCameOnlineFromSignIn");
  assert.ok(joinAt > 0 && notifyAt > joinAt);
  assert.ok(auth.includes("joined.workspaceId"));
  assert.ok(notify.includes("opts?.workspaceId === null"));
  assert.ok(notify.includes("customerOnlineLeadWhere"));
  assert.ok(activity.includes("customerWorkspaceLeadWhere"));
  assert.ok(activity.includes("resolveAccountWorkspaceId"));
  assert.equal(activity.includes("where: { customerId: user.id }"), false);
  assert.ok(account.includes("customerWorkspaceLeadWhere"));
  assert.equal(account.includes("where: { customerId: userId }"), false);

  console.log("[customer-tenant-join] signup copy and sources... PASS");
}

function crmCtx(userId: string, workspaceId: string): CrmScopeContext {
  return {
    user: { id: userId },
    organizationId: "org",
    organizationIds: ["org"],
    canSeeTeamLeads: true,
    isPlatformAdmin: false,
    workspaceId,
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: true,
    hasAmbiguousWorkspaceMembership: false,
  };
}

async function main() {
  await testTwoWorkspaceJoin();
  await testStaffMembershipOnHostSkipsCapture();
  await testStaffSignInDoesNotCapture();
  testSignupCopyAndIsolationSources();
  console.log("customer-tenant-join-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
