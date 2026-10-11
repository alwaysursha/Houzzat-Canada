/**
 * Chat V1 Milestone 4D — typing indicators backend selftest (no DB).
 * Run: pnpm chat-typing-indicators:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  agentChatTypingRoute,
  customerChatTypingRoute,
  peerTypingFromPayload,
  shouldSendTypingHeartbeat,
  TYPING_HEARTBEAT_MS,
  TYPING_IDLE_STOP_MS,
} from "../src/lib/chat/typing/client";
import {
  TYPING_REFRESH_REMAINING_MS,
  TYPING_TTL_MS,
} from "../src/lib/chat/typing/constants";
import {
  allowConversationTypingHeartbeat,
  clearConversationTypingRateLimitsForTests,
} from "../src/lib/chat/typing/rate-limit";
import {
  isTypingActive,
  maxClearableTypingUntil,
  nextTypingUntil,
  parseTypingActiveBody,
  shouldSkipActiveTypingRefresh,
} from "../src/lib/chat/typing/state";
import {
  clearConversationTypingOnSend,
  setConversationTypingState,
  type ConversationTypingDb,
  type ConversationTypingRow,
} from "../src/lib/chat/typing/update";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testPureHelpers() {
  const now = new Date("2026-10-10T12:00:00.000Z");
  assert.equal(isTypingActive(null, now), false);
  assert.equal(isTypingActive(new Date(now.getTime() - 1), now), false);
  assert.equal(isTypingActive(new Date(now.getTime() + 1), now), true);

  const until = nextTypingUntil(now);
  assert.equal(until.getTime() - now.getTime(), TYPING_TTL_MS);

  assert.equal(
    shouldSkipActiveTypingRefresh(
      new Date(now.getTime() + TYPING_REFRESH_REMAINING_MS + 1),
      now,
    ),
    true,
  );
  assert.equal(
    shouldSkipActiveTypingRefresh(
      new Date(now.getTime() + TYPING_REFRESH_REMAINING_MS - 1),
      now,
    ),
    false,
  );

  assert.equal(
    maxClearableTypingUntil(now).getTime() - now.getTime(),
    TYPING_TTL_MS,
  );

  assert.deepEqual(parseTypingActiveBody({ active: true }), {
    ok: true,
    active: true,
  });
  assert.equal(parseTypingActiveBody({ active: "yes" }).ok, false);
  assert.equal(parseTypingActiveBody({ active: true, extra: 1 }).ok, false);
  assert.equal(parseTypingActiveBody(null).ok, false);
}

function testRateLimit() {
  clearConversationTypingRateLimitsForTests();
  let blocked = false;
  for (let i = 0; i < 80; i += 1) {
    const rate = allowConversationTypingHeartbeat({
      userId: "u1",
      workspaceId: "ws1",
    });
    if (!rate.allowed) {
      blocked = true;
      break;
    }
  }
  assert.equal(blocked, true);

  const other = allowConversationTypingHeartbeat({
    userId: "u1",
    workspaceId: "ws2",
  });
  assert.equal(other.allowed, true);
}

async function testConditionalUpdatesAndIsolation() {
  const store = new Map<string, ConversationTypingRow>();
  const key = (workspaceId: string, id: string) => `${workspaceId}:${id}`;

  const db: ConversationTypingDb = {
    conversation: {
      findUnique: async (args) => {
        const { workspaceId, id } = args.where.workspaceId_id;
        return store.get(key(workspaceId, id)) ?? null;
      },
      updateMany: async (args) => {
        const workspaceId = String(args.where.workspaceId);
        const id = String(args.where.id);
        const row = store.get(key(workspaceId, id));
        if (!row) return { count: 0 };

        const field = Object.keys(args.data)[0] as
          | "customerTypingUntil"
          | "agentTypingUntil";
        const nextValue = args.data[field] as Date | null;

        if (args.where.OR) {
          const or = args.where.OR as Array<Record<string, unknown>>;
          const current = row[field];
          const lteClause = or.find(
            (entry) =>
              entry[field] &&
              typeof entry[field] === "object" &&
              entry[field] !== null &&
              "lte" in (entry[field] as object),
          );
          const nullClause = or.find((entry) => entry[field] === null);
          const lte =
            lteClause &&
            (lteClause[field] as { lte: Date }).lte.getTime();
          const ok =
            (nullClause && current == null) ||
            (typeof lte === "number" &&
              current != null &&
              current.getTime() <= lte);
          if (!ok) return { count: 0 };
          row[field] = nextValue;
          return { count: 1 };
        }

        if (args.where[field] && typeof args.where[field] === "object") {
          const clause = args.where[field] as {
            not?: null;
            lte?: Date;
          };
          const current = row[field];
          if (clause.not === null && current == null) return { count: 0 };
          if (clause.lte && current && current.getTime() > clause.lte.getTime()) {
            return { count: 0 };
          }
          if (clause.lte && current == null) return { count: 0 };
          row[field] = nextValue;
          return { count: 1 };
        }

        row[field] = nextValue;
        return { count: 1 };
      },
    },
  };

  store.set(key("wsA", "convA"), {
    customerTypingUntil: null,
    agentTypingUntil: null,
  });
  store.set(key("wsB", "convB"), {
    customerTypingUntil: null,
    agentTypingUntil: null,
  });

  const now = new Date("2026-10-10T15:00:00.000Z");
  const first = await setConversationTypingState(db, {
    workspaceId: "wsA",
    conversationId: "convA",
    side: "customer",
    active: true,
    now,
  });
  assert.equal(first.updated, true);
  assert.ok(store.get(key("wsA", "convA"))?.customerTypingUntil);

  const skip = await setConversationTypingState(db, {
    workspaceId: "wsA",
    conversationId: "convA",
    side: "customer",
    active: true,
    now: new Date(now.getTime() + 500),
  });
  assert.equal(skip.skipped, true);

  // Cross-tenant: wrong workspace cannot update missing row
  const cross = await setConversationTypingState(db, {
    workspaceId: "wsB",
    conversationId: "convA",
    side: "customer",
    active: true,
    now,
  });
  assert.equal(cross.updated, false);
  assert.equal(store.get(key("wsB", "convB"))?.customerTypingUntil, null);

  // Stale clear must not wipe a newer heartbeat beyond max clearable
  const farFuture = new Date(now.getTime() + TYPING_TTL_MS + 10_000);
  store.set(key("wsA", "convA"), {
    customerTypingUntil: farFuture,
    agentTypingUntil: null,
  });
  const staleClear = await setConversationTypingState(db, {
    workspaceId: "wsA",
    conversationId: "convA",
    side: "customer",
    active: false,
    now,
  });
  assert.equal(staleClear.updated, false);
  assert.equal(
    store.get(key("wsA", "convA"))?.customerTypingUntil?.getTime(),
    farFuture.getTime(),
  );

  // Normal clear within TTL window
  store.set(key("wsA", "convA"), {
    customerTypingUntil: new Date(now.getTime() + 1_000),
    agentTypingUntil: null,
  });
  const clear = await setConversationTypingState(db, {
    workspaceId: "wsA",
    conversationId: "convA",
    side: "customer",
    active: false,
    now,
  });
  assert.equal(clear.updated, true);
  assert.equal(store.get(key("wsA", "convA"))?.customerTypingUntil, null);

  // Send clear force-nulls
  store.set(key("wsA", "convA"), {
    customerTypingUntil: new Date(now.getTime() + TYPING_TTL_MS),
    agentTypingUntil: new Date(now.getTime() + TYPING_TTL_MS),
  });
  await clearConversationTypingOnSend(db, {
    workspaceId: "wsA",
    conversationId: "convA",
    side: "agent",
  });
  assert.equal(store.get(key("wsA", "convA"))?.agentTypingUntil, null);
  assert.ok(store.get(key("wsA", "convA"))?.customerTypingUntil);
}

function testClientHelpersAndUiWiring() {
  assert.ok(TYPING_HEARTBEAT_MS >= 2000 && TYPING_HEARTBEAT_MS <= 3000);
  assert.ok(TYPING_IDLE_STOP_MS >= 1500 && TYPING_IDLE_STOP_MS <= 2500);
  assert.equal(
    shouldSendTypingHeartbeat({ now: 1000, lastSentAt: null }),
    true,
  );
  assert.equal(
    shouldSendTypingHeartbeat({
      now: 1000,
      lastSentAt: 1000 - TYPING_HEARTBEAT_MS + 1,
    }),
    false,
  );
  assert.equal(
    shouldSendTypingHeartbeat({
      now: 1000,
      lastSentAt: 1000 - TYPING_HEARTBEAT_MS,
    }),
    true,
  );
  assert.equal(peerTypingFromPayload(true), true);
  assert.equal(peerTypingFromPayload(false), false);
  assert.equal(peerTypingFromPayload(undefined), false);
  assert.equal(customerChatTypingRoute(), "/api/account/conversation/typing");
  assert.equal(
    agentChatTypingRoute("lead/1"),
    "/api/agent/leads/lead%2F1/conversation/typing",
  );

  const indicator = read("src/components/chat/ChatTypingIndicator.tsx");
  assert.ok(indicator.includes("CHAT_TYPING_INDICATOR_SLOT_CLASS"));
  assert.ok(indicator.includes("h-5"));
  assert.ok(indicator.includes("opacity-0"));
  assert.ok(indicator.includes("opacity-100"));
  assert.ok(indicator.includes("motion-safe:transition-opacity"));
  assert.ok(indicator.includes("motion-reduce:transition-none"));
  assert.ok(!indicator.includes("if (!visible) return null"));

  const customerUi = read("src/components/customer-chat/CustomerChatScreen.tsx");
  assert.ok(customerUi.includes("ChatTypingIndicator"));
  assert.ok(customerUi.includes("Agent is typing"));
  assert.ok(customerUi.includes("signalTyping"));
  assert.ok(customerUi.includes("clearTyping"));
  assert.ok(customerUi.includes("customerChatTypingRoute"));

  const agentUi = read(
    "src/components/agent/chat/AgentChatTranscriptPane.tsx",
  );
  assert.ok(agentUi.includes("ChatTypingIndicator"));
  assert.ok(agentUi.includes("Customer is typing"));
  assert.ok(agentUi.includes("signalTyping"));
  assert.ok(agentUi.includes("!smsSelected"));
  assert.ok(agentUi.includes("agentChatTypingRoute"));
  assert.ok(agentUi.includes("canSend ? ("));

  const customerHook = read(
    "src/components/customer-chat/useCustomerChatThread.ts",
  );
  assert.ok(customerHook.includes("peerTyping: Boolean(json.peerTyping)"));

  const agentHook = read("src/components/agent/chat/useAgentChatThread.ts");
  assert.ok(agentHook.includes("peerTyping: Boolean(json.peerTyping)"));

  const publisher = read("src/components/chat/useChatTypingPublisher.ts");
  assert.ok(publisher.includes("TYPING_IDLE_STOP_MS"));
  assert.ok(publisher.includes("TYPING_HEARTBEAT_MS"));
  assert.ok(publisher.includes("shouldSendTypingHeartbeat"));
  assert.ok(!publisher.includes("body: JSON.stringify({ text"));

  const client = read("src/lib/chat/typing/client.ts");
  assert.ok(client.includes("postTypingActive"));
  assert.ok(client.includes('JSON.stringify({ active })'));
}

function testWiringAndSecuritySurface() {
  const customerTyping = read(
    "src/lib/conversations/customer-conversation-typing.ts",
  );
  assert.ok(customerTyping.includes("ensureCustomerChatLead"));
  assert.ok(customerTyping.includes('side: "customer"'));
  assert.ok(!customerTyping.includes("clientConversationId"));

  const agentTyping = read("src/lib/conversations/agent-conversation-typing.ts");
  assert.ok(agentTyping.includes("assignedAgentId"));
  assert.ok(agentTyping.includes('side: "agent"'));

  const customerGet = read("src/lib/conversations/customer-conversation.ts");
  assert.ok(customerGet.includes("peerTyping"));
  assert.ok(customerGet.includes("agentTypingUntil"));
  assert.ok(!customerGet.includes("customerTypingUntil:"));

  const agentGet = read("src/lib/conversations/agent-conversation-read.ts");
  assert.ok(agentGet.includes("peerTyping"));
  assert.ok(agentGet.includes("customerTypingUntil"));

  const customerRoute = read(
    "src/app/api/account/conversation/typing/route.ts",
  );
  assert.ok(customerRoute.includes("handleCustomerConversationTyping"));

  const agentRoute = read(
    "src/app/api/agent/leads/[id]/conversation/typing/route.ts",
  );
  assert.ok(agentRoute.includes("setAgentLeadConversationTyping"));

  assert.ok(
    read("src/lib/conversations/customer-conversation.ts").includes(
      "clearConversationTypingOnSend",
    ),
  );
  assert.ok(
    read("src/lib/conversations/agent-conversation-send.ts").includes(
      "clearConversationTypingOnSend",
    ),
  );

  const migration = read(
    "prisma/migrations/20261011130000_conversation_typing_indicators/migration.sql",
  );
  assert.ok(migration.includes("customerTypingUntil"));
  assert.ok(migration.includes("agentTypingUntil"));
  assert.ok(!migration.includes("DROP"));
}

async function main() {
  testPureHelpers();
  testRateLimit();
  await testConditionalUpdatesAndIsolation();
  testClientHelpersAndUiWiring();
  testWiringAndSecuritySurface();
  console.log("chat-typing-indicators-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
