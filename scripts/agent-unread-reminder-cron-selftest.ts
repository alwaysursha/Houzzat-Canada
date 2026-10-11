/**
 * Chat V1 Milestone 4S — chat unread-reminder cron (no DB / no live push).
 * Run: pnpm agent-unread-reminder-cron:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  beginChatUnreadReminderCronRun,
  endChatUnreadReminderCronRun,
  isChatUnreadReminderCronRunInFlight,
  summarizeChatUnreadReminderCronError,
} from "../src/lib/conversations/agent-unread-reminder-cron-lock";
import {
  authorizeChatUnreadReminderCronRequest,
  CHAT_UNREAD_REMINDER_CRON,
  CHAT_UNREAD_REMINDER_CRON_BATCH,
  CHAT_UNREAD_REMINDER_CRON_PER_WORKSPACE,
  CHAT_UNREAD_REMINDER_PUSH_BODY,
  buildAgentUnreadReminderPushPayload,
  evaluatePrePushDeliveryGate,
  isPushDeliverySent,
  runChatUnreadReminderCron,
  type ChatUnreadReminderCandidate,
  type ChatUnreadReminderCronDb,
  type ChatUnreadReminderPrePushSnapshot,
} from "../src/lib/conversations/agent-unread-reminder-cron";
import type {
  AgentUnreadReminderClaim,
  ClaimAgentUnreadReminderResult,
} from "../src/lib/conversations/agent-unread-reminder";
import type { PushDeliveryResult, PushPayload } from "../src/lib/notifications/push";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const NOW = new Date("2026-10-10T12:00:00.000Z");

function candidate(
  overrides: Partial<ChatUnreadReminderCandidate> & {
    id: string;
    workspaceId: string;
  },
): ChatUnreadReminderCandidate {
  return {
    leadId: `lead_${overrides.id}`,
    status: "OPEN",
    lastMessageAt: new Date(NOW.getTime() - 20 * 60_000),
    agentUnreadReminderMessageId: null,
    agentUnreadReminderAgentId: null,
    assignedAgentId: "agent_a",
    ...overrides,
  };
}

function makeClaim(
  c: ChatUnreadReminderCandidate,
  overrides: Partial<AgentUnreadReminderClaim> = {},
): AgentUnreadReminderClaim {
  return {
    workspaceId: c.workspaceId,
    conversationId: c.id,
    leadId: c.leadId,
    assignedAgentId: c.assignedAgentId!,
    streakMessageId: `streak_${c.id}`,
    streakCreatedAt: new Date(NOW.getTime() - 20 * 60_000),
    remindedAt: NOW,
    ...overrides,
  };
}

function createCronDb(candidates: ChatUnreadReminderCandidate[]): ChatUnreadReminderCronDb {
  return {
    conversation: { findUnique: async () => null },
    lead: { findUnique: async () => null },
    message: {
      findMany: async () => [],
      findFirst: async () => null,
    },
    leadActivity: { findFirst: async () => null },
    user: { findUnique: async () => null },
    workspace: { findUnique: async () => null },
    workspaceMember: { findFirst: async () => null },
    $executeRaw: async () => undefined,
    $queryRaw: async () => candidates as never,
    $transaction: async (fn) => fn(createCronDb(candidates)),
  };
}

function testSourceAndRuntimeGuards() {
  const route = read("src/app/api/cron/chat-unread-reminders/route.ts");
  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /authorizeChatUnreadReminderCronRequest/);
  assert.match(route, /beginChatUnreadReminderCronRun/);
  assert.match(route, /runChatUnreadReminderCron/);
  assert.match(route, /OVERLAP/);
  assert.doesNotMatch(route, /vercel\.json/);
  assert.doesNotMatch(route, /message\.body/);

  const cron = read("src/lib/conversations/agent-unread-reminder-cron.ts");
  assert.match(cron, /CHAT_UNREAD_REMINDER_CRON_SECRET/);
  assert.match(cron, /claimAgentUnreadReminder/);
  assert.match(cron, /deliverPushToUsersNow/);
  assert.match(cron, /ROW_NUMBER\(\) OVER/);
  assert.match(cron, /PARTITION BY c\."workspaceId"/);
  assert.match(cron, /CHAT_UNREAD_REMINDER_PUSH_BODY/);
  assert.doesNotMatch(cron, /scheduleWorkerSideEffect/);
  assert.doesNotMatch(cron, /presenceUntil/);
  assert.ok(!cron.includes("body: claim"));
  assert.equal(CHAT_UNREAD_REMINDER_CRON.job, "chat-unread-reminders");
  assert.ok(CHAT_UNREAD_REMINDER_CRON_BATCH >= 1);
  assert.ok(CHAT_UNREAD_REMINDER_CRON_PER_WORKSPACE >= 1);
  assert.ok(CHAT_UNREAD_REMINDER_PUSH_BODY.includes("unread"));

  const payload = buildAgentUnreadReminderPushPayload("lead_x");
  assert.equal(payload.type, "chat_message");
  assert.equal(payload.body, CHAT_UNREAD_REMINDER_PUSH_BODY);
  assert.ok(payload.href?.includes("lead_x"));
  assert.equal(isPushDeliverySent({ status: "sent" }), true);
  assert.equal(isPushDeliverySent({ status: "failed" }), false);
}

function testUnauthorizedCron() {
  const prev = process.env.CRON_SECRET;
  const prevChat = process.env.CHAT_UNREAD_REMINDER_CRON_SECRET;
  delete process.env.CHAT_UNREAD_REMINDER_CRON_SECRET;
  process.env.CRON_SECRET = "test-secret";
  try {
    assert.equal(
      authorizeChatUnreadReminderCronRequest(
        new Request("http://localhost/api/cron/chat-unread-reminders", {
          method: "POST",
        }),
      ),
      false,
    );
    assert.equal(
      authorizeChatUnreadReminderCronRequest(
        new Request("http://localhost/api/cron/chat-unread-reminders", {
          method: "POST",
          headers: { authorization: "Bearer wrong" },
        }),
      ),
      false,
    );
    assert.equal(
      authorizeChatUnreadReminderCronRequest(
        new Request("http://localhost/api/cron/chat-unread-reminders", {
          method: "POST",
          headers: { authorization: "Bearer test-secret" },
        }),
      ),
      true,
    );
    assert.equal(
      authorizeChatUnreadReminderCronRequest(
        new Request("http://localhost/api/cron/chat-unread-reminders", {
          method: "POST",
          headers: { "x-chat-unread-reminder-cron-secret": "test-secret" },
        }),
      ),
      true,
    );
  } finally {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
    if (prevChat === undefined) delete process.env.CHAT_UNREAD_REMINDER_CRON_SECRET;
    else process.env.CHAT_UNREAD_REMINDER_CRON_SECRET = prevChat;
  }
}

function testOverlapLock() {
  endChatUnreadReminderCronRun();
  assert.equal(isChatUnreadReminderCronRunInFlight(), false);
  assert.equal(beginChatUnreadReminderCronRun(), true);
  assert.equal(beginChatUnreadReminderCronRun(), false);
  endChatUnreadReminderCronRun();
  assert.equal(
    summarizeChatUnreadReminderCronError(new TypeError("x")),
    "TypeError",
  );
}

function testPrePushGate() {
  const claim = makeClaim(
    candidate({ id: "c1", workspaceId: "ws1" }),
  );
  const base: ChatUnreadReminderPrePushSnapshot = {
    assignedAgentId: claim.assignedAgentId,
    agentLastReadAt: new Date(NOW.getTime() - 40 * 60_000),
    agentLastReadByUserId: claim.assignedAgentId,
    agentUnreadReminderMessageId: claim.streakMessageId,
    agentUnreadReminderAgentId: claim.assignedAgentId,
    disabledAt: null,
    pushNotificationPrefs: {},
    conversationStatus: "OPEN",
  };
  assert.equal(evaluatePrePushDeliveryGate(claim, base).ok, true);

  assert.equal(
    (
      evaluatePrePushDeliveryGate(claim, {
        ...base,
        assignedAgentId: "other",
      }) as { reason: string }
    ).reason,
    "PRE_PUSH_ASSIGNMENT_CHANGED",
  );
  assert.equal(
    (
      evaluatePrePushDeliveryGate(claim, {
        ...base,
        agentLastReadAt: claim.streakCreatedAt,
      }) as { reason: string }
    ).reason,
    "PRE_PUSH_CURSOR_CHANGED",
  );
  assert.equal(
    (
      evaluatePrePushDeliveryGate(claim, {
        ...base,
        pushNotificationPrefs: { chat_message: false },
      }) as { reason: string }
    ).reason,
    "PRE_PUSH_PREFERENCE_OFF",
  );
  assert.equal(
    (
      evaluatePrePushDeliveryGate(claim, {
        ...base,
        disabledAt: NOW,
      }) as { reason: string }
    ).reason,
    "PRE_PUSH_AGENT_INELIGIBLE",
  );
}

async function testRunScenarios() {
  const empty = await runChatUnreadReminderCron({
    db: createCronDb([]),
    now: NOW,
  });
  assert.equal(empty.candidatesScanned, 0);
  assert.equal(empty.remindersSent, 0);

  const c1 = candidate({ id: "c1", workspaceId: "ws1" });
  const c2 = candidate({ id: "c2", workspaceId: "ws1" });
  const claimed = new Set<string>();
  const pushes: PushPayload[] = [];

  const eligible = await runChatUnreadReminderCron({
    db: createCronDb([c1, c2]),
    now: NOW,
    batch: 10,
    claimAgentUnreadReminder: async (_db, input) => {
      if (claimed.has(input.conversationId)) {
        return { ok: false, reason: "ALREADY_CLAIMED" };
      }
      claimed.add(input.conversationId);
      const row = input.conversationId === c1.id ? c1 : c2;
      return { ok: true, claim: makeClaim(row) };
    },
    loadPrePushSnapshot: async (_db, claim) => ({
      assignedAgentId: claim.assignedAgentId,
      agentLastReadAt: new Date(NOW.getTime() - 40 * 60_000),
      agentLastReadByUserId: claim.assignedAgentId,
      agentUnreadReminderMessageId: claim.streakMessageId,
      agentUnreadReminderAgentId: claim.assignedAgentId,
      disabledAt: null,
      pushNotificationPrefs: {},
      conversationStatus: "OPEN",
    }),
    authorizeStaffRecipientForLead: async () => true,
    deliverPushToUsersNow: async (_ids, payload) => {
      pushes.push(payload);
      return [
        {
          userId: "agent_a",
          status: "sent",
          deviceCount: 1,
          sentCount: 1,
          failedCount: 0,
          skippedCount: 0,
          unregisteredCount: 0,
        } satisfies PushDeliveryResult,
      ];
    },
  });
  assert.equal(eligible.candidatesScanned, 2);
  assert.equal(eligible.eligibleClaims, 2);
  assert.equal(eligible.remindersAttempted, 2);
  assert.equal(eligible.remindersSent, 2);
  assert.equal(pushes.length, 2);
  assert.ok(pushes.every((p) => p.body === CHAT_UNREAD_REMINDER_PUSH_BODY));

  // Already claimed → skip, no second push
  const again = await runChatUnreadReminderCron({
    db: createCronDb([c1]),
    now: NOW,
    claimAgentUnreadReminder: async () => ({
      ok: false,
      reason: "ALREADY_CLAIMED",
    }),
    deliverPushToUsersNow: async () => {
      throw new Error("should not deliver");
    },
  });
  assert.equal(again.eligibleClaims, 0);
  assert.equal(again.skipped, 1);

  // Reassignment abort pre-push
  const reassign = await runChatUnreadReminderCron({
    db: createCronDb([c1]),
    now: NOW,
    claimAgentUnreadReminder: async () => ({
      ok: true,
      claim: makeClaim(c1),
    }),
    loadPrePushSnapshot: async (_db, claim) => ({
      assignedAgentId: "agent_b",
      agentLastReadAt: null,
      agentLastReadByUserId: null,
      agentUnreadReminderMessageId: claim.streakMessageId,
      agentUnreadReminderAgentId: claim.assignedAgentId,
      disabledAt: null,
      pushNotificationPrefs: {},
      conversationStatus: "OPEN",
    }),
    deliverPushToUsersNow: async () => {
      throw new Error("should not deliver after reassignment");
    },
  });
  assert.equal(reassign.eligibleClaims, 1);
  assert.equal(reassign.remindersAttempted, 0);
  assert.equal(reassign.skipped, 1);

  // Mark-read race
  const markRead = await runChatUnreadReminderCron({
    db: createCronDb([c1]),
    now: NOW,
    claimAgentUnreadReminder: async () => ({
      ok: true,
      claim: makeClaim(c1),
    }),
    loadPrePushSnapshot: async (_db, claim) => ({
      assignedAgentId: claim.assignedAgentId,
      agentLastReadAt: claim.streakCreatedAt,
      agentLastReadByUserId: claim.assignedAgentId,
      agentUnreadReminderMessageId: claim.streakMessageId,
      agentUnreadReminderAgentId: claim.assignedAgentId,
      disabledAt: null,
      pushNotificationPrefs: {},
      conversationStatus: "OPEN",
    }),
    deliverPushToUsersNow: async () => {
      throw new Error("should not deliver after mark-read");
    },
  });
  assert.equal(markRead.remindersAttempted, 0);
  assert.equal(markRead.skipped, 1);

  // Pref opt-out after claim
  const prefOff = await runChatUnreadReminderCron({
    db: createCronDb([c1]),
    now: NOW,
    claimAgentUnreadReminder: async () => ({
      ok: true,
      claim: makeClaim(c1),
    }),
    loadPrePushSnapshot: async (_db, claim) => ({
      assignedAgentId: claim.assignedAgentId,
      agentLastReadAt: new Date(NOW.getTime() - 40 * 60_000),
      agentLastReadByUserId: claim.assignedAgentId,
      agentUnreadReminderMessageId: claim.streakMessageId,
      agentUnreadReminderAgentId: claim.assignedAgentId,
      disabledAt: null,
      pushNotificationPrefs: { chat_message: false },
      conversationStatus: "OPEN",
    }),
    deliverPushToUsersNow: async () => {
      throw new Error("should not deliver when pref off");
    },
  });
  assert.equal(prefOff.remindersAttempted, 0);

  // Push delivery failure
  const failPush = await runChatUnreadReminderCron({
    db: createCronDb([c1]),
    now: NOW,
    claimAgentUnreadReminder: async () => ({
      ok: true,
      claim: makeClaim(c1),
    }),
    loadPrePushSnapshot: async (_db, claim) => ({
      assignedAgentId: claim.assignedAgentId,
      agentLastReadAt: new Date(NOW.getTime() - 40 * 60_000),
      agentLastReadByUserId: claim.assignedAgentId,
      agentUnreadReminderMessageId: claim.streakMessageId,
      agentUnreadReminderAgentId: claim.assignedAgentId,
      disabledAt: null,
      pushNotificationPrefs: {},
      conversationStatus: "OPEN",
    }),
    authorizeStaffRecipientForLead: async () => true,
    deliverPushToUsersNow: async () => [
      {
        userId: "agent_a",
        status: "failed",
        deviceCount: 1,
        sentCount: 0,
        failedCount: 1,
        skippedCount: 0,
        unregisteredCount: 0,
      },
    ],
  });
  assert.equal(failPush.remindersAttempted, 1);
  assert.equal(failPush.remindersSent, 0);
  assert.equal(failPush.errors, 1);

  // Batch limit
  const many = [
    candidate({ id: "a", workspaceId: "ws1" }),
    candidate({ id: "b", workspaceId: "ws1" }),
    candidate({ id: "c", workspaceId: "ws2" }),
  ];
  let claimCalls = 0;
  const batched = await runChatUnreadReminderCron({
    db: createCronDb(many),
    now: NOW,
    batch: 1,
    claimAgentUnreadReminder: async (_db, input) => {
      claimCalls += 1;
      const row = many.find((m) => m.id === input.conversationId)!;
      return { ok: true, claim: makeClaim(row) };
    },
    loadPrePushSnapshot: async (_db, claim) => ({
      assignedAgentId: claim.assignedAgentId,
      agentLastReadAt: new Date(NOW.getTime() - 40 * 60_000),
      agentLastReadByUserId: claim.assignedAgentId,
      agentUnreadReminderMessageId: claim.streakMessageId,
      agentUnreadReminderAgentId: claim.assignedAgentId,
      disabledAt: null,
      pushNotificationPrefs: {},
      conversationStatus: "OPEN",
    }),
    authorizeStaffRecipientForLead: async () => true,
    deliverPushToUsersNow: async () => [
      {
        userId: "agent_a",
        status: "sent",
        deviceCount: 1,
        sentCount: 1,
        failedCount: 0,
        skippedCount: 0,
        unregisteredCount: 0,
      },
    ],
  });
  assert.equal(batched.eligibleClaims, 1);
  assert.equal(claimCalls, 1);
  assert.equal(batched.remindersSent, 1);

  // Concurrent cron workers: overlap lock at route; durable claim dedupe at lib
  const claimResults: ClaimAgentUnreadReminderResult[] = [];
  let concurrentClaims = 0;
  const worker = () =>
    runChatUnreadReminderCron({
      db: createCronDb([c1]),
      now: NOW,
      claimAgentUnreadReminder: async () => {
        concurrentClaims += 1;
        if (concurrentClaims === 1) {
          const result: ClaimAgentUnreadReminderResult = {
            ok: true,
            claim: makeClaim(c1),
          };
          claimResults.push(result);
          return result;
        }
        const result: ClaimAgentUnreadReminderResult = {
          ok: false,
          reason: "ALREADY_CLAIMED",
        };
        claimResults.push(result);
        return result;
      },
      loadPrePushSnapshot: async (_db, claim) => ({
        assignedAgentId: claim.assignedAgentId,
        agentLastReadAt: new Date(NOW.getTime() - 40 * 60_000),
        agentLastReadByUserId: claim.assignedAgentId,
        agentUnreadReminderMessageId: claim.streakMessageId,
        agentUnreadReminderAgentId: claim.assignedAgentId,
        disabledAt: null,
        pushNotificationPrefs: {},
        conversationStatus: "OPEN",
      }),
      authorizeStaffRecipientForLead: async () => true,
      deliverPushToUsersNow: async () => [
        {
          userId: "agent_a",
          status: "sent",
          deviceCount: 1,
          sentCount: 1,
          failedCount: 0,
          skippedCount: 0,
          unregisteredCount: 0,
        },
      ],
    });
  const [w1, w2] = await Promise.all([worker(), worker()]);
  const sent = w1.remindersSent + w2.remindersSent;
  assert.equal(sent, 1);
  assert.equal(
    claimResults.filter((r) => r.ok).length,
    1,
  );
}

async function main() {
  testSourceAndRuntimeGuards();
  testOverlapLock();
  testPrePushGate();
  testUnauthorizedCron();
  await testRunScenarios();
  console.log("agent-unread-reminder-cron-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
