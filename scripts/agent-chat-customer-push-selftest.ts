/**
 * Agent Chat → Customer `agent_chat` FCM (hermetic).
 * Mocks FCM. Does not send production push or create production rows.
 * Run: pnpm agent-chat-customer-push:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  PushDeliveryResult,
  PushPayload,
} from "../src/lib/notifications/push";
import {
  AGENT_CHAT_CUSTOMER_PUSH_BODY_FALLBACK,
  AGENT_CHAT_CUSTOMER_PUSH_COMPOSE_HREF,
  AGENT_CHAT_CUSTOMER_PUSH_PREVIEW_MAX,
  AGENT_CHAT_CUSTOMER_PUSH_TYPE,
  agentChatCustomerPushPreview,
  agentChatCustomerPushTitle,
  buildAgentChatCustomerPushPayload,
  formatAgentChatCustomerEnqueueLog,
  formatAgentChatCustomerFcmResultLog,
  isAgentChatCustomerPushEligible,
  notifyCustomerOfAgentChatMessage,
  scheduleNotifyCustomerOfAgentChatMessage,
  type AgentChatCustomerPushDeps,
  type AgentChatCustomerPushLead,
  type AgentChatCustomerPushMessage,
  type AgentChatCustomerPushRecipient,
  type NotifyCustomerOfAgentChatMessageInput,
} from "../src/lib/notifications/agent-chat-customer-push";
import {
  audienceForPushType,
  isPushTypeEnabled,
  shellForAudience,
} from "../src/lib/notifications/catalog";
import { CUSTOMER_CHAT_GENERIC_UNREAD_COPY } from "../src/lib/customer-chat/floating-chat";
import { CUSTOMER_CHAT_PAGE_HREF } from "../src/lib/customer-chat/query";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEAD_ID = "lead_chat_1";
const WS_A = "ws_tenant_a";
const WS_B = "ws_tenant_b";
const CUSTOMER_A = "user_customer_a";
const MSG_ID = "msg_agent_1";

function baseMessage(
  overrides: Partial<AgentChatCustomerPushMessage> = {},
): AgentChatCustomerPushMessage {
  return {
    id: MSG_ID,
    channel: "CHAT",
    kind: "TEXT",
    senderKind: "AGENT",
    senderName: "Ali Syed",
    body: "Listing update from your agent",
    ...overrides,
  };
}

function eligibleInput(
  overrides: Partial<NotifyCustomerOfAgentChatMessageInput> = {},
): NotifyCustomerOfAgentChatMessageInput {
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
  loadLeadCalls: number;
  scheduled: number;
};

function sentResult(userId: string): PushDeliveryResult {
  return {
    userId,
    status: "sent",
    deviceCount: 1,
    sentCount: 1,
    failedCount: 0,
    skippedCount: 0,
    unregisteredCount: 0,
  };
}

function captureHarness(options?: {
  lead?: AgentChatCustomerPushLead | null;
  customer?: AgentChatCustomerPushRecipient | null;
  deliverImpl?: (
    userIds: Array<string | null | undefined>,
    payload: PushPayload,
  ) => Promise<PushDeliveryResult[]>;
}): Capture & AgentChatCustomerPushDeps {
  const cap: Capture = {
    pushes: [],
    loadLeadCalls: 0,
    scheduled: 0,
  };
  const lead =
    options && "lead" in options
      ? options.lead
      : {
          id: LEAD_ID,
          workspaceId: WS_A,
          customerId: CUSTOMER_A,
        };
  const customer =
    options && "customer" in options
      ? options.customer
      : {
          id: CUSTOMER_A,
          disabledAt: null,
          pushNotificationPrefs: null,
        };
  const deps: Capture & AgentChatCustomerPushDeps = Object.assign(cap, {
    loadLead: async () => {
      cap.loadLeadCalls += 1;
      return lead ?? null;
    },
    loadCustomer: async (userId: string) => {
      if (!customer) return null;
      return { ...customer, id: userId };
    },
    deliverPushToUsersNow: async (userIds, payload) => {
      if (options?.deliverImpl) {
        return options.deliverImpl(userIds, payload);
      }
      const id = userIds.find((value): value is string => Boolean(value));
      if (!id) return [];
      cap.pushes.push({ userId: id, payload });
      return [sentResult(id)];
    },
    scheduleWorkerSideEffect: (work) => {
      cap.scheduled += 1;
      void work;
    },
  });
  return deps;
}

function testPreviewAndPayload() {
  assert.equal(AGENT_CHAT_CUSTOMER_PUSH_TYPE, "agent_chat");
  assert.equal(
    agentChatCustomerPushPreview("Listing update from your agent"),
    "Listing update from your agent",
  );
  assert.equal(agentChatCustomerPushPreview("  hi\n\tthere  "), "hi there");
  assert.equal(agentChatCustomerPushPreview(""), AGENT_CHAT_CUSTOMER_PUSH_BODY_FALLBACK);
  assert.equal(agentChatCustomerPushPreview(null), AGENT_CHAT_CUSTOMER_PUSH_BODY_FALLBACK);
  const long = "x".repeat(AGENT_CHAT_CUSTOMER_PUSH_PREVIEW_MAX + 8);
  assert.equal(
    agentChatCustomerPushPreview(long).length <= AGENT_CHAT_CUSTOMER_PUSH_PREVIEW_MAX,
    true,
  );
  assert.equal(
    agentChatCustomerPushTitle("Ali Syed"),
    "Ali Syed sent you a message",
  );
  assert.equal(
    agentChatCustomerPushTitle(null),
    CUSTOMER_CHAT_GENERIC_UNREAD_COPY,
  );
  assert.equal(
    agentChatCustomerPushPreview("Voice note"),
    "Sent you a voice message",
  );
  assert.equal(
    agentChatCustomerPushPreview("An agent shared a property with you."),
    "Shared a property with you",
  );
  const payload = buildAgentChatCustomerPushPayload({
    body: "Hello from Ali",
    senderName: "Ali Syed",
  });
  assert.equal(payload.type, "agent_chat");
  assert.equal(payload.title, "Ali Syed sent you a message");
  assert.equal(payload.body, "Hello from Ali");
  assert.equal(payload.href, AGENT_CHAT_CUSTOMER_PUSH_COMPOSE_HREF);
  assert.equal(payload.href, `${CUSTOMER_CHAT_PAGE_HREF}?compose=1`);
  assert.deepEqual(Object.keys(payload).sort(), ["body", "href", "title", "type"]);
}

function testEligibilityAndReplay() {
  assert.equal(isAgentChatCustomerPushEligible(eligibleInput()), true);
  assert.equal(
    isAgentChatCustomerPushEligible(eligibleInput({ created: false })),
    false,
  );
  assert.equal(
    isAgentChatCustomerPushEligible(
      eligibleInput({ message: baseMessage({ channel: "SMS" }) }),
    ),
    false,
  );
  assert.equal(
    isAgentChatCustomerPushEligible(
      eligibleInput({ message: baseMessage({ kind: "SYSTEM_CARD" }) }),
    ),
    false,
  );
  assert.equal(
    isAgentChatCustomerPushEligible(
      eligibleInput({ message: baseMessage({ senderKind: "CUSTOMER" }) }),
    ),
    false,
  );
  assert.equal(
    isAgentChatCustomerPushEligible(
      eligibleInput({ message: baseMessage({ senderKind: "SYSTEM" }) }),
    ),
    false,
  );
}

async function testHappyPathOnce() {
  const deps = captureHarness();
  await notifyCustomerOfAgentChatMessage(eligibleInput(), deps);
  assert.equal(deps.pushes.length, 1);
  assert.equal(deps.scheduled, 0);
  assert.equal(deps.pushes[0]?.userId, CUSTOMER_A);
  assert.equal(deps.pushes[0]?.payload.type, "agent_chat");
  assert.equal(deps.pushes[0]?.payload.href, "/account/chat?compose=1");
  assert.equal(
    deps.pushes[0]?.payload.title,
    "Ali Syed sent you a message",
  );
  assert.equal(deps.loadLeadCalls, 1);
}

async function testReplaySkipsWithoutLoad() {
  const deps = captureHarness();
  await notifyCustomerOfAgentChatMessage(
    eligibleInput({ created: false }),
    deps,
  );
  assert.equal(deps.loadLeadCalls, 0);
  assert.equal(deps.pushes.length, 0);
}

async function testSmsNeverPushes() {
  const deps = captureHarness();
  await notifyCustomerOfAgentChatMessage(
    eligibleInput({ message: baseMessage({ channel: "SMS" }) }),
    deps,
  );
  assert.equal(deps.loadLeadCalls, 0);
  assert.equal(deps.pushes.length, 0);
}

async function testWorkspaceMismatchAndMissingCustomer() {
  const mismatch = captureHarness({
    lead: { id: LEAD_ID, workspaceId: WS_B, customerId: CUSTOMER_A },
  });
  await notifyCustomerOfAgentChatMessage(eligibleInput(), mismatch);
  assert.equal(mismatch.pushes.length, 0);

  const missing = captureHarness({
    lead: { id: LEAD_ID, workspaceId: WS_A, customerId: null },
  });
  await notifyCustomerOfAgentChatMessage(eligibleInput(), missing);
  assert.equal(missing.pushes.length, 0);
}

async function testPrefOffAndDeliverFailureDoNotThrow() {
  const off = captureHarness({
    customer: {
      id: CUSTOMER_A,
      disabledAt: null,
      pushNotificationPrefs: { agent_chat: false },
    },
  });
  await notifyCustomerOfAgentChatMessage(eligibleInput(), off);
  assert.equal(off.pushes.length, 0);

  const exploding = captureHarness({
    deliverImpl: async () => {
      throw new Error("fcm down");
    },
  });
  await notifyCustomerOfAgentChatMessage(eligibleInput(), exploding);
  assert.equal(exploding.pushes.length, 0);
}

async function testScheduleReplayDoesNotEnqueue() {
  const deps = captureHarness();
  scheduleNotifyCustomerOfAgentChatMessage(
    eligibleInput({ created: false }),
    deps,
  );
  assert.equal(deps.scheduled, 0);
  scheduleNotifyCustomerOfAgentChatMessage(eligibleInput(), deps);
  assert.equal(deps.scheduled, 1);
}

function testLogsAndCatalog() {
  assert.equal(
    formatAgentChatCustomerEnqueueLog({
      messageId: MSG_ID,
      leadId: LEAD_ID,
      recipientUserId: CUSTOMER_A,
    }),
    `[customer-notify] agent_chat enqueue messageId=${MSG_ID} leadIdPrefix=${LEAD_ID.slice(0, 8)} recipientPrefix=${CUSTOMER_A.slice(0, 8)}`,
  );
  assert.ok(
    formatAgentChatCustomerFcmResultLog(CUSTOMER_A, sentResult(CUSTOMER_A)).includes(
      "type=agent_chat",
    ),
  );
  assert.ok(
    formatAgentChatCustomerFcmResultLog(CUSTOMER_A, sentResult(CUSTOMER_A)).includes(
      "shell=houzzat",
    ),
  );
  assert.equal(isPushTypeEnabled(null, "agent_chat"), true);
  assert.equal(isPushTypeEnabled({ agent_chat: false }, "agent_chat"), false);
  assert.equal(audienceForPushType("agent_chat"), "consumer");
  assert.equal(shellForAudience("consumer"), "houzzat");
  assert.equal(audienceForPushType("chat_message"), "staff");
}

function testSourceContract() {
  const helper = read("src/lib/notifications/agent-chat-customer-push.ts");
  const send = read("src/lib/conversations/agent-conversation-send.ts");
  const sms = read("src/lib/conversations/agent-conversation-sms.ts");
  const inbound = read("src/lib/sms/inbound.ts");
  const catalog = read("src/lib/notifications/catalog.ts");

  assert.ok(helper.includes("deliverPushToUsersNow"));
  assert.ok(helper.includes("CUSTOMER_CHAT_PAGE_HREF"));
  assert.ok(helper.includes('type: AGENT_CHAT_CUSTOMER_PUSH_TYPE'));
  assert.ok(!helper.includes("chat_message"));
  assert.ok(!helper.includes("authorizeStaffRecipientForLead"));
  assert.ok(!helper.includes("chatsPageHref"));

  assert.ok(send.includes("scheduleNotifyCustomerOfAgentChatMessage"));
  assert.ok(send.includes("created: created.created"));
  assert.ok(!send.includes("customer-chat-agent-push"));
  assert.equal(sms.includes("scheduleNotifyCustomerOfAgentChatMessage"), false);
  assert.equal(inbound.includes("scheduleNotifyCustomerOfAgentChatMessage"), false);
  assert.ok(catalog.includes('"agent_chat"'));
  assert.ok(catalog.includes("Chat messages"));
}

async function main() {
  testPreviewAndPayload();
  testEligibilityAndReplay();
  await testHappyPathOnce();
  await testReplaySkipsWithoutLoad();
  await testSmsNeverPushes();
  await testWorkspaceMismatchAndMissingCustomer();
  await testPrefOffAndDeliverFailureDoNotThrow();
  await testScheduleReplayDoesNotEnqueue();
  testLogsAndCatalog();
  testSourceContract();
  console.log("agent-chat-customer-push-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
