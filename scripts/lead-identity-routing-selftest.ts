/**
 * Phase 1 Lead identity / routing — resolve-first, sticky ownership.
 * Seller PERCENTAGE is preserved. No unique index. No production cleanup.
 *
 * Run: pnpm lead-identity-routing:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LeadIntent, LeadSource, PrismaClient } from "@prisma/client";
import { pickRoutedAssignee } from "../src/lib/agent/pick-routed-assignee";
import { mergeIncomingLeadClassification } from "../src/lib/agent/lead-classification";
import {
  AmbiguousLeadIdentityError,
  normalizeLeadEmail,
} from "../src/lib/agent/lead-identity";
import {
  resetLeadIdentityLocksForTests,
  resolveOrCreateWorkspaceLead,
} from "../src/lib/agent/resolve-workspace-lead";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_a";
const WS_B = "ws_b";
const AGENT_DEMO = "agent_demo";
const AGENT_ALI = "agent_ali";
const AGENT_LISTING = "agent_listing";

type FakeUser = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  phoneE164: string | null;
  role: string;
  isBuyer: boolean;
  isSeller: boolean;
  activeMode: string;
};

type FakeLead = {
  id: string;
  workspaceId: string;
  customerId: string | null;
  assignedAgentId: string | null;
  source: LeadSource;
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

type FakeActivity = {
  id: string;
  leadId: string;
  type: string;
  body: string | null;
};

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
  next: number;
};

function id(prefix: string, state: FakeState) {
  state.next += 1;
  return `${prefix}_${state.next}`;
}

function emptyState(): FakeState {
  return {
    users: [],
    leads: [],
    activities: [],
    conversations: [],
    next: 0,
  };
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
          ? state.users.find((u) => u.email === where.email)
          : state.users.find((u) => u.id === where.id);
        if (!user) return null;
        return pickSelect(user as unknown as Record<string, unknown>, select);
      },
      async findMany({
        where,
        select,
      }: {
        where?: { phoneE164?: string };
        select?: Record<string, unknown>;
      }) {
        const rows = where?.phoneE164
          ? state.users.filter((u) => u.phoneE164 === where.phoneE164)
          : state.users;
        return rows.map((u) =>
          pickSelect(u as unknown as Record<string, unknown>, select),
        );
      },
      async create({
        data,
        select,
      }: {
        data: Record<string, unknown>;
        select?: Record<string, unknown>;
      }) {
        const email = String(data.email).toLowerCase();
        if (state.users.some((u) => u.email === email)) {
          const err = new Error("Unique") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const user: FakeUser = {
          id: id("user", state),
          email,
          name: (data.name as string | null) ?? null,
          phone: (data.phone as string | null) ?? null,
          phoneE164: (data.phoneE164 as string | null) ?? null,
          role: String(data.role ?? "BUYER"),
          isBuyer: Boolean(data.isBuyer),
          isSeller: Boolean(data.isSeller),
          activeMode: String(data.activeMode ?? "BUYER"),
        };
        state.users.push(user);
        return pickSelect(user as unknown as Record<string, unknown>, select);
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
        where?: {
          workspaceId?: string;
          customerId?: string;
          customer?: { is?: { phoneE164?: string } };
        };
        select?: Record<string, unknown>;
      }) {
        let rows = state.leads;
        if (where?.workspaceId) {
          rows = rows.filter((row) => row.workspaceId === where.workspaceId);
        }
        if (where?.customerId) {
          rows = rows.filter((row) => row.customerId === where.customerId);
        }
        const phone = where?.customer?.is?.phoneE164;
        if (phone) {
          const userIds = new Set(
            state.users.filter((u) => u.phoneE164 === phone).map((u) => u.id),
          );
          rows = rows.filter(
            (row) => row.customerId && userIds.has(row.customerId),
          );
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
        const now = new Date();
        const lead: FakeLead = {
          id: id("lead", state),
          workspaceId: String(data.workspaceId),
          customerId: (data.customerId as string | null) ?? null,
          assignedAgentId: (data.assignedAgentId as string | null) ?? null,
          source: data.source as LeadSource,
          intent: data.intent as LeadIntent,
          isBuyer: Boolean(data.isBuyer),
          isSeller: Boolean(data.isSeller),
          score: Number(data.score ?? 15),
          notes: (data.notes as string | null) ?? null,
          listingMls: (data.listingMls as string | null) ?? null,
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
          id: id("act", state),
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
        where: {
          workspaceId_leadId?: { workspaceId: string; leadId: string };
        };
        select?: Record<string, unknown>;
      }) {
        const key = where.workspaceId_leadId;
        if (!key) return null;
        const row = state.conversations.find(
          (c) => c.workspaceId === key.workspaceId && c.leadId === key.leadId,
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
            (c) => c.workspaceId === workspaceId && c.leadId === leadId,
          )
        ) {
          const err = new Error("Unique") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const now = new Date();
        const row: FakeConversation = {
          id: id("conv", state),
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

async function seedBuyerLead(state: FakeState, opts?: { workspaceId?: string }) {
  const workspaceId = opts?.workspaceId ?? WS_A;
  const user: FakeUser = {
    id: id("user", state),
    email: `omer.${state.next}@example.com`,
    name: "Omer",
    phone: "+1 416-555-0100",
    phoneE164: "+14165550100",
    role: "BUYER",
    isBuyer: true,
    isSeller: false,
    activeMode: "BUYER",
  };
  user.email = `omer.${state.next}@example.com`;
  state.users.push(user);
  const now = new Date("2026-01-01T00:00:00.000Z");
  const lead: FakeLead = {
    id: id("lead", state),
    workspaceId,
    customerId: user.id,
    assignedAgentId: AGENT_DEMO,
    source: "SIGNUP",
    intent: "BUYER",
    isBuyer: true,
    isSeller: false,
    score: 20,
    notes: "Original signup",
    listingMls: null,
    organizationId: "org_a",
    contactConsentAt: now,
    updatedAt: now,
    createdAt: now,
  };
  state.leads.push(lead);
  return { user, lead };
}

function testPickerPreservesSellerPercentage() {
  const percentage = pickRoutedAssignee({
    intent: "SELLER",
    agentIds: [AGENT_DEMO, AGENT_ALI],
    sellerAssignMode: "PERCENTAGE",
    listingAgentId: AGENT_ALI,
    weights: [
      {
        id: "w_demo",
        agentId: AGENT_DEMO,
        lane: "SELLER",
        percent: 0,
        assignedCount: 0,
      },
      {
        id: "w_ali",
        agentId: AGENT_ALI,
        lane: "SELLER",
        percent: 100,
        assignedCount: 0,
      },
    ],
  });
  assert.equal(percentage.reason, "percentage");
  assert.equal(percentage.agentId, AGENT_ALI);

  const listing = pickRoutedAssignee({
    intent: "SELLER",
    agentIds: [AGENT_DEMO, AGENT_ALI, AGENT_LISTING],
    sellerAssignMode: "LISTING_AGENT",
    listingAgentId: AGENT_LISTING,
    weights: [
      {
        id: "w_ali",
        agentId: AGENT_ALI,
        lane: "SELLER",
        percent: 100,
        assignedCount: 0,
      },
    ],
  });
  assert.equal(listing.reason, "listing_agent");
  assert.equal(listing.agentId, AGENT_LISTING);

  const buyer = pickRoutedAssignee({
    intent: "BUYER",
    agentIds: [AGENT_DEMO, AGENT_ALI],
    sellerAssignMode: "LISTING_AGENT",
    listingAgentId: AGENT_LISTING,
    weights: [
      {
        id: "w_demo",
        agentId: AGENT_DEMO,
        lane: "BUYER",
        percent: 100,
        assignedCount: 0,
      },
      {
        id: "w_ali",
        agentId: AGENT_ALI,
        lane: "BUYER",
        percent: 0,
        assignedCount: 0,
      },
    ],
  });
  assert.equal(buyer.reason, "percentage");
  assert.equal(buyer.agentId, AGENT_DEMO);

  const unconfigured = pickRoutedAssignee({
    intent: "SELLER",
    agentIds: [AGENT_DEMO, AGENT_ALI],
    sellerAssignMode: "PERCENTAGE",
    listingAgentId: AGENT_LISTING,
    weights: [],
  });
  assert.equal(unconfigured.reason, "unconfigured_multi_agent");
  assert.equal(unconfigured.agentId, null);

  const sole = pickRoutedAssignee({
    intent: "SELLER",
    agentIds: [AGENT_ALI],
    sellerAssignMode: "LISTING_AGENT",
    listingAgentId: AGENT_LISTING,
    weights: [],
  });
  assert.equal(sole.reason, "sole_agent");
  assert.equal(sole.agentId, AGENT_ALI);
  console.log("[picker] PERCENTAGE / LISTING_AGENT / buyer / pond... PASS");
}

async function capture(
  state: FakeState,
  input: {
    workspaceId: string;
    customerId?: string | null;
    email?: string | null;
    phone?: string | null;
    name?: string | null;
    isBuyer?: boolean;
    isSeller?: boolean;
    source: LeadSource;
    assigneeId: string | null;
  },
) {
  let routed = false;
  const result = await resolveOrCreateWorkspaceLead({
    workspaceId: input.workspaceId,
    organizationId: "org_a",
    customerId: input.customerId,
    email: input.email,
    phone: input.phone,
    name: input.name,
    isBuyer: input.isBuyer,
    isSeller: input.isSeller,
    source: input.source,
    actorId: input.customerId,
    db: createFakeDb(state),
    resolveCreateDesk: async () => {
      routed = true;
      return { assigneeId: input.assigneeId, organizationId: "org_a" };
    },
    activity: {
      type: input.source.toLowerCase(),
      body: `activity ${input.source}`,
    },
  });
  return { ...result, routed };
}

async function testExistingBuyerThenSeller() {
  resetLeadIdentityLocksForTests();
  const state = emptyState();
  const seeded = await seedBuyerLead(state);
  const result = await capture(state, {
    workspaceId: WS_A,
    customerId: seeded.user.id,
    email: seeded.user.email,
    isBuyer: false,
    isSeller: true,
    source: "HOME_VALUATION",
    assigneeId: AGENT_ALI,
  });
  assert.equal(result.created, false);
  assert.equal(result.routed, false);
  assert.equal(result.lead.id, seeded.lead.id);
  assert.equal(result.assignedAgentId, AGENT_DEMO);
  assert.equal(result.lead.source, "SIGNUP");
  assert.equal(result.lead.isBuyer, true);
  assert.equal(result.lead.isSeller, true);
  assert.equal(result.lead.intent, "SELLER");
  assert.equal(state.leads.length, 1);
  assert.equal(state.conversations.length, 1);
  assert.equal(state.activities.length, 1);
  console.log("[1] existing Buyer → Seller = same Lead/Agent/both flags... PASS");
}

async function testExistingSellerThenBuyer() {
  resetLeadIdentityLocksForTests();
  const state = emptyState();
  const seeded = await seedBuyerLead(state);
  seeded.lead.isBuyer = false;
  seeded.lead.isSeller = true;
  seeded.lead.intent = "SELLER";
  seeded.lead.source = "HOME_VALUATION";
  const result = await capture(state, {
    workspaceId: WS_A,
    customerId: seeded.user.id,
    email: seeded.user.email,
    isBuyer: true,
    isSeller: false,
    source: "PROPERTY_INQUIRY",
    assigneeId: AGENT_ALI,
  });
  assert.equal(result.created, false);
  assert.equal(result.routed, false);
  assert.equal(result.assignedAgentId, AGENT_DEMO);
  assert.equal(result.lead.source, "HOME_VALUATION");
  assert.equal(result.lead.isBuyer, true);
  assert.equal(result.lead.isSeller, true);
  console.log("[2] existing Seller → Buyer = same Lead/Agent/both flags... PASS");
}

async function testNewSellerPercentage() {
  resetLeadIdentityLocksForTests();
  const state = emptyState();
  let routed = false;
  const result = await resolveOrCreateWorkspaceLead({
    workspaceId: WS_A,
    email: "new-seller@example.com",
    name: "New Seller",
    isBuyer: false,
    isSeller: true,
    source: "HOME_VALUATION",
    db: createFakeDb(state),
    resolveCreateDesk: async () => {
      routed = true;
      const pick = pickRoutedAssignee({
        intent: "SELLER",
        agentIds: [AGENT_DEMO, AGENT_ALI],
        sellerAssignMode: "PERCENTAGE",
        listingAgentId: AGENT_ALI,
        weights: [
          {
            id: "w",
            agentId: AGENT_ALI,
            lane: "SELLER",
            percent: 100,
            assignedCount: 0,
          },
        ],
      });
      return { assigneeId: pick.agentId, organizationId: "org_a" };
    },
  });
  assert.equal(result.created, true);
  assert.equal(routed, true);
  assert.equal(result.assignedAgentId, AGENT_ALI);
  assert.equal(result.lead.isSeller, true);
  console.log("[3] new Seller + PERCENTAGE → percentage engine... PASS");
}

async function testNewSellerListingAgent() {
  resetLeadIdentityLocksForTests();
  const state = emptyState();
  const result = await resolveOrCreateWorkspaceLead({
    workspaceId: WS_A,
    email: "listing-seller@example.com",
    name: "Listing Seller",
    isBuyer: false,
    isSeller: true,
    source: "HOME_VALUATION",
    db: createFakeDb(state),
    resolveCreateDesk: async () => {
      const pick = pickRoutedAssignee({
        intent: "SELLER",
        agentIds: [AGENT_DEMO, AGENT_ALI, AGENT_LISTING],
        sellerAssignMode: "LISTING_AGENT",
        listingAgentId: AGENT_LISTING,
        weights: [],
      });
      return { assigneeId: pick.agentId, organizationId: "org_a" };
    },
  });
  assert.equal(result.created, true);
  assert.equal(result.assignedAgentId, AGENT_LISTING);
  console.log("[4] new Seller + LISTING_AGENT → Listing Agent... PASS");
}

async function testNewBuyerRouting() {
  resetLeadIdentityLocksForTests();
  const state = emptyState();
  const result = await resolveOrCreateWorkspaceLead({
    workspaceId: WS_A,
    email: "new-buyer@example.com",
    isBuyer: true,
    isSeller: false,
    source: "SIGNUP",
    db: createFakeDb(state),
    resolveCreateDesk: async () => {
      const pick = pickRoutedAssignee({
        intent: "BUYER",
        agentIds: [AGENT_DEMO, AGENT_ALI],
        sellerAssignMode: "PERCENTAGE",
        weights: [
          {
            id: "w",
            agentId: AGENT_DEMO,
            lane: "BUYER",
            percent: 100,
            assignedCount: 0,
          },
        ],
      });
      return { assigneeId: pick.agentId, organizationId: "org_a" };
    },
  });
  assert.equal(result.created, true);
  assert.equal(result.assignedAgentId, AGENT_DEMO);
  console.log("[5] new Buyer → Buyer routing... PASS");
}

async function testRepeatValuationAndInquiry() {
  resetLeadIdentityLocksForTests();
  const state = emptyState();
  const seeded = await seedBuyerLead(state);
  const first = await capture(state, {
    workspaceId: WS_A,
    customerId: seeded.user.id,
    email: seeded.user.email,
    isSeller: true,
    source: "HOME_VALUATION",
    assigneeId: AGENT_ALI,
  });
  const second = await capture(state, {
    workspaceId: WS_A,
    customerId: seeded.user.id,
    email: seeded.user.email,
    isSeller: true,
    source: "HOME_VALUATION",
    assigneeId: AGENT_ALI,
  });
  const inquiry = await capture(state, {
    workspaceId: WS_A,
    customerId: seeded.user.id,
    email: seeded.user.email,
    isBuyer: true,
    source: "PROPERTY_INQUIRY",
    assigneeId: AGENT_ALI,
  });
  const planner = await capture(state, {
    workspaceId: WS_A,
    customerId: seeded.user.id,
    email: seeded.user.email,
    isBuyer: true,
    source: "SHOWING_REQUEST",
    assigneeId: AGENT_ALI,
  });
  const chat = await capture(state, {
    workspaceId: WS_A,
    customerId: seeded.user.id,
    email: seeded.user.email,
    isBuyer: true,
    source: "SIGNUP",
    assigneeId: AGENT_ALI,
  });
  const manual = await capture(state, {
    workspaceId: WS_A,
    customerId: seeded.user.id,
    email: seeded.user.email,
    isBuyer: true,
    source: "OTHER",
    assigneeId: AGENT_ALI,
  });
  assert.equal(first.lead.id, seeded.lead.id);
  assert.equal(second.lead.id, seeded.lead.id);
  assert.equal(inquiry.lead.id, seeded.lead.id);
  assert.equal(planner.lead.id, seeded.lead.id);
  assert.equal(chat.lead.id, seeded.lead.id);
  assert.equal(manual.lead.id, seeded.lead.id);
  assert.equal(state.leads.length, 1);
  assert.equal(state.conversations.length, 1);
  console.log(
    "[6] repeat valuation / listing / Route Planner / Chat / manual... PASS",
  );
}

async function testGuestThenAuthenticated() {
  resetLeadIdentityLocksForTests();
  const state = emptyState();
  const guest = await capture(state, {
    workspaceId: WS_A,
    email: "guest-later@example.com",
    name: "Guest",
    isBuyer: true,
    source: "PROPERTY_INQUIRY",
    assigneeId: AGENT_DEMO,
  });
  assert.equal(guest.created, true);
  assert.ok(guest.customerId);
  const signedIn = await capture(state, {
    workspaceId: WS_A,
    customerId: guest.customerId,
    email: "guest-later@example.com",
    isSeller: true,
    source: "HOME_VALUATION",
    assigneeId: AGENT_ALI,
  });
  assert.equal(signedIn.created, false);
  assert.equal(signedIn.lead.id, guest.lead.id);
  assert.equal(signedIn.assignedAgentId, AGENT_DEMO);
  assert.equal(signedIn.lead.isBuyer, true);
  assert.equal(signedIn.lead.isSeller, true);
  console.log("[7] guest → later authenticated same identity... PASS");
}

async function testCrossWorkspaceIsolation() {
  resetLeadIdentityLocksForTests();
  const state = emptyState();
  const seeded = await seedBuyerLead(state, { workspaceId: WS_A });
  const other = await capture(state, {
    workspaceId: WS_B,
    customerId: seeded.user.id,
    email: seeded.user.email,
    isBuyer: true,
    source: "SIGNUP",
    assigneeId: AGENT_ALI,
  });
  assert.equal(other.created, true);
  assert.notEqual(other.lead.id, seeded.lead.id);
  assert.equal(other.assignedAgentId, AGENT_ALI);
  assert.equal(state.leads.length, 2);
  console.log("[8] same person, different Workspaces → separate Leads... PASS");
}

async function testAmbiguousIdentityFailsClosed() {
  resetLeadIdentityLocksForTests();
  const state = emptyState();
  state.users.push(
    {
      id: "user_email",
      email: "alpha@example.com",
      name: "Alpha",
      phone: null,
      phoneE164: null,
      role: "BUYER",
      isBuyer: true,
      isSeller: false,
      activeMode: "BUYER",
    },
    {
      id: "user_phone",
      email: "beta@example.com",
      name: "Beta",
      phone: "4165550199",
      phoneE164: "+14165550199",
      role: "BUYER",
      isBuyer: true,
      isSeller: false,
      activeMode: "BUYER",
    },
  );
  await assert.rejects(
    () =>
      capture(state, {
        workspaceId: WS_A,
        email: "alpha@example.com",
        phone: "+14165550199",
        isBuyer: true,
        source: "PROPERTY_INQUIRY",
        assigneeId: AGENT_DEMO,
      }),
    AmbiguousLeadIdentityError,
  );
  assert.equal(state.leads.length, 0);
  console.log("[9] ambiguous identity fails closed... PASS");
}

async function testConcurrentIntake() {
  resetLeadIdentityLocksForTests();
  const state = emptyState();
  const db = createFakeDb(state);
  const input = {
    workspaceId: WS_A,
    email: "race@example.com",
    name: "Race",
    isBuyer: true,
    isSeller: false,
    source: "SIGNUP" as const,
    db,
    resolveCreateDesk: async () => ({
      assigneeId: AGENT_DEMO,
      organizationId: "org_a",
    }),
  };
  const [a, b] = await Promise.all([
    resolveOrCreateWorkspaceLead(input),
    resolveOrCreateWorkspaceLead(input),
  ]);
  assert.equal(a.lead.id, b.lead.id);
  assert.equal(state.leads.length, 1);
  console.log("[10] concurrent intake reuses one Lead... PASS");
}

function testSentinelEmailIsNotIdentity() {
  assert.equal(normalizeLeadEmail("pending@houzzat.ca"), null);
  assert.equal(normalizeLeadEmail("omsyed88@gmail.com"), "omsyed88@gmail.com");
  console.log("[11] sentinel pending@ email is not identity... PASS");
}

function testWiringAndNoUniqueIndexYet() {
  const schema = read("prisma/schema.prisma");
  const leadStart = schema.indexOf("model Lead ");
  const leadEnd = schema.indexOf("\nmodel ", leadStart + 1);
  const leadBlock = schema.slice(leadStart, leadEnd);
  assert.ok(!leadBlock.includes("@@unique([workspaceId, customerId])"));
  assert.ok(!leadBlock.includes("workspaceId_customerId"));

  const routes = [
    "src/app/api/leads/route.ts",
    "src/app/api/valuation/route.ts",
    "src/app/api/tools/affordability-lead/route.ts",
    "src/app/api/tools/seller-readiness/route.ts",
    "src/app/api/pre-construction/inquiry/route.ts",
    "src/app/api/route-planner/request/route.ts",
  ];
  for (const rel of routes) {
    const src = read(rel);
    assert.ok(
      src.includes("publicResolveOrCreateLead"),
      `${rel} must resolve-first`,
    );
    assert.ok(
      !src.includes("prisma.lead.create") && !src.includes("tx.lead.create"),
      `${rel} must not insert Leads directly`,
    );
  }
  const intake = read("src/lib/agent/lead-intake.ts");
  assert.ok(intake.includes("resolveOrCreateWorkspaceLead"));
  assert.ok(intake.includes("if (!resolved.created)"));
  const manual = read("src/lib/agent/create-manual-lead.ts");
  assert.ok(manual.includes("resolveOrCreateWorkspaceLead"));
  const chat = read("src/lib/conversations/customer-chat-lead.ts");
  assert.ok(chat.includes("captureWebsiteLead"));
  assert.ok(chat.includes("Do NOT call `routeExistingLead`"));
  const assign = read("src/app/api/agent/leads/route.ts");
  assert.ok(assign.includes("assignedAgentId"));
  const apply = read("src/lib/agent/lead-intake.ts");
  assert.ok(apply.includes("export async function applyLeadAssignment"));
  const provision = read("src/lib/platform/provisioning/crm-routing.ts");
  assert.ok(provision.includes('sellerAssignMode: "LISTING_AGENT"'));
  assert.ok(provision.includes("PERCENTAGE"));
  assert.ok(!provision.includes("agents[0]"));
  const workspaceRouting = read("src/lib/workspace-routing.ts");
  assert.ok(workspaceRouting.includes("pickRoutedAssignee"));
  assert.ok(!workspaceRouting.includes("crmRoutingSettings.create"));
  const merge = mergeIncomingLeadClassification(
    { isBuyer: true, isSeller: false },
    { isSeller: true },
  );
  assert.equal(merge.isBuyer && merge.isSeller, true);
  console.log("[12] wiring + no unique index yet + sticky reassignment path... PASS");
}

async function main() {
  console.log("\n=== LEAD IDENTITY / ROUTING PHASE 1 ===\n");
  testPickerPreservesSellerPercentage();
  await testExistingBuyerThenSeller();
  await testExistingSellerThenBuyer();
  await testNewSellerPercentage();
  await testNewSellerListingAgent();
  await testNewBuyerRouting();
  await testRepeatValuationAndInquiry();
  await testGuestThenAuthenticated();
  await testCrossWorkspaceIsolation();
  await testAmbiguousIdentityFailsClosed();
  await testConcurrentIntake();
  testSentinelEmailIsNotIdentity();
  testWiringAndNoUniqueIndexYet();
  console.log("\nLEAD IDENTITY / ROUTING PHASE 1 SELFTEST PASSED\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
