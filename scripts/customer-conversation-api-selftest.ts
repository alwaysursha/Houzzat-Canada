/**
 * Customer Conversation APIs — in-memory selftest.
 * Does not connect to production. Does not create production rows.
 * Run: pnpm customer-conversation-api:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConversationStatus, Role } from "@prisma/client";
import type { CustomerUser } from "../src/lib/account";
import {
  CUSTOMER_CHAT_TEXT_MAX_LENGTH,
  handleCustomerConversationGet,
  handleCustomerConversationRead,
  handleCustomerConversationSend,
  type CustomerConversationApiDeps,
  type CustomerConversationDb,
  type CustomerConversationGetPayload,
  type CustomerConversationMarkReadPayload,
  type CustomerConversationSendPayload,
} from "../src/lib/conversations/customer-conversation";
import {
  CUSTOMER_CHAT_SEND_LIMIT,
  clearCustomerChatSendRateLimitsForTests,
} from "../src/lib/conversations/customer-chat-rate-limit";
import type {
  CustomerChatLeadFailure,
  CustomerChatLeadResult,
  CustomerChatLeadSuccess,
} from "../src/lib/conversations/customer-chat-lead";
import {
  getConversationUnreadState,
} from "../src/lib/conversations/read-state";
import type { LeadConversationRecord } from "../src/lib/conversations/lead-conversation";
import type { ConversationMessageRecord } from "../src/lib/conversations/create-conversation-message";
import type { NotifyAssignedAgentOfCustomerChatMessageInput } from "../src/lib/notifications/customer-chat-agent-push";
import type { ResolvedWorkspaceHost } from "../src/lib/tenancy/host-resolution-types";

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
const HOST_A = "tenant-a.houzzatpro.com";
const HOST_B = "tenant-b.houzzatpro.com";
const T0 = new Date("2026-09-17T18:00:00.000Z");

function uniqueError(): Error & { code: string } {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

function customerUser(
  overrides: Partial<CustomerUser> & { id?: string; role?: Role } = {},
): CustomerUser {
  return {
    id: overrides.id ?? CUSTOMER_A,
    email: overrides.email ?? "customer-a@test.local",
    name: overrides.name ?? "Customer A",
    image: null,
    phone: null,
    homeAddress: null,
    homeLat: null,
    homeLng: null,
    role: overrides.role ?? "BUYER",
    emailVerified: overrides.emailVerified ?? T0,
    createdAt: overrides.createdAt ?? T0,
    caslConsentAt: null,
    vowAcceptedAt: null,
    vowVersion: null,
    emailAlertsEnabled: true,
    smsAlertsEnabled: false,
    relatedListingsMode: "SAME_AREA",
    termsAcceptedAt: null,
    termsVersion: null,
  };
}

type StoredMessage = ConversationMessageRecord & {
  editedAt: Date | null;
  deletedAt: Date | null;
};

class FakeCustomerDb implements CustomerConversationDb {
  leads = new Map<
    string,
    {
      id: string;
      workspaceId: string;
      assignedAgentId: string | null;
      customerId: string | null;
    }
  >();
  conversations = new Map<string, LeadConversationRecord>();
  messages: StoredMessage[] = [];
  conversationCreates = 0;
  messageCreates = 0;
  customerCursorWrites = 0;
  agentCursorWrites = 0;
  leadActivityCreates = 0;
  activities: Array<{
    id: string;
    leadId: string;
    type: string;
    body: string | null;
    meta: Record<string, unknown> | null;
  }> = [];
  notificationSends = 0;
  emailSends = 0;
  smsSends = 0;
  consentWrites = 0;
  nextConversationId = 1;
  nextMessageId = 1;

  private leadKey(workspaceId: string, leadId: string) {
    return `${workspaceId}:${leadId}`;
  }

  seedLead(input: {
    id: string;
    workspaceId?: string;
    assignedAgentId?: string | null;
    customerId?: string | null;
  }) {
    const row = {
      id: input.id,
      workspaceId: input.workspaceId ?? WS_A,
      assignedAgentId: input.assignedAgentId ?? AGENT_A,
      customerId: input.customerId ?? CUSTOMER_A,
    };
    this.leads.set(this.leadKey(row.workspaceId, row.id), row);
    return row;
  }

  seedConversation(
    overrides: Partial<LeadConversationRecord> &
      Pick<LeadConversationRecord, "id" | "workspaceId" | "leadId">,
  ) {
    const row: LeadConversationRecord = {
      status: "OPEN" as ConversationStatus,
      createdAt: T0,
      updatedAt: T0,
      lastMessageAt: null,
      customerLastReadAt: null,
      agentLastReadAt: null,
      agentLastReadByUserId: null,
      ...overrides,
    };
    this.conversations.set(this.leadKey(row.workspaceId, row.leadId), row);
    return row;
  }

  seedMessage(
    overrides: Partial<StoredMessage> &
      Pick<StoredMessage, "id" | "conversationId" | "leadId" | "workspaceId">,
  ) {
    const row: StoredMessage = {
      channel: "CHAT",
      kind: "TEXT",
      senderKind: "AGENT",
      senderUserId: AGENT_A,
      senderName: "Agent A",
      createdByUserId: AGENT_A,
      body: "hello",
      createdAt: T0,
      deliveredAt: null,
      smsSource: null,
      twilioMessageSid: null,
      providerStatus: null,
      smsFrom: null,
      smsTo: null,
      payload: null,
      editedAt: null,
      deletedAt: null,
      ...overrides,
    };
    this.messages.push(row);
    return row;
  }

  lead: CustomerConversationDb["lead"] = {
    findUnique: async ({ where }) => {
      const pair = where.workspaceId_id;
      if (pair) {
        return this.leads.get(this.leadKey(pair.workspaceId, pair.id)) ?? null;
      }
      return null;
    },
  };

  conversation = {
    findUnique: async ({ where }: { where: Record<string, unknown> }) => {
      const byLead = where.workspaceId_leadId as
        | { workspaceId: string; leadId: string }
        | undefined;
      if (byLead) {
        return (
          this.conversations.get(
            this.leadKey(byLead.workspaceId, byLead.leadId),
          ) ?? null
        );
      }
      const byId = where.workspaceId_id as
        | { workspaceId: string; id: string }
        | undefined;
      if (byId) {
        return (
          [...this.conversations.values()].find(
            (row) =>
              row.workspaceId === byId.workspaceId && row.id === byId.id,
          ) ?? null
        );
      }
      return null;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const workspaceId = String(data.workspaceId);
      const leadId = String(data.leadId);
      const key = this.leadKey(workspaceId, leadId);
      this.conversationCreates += 1;
      if (this.conversations.has(key)) throw uniqueError();
      const row: LeadConversationRecord = {
        id: `conv_${this.nextConversationId++}`,
        workspaceId,
        leadId,
        status: "OPEN" as ConversationStatus,
        createdAt: T0,
        updatedAt: T0,
        lastMessageAt: null,
        customerLastReadAt: null,
        agentLastReadAt: null,
        agentLastReadByUserId: null,
      };
      this.conversations.set(key, row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: { workspaceId_id?: { workspaceId: string; id: string } };
      data: Partial<LeadConversationRecord>;
    }) => {
      const pair = where.workspaceId_id;
      if (!pair) throw new Error("workspaceId_id required");
      const row = [...this.conversations.values()].find(
        (item) =>
          item.workspaceId === pair.workspaceId && item.id === pair.id,
      );
      if (!row) throw new Error("missing conversation");
      if (data.lastMessageAt !== undefined) {
        row.lastMessageAt = data.lastMessageAt;
      }
      if (data.agentLastReadAt !== undefined) {
        row.agentLastReadAt = data.agentLastReadAt;
        this.agentCursorWrites += 1;
      }
      if (data.agentLastReadByUserId !== undefined) {
        row.agentLastReadByUserId = data.agentLastReadByUserId;
        this.agentCursorWrites += 1;
      }
      if (data.customerLastReadAt !== undefined) {
        row.customerLastReadAt = data.customerLastReadAt;
        this.customerCursorWrites += 1;
      }
      this.conversations.set(this.leadKey(row.workspaceId, row.leadId), row);
      return { ...row };
    },
  };

  message = {
    findUnique: async ({ where }: { where: Record<string, unknown> }) => {
      const sid = where.twilioMessageSid;
      if (typeof sid === "string") {
        return this.messages.find((row) => row.twilioMessageSid === sid) ?? null;
      }
      return null;
    },
    findFirst: async ({
      where,
      orderBy,
    }: {
      where: {
        workspaceId?: string;
        conversationId?: string;
        channel?: string;
      };
      orderBy?: { createdAt?: "asc" | "desc" };
    }) => {
      const rows = this.messages.filter(
        (row) =>
          row.workspaceId === where.workspaceId &&
          row.conversationId === where.conversationId &&
          (where.channel ? row.channel === where.channel : true),
      );
      rows.sort((a, b) => {
        const byTime = a.createdAt.getTime() - b.createdAt.getTime();
        return orderBy?.createdAt === "desc" ? -byTime : byTime;
      });
      return rows[0] ?? null;
    },
    findMany: async ({
      where,
      orderBy,
      take,
    }: {
      where: Record<string, unknown>;
      orderBy?: Array<Record<string, string>> | Record<string, string>;
      take?: number;
    }) => {
      let rows = this.messages.filter((row) => {
        if (where.workspaceId && row.workspaceId !== where.workspaceId) {
          return false;
        }
        if (where.conversationId && row.conversationId !== where.conversationId) {
          return false;
        }
        if (where.channel && row.channel !== where.channel) {
          return false;
        }
        const or = where.OR as
          | Array<Record<string, unknown>>
          | undefined;
        if (or?.length) {
          return or.some((clause) => {
            const createdAt = clause.createdAt as
              | { lt?: Date }
              | undefined;
            if (createdAt?.lt) {
              return row.createdAt.getTime() < createdAt.lt.getTime();
            }
            if (
              clause.createdAt instanceof Date === false &&
              clause.createdAt &&
              typeof clause.id === "object"
            ) {
              const id = (clause.id as { lt?: string }).lt;
              const at = clause.createdAt as Date;
              return (
                row.createdAt.getTime() === at.getTime() &&
                Boolean(id && row.id < id)
              );
            }
            return false;
          });
        }
        return true;
      });
      const order = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
      const createdDir = order[0]?.createdAt === "asc" ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const byTime = a.createdAt.getTime() - b.createdAt.getTime();
        if (byTime !== 0) return createdDir * byTime;
        return createdDir * a.id.localeCompare(b.id);
      });
      if (typeof take === "number") rows = rows.slice(0, take);
      return rows;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.messageCreates += 1;
      const createdAt =
        data.createdAt instanceof Date ? data.createdAt : new Date();
      const row: StoredMessage = {
        id: `msg_${this.nextMessageId++}`,
        workspaceId: String(data.workspaceId),
        conversationId: String(data.conversationId),
        leadId: String(data.leadId),
        channel: data.channel as StoredMessage["channel"],
        kind: data.kind as StoredMessage["kind"],
        senderKind: data.senderKind as StoredMessage["senderKind"],
        senderUserId:
          typeof data.senderUserId === "string" ? data.senderUserId : null,
        senderName: String(data.senderName),
        createdByUserId:
          typeof data.createdByUserId === "string"
            ? data.createdByUserId
            : null,
        body: typeof data.body === "string" ? data.body : null,
        createdAt,
        deliveredAt: null,
        smsSource: null,
        twilioMessageSid: null,
        providerStatus: null,
        smsFrom: null,
        smsTo: null,
        payload: null,
        editedAt: null,
        deletedAt: null,
      };
      this.messages.push(row);
      return row;
    },
  };

  leadActivity = {
    findFirst: async ({
      where,
    }: {
      where: {
        leadId?: string;
        type?: string;
        meta?: { path?: string[]; equals?: unknown };
      };
    }) => {
      const messageId =
        where.meta?.path?.[0] === "messageId" &&
        typeof where.meta.equals === "string"
          ? where.meta.equals
          : null;
      if (!messageId) return null;
      const row = this.activities.find(
        (item) =>
          item.leadId === where.leadId &&
          item.type === where.type &&
          item.meta?.messageId === messageId,
      );
      return row ? { id: row.id } : null;
    },
    create: async ({
      data,
    }: {
      data: {
        leadId: string;
        type: string;
        body?: string | null;
        meta?: unknown;
        userId?: string | null;
      };
    }) => {
      this.leadActivityCreates += 1;
      const meta =
        data.meta && typeof data.meta === "object" && !Array.isArray(data.meta)
          ? (data.meta as Record<string, unknown>)
          : null;
      const row = {
        id: `act_${this.leadActivityCreates}`,
        leadId: data.leadId,
        type: data.type,
        body: data.body ?? null,
        meta,
      };
      this.activities.push(row);
      return row;
    },
  };

  async $transaction<T>(
    fn: (tx: {
      message: FakeCustomerDb["message"];
      conversation: FakeCustomerDb["conversation"];
    }) => Promise<T>,
  ): Promise<T> {
    return fn({ message: this.message, conversation: this.conversation });
  }
}

type WorldLead = {
  id: string;
  workspaceId: string;
  customerId: string;
  assignedAgentId: string | null;
};

class ApiWorld {
  db = new FakeCustomerDb();
  user: CustomerUser | null = customerUser();
  verifyDenied: { status: number; body: unknown } | null = null;
  leads: WorldLead[] = [];
  eligibleByWorkspace = new Map<string, string | null>([
    [WS_A, AGENT_A],
    [WS_B, AGENT_B],
  ]);
  resolveCalls = 0;
  ensureCalls = 0;
  captureCalls = 0;
  chatPushes: NotifyAssignedAgentOfCustomerChatMessageInput[] = [];
  nextLead = 1;

  seedOwnLead(input: {
    id?: string;
    workspaceId?: string;
    assignedAgentId?: string | null;
    customerId?: string;
  } = {}) {
    const lead: WorldLead = {
      id: input.id ?? `lead_${this.nextLead++}`,
      workspaceId: input.workspaceId ?? WS_A,
      customerId: input.customerId ?? CUSTOMER_A,
      assignedAgentId:
        input.assignedAgentId === undefined ? AGENT_A : input.assignedAgentId,
    };
    this.leads.push(lead);
    this.db.seedLead(lead);
    return lead;
  }

  private hostWorkspace(request: Request): ResolvedWorkspaceHost {
    const hostname = new URL(request.url).hostname;
    if (hostname === HOST_A) {
      return {
        ok: true,
        mode: "workspace",
        workspaceId: WS_A,
        workspaceSlug: "tenant-a",
        normalizedHostname: HOST_A,
        verifiedHostname: true,
      };
    }
    if (hostname === HOST_B) {
      return {
        ok: true,
        mode: "workspace",
        workspaceId: WS_B,
        workspaceSlug: "tenant-b",
        normalizedHostname: HOST_B,
        verifiedHostname: true,
      };
    }
    if (hostname === "app.houzzatpro.com" || hostname === "houzzatpro.com") {
      return {
        ok: false,
        mode: "workspace",
        normalizedHostname: hostname,
        reason: "platform_surface",
        verifiedHostname: false,
      };
    }
    if (hostname === "suspended.houzzatpro.com") {
      return {
        ok: false,
        mode: "workspace",
        normalizedHostname: hostname,
        reason: "workspace_suspended",
        verifiedHostname: false,
      };
    }
    return {
      ok: false,
      mode: "workspace",
      normalizedHostname: hostname,
      reason: "domain_not_found",
      verifiedHostname: false,
    };
  }

  private identity(request: Request): CustomerChatLeadResult | CustomerChatLeadSuccess {
    if (!this.user) {
      return { ok: false, reason: "UNAUTHENTICATED" };
    }
    if (this.user.role === "AGENT" || this.user.role === "ADMIN") {
      return { ok: false, reason: "STAFF_FORBIDDEN", customerUserId: this.user.id };
    }
    const host = this.hostWorkspace(request);
    if (!host.ok) {
      return host.reason === "platform_surface"
        ? { ok: false, reason: "PLATFORM_SURFACE", hostDenyReason: host.reason }
        : {
            ok: false,
            reason: "WORKSPACE_UNAVAILABLE",
            hostDenyReason: host.reason,
          };
    }
    return {
      ok: true,
      workspaceId: host.workspaceId,
      workspaceSlug: host.workspaceSlug,
      customerUserId: this.user.id,
      customerDisplayName: this.user.name ?? this.user.email,
      customerEmail: this.user.email,
      leadId: "",
      assignedAgentId: null,
      assignmentState: "UNASSIGNED",
      assignedAgentEligible: false,
      leadExisted: false,
      leadCreated: false,
      canSend: false,
    };
  }

  private primaryLead(workspaceId: string, customerId: string): WorldLead | null {
    const matches = this.leads.filter(
      (lead) =>
        lead.workspaceId === workspaceId && lead.customerId === customerId,
    );
    return matches.sort((a, b) => b.id.localeCompare(a.id))[0] ?? null;
  }

  private presentLead(
    base: CustomerChatLeadSuccess,
    lead: WorldLead,
    created: boolean,
  ): CustomerChatLeadSuccess {
    return {
      ...base,
      leadId: lead.id,
      assignedAgentId: lead.assignedAgentId,
      assignmentState: lead.assignedAgentId ? "ASSIGNED" : "UNASSIGNED",
      assignedAgentEligible: Boolean(lead.assignedAgentId),
      leadExisted: !created,
      leadCreated: created,
      canSend: Boolean(lead.assignedAgentId),
    };
  }

  deps(): CustomerConversationApiDeps {
    const world = this;
    return {
      db: this.db,
      requireSendAccess: async () => {
        if (this.verifyDenied) return { ok: false, ...this.verifyDenied };
        if (!this.user) {
          return {
            ok: false,
            status: 401,
            body: { error: "Sign in required.", requiresAuth: true },
          };
        }
        return { ok: true, user: this.user };
      },
      resolveWorkspaceFromRequest: async (request) => this.hostWorkspace(request),
      resolveCustomerChatLead: async ({ request }) => {
        this.resolveCalls += 1;
        const identity = this.identity(request);
        if (!identity.ok) return identity;
        const lead = this.primaryLead(identity.workspaceId, identity.customerUserId);
        if (!lead) {
          const missing: CustomerChatLeadFailure = {
            ok: false,
            reason: "LEAD_NOT_FOUND",
            workspaceId: identity.workspaceId,
            customerUserId: identity.customerUserId,
          };
          return missing;
        }
        return this.presentLead(identity, lead, false);
      },
      ensureCustomerChatLead: async ({ request }) => {
        this.ensureCalls += 1;
        const identity = this.identity(request);
        if (!identity.ok) return identity;
        let lead = this.primaryLead(identity.workspaceId, identity.customerUserId);
        let created = false;
        if (!lead) {
          this.captureCalls += 1;
          created = true;
          lead = {
            id: `lead_captured_${this.nextLead++}`,
            workspaceId: identity.workspaceId,
            customerId: identity.customerUserId,
            assignedAgentId: this.eligibleByWorkspace.get(identity.workspaceId) ?? null,
          };
          this.leads.push(lead);
          this.db.seedLead(lead);
        }
        if (!lead.assignedAgentId) {
          const assignee = this.eligibleByWorkspace.get(identity.workspaceId) ?? null;
          if (!assignee) {
            return {
              ok: false,
              reason: "NO_ELIGIBLE_AGENT",
              workspaceId: identity.workspaceId,
              customerUserId: identity.customerUserId,
              leadId: lead.id,
              assignmentState: "NO_ELIGIBLE_AGENT",
            };
          }
          lead.assignedAgentId = assignee;
          const row = this.db.leads.get(`${lead.workspaceId}:${lead.id}`);
          if (row) row.assignedAgentId = assignee;
        }
        return this.presentLead(identity, lead, created);
      },
      scheduleAssignedAgentChatPush: (input) => {
        world.chatPushes.push(input);
      },
    };
  }
}

function requestFor(
  hostname: string,
  path: string,
  init?: RequestInit,
): Request {
  return new Request(`https://${hostname}${path}`, {
    ...init,
    headers: {
      host: hostname,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function sendBody(
  world: ApiWorld,
  body: unknown,
  hostname = HOST_A,
) {
  return handleCustomerConversationSend(
    requestFor(hostname, "/api/account/conversation/messages", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    world.deps(),
  );
}

async function getConversation(
  world: ApiWorld,
  path = "/api/account/conversation",
  hostname = HOST_A,
) {
  return handleCustomerConversationGet(
    requestFor(hostname, path),
    world.deps(),
  );
}

async function postRead(
  world: ApiWorld,
  body?: unknown,
  hostname = HOST_A,
) {
  return handleCustomerConversationRead(
    requestFor(hostname, "/api/account/conversation/read", {
      method: "POST",
      body: body === undefined ? "" : JSON.stringify(body),
    }),
    world.deps(),
  );
}

async function testUnauthenticated() {
  clearCustomerChatSendRateLimitsForTests();
  const world = new ApiWorld();
  world.user = null;
  const get = await getConversation(world);
  const send = await sendBody(world, { body: "hi" });
  const read = await postRead(world);
  assert.equal(get.status, 401);
  assert.equal(send.status, 401);
  assert.equal(read.status, 401);
  assert.equal((get.body as { requiresAuth?: boolean }).requiresAuth, true);
}

async function testStaffRejected() {
  clearCustomerChatSendRateLimitsForTests();
  const world = new ApiWorld();
  world.user = customerUser({ id: "agent_1", role: "AGENT", email: "a@t.local" });
  const get = await getConversation(world);
  const send = await sendBody(world, { body: "hi" });
  const read = await postRead(world);
  assert.equal(get.status, 404);
  assert.equal(send.status, 404);
  assert.equal(read.status, 404);
  assert.equal(world.db.messageCreates, 0);
}

async function testAdminRejected() {
  clearCustomerChatSendRateLimitsForTests();
  const world = new ApiWorld();
  world.user = customerUser({ id: "admin_1", role: "ADMIN", email: "ad@t.local" });
  const send = await sendBody(world, { body: "hi" });
  assert.equal(send.status, 404);
}

async function testHostnameIsolation() {
  const world = new ApiWorld();
  world.seedOwnLead({ id: "lead_a", workspaceId: WS_A, assignedAgentId: AGENT_A });
  world.seedOwnLead({ id: "lead_b", workspaceId: WS_B, assignedAgentId: AGENT_B });
  const onA = await getConversation(world, "/api/account/conversation", HOST_A);
  const onB = await getConversation(world, "/api/account/conversation", HOST_B);
  assert.equal(onA.status, 200);
  assert.equal(onB.status, 200);
  const aBody = onA.body as CustomerConversationGetPayload;
  const bBody = onB.body as CustomerConversationGetPayload;
  assert.ok(aBody.conversation);
  assert.ok(bBody.conversation);
  assert.notEqual(aBody.conversation?.id, bBody.conversation?.id);
}

async function testOtherCustomerInaccessible() {
  const world = new ApiWorld();
  world.seedOwnLead({
    id: "lead_b",
    workspaceId: WS_A,
    customerId: CUSTOMER_B,
    assignedAgentId: AGENT_A,
  });
  const get = await getConversation(world);
  assert.equal(get.status, 200);
  const body = get.body as CustomerConversationGetPayload;
  assert.equal(body.conversation, null);
  assert.equal(world.db.conversationCreates, 0);
}

async function testStrictBodyRejectsIdentity() {
  clearCustomerChatSendRateLimitsForTests();
  const world = new ApiWorld();
  world.seedOwnLead();
  const fields = [
    { body: "hi", leadId: "lead_forged" },
    { body: "hi", workspaceId: WS_B },
    { body: "hi", conversationId: "conv_x" },
    { body: "hi", assignedAgentId: AGENT_B },
    { body: "hi", senderUserId: CUSTOMER_B },
    { body: "hi", senderName: "Forged" },
    { body: "hi", email: "forged@test.local" },
  ];
  for (const payload of fields) {
    const result = await sendBody(world, payload);
    assert.equal(result.status, 400, JSON.stringify(payload));
  }
  assert.equal(world.db.messageCreates, 0);
  assert.equal(world.ensureCalls, 0);
}

async function testGetNoLeadDoesNotCreate() {
  const world = new ApiWorld();
  const result = await getConversation(world);
  assert.equal(result.status, 200);
  const body = result.body as CustomerConversationGetPayload;
  assert.equal(body.conversation, null);
  assert.equal(body.messages.length, 0);
  assert.equal(body.canSend, true);
  assert.equal(world.ensureCalls, 0);
  assert.equal(world.captureCalls, 0);
  assert.equal(world.db.conversationCreates, 0);
}

async function testGetExistingTranscriptAndNoMarkRead() {
  const world = new ApiWorld();
  const lead = world.seedOwnLead({ id: "lead_a" });
  const conv = world.db.seedConversation({
    id: "conv_a",
    workspaceId: WS_A,
    leadId: lead.id,
  });
  world.db.seedMessage({
    id: "msg_agent",
    workspaceId: WS_A,
    conversationId: conv.id,
    leadId: lead.id,
    senderKind: "AGENT",
    senderName: "Agent A",
    body: "Welcome",
    createdAt: T0,
  });
  const result = await getConversation(world);
  assert.equal(result.status, 200);
  const body = result.body as CustomerConversationGetPayload;
  assert.equal(body.conversation?.id, "conv_a");
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0]?.body, "Welcome");
  assert.equal(body.messages[0]?.senderUserId, undefined);
  assert.equal(world.db.customerCursorWrites, 0);
  assert.equal((body.conversation as { leadId?: string }).leadId, undefined);
}

async function testGetIncludesSms() {
  const world = new ApiWorld();
  const lead = world.seedOwnLead({ id: "lead_a" });
  const conv = world.db.seedConversation({
    id: "conv_a",
    workspaceId: WS_A,
    leadId: lead.id,
  });
  world.db.seedMessage({
    id: "msg_chat",
    workspaceId: WS_A,
    conversationId: conv.id,
    leadId: lead.id,
    channel: "CHAT",
    senderKind: "AGENT",
    body: "Chat hello",
    createdAt: T0,
  });
  world.db.seedMessage({
    id: "msg_sms",
    workspaceId: WS_A,
    conversationId: conv.id,
    leadId: lead.id,
    channel: "SMS",
    senderKind: "AGENT",
    body: "SMS hello",
    createdAt: new Date(T0.getTime() + 1000),
    smsSource: "TWILIO",
    twilioMessageSid: "SM_HIDE",
    payload: {
      automationKey: "lead.inactive_14_days",
      internal: "secret",
    },
  });
  world.db.seedMessage({
    id: "msg_inbound",
    workspaceId: WS_A,
    conversationId: conv.id,
    leadId: lead.id,
    channel: "SMS",
    senderKind: "CUSTOMER",
    senderName: "Customer A",
    body: "YES",
    createdAt: new Date(T0.getTime() + 2000),
    smsSource: "TWILIO",
    twilioMessageSid: "SM_IN",
  });
  const result = await getConversation(world);
  assert.equal(result.status, 200);
  const body = result.body as CustomerConversationGetPayload;
  assert.equal(body.messages.length, 3);
  assert.equal(body.messages[0]?.id, "msg_chat");
  assert.equal(body.messages[0]?.channel, "CHAT");
  assert.equal(body.messages[0]?.payload, null);
  const sms = body.messages[1];
  assert.equal(sms?.id, "msg_sms");
  assert.equal(sms?.channel, "SMS");
  assert.equal(sms?.body, "SMS hello");
  assert.deepEqual(sms?.payload, { automationKey: "lead.inactive_14_days" });
  assert.equal("twilioMessageSid" in (sms ?? {}), false);
  assert.equal("smsTo" in (sms ?? {}), false);
  assert.equal(body.messages[2]?.id, "msg_inbound");
  assert.equal(body.messages[2]?.senderKind, "CUSTOMER");
  assert.equal(body.messages[2]?.payload, null);
}

async function testSendCreatesViaEnsure() {
  clearCustomerChatSendRateLimitsForTests();
  const world = new ApiWorld();
  const result = await sendBody(world, { body: "Hello agent" });
  assert.equal(result.status, 200);
  assert.equal(world.ensureCalls, 1);
  assert.equal(world.captureCalls, 1);
  assert.equal(world.db.messageCreates, 1);
  const body = result.body as CustomerConversationSendPayload;
  assert.equal(body.message.senderKind, "CUSTOMER");
  assert.equal(body.message.channel, "CHAT");
  assert.equal(body.message.kind, "TEXT");
  assert.equal(body.message.body, "Hello agent");
  assert.equal(body.message.senderName, "Customer A");
  assert.equal(world.db.messages.length, 1);
}

async function testSendUnassignedRoutes() {
  clearCustomerChatSendRateLimitsForTests();
  const world = new ApiWorld();
  world.seedOwnLead({ id: "lead_pond", assignedAgentId: null });
  const result = await sendBody(world, { body: "Need help" });
  assert.equal(result.status, 200);
  assert.equal(world.ensureCalls, 1);
  assert.equal(world.leads[0]?.assignedAgentId, AGENT_A);
  assert.equal(world.db.messageCreates, 1);
}

async function testNoEligibleAgentNoRows() {
  clearCustomerChatSendRateLimitsForTests();
  const world = new ApiWorld();
  world.seedOwnLead({ id: "lead_pond", assignedAgentId: null });
  world.eligibleByWorkspace.set(WS_A, null);
  const result = await sendBody(world, { body: "Anyone there?" });
  assert.equal(result.status, 503);
  assert.equal(
    (result.body as { code?: string }).code,
    "CHAT_AGENT_UNAVAILABLE",
  );
  assert.equal(world.db.messageCreates, 0);
  assert.equal(world.db.conversationCreates, 0);
  assert.equal(world.chatPushes.length, 0);
}

async function testBlockedCannotSend() {
  clearCustomerChatSendRateLimitsForTests();
  const world = new ApiWorld();
  const lead = world.seedOwnLead({ id: "lead_a" });
  world.db.seedConversation({
    id: "conv_blocked",
    workspaceId: WS_A,
    leadId: lead.id,
    status: "BLOCKED",
  });
  const send = await sendBody(world, { body: "hello" });
  assert.equal(send.status, 403);
  assert.equal((send.body as { code?: string }).code, "CHAT_BLOCKED");
  assert.equal(world.db.messageCreates, 0);
  const get = await getConversation(world);
  const body = get.body as CustomerConversationGetPayload;
  assert.equal(body.blocked, true);
  assert.equal(body.canSend, false);
}

async function testExactlyOneCustomerMessage() {
  clearCustomerChatSendRateLimitsForTests();
  const world = new ApiWorld();
  world.seedOwnLead();
  const result = await sendBody(world, { body: "One" });
  assert.equal(result.status, 200);
  assert.equal(world.db.messageCreates, 1);
  assert.equal(world.db.messages.filter((m) => m.senderKind === "CUSTOMER").length, 1);
}

async function testFrozenSenderIgnoresRequest() {
  clearCustomerChatSendRateLimitsForTests();
  const world = new ApiWorld();
  world.user = customerUser({ name: "  Server Name  " });
  world.seedOwnLead();
  const result = await sendBody(world, { body: "Hi" });
  assert.equal(result.status, 200);
  const body = result.body as CustomerConversationSendPayload;
  assert.equal(body.message.senderName, "Server Name");
}

async function testBodyLengthAndWhitespace() {
  clearCustomerChatSendRateLimitsForTests();
  const world = new ApiWorld();
  world.seedOwnLead();
  const ok = await sendBody(world, { body: "a".repeat(CUSTOMER_CHAT_TEXT_MAX_LENGTH) });
  assert.equal(ok.status, 200);
  const tooLong = await sendBody(world, {
    body: "a".repeat(CUSTOMER_CHAT_TEXT_MAX_LENGTH + 1),
  });
  assert.equal(tooLong.status, 400);
  const empty = await sendBody(world, { body: "   \n\t  " });
  assert.equal(empty.status, 400);
  const crlf = await sendBody(world, { body: "hello\r\nworld" });
  assert.equal(crlf.status, 200);
  const sent = crlf.body as CustomerConversationSendPayload;
  assert.equal(sent.message.body, "hello\nworld");
}

async function testHtmlRemainsPlainText() {
  clearCustomerChatSendRateLimitsForTests();
  const world = new ApiWorld();
  world.seedOwnLead();
  const html = "<script>alert(1)</script>";
  const result = await sendBody(world, { body: html });
  assert.equal(result.status, 200);
  const body = result.body as CustomerConversationSendPayload;
  assert.equal(body.message.body, html);
}

async function testRateLimit429() {
  clearCustomerChatSendRateLimitsForTests();
  const world = new ApiWorld();
  world.seedOwnLead();
  for (let i = 0; i < CUSTOMER_CHAT_SEND_LIMIT; i += 1) {
    const result = await sendBody(world, { body: `msg ${i}` });
    assert.equal(result.status, 200);
  }
  const blocked = await sendBody(world, { body: "one more" });
  assert.equal(blocked.status, 429);
  assert.equal((blocked.body as { code?: string }).code, "RATE_LIMITED");
  assert.ok(blocked.headers?.["Retry-After"]);
  assert.equal(world.db.messageCreates, CUSTOMER_CHAT_SEND_LIMIT);
  clearCustomerChatSendRateLimitsForTests();
}

async function testLastMessageAtAndAgentUnread() {
  clearCustomerChatSendRateLimitsForTests();
  const world = new ApiWorld();
  const lead = world.seedOwnLead({ id: "lead_a" });
  const result = await sendBody(world, { body: "Ping" });
  assert.equal(result.status, 200);
  const conv = [...world.db.conversations.values()][0];
  assert.ok(conv?.lastMessageAt);
  const unread = await getConversationUnreadState(world.db, {
    workspaceId: WS_A,
    leadId: lead.id,
  });
  assert.equal(unread.agentUnreadCount, 1);
  assert.ok(conv.lastMessageAt);
}

async function testPostReadCustomerCursorOnly() {
  const world = new ApiWorld();
  const lead = world.seedOwnLead({ id: "lead_a" });
  const conv = world.db.seedConversation({
    id: "conv_a",
    workspaceId: WS_A,
    leadId: lead.id,
    agentLastReadAt: T0,
    agentLastReadByUserId: AGENT_A,
  });
  world.db.seedMessage({
    id: "msg_1",
    workspaceId: WS_A,
    conversationId: conv.id,
    leadId: lead.id,
    senderKind: "AGENT",
    createdAt: new Date("2026-09-18T00:00:00.000Z"),
  });
  const before = conv.agentLastReadAt;
  const get = await getConversation(world);
  assert.equal(world.db.customerCursorWrites, 0);
  const read = await postRead(world);
  assert.equal(read.status, 200);
  const body = read.body as CustomerConversationMarkReadPayload;
  assert.equal(body.marked, true);
  assert.ok(body.conversation?.customerLastReadAt);
  assert.equal(world.db.agentCursorWrites, 0);
  assert.equal(conv.agentLastReadAt, before);
  assert.ok(world.db.customerCursorWrites >= 1);
  void get;
}

async function testPostReadNoLeadNoop() {
  const world = new ApiWorld();
  const result = await postRead(world);
  assert.equal(result.status, 200);
  const body = result.body as CustomerConversationMarkReadPayload;
  assert.equal(body.ok, true);
  assert.equal(body.marked, false);
  assert.equal(body.conversation, null);
  assert.equal(world.ensureCalls, 0);
}

async function testDeletedBodyNeverExposed() {
  const world = new ApiWorld();
  const lead = world.seedOwnLead({ id: "lead_a" });
  const conv = world.db.seedConversation({
    id: "conv_a",
    workspaceId: WS_A,
    leadId: lead.id,
  });
  world.db.seedMessage({
    id: "msg_del",
    workspaceId: WS_A,
    conversationId: conv.id,
    leadId: lead.id,
    senderKind: "AGENT",
    body: "SECRET_DELETED_BODY",
    deletedAt: new Date("2026-09-18T01:00:00.000Z"),
  });
  const result = await getConversation(world);
  const body = result.body as CustomerConversationGetPayload;
  assert.equal(body.messages[0]?.body, null);
  assert.ok(body.messages[0]?.deletedAt);
  assert.ok(!JSON.stringify(result.body).includes("SECRET_DELETED_BODY"));
}

async function testNoSideEffectsOnSend() {
  clearCustomerChatSendRateLimitsForTests();
  const world = new ApiWorld();
  world.seedOwnLead();
  await sendBody(world, { body: "Hi" });
  assert.equal(world.db.leadActivityCreates, 1);
  assert.equal(world.db.activities[0]?.type, "CHAT");
  assert.equal(world.db.activities[0]?.meta?.channel, "CHAT");
  assert.equal(world.db.activities[0]?.meta?.direction, "inbound");
  assert.equal(world.db.notificationSends, 0);
  assert.equal(world.db.emailSends, 0);
  assert.equal(world.db.smsSends, 0);
  assert.equal(world.db.consentWrites, 0);
  assert.equal(world.chatPushes.length, 1);
  assert.equal(world.chatPushes[0]?.created, true);
}

async function testGetQueryLeadIdIgnored() {
  const world = new ApiWorld();
  world.seedOwnLead({ id: "lead_a" });
  world.seedOwnLead({
    id: "lead_other",
    customerId: CUSTOMER_B,
  });
  const result = await getConversation(
    world,
    "/api/account/conversation?leadId=lead_other&workspaceId=ws_tenant_b",
  );
  assert.equal(result.status, 200);
  const body = result.body as CustomerConversationGetPayload;
  assert.ok(body.conversation);
}

async function testEmailVerificationRequiredOnSend() {
  clearCustomerChatSendRateLimitsForTests();
  const world = new ApiWorld();
  world.verifyDenied = {
    status: 403,
    body: {
      error: "Email verification required.",
      requiresEmailVerification: true,
    },
  };
  const result = await sendBody(world, { body: "hi" });
  assert.equal(result.status, 403);
  assert.equal(
    (result.body as { requiresEmailVerification?: boolean })
      .requiresEmailVerification,
    true,
  );
  assert.equal(world.db.messageCreates, 0);
}

function testSourceSecurity() {
  const api = read("src/lib/conversations/customer-conversation.ts");
  const getRoute = read("src/app/api/account/conversation/route.ts");
  const sendRoute = read("src/app/api/account/conversation/messages/route.ts");
  const readRoute = read("src/app/api/account/conversation/read/route.ts");

  assert.ok(getRoute.includes("handleCustomerConversationGet"));
  assert.ok(sendRoute.includes("handleCustomerConversationSend"));
  assert.ok(readRoute.includes("handleCustomerConversationRead"));
  assert.ok(!getRoute.includes("[leadId]"));
  assert.ok(!sendRoute.includes("[conversationId]"));
  assert.ok(api.includes("resolveCustomerChatLead"));
  assert.ok(api.includes("ensureCustomerChatLead"));
  assert.ok(api.includes("createConversationMessage"));
  assert.ok(api.includes("scheduleNotifyAssignedAgentOfCustomerChatMessage"));
  assert.ok(api.includes("scheduleAssignedAgentChatPush"));
  assert.ok(api.includes("markConversationReadByCustomer"));
  assert.ok(api.includes("frozenCustomerChatDisplayName"));
  assert.ok(api.includes("allowCustomerChatSend"));
  assert.ok(api.includes("requireFullCustomerUser"));
  assert.ok(!api.includes("routeExistingLead"));
  assert.ok(!api.includes("notifyNewLead"));
  assert.ok(!api.includes("notifyNewLeadCapturedToStaff"));
  assert.ok(!api.includes("resolveLeadDeskNotifiers"));
  assert.ok(!api.includes("getOrCreateLeadConversation") === false);
  assert.ok(sendRoute.includes("Failed to send"));
  assert.ok(!api.includes("markConversationReadByAgent"));

  const sendFn = api.slice(
    api.indexOf("export async function handleCustomerConversationSend"),
    api.indexOf("export async function handleCustomerConversationRead"),
  );
  const persistIdx = sendFn.indexOf("createConversationMessage");
  const notifyIdx = sendFn.indexOf("scheduleAssignedAgentChatPush");
  assert.ok(persistIdx > 0 && notifyIdx > persistIdx);

  const getFn = api.slice(
    api.indexOf("export async function handleCustomerConversationGet"),
    api.indexOf("export async function handleCustomerConversationSend"),
  );
  assert.ok(!getFn.includes("ensureCustomerChatLead"));
  assert.ok(!getFn.includes("markConversationReadByCustomer"));
  assert.ok(getFn.includes("resolveCustomerChatLead"));

  const loadPage = api.slice(
    api.indexOf("async function loadTranscriptPage"),
    api.indexOf("export async function handleCustomerConversationGet"),
  );
  assert.equal(loadPage.includes('channel: "CHAT"'), false);
  assert.ok(api.includes('presentSmsAutomationMessagePayload'));

  const readFn = api.slice(
    api.indexOf("export async function handleCustomerConversationRead"),
  );
  assert.ok(!readFn.includes("ensureCustomerChatLead"));
  assert.ok(readFn.includes("resolveCustomerChatLead"));
}

async function main() {
  clearCustomerChatSendRateLimitsForTests();
  testSourceSecurity();
  await testUnauthenticated();
  await testStaffRejected();
  await testAdminRejected();
  await testHostnameIsolation();
  await testOtherCustomerInaccessible();
  await testStrictBodyRejectsIdentity();
  await testGetNoLeadDoesNotCreate();
  await testGetExistingTranscriptAndNoMarkRead();
  await testGetIncludesSms();
  await testGetQueryLeadIdIgnored();
  await testSendCreatesViaEnsure();
  await testSendUnassignedRoutes();
  await testNoEligibleAgentNoRows();
  await testBlockedCannotSend();
  await testExactlyOneCustomerMessage();
  await testFrozenSenderIgnoresRequest();
  await testBodyLengthAndWhitespace();
  await testHtmlRemainsPlainText();
  await testRateLimit429();
  await testLastMessageAtAndAgentUnread();
  await testPostReadCustomerCursorOnly();
  await testPostReadNoLeadNoop();
  await testDeletedBodyNeverExposed();
  await testNoSideEffectsOnSend();
  await testEmailVerificationRequiredOnSend();
  clearCustomerChatSendRateLimitsForTests();
  console.log("customer-conversation-api selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
