/**
 * Customer Chat → assigned Agent `chat_message` FCM (hermetic).
 * Mocks FCM. Does not send production push or create production rows.
 * Run: pnpm customer-chat-agent-push:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PushPayload } from "../src/lib/notifications/push";
import {
  buildCustomerChatAgentPushPayload,
  customerChatPushPreview,
  customerChatPushTitle,
  CUSTOMER_CHAT_PUSH_BODY_FALLBACK,
  CUSTOMER_CHAT_PUSH_PREVIEW_MAX,
  CUSTOMER_CHAT_PUSH_TYPE,
  isCustomerChatAgentPushEligible,
  notifyAssignedAgentOfCustomerChatMessage,
  scheduleNotifyAssignedAgentOfCustomerChatMessage,
  type CustomerChatAgentPushAssignee,
  type CustomerChatAgentPushDeps,
  type CustomerChatAgentPushLead,
  type CustomerChatAgentPushMessage,
  type NotifyAssignedAgentOfCustomerChatMessageInput,
} from "../src/lib/notifications/customer-chat-agent-push";
import {
  audienceForPushType,
  isPushTypeEnabled,
  shellForAudience,
} from "../src/lib/notifications/catalog";
import { STAFF_CATEGORY_CATALOG } from "../src/lib/notifications/staff-categories";
import { chatsPageHref } from "../src/lib/agent/chats-inbox-query";
import {
  handleCustomerConversationSend,
  type CustomerConversationApiDeps,
  type CustomerConversationSendPayload,
} from "../src/lib/conversations/customer-conversation";
import { clearCustomerChatSendRateLimitsForTests } from "../src/lib/conversations/customer-chat-rate-limit";
import type { CustomerUser } from "../src/lib/account";
import type { ConversationStatus, Role } from "@prisma/client";
import type { CustomerChatLeadSuccess } from "../src/lib/conversations/customer-chat-lead";
import type { LeadConversationRecord } from "../src/lib/conversations/lead-conversation";
import type { ConversationMessageRecord } from "../src/lib/conversations/create-conversation-message";
import type { ResolvedWorkspaceHost } from "../src/lib/tenancy/host-resolution-types";
import type { CustomerConversationDb } from "../src/lib/conversations/customer-conversation";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEAD_ID = "lead_chat_1";
const WS_A = "ws_tenant_a";
const WS_B = "ws_tenant_b";
const AGENT_A = "user_agent_a";
const AGENT_B = "user_agent_b";
const MSG_ID = "msg_customer_1";

function baseMessage(
  overrides: Partial<CustomerChatAgentPushMessage> = {},
): CustomerChatAgentPushMessage {
  return {
    id: MSG_ID,
    channel: "CHAT",
    kind: "TEXT",
    senderKind: "CUSTOMER",
    senderName: "Omer Ali",
    body: "Production customer chat test",
    ...overrides,
  };
}

function eligibleInput(
  overrides: Partial<NotifyAssignedAgentOfCustomerChatMessageInput> = {},
): NotifyAssignedAgentOfCustomerChatMessageInput {
  return {
    leadId: LEAD_ID,
    trustedWorkspaceId: WS_A,
    created: true,
    message: baseMessage(),
    ...overrides,
  };
}

type Capture = {
  pushes: Array<{ userId: string; payload: PushPayload }>;
  authorizes: Array<{ userId: string; leadId: string; event?: string }>;
  loadLeadCalls: number;
  scheduled: number;
};

function captureHarness(options?: {
  lead?: CustomerChatAgentPushLead | null;
  assignee?: CustomerChatAgentPushAssignee | null;
  authorized?: boolean;
  sendImpl?: (userId: string, payload: PushPayload) => void;
}): Capture & CustomerChatAgentPushDeps {
  const cap: Capture = {
    pushes: [],
    authorizes: [],
    loadLeadCalls: 0,
    scheduled: 0,
  };
  const lead =
    options && "lead" in options
      ? options.lead
      : {
          id: LEAD_ID,
          workspaceId: WS_A,
          assignedAgentId: AGENT_A,
        };
  const assignee =
    options && "assignee" in options
      ? options.assignee
      : {
          id: AGENT_A,
          disabledAt: null,
          pushNotificationPrefs: null,
        };
  const deps: Capture & CustomerChatAgentPushDeps = Object.assign(cap, {
    loadLead: async () => {
      cap.loadLeadCalls += 1;
      return lead ?? null;
    },
    loadAssignee: async (userId: string) => {
      if (!assignee) return null;
      return { ...assignee, id: userId };
    },
    authorizeStaffRecipientForLead: async (input) => {
      cap.authorizes.push(input);
      return options?.authorized !== false;
    },
    sendPushToUser: (userId, payload) => {
      if (!userId) return;
      if (options?.sendImpl) {
        options.sendImpl(userId, payload);
        return;
      }
      cap.pushes.push({ userId, payload });
    },
    scheduleWorkerSideEffect: (work) => {
      cap.scheduled += 1;
      void work;
    },
  });
  return deps;
}

async function flush(deps: CustomerChatAgentPushDeps) {
  await Promise.resolve();
  await Promise.resolve();
}

function testPreviewAndTitle() {
  assert.equal(
    customerChatPushTitle("Omer Ali"),
    "New message from Omer Ali",
  );
  assert.equal(
    customerChatPushTitle("  Frozen   Name  "),
    "New message from Frozen Name",
  );
  assert.equal(customerChatPushTitle("   "), "New message from a customer");
  assert.equal(
    customerChatPushPreview("Production customer chat test"),
    "Production customer chat test",
  );
  assert.equal(customerChatPushPreview("  hi\n\tthere  "), "hi there");
  assert.equal(customerChatPushPreview(""), CUSTOMER_CHAT_PUSH_BODY_FALLBACK);
  assert.equal(customerChatPushPreview(null), CUSTOMER_CHAT_PUSH_BODY_FALLBACK);
  assert.equal(
    customerChatPushPreview("   \n"),
    CUSTOMER_CHAT_PUSH_BODY_FALLBACK,
  );
  const long = "x".repeat(CUSTOMER_CHAT_PUSH_PREVIEW_MAX + 40);
  const preview = customerChatPushPreview(long);
  assert.equal(preview.length, CUSTOMER_CHAT_PUSH_PREVIEW_MAX);
  assert.equal(preview, "x".repeat(CUSTOMER_CHAT_PUSH_PREVIEW_MAX));
  assert.ok(!preview.includes("<"));
  const html = customerChatPushPreview("<b>hello</b>");
  assert.equal(html, "<b>hello</b>");
}

function testPayloadHref() {
  const payload = buildCustomerChatAgentPushPayload({
    leadId: LEAD_ID,
    senderName: "Omer Ali",
    body: "Hello",
  });
  assert.equal(payload.type, "chat_message");
  assert.equal(payload.title, "New message from Omer Ali");
  assert.equal(payload.body, "Hello");
  assert.equal(payload.href, chatsPageHref(LEAD_ID));
  assert.equal(payload.href, `/agent/chats?lead=${LEAD_ID}`);
  assert.equal("workspaceId" in payload, false);
  const keys = Object.keys(payload).sort();
  assert.deepEqual(keys, ["body", "href", "title", "type"]);
}

function testEligibility() {
  assert.equal(isCustomerChatAgentPushEligible(eligibleInput()), true);
  assert.equal(
    isCustomerChatAgentPushEligible(eligibleInput({ created: false })),
    false,
  );
  assert.equal(
    isCustomerChatAgentPushEligible(
      eligibleInput({ message: baseMessage({ senderKind: "AGENT" }) }),
    ),
    false,
  );
  assert.equal(
    isCustomerChatAgentPushEligible(
      eligibleInput({ message: baseMessage({ senderKind: "ADMIN" }) }),
    ),
    false,
  );
  assert.equal(
    isCustomerChatAgentPushEligible(
      eligibleInput({ message: baseMessage({ senderKind: "SYSTEM" }) }),
    ),
    false,
  );
  assert.equal(
    isCustomerChatAgentPushEligible(
      eligibleInput({ message: baseMessage({ channel: "SMS" }) }),
    ),
    false,
  );
}

async function testHappyPathOnce() {
  const deps = captureHarness();
  await notifyAssignedAgentOfCustomerChatMessage(eligibleInput(), deps);
  assert.equal(deps.pushes.length, 1);
  assert.equal(deps.pushes[0]?.userId, AGENT_A);
  assert.equal(deps.pushes[0]?.payload.type, "chat_message");
  assert.equal(
    deps.pushes[0]?.payload.title,
    "New message from Omer Ali",
  );
  assert.equal(
    deps.pushes[0]?.payload.body,
    "Production customer chat test",
  );
  assert.equal(deps.pushes[0]?.payload.href, `/agent/chats?lead=${LEAD_ID}`);
  assert.equal(deps.authorizes.length, 1);
  assert.equal(deps.authorizes[0]?.userId, AGENT_A);
  assert.equal(deps.authorizes[0]?.event, "chat_message");
  assert.equal(deps.loadLeadCalls, 1);
}

async function testWrongSendersNeverNotify() {
  for (const senderKind of ["AGENT", "ADMIN", "SYSTEM"] as const) {
    const deps = captureHarness();
    await notifyAssignedAgentOfCustomerChatMessage(
      eligibleInput({ message: baseMessage({ senderKind }) }),
      deps,
    );
    assert.equal(deps.pushes.length, 0, senderKind);
    assert.equal(deps.loadLeadCalls, 0, senderKind);
  }
  const sms = captureHarness();
  await notifyAssignedAgentOfCustomerChatMessage(
    eligibleInput({ message: baseMessage({ channel: "SMS" }) }),
    sms,
  );
  assert.equal(sms.pushes.length, 0);
  assert.equal(sms.loadLeadCalls, 0);
}

async function testReplaySkips() {
  const deps = captureHarness();
  await notifyAssignedAgentOfCustomerChatMessage(
    eligibleInput({ created: false }),
    deps,
  );
  assert.equal(deps.pushes.length, 0);
  assert.equal(deps.loadLeadCalls, 0);
  scheduleNotifyAssignedAgentOfCustomerChatMessage(
    eligibleInput({ created: false }),
    deps,
  );
  assert.equal(deps.scheduled, 0);
  assert.equal(deps.pushes.length, 0);
}

async function testReassignmentRace() {
  const deps = captureHarness({
    lead: {
      id: LEAD_ID,
      workspaceId: WS_A,
      assignedAgentId: AGENT_B,
    },
  });
  await notifyAssignedAgentOfCustomerChatMessage(eligibleInput(), deps);
  assert.equal(deps.pushes.length, 1);
  assert.equal(deps.pushes[0]?.userId, AGENT_B);
  assert.equal(deps.authorizes[0]?.userId, AGENT_B);
  assert.ok(deps.pushes.every((p) => p.userId !== AGENT_A));
}

async function testForeignWorkspaceNoPush() {
  const mismatch = captureHarness({
    lead: {
      id: LEAD_ID,
      workspaceId: WS_B,
      assignedAgentId: AGENT_A,
    },
  });
  await notifyAssignedAgentOfCustomerChatMessage(eligibleInput(), mismatch);
  assert.equal(mismatch.pushes.length, 0);
  assert.equal(mismatch.authorizes.length, 0);

  const unauthorized = captureHarness({ authorized: false });
  await notifyAssignedAgentOfCustomerChatMessage(eligibleInput(), unauthorized);
  assert.equal(unauthorized.pushes.length, 0);
  assert.equal(unauthorized.authorizes.length, 1);
}

async function testDisabledAndUnassigned() {
  const disabled = captureHarness({
    assignee: {
      id: AGENT_A,
      disabledAt: new Date("2026-01-01T00:00:00.000Z"),
      pushNotificationPrefs: null,
    },
  });
  await notifyAssignedAgentOfCustomerChatMessage(eligibleInput(), disabled);
  assert.equal(disabled.pushes.length, 0);

  const unassigned = captureHarness({
    lead: { id: LEAD_ID, workspaceId: WS_A, assignedAgentId: null },
  });
  await notifyAssignedAgentOfCustomerChatMessage(eligibleInput(), unassigned);
  assert.equal(unassigned.pushes.length, 0);
  assert.equal(unassigned.authorizes.length, 0);
}

async function testPreferenceOff() {
  const deps = captureHarness({
    assignee: {
      id: AGENT_A,
      disabledAt: null,
      pushNotificationPrefs: { chat_message: false },
    },
  });
  await notifyAssignedAgentOfCustomerChatMessage(eligibleInput(), deps);
  assert.equal(deps.pushes.length, 0);
}

async function testFcmFailureAndNoDeviceStillOk() {
  const throwing = captureHarness({
    sendImpl: () => {
      throw new Error("FCM down");
    },
  });
  await notifyAssignedAgentOfCustomerChatMessage(eligibleInput(), throwing);
  assert.equal(throwing.pushes.length, 0);

  const noop = captureHarness({
    sendImpl: () => undefined,
  });
  await notifyAssignedAgentOfCustomerChatMessage(eligibleInput(), noop);
  assert.equal(noop.pushes.length, 0);
}

async function testNoDeskFanout() {
  const deps = captureHarness();
  await notifyAssignedAgentOfCustomerChatMessage(eligibleInput(), deps);
  assert.equal(deps.pushes.length, 1);
  assert.equal(deps.pushes[0]?.userId, AGENT_A);
}

async function testScheduleOnce() {
  const deps = captureHarness();
  scheduleNotifyAssignedAgentOfCustomerChatMessage(eligibleInput(), deps);
  assert.equal(deps.scheduled, 1);
  await flush(deps);
  assert.equal(deps.pushes.length, 1);
}

function testPrefsDefaultOnNoUiRow() {
  assert.equal(isPushTypeEnabled(null, "chat_message"), true);
  assert.equal(isPushTypeEnabled({}, "chat_message"), true);
  assert.equal(isPushTypeEnabled({ chat_message: false }, "chat_message"), false);
  assert.equal(audienceForPushType("chat_message"), "staff");
  assert.equal(shellForAudience("staff"), "houzzatpro");
  assert.ok(
    !STAFF_CATEGORY_CATALOG.some((row) => row.pushTypes.includes("chat_message")),
    "V1 must not add a Messages preference UI category",
  );
}

function testSourceContracts() {
  const helper = read("src/lib/notifications/customer-chat-agent-push.ts");
  const api = read("src/lib/conversations/customer-conversation.ts");
  const writer = read("src/lib/conversations/create-conversation-message.ts");
  const agentSend = read("src/lib/conversations/agent-conversation-send.ts");
  const agentRoute = read(
    "src/app/api/agent/leads/[id]/conversation/messages/route.ts",
  );
  const customerSendRoute = read(
    "src/app/api/account/conversation/messages/route.ts",
  );
  const catalog = read("src/lib/notifications/catalog.ts");
  const categories = read("src/lib/notifications/staff-categories.ts");
  const push = read("src/lib/notifications/push.ts");

  assert.ok(helper.includes("notifyAssignedAgentOfCustomerChatMessage"));
  assert.ok(helper.includes("authorizeStaffRecipientForLead"));
  assert.ok(helper.includes("chatsPageHref"));
  assert.ok(helper.includes("sendPushToUser"));
  assert.ok(helper.includes("scheduleWorkerSideEffect"));
  assert.ok(!helper.includes("notifyNewLeadCapturedToStaff"));
  assert.ok(!helper.includes("resolveLeadDeskNotifiers"));
  assert.ok(!helper.includes("deskUserIds"));
  assert.ok(!helper.includes("sendPushToUsers"));
  assert.ok(!helper.includes("sendNotification"));
  assert.ok(!helper.includes("CustomerAlert"));
  assert.ok(!helper.includes("scheduleNewLeadStaffEmail"));
  assert.ok(!helper.includes("leadActivity"));
  assert.ok(!helper.includes("agentTask"));
  assert.ok(!helper.includes("Resend"));
  assert.ok(!helper.includes("twilio"));
  assert.ok(helper.includes("trustedWorkspaceId"));

  assert.ok(api.includes("scheduleNotifyAssignedAgentOfCustomerChatMessage"));
  const sendFn = api.slice(
    api.indexOf("export async function handleCustomerConversationSend"),
    api.indexOf("export async function handleCustomerConversationRead"),
  );
  const persistIdx = sendFn.indexOf("createConversationMessage");
  const notifyIdx = sendFn.indexOf("scheduleAssignedAgentChatPush");
  const returnIdx = sendFn.lastIndexOf("return jsonResult(200");
  assert.ok(persistIdx > 0 && notifyIdx > persistIdx && returnIdx > notifyIdx);
  assert.ok(!sendFn.includes("notifyNewLeadCapturedToStaff"));
  assert.ok(!sendFn.includes("markConversationReadByAgent"));
  assert.ok(!sendFn.includes("markConversationReadByCustomer"));

  assert.ok(!writer.includes("notifyAssignedAgent"));
  assert.ok(!writer.includes("sendPushToUser"));
  assert.ok(writer.includes("Do not write"));
  assert.ok(writer.includes("LeadActivity or send notifications"));

  assert.ok(!agentSend.includes("customer-chat-agent-push"));
  assert.ok(!agentSend.includes("chat_message"));
  assert.ok(!agentSend.includes("@/lib/notifications"));
  assert.ok(!agentRoute.includes("customer-chat-agent-push"));
  assert.ok(customerSendRoute.includes("handleCustomerConversationSend"));
  assert.ok(!customerSendRoute.includes("sendPushToUser"));

  assert.ok(catalog.includes('"chat_message"'));
  assert.ok(!categories.includes('pushTypes: ["chat_message"]'));
  assert.ok(push.includes("type: payload.type"));
  assert.ok(push.includes("href: payload.href ?? \"\""));
}

const T0 = new Date("2026-09-17T18:00:00.000Z");
const CUSTOMER_A = "user_customer_a";
const HOST_A = "tenant-a.houzzatpro.com";
const AGENT_SEND = "user_agent_a";

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

class FakeDb implements CustomerConversationDb {
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
  messageCreates = 0;
  conversationCreates = 0;
  leadActivityCreates = 0;
  customerCursorWrites = 0;
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
      assignedAgentId: input.assignedAgentId ?? AGENT_SEND,
      customerId: input.customerId ?? CUSTOMER_A,
    };
    this.leads.set(this.leadKey(row.workspaceId, row.id), row);
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
          this.conversations.get(this.leadKey(byLead.workspaceId, byLead.leadId)) ??
          null
        );
      }
      return null;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.conversationCreates += 1;
      const row: LeadConversationRecord = {
        id: `conv_${this.nextConversationId++}`,
        workspaceId: String(data.workspaceId),
        leadId: String(data.leadId),
        status: "OPEN" as ConversationStatus,
        createdAt: T0,
        updatedAt: T0,
        lastMessageAt: null,
        customerLastReadAt: null,
        agentLastReadAt: null,
        agentLastReadByUserId: null,
      };
      this.conversations.set(this.leadKey(row.workspaceId, row.leadId), row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const pair = where.workspaceId_id as { workspaceId: string; id: string };
      const row = [...this.conversations.values()].find(
        (c) => c.workspaceId === pair.workspaceId && c.id === pair.id,
      );
      if (!row) throw new Error("missing conversation");
      if (data.lastMessageAt instanceof Date) {
        row.lastMessageAt = data.lastMessageAt;
      }
      return row;
    },
  };

  message = {
    findUnique: async () => null,
    findMany: async () => [],
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.messageCreates += 1;
      const row: StoredMessage = {
        id: `msg_${this.nextMessageId++}`,
        workspaceId: String(data.workspaceId),
        conversationId: String(data.conversationId),
        leadId: String(data.leadId),
        channel: (data.channel as StoredMessage["channel"]) ?? "CHAT",
        kind: (data.kind as StoredMessage["kind"]) ?? "TEXT",
        senderKind: (data.senderKind as StoredMessage["senderKind"]) ?? "CUSTOMER",
        senderUserId: (data.senderUserId as string | null) ?? null,
        senderName: String(data.senderName),
        createdByUserId: (data.createdByUserId as string | null) ?? null,
        body: (data.body as string | null) ?? null,
        createdAt: data.createdAt instanceof Date ? data.createdAt : new Date(),
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

  async $transaction<T>(
    fn: (tx: {
      message: FakeDb["message"];
      conversation: FakeDb["conversation"];
    }) => Promise<T>,
  ): Promise<T> {
    return fn({ message: this.message, conversation: this.conversation });
  }
}

class SendWorld {
  db = new FakeDb();
  user: CustomerUser | null = customerUser();
  leads: Array<{
    id: string;
    workspaceId: string;
    customerId: string;
    assignedAgentId: string | null;
  }> = [];
  eligibleByWorkspace = new Map<string, string | null>([[WS_A, AGENT_SEND]]);
  chatPushes: NotifyAssignedAgentOfCustomerChatMessageInput[] = [];
  pushThrows = false;
  nextLead = 1;

  seedOwnLead(
    input: {
      id?: string;
      assignedAgentId?: string | null;
    } = {},
  ) {
    const lead = {
      id: input.id ?? `lead_${this.nextLead++}`,
      workspaceId: WS_A,
      customerId: CUSTOMER_A,
      assignedAgentId:
        input.assignedAgentId === undefined ? AGENT_SEND : input.assignedAgentId,
    };
    this.leads.push(lead);
    this.db.seedLead(lead);
    return lead;
  }

  deps(): CustomerConversationApiDeps {
    const world = this;
    return {
      db: this.db,
      requireSendAccess: async () => {
        if (!this.user) {
          return {
            ok: false,
            status: 401,
            body: { error: "Sign in required.", requiresAuth: true },
          };
        }
        return { ok: true, user: this.user };
      },
      resolveWorkspaceFromRequest: async () =>
        ({
          ok: true,
          mode: "workspace",
          workspaceId: WS_A,
          workspaceSlug: "tenant-a",
          normalizedHostname: HOST_A,
          verifiedHostname: true,
        }) satisfies Extract<ResolvedWorkspaceHost, { ok: true }>,
      resolveCustomerChatLead: async () => ({
        ok: false,
        reason: "LEAD_NOT_FOUND",
      }),
      ensureCustomerChatLead: async () => {
        if (!this.user) {
          return { ok: false, reason: "UNAUTHENTICATED" };
        }
        let lead = this.leads[0];
        if (!lead) {
          const assignee = this.eligibleByWorkspace.get(WS_A) ?? null;
          lead = {
            id: `lead_captured_${this.nextLead++}`,
            workspaceId: WS_A,
            customerId: this.user.id,
            assignedAgentId: assignee,
          };
          this.leads.push(lead);
          this.db.seedLead(lead);
        } else if (!lead.assignedAgentId) {
          const assignee = this.eligibleByWorkspace.get(WS_A) ?? null;
          if (!assignee) {
            return {
              ok: false,
              reason: "NO_ELIGIBLE_AGENT",
              workspaceId: WS_A,
              customerUserId: this.user.id,
              leadId: lead.id,
              assignmentState: "NO_ELIGIBLE_AGENT",
            };
          }
          lead.assignedAgentId = assignee;
        }
        return {
          ok: true,
          workspaceId: WS_A,
          workspaceSlug: "tenant-a",
          customerUserId: this.user.id,
          customerDisplayName: this.user.name ?? this.user.email,
          customerEmail: this.user.email,
          leadId: lead.id,
          assignedAgentId: lead.assignedAgentId,
          assignmentState: lead.assignedAgentId ? "ASSIGNED" : "UNASSIGNED",
          assignedAgentEligible: Boolean(lead.assignedAgentId),
          leadExisted: true,
          leadCreated: false,
          canSend: Boolean(lead.assignedAgentId),
        } satisfies CustomerChatLeadSuccess;
      },
      scheduleAssignedAgentChatPush: (input) => {
        if (world.pushThrows) throw new Error("scheduler exploded");
        world.chatPushes.push(input);
      },
    };
  }
}

async function send(world: SendWorld, body: unknown) {
  return handleCustomerConversationSend(
    new Request(`https://${HOST_A}/api/account/conversation/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", host: HOST_A },
      body: JSON.stringify(body),
    }),
    world.deps(),
  );
}

async function testCustomerSendSchedulesOnce() {
  clearCustomerChatSendRateLimitsForTests();
  const world = new SendWorld();
  world.seedOwnLead({ id: LEAD_ID });
  const result = await send(world, { body: "Hello from customer" });
  assert.equal(result.status, 200);
  const payload = result.body as CustomerConversationSendPayload;
  assert.equal(world.db.messageCreates, 1);
  assert.equal(world.chatPushes.length, 1);
  assert.equal(world.chatPushes[0]?.created, true);
  assert.equal(world.chatPushes[0]?.leadId, LEAD_ID);
  assert.equal(world.chatPushes[0]?.trustedWorkspaceId, WS_A);
  assert.equal(world.chatPushes[0]?.message.senderKind, "CUSTOMER");
  assert.equal(world.chatPushes[0]?.message.channel, "CHAT");
  assert.equal(world.chatPushes[0]?.message.kind, "TEXT");
  assert.equal(world.chatPushes[0]?.message.body, "Hello from customer");
  assert.equal(world.chatPushes[0]?.message.senderName, "Customer A");
  assert.equal(world.chatPushes[0]?.message.id, payload.message.id);
  assert.equal(world.db.leadActivityCreates, 0);
}

async function testUnassignedFailsBeforeMessageAndNotify() {
  clearCustomerChatSendRateLimitsForTests();
  const world = new SendWorld();
  world.seedOwnLead({ id: "lead_pond", assignedAgentId: null });
  world.eligibleByWorkspace.set(WS_A, null);
  const result = await send(world, { body: "Anyone there?" });
  assert.equal(result.status, 503);
  assert.equal(world.db.messageCreates, 0);
  assert.equal(world.chatPushes.length, 0);
}

async function testPushFailureDoesNotFailSend() {
  clearCustomerChatSendRateLimitsForTests();
  const world = new SendWorld();
  world.seedOwnLead({ id: LEAD_ID });
  world.pushThrows = true;
  const result = await send(world, { body: "Still persist" });
  assert.equal(result.status, 200);
  assert.equal(world.db.messageCreates, 1);
  const payload = result.body as CustomerConversationSendPayload;
  assert.equal(payload.message.body, "Still persist");
}

async function testNoEligibleDoesNotNotify() {
  clearCustomerChatSendRateLimitsForTests();
  const world = new SendWorld();
  world.user = customerUser({ role: "AGENT", id: "agent_1", email: "a@t.local" });
  const result = await send(world, { body: "hi" });
  assert.equal(result.status, 404);
  assert.equal(world.chatPushes.length, 0);
  assert.equal(world.db.messageCreates, 0);
}

async function main() {
  testPreviewAndTitle();
  testPayloadHref();
  testEligibility();
  testPrefsDefaultOnNoUiRow();
  testSourceContracts();
  await testHappyPathOnce();
  await testWrongSendersNeverNotify();
  await testReplaySkips();
  await testReassignmentRace();
  await testForeignWorkspaceNoPush();
  await testDisabledAndUnassigned();
  await testPreferenceOff();
  await testFcmFailureAndNoDeviceStillOk();
  await testNoDeskFanout();
  await testScheduleOnce();
  await testCustomerSendSchedulesOnce();
  await testUnassignedFailsBeforeMessageAndNotify();
  await testPushFailureDoesNotFailSend();
  await testNoEligibleDoesNotNotify();
  clearCustomerChatSendRateLimitsForTests();
  console.log("customer-chat-agent-push selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
