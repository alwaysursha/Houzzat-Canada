/**
 * Chat V1 Milestone 2 — rich messaging selftest.
 * Run: pnpm chat-rich-messaging:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { composerSendPayload } from "../src/lib/agent/lead-profile-v2/chat-query";
import {
  CHAT_REACTION_KEYS,
  insertEmojiAtCursor,
  normalizeChatReactionKey,
  searchChatEmojis,
} from "../src/lib/chat/emoji-catalog";
import {
  normalizeConversationSearchQuery,
  parseConversationSearchCursor,
  parseConversationSearchLimit,
  searchConversationMessages,
} from "../src/lib/chat/conversation-search";
import {
  allowMessageReaction,
  clearMessageReactionRateLimitsForTests,
  summarizeMessageReactions,
  toggleMessageReaction,
} from "../src/lib/chat/message-reactions";
import {
  chatQuotePreviewBody,
  loadQuotedMessagesById,
  resolveReplyToMessageId,
} from "../src/lib/chat/message-reply";
import {
  applyContextPageState,
  loadConversationMessageContext,
  mergeMessagesWithContext,
} from "../src/lib/chat/message-context";
import {
  chatReceiptLabel,
  presentChatReceiptStatus,
} from "../src/lib/chat/message-receipts";
import {
  customerChatSendBody,
  mergeCustomerChatContext,
  shouldMarkCustomerChatRead,
} from "../src/lib/customer-chat/query";
import { shouldMarkV2ChatRead } from "../src/lib/agent/lead-profile-v2/chat-query";
import type { CustomerChatGetPayload } from "../src/lib/customer-chat/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testEmojiInsertionAndSearch() {
  const inserted = insertEmojiAtCursor({
    value: "Hi there",
    emoji: "😊",
    selectionStart: 2,
    selectionEnd: 2,
  });
  assert.equal(inserted.value, "Hi😊 there");
  assert.equal(inserted.selectionStart, 4);
  assert.equal(inserted.selectionEnd, 4);

  const replaced = insertEmojiAtCursor({
    value: "Hello",
    emoji: "👍",
    selectionStart: 0,
    selectionEnd: 5,
  });
  assert.equal(replaced.value, "👍");

  for (const key of CHAT_REACTION_KEYS) {
    assert.equal(normalizeChatReactionKey(key), key);
  }
  assert.equal(normalizeChatReactionKey("🚀"), null);

  const heartHits = searchChatEmojis("heart");
  assert.ok(heartHits.includes("❤️"));
  const laughHits = searchChatEmojis("lol");
  assert.ok(laughHits.includes("😂"));
}

function testReceiptLabels() {
  assert.equal(
    presentChatReceiptStatus({
      isOwnMessage: false,
      messageCreatedAt: "2026-10-10T12:00:00.000Z",
      deliveredAt: null,
      peerLastReadAt: "2026-10-10T13:00:00.000Z",
    }),
    null,
  );
  assert.equal(
    presentChatReceiptStatus({
      isOwnMessage: true,
      messageCreatedAt: "2026-10-10T12:00:00.000Z",
      deliveredAt: null,
      peerLastReadAt: null,
    }),
    "sent",
  );
  assert.equal(
    presentChatReceiptStatus({
      isOwnMessage: true,
      messageCreatedAt: "2026-10-10T12:00:00.000Z",
      deliveredAt: "2026-10-10T12:01:00.000Z",
      peerLastReadAt: null,
    }),
    "delivered",
  );
  assert.equal(
    presentChatReceiptStatus({
      isOwnMessage: true,
      messageCreatedAt: "2026-10-10T12:00:00.000Z",
      deliveredAt: "2026-10-10T12:01:00.000Z",
      peerLastReadAt: "2026-10-10T12:02:00.000Z",
    }),
    "read",
  );
  // Exact cursor equality counts as Read.
  assert.equal(
    presentChatReceiptStatus({
      isOwnMessage: true,
      messageCreatedAt: "2026-10-10T12:00:00.000Z",
      deliveredAt: null,
      peerLastReadAt: "2026-10-10T12:00:00.000Z",
    }),
    "read",
  );
  // Peer cursor before message creation is still Sent (not Read).
  assert.equal(
    presentChatReceiptStatus({
      isOwnMessage: true,
      messageCreatedAt: "2026-10-10T12:00:00.000Z",
      deliveredAt: null,
      peerLastReadAt: "2026-10-10T11:59:59.999Z",
    }),
    "sent",
  );
  // Invalid / empty delivery acknowledgement never yields Delivered.
  assert.equal(
    presentChatReceiptStatus({
      isOwnMessage: true,
      messageCreatedAt: "2026-10-10T12:00:00.000Z",
      deliveredAt: "not-a-date",
      peerLastReadAt: null,
    }),
    "sent",
  );
  assert.equal(
    presentChatReceiptStatus({
      isOwnMessage: true,
      messageCreatedAt: "2026-10-10T12:00:00.000Z",
      deliveredAt: "",
      peerLastReadAt: null,
    }),
    "sent",
  );
  // Sending alone never marks Read.
  assert.equal(
    presentChatReceiptStatus({
      isOwnMessage: true,
      messageCreatedAt: "2026-10-10T12:00:00.000Z",
      deliveredAt: null,
      peerLastReadAt: undefined,
    }),
    "sent",
  );
  assert.equal(chatReceiptLabel("sent"), "Sent");
  assert.equal(chatReceiptLabel("delivered"), "Delivered");
  assert.equal(chatReceiptLabel("read"), "Read");

  assert.equal(
    shouldMarkCustomerChatRead({
      chatVisible: false,
      openId: "conv_1",
      alreadyMarkedId: null,
    }),
    false,
  );
  assert.equal(
    shouldMarkCustomerChatRead({
      chatVisible: true,
      openId: "conv_1",
      alreadyMarkedId: null,
    }),
    true,
  );
  assert.equal(
    shouldMarkV2ChatRead({ chatVisible: false, canMarkRead: true }),
    false,
  );
  assert.equal(
    shouldMarkV2ChatRead({ chatVisible: true, canMarkRead: true }),
    true,
  );
  assert.equal(
    shouldMarkV2ChatRead({ chatVisible: true, canMarkRead: false }),
    false,
  );
}

async function testReactionOwnershipAndIsolation() {
  clearMessageReactionRateLimitsForTests();
  const store = new Map<string, { id: string; key: string; workspaceId: string; messageId: string; userId: string }>();
  let seq = 0;
  const db = {
    message: {
      findFirst: async (args: {
        where: { id: string; workspaceId: string; conversationId: string };
      }) => {
        if (
          args.where.id === "msg_a" &&
          args.where.workspaceId === "ws_a" &&
          args.where.conversationId === "conv_a"
        ) {
          return {
            id: "msg_a",
            workspaceId: "ws_a",
            conversationId: "conv_a",
          };
        }
        return null;
      },
    },
    messageReaction: {
      findUnique: async (args: {
        where: { messageId_userId: { messageId: string; userId: string } };
      }) => {
        const key = `${args.where.messageId_userId.messageId}:${args.where.messageId_userId.userId}`;
        const row = store.get(key);
        return row ? { id: row.id, key: row.key } : null;
      },
      findMany: async (args: {
        where: { workspaceId: string; messageId: { in: string[] } };
      }) =>
        [...store.values()]
          .filter(
            (row) =>
              row.workspaceId === args.where.workspaceId &&
              args.where.messageId.in.includes(row.messageId),
          )
          .map((row) => ({
            messageId: row.messageId,
            userId: row.userId,
            key: row.key,
          })),
      create: async (args: {
        data: {
          workspaceId: string;
          messageId: string;
          userId: string;
          key: string;
        };
      }) => {
        const composite = `${args.data.messageId}:${args.data.userId}`;
        if (store.has(composite)) {
          const err = new Error("Unique constraint failed") as Error & {
            code: string;
          };
          err.code = "P2002";
          throw err;
        }
        const id = `rx_${++seq}`;
        store.set(composite, {
          id,
          ...args.data,
        });
        return { id, key: args.data.key };
      },
      update: async (args: { where: { id: string }; data: { key: string } }) => {
        for (const [key, row] of store) {
          if (row.id === args.where.id) {
            const next = { ...row, key: args.data.key };
            store.set(key, next);
            return { id: next.id, key: next.key };
          }
        }
        throw new Error("missing");
      },
      delete: async (args: { where: { id: string } }) => {
        for (const [key, row] of store) {
          if (row.id === args.where.id) {
            store.delete(key);
            return;
          }
        }
      },
    },
  };

  const foreign = await toggleMessageReaction(db, {
    workspaceId: "ws_b",
    conversationId: "conv_a",
    messageId: "msg_a",
    userId: "user_1",
    key: "👍",
  });
  assert.equal(foreign.ok, false);
  if (!foreign.ok) assert.equal(foreign.reason, "MESSAGE_NOT_FOUND");

  const added = await toggleMessageReaction(db, {
    workspaceId: "ws_a",
    conversationId: "conv_a",
    messageId: "msg_a",
    userId: "user_1",
    key: "👍",
  });
  assert.equal(added.ok, true);
  if (added.ok) {
    assert.equal(added.action, "added");
    assert.equal(added.summaries[0]?.key, "👍");
    assert.equal(added.summaries[0]?.reactedByMe, true);
  }

  const changed = await toggleMessageReaction(db, {
    workspaceId: "ws_a",
    conversationId: "conv_a",
    messageId: "msg_a",
    userId: "user_1",
    key: "❤️",
  });
  assert.equal(changed.ok, true);
  if (changed.ok) {
    assert.equal(changed.action, "changed");
    assert.equal(changed.summaries.length, 1);
    assert.equal(changed.summaries[0]?.key, "❤️");
  }

  const removed = await toggleMessageReaction(db, {
    workspaceId: "ws_a",
    conversationId: "conv_a",
    messageId: "msg_a",
    userId: "user_1",
    key: "❤️",
  });
  assert.equal(removed.ok, true);
  if (removed.ok) {
    assert.equal(removed.action, "removed");
    assert.equal(removed.summaries.length, 0);
  }

  // User 2 reaction is independent; user 1 cannot delete/change it.
  const user2 = await toggleMessageReaction(db, {
    workspaceId: "ws_a",
    conversationId: "conv_a",
    messageId: "msg_a",
    userId: "user_2",
    key: "😂",
  });
  assert.equal(user2.ok, true);
  const user1Again = await toggleMessageReaction(db, {
    workspaceId: "ws_a",
    conversationId: "conv_a",
    messageId: "msg_a",
    userId: "user_1",
    key: "👍",
  });
  assert.equal(user1Again.ok, true);
  assert.ok(store.has("msg_a:user_2"));
  assert.equal(store.get("msg_a:user_2")?.key, "😂");

  // Concurrent create race (unique constraint) resolves without throw.
  store.delete("msg_a:user_1");
  store.set("msg_a:user_1", {
    id: "rx_race",
    workspaceId: "ws_a",
    messageId: "msg_a",
    userId: "user_1",
    key: "😊",
  });
  const raced = await toggleMessageReaction(db, {
    workspaceId: "ws_a",
    conversationId: "conv_a",
    messageId: "msg_a",
    userId: "user_1",
    key: "🙏",
  });
  // findUnique sees existing before create — change path.
  assert.equal(raced.ok, true);
  if (raced.ok) assert.equal(raced.action, "changed");

  // Force create-path race: empty findUnique then P2002 on create.
  store.delete("msg_a:user_race");
  let raceCreates = 0;
  const raceDb = {
    ...db,
    messageReaction: {
      ...db.messageReaction,
      findUnique: async (args: {
        where: { messageId_userId: { messageId: string; userId: string } };
      }) => {
        const key = `${args.where.messageId_userId.messageId}:${args.where.messageId_userId.userId}`;
        if (raceCreates === 0 && key === "msg_a:user_race") return null;
        return db.messageReaction.findUnique(args);
      },
      create: async (args: {
        data: {
          workspaceId: string;
          messageId: string;
          userId: string;
          key: string;
        };
      }) => {
        raceCreates += 1;
        if (raceCreates === 1) {
          store.set(`${args.data.messageId}:${args.data.userId}`, {
            id: "rx_pre",
            workspaceId: args.data.workspaceId,
            messageId: args.data.messageId,
            userId: args.data.userId,
            key: "😮",
          });
          const err = new Error("Unique constraint failed") as Error & {
            code: string;
          };
          err.code = "P2002";
          throw err;
        }
        return db.messageReaction.create(args);
      },
    },
  };
  const raceToggle = await toggleMessageReaction(raceDb, {
    workspaceId: "ws_a",
    conversationId: "conv_a",
    messageId: "msg_a",
    userId: "user_race",
    key: "🙏",
  });
  assert.equal(raceToggle.ok, true);
  if (raceToggle.ok) assert.equal(raceToggle.action, "changed");
  assert.equal(store.get("msg_a:user_race")?.key, "🙏");

  const summaries = summarizeMessageReactions({
    rows: [
      { messageId: "msg_a", userId: "user_1", key: "👍" },
      { messageId: "msg_a", userId: "user_2", key: "👍" },
      { messageId: "msg_b", userId: "user_1", key: "😂" },
    ],
    messageId: "msg_a",
    viewerUserId: "user_1",
  });
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.count, 2);
  assert.equal(summaries[0]?.reactedByMe, true);

  clearMessageReactionRateLimitsForTests();
  for (let i = 0; i < 40; i += 1) {
    const allowed = allowMessageReaction({
      userId: "user_rate",
      workspaceId: "ws_a",
      now: 1_000,
    });
    assert.equal(allowed.allowed, true);
  }
  const blocked = allowMessageReaction({
    userId: "user_rate",
    workspaceId: "ws_a",
    now: 1_000,
  });
  assert.equal(blocked.allowed, false);
}

async function testQuotedReplyAuthorization() {
  const db = {
    message: {
      findFirst: async (args: {
        where: { id: string; workspaceId: string; conversationId: string };
      }) => {
        if (
          args.where.id === "msg_ok" &&
          args.where.workspaceId === "ws_a" &&
          args.where.conversationId === "conv_a"
        ) {
          return {
            id: "msg_ok",
            senderName: "Ali",
            body: "Original",
            deletedAt: null,
          };
        }
        return null;
      },
      findMany: async (args: {
        where: {
          workspaceId: string;
          conversationId: string;
          id: { in: string[] };
        };
      }) => {
        if (
          args.where.workspaceId !== "ws_a" ||
          args.where.conversationId !== "conv_a"
        ) {
          return [];
        }
        return args.where.id.in
          .filter((id) => id === "msg_ok" || id === "msg_deleted")
          .map((id) =>
            id === "msg_deleted"
              ? {
                  id,
                  senderName: "Ali",
                  body: "gone",
                  deletedAt: new Date("2026-10-01T00:00:00.000Z"),
                }
              : {
                  id,
                  senderName: "Ali",
                  body: "Original note",
                  deletedAt: null,
                },
          );
      },
    },
  };

  const ok = await resolveReplyToMessageId(db, {
    workspaceId: "ws_a",
    conversationId: "conv_a",
    replyToMessageId: "msg_ok",
  });
  assert.equal(ok.ok, true);

  const foreign = await resolveReplyToMessageId(db, {
    workspaceId: "ws_a",
    conversationId: "conv_b",
    replyToMessageId: "msg_ok",
  });
  assert.equal(foreign.ok, false);

  const quotes = await loadQuotedMessagesById(db, {
    workspaceId: "ws_a",
    conversationId: "conv_a",
    replyToMessageIds: ["msg_ok", "msg_deleted", "msg_missing"],
  });
  assert.equal(quotes.get("msg_ok")?.body, "Original note");
  assert.equal(quotes.get("msg_deleted")?.deleted, true);
  assert.equal(quotes.has("msg_missing"), false);
  assert.equal(
    chatQuotePreviewBody({
      id: "x",
      senderName: "Ali",
      body: null,
      deleted: true,
    }),
    "Original message unavailable",
  );

  assert.deepEqual(customerChatSendBody("Reply", "msg_ok"), {
    body: "Reply",
    replyToMessageId: "msg_ok",
  });
  assert.deepEqual(composerSendPayload("Reply", "CHAT", "msg_ok"), {
    body: "Reply",
    channel: "CHAT",
    replyToMessageId: "msg_ok",
  });
  assert.deepEqual(composerSendPayload("SMS body", "SMS", "msg_ok"), {
    body: "SMS body",
    channel: "SMS",
    replyToMessageId: "msg_ok",
  });
}

async function testMessageContextJump() {
  type Row = {
    id: string;
    body: string | null;
    createdAt: Date;
    workspaceId: string;
    conversationId: string;
  };
  const rows: Row[] = Array.from({ length: 12 }, (_, index) => ({
    id: `msg_${String(index).padStart(2, "0")}`,
    body: `body ${index}`,
    createdAt: new Date(`2026-10-01T${String(index).padStart(2, "0")}:00:00.000Z`),
    workspaceId: "ws_a",
    conversationId: "conv_a",
  }));

  const db = {
    message: {
      findFirst: async (args: {
        where: { id: string; workspaceId: string; conversationId: string };
      }) => {
        if (
          args.where.workspaceId !== "ws_a" ||
          args.where.conversationId !== "conv_a"
        ) {
          return null;
        }
        return rows.find((row) => row.id === args.where.id) ?? null;
      },
      findMany: async (args: {
        where: Record<string, unknown>;
        orderBy: Array<Record<string, "asc" | "desc">>;
        take: number;
      }) => {
        assert.equal(args.where.workspaceId, "ws_a");
        assert.equal(args.where.conversationId, "conv_a");
        let filtered = rows.slice();
        const or = args.where.OR as Array<Record<string, unknown>> | undefined;
        if (or) {
          const anchor = rows.find((row) => row.id === "msg_05")!;
          const older = or.some((clause) => "lt" in ((clause.createdAt as object) ?? {}));
          filtered = filtered.filter((row) => {
            if (older) {
              return (
                row.createdAt < anchor.createdAt ||
                (row.createdAt.getTime() === anchor.createdAt.getTime() &&
                  row.id < anchor.id)
              );
            }
            return (
              row.createdAt > anchor.createdAt ||
              (row.createdAt.getTime() === anchor.createdAt.getTime() &&
                row.id > anchor.id)
            );
          });
        }
        const desc = args.orderBy[0]?.createdAt === "desc";
        filtered.sort((a, b) =>
          desc
            ? b.createdAt.getTime() - a.createdAt.getTime() ||
              (a.id < b.id ? 1 : -1)
            : a.createdAt.getTime() - b.createdAt.getTime() ||
              (a.id < b.id ? -1 : 1),
        );
        return filtered.slice(0, args.take);
      },
    },
  };

  const foreign = await loadConversationMessageContext(db, {
    workspaceId: "ws_b",
    conversationId: "conv_a",
    messageId: "msg_05",
    select: { id: true, body: true, createdAt: true },
    before: 2,
    after: 2,
  });
  assert.equal(foreign, null);

  const context = await loadConversationMessageContext(db, {
    workspaceId: "ws_a",
    conversationId: "conv_a",
    messageId: "msg_05",
    select: { id: true, body: true, createdAt: true },
    before: 2,
    after: 2,
  });
  assert.ok(context);
  assert.equal(context?.anchorMessageId, "msg_05");
  assert.deepEqual(
    context?.messages.map((row) => row.id),
    ["msg_03", "msg_04", "msg_05", "msg_06", "msg_07"],
  );
  assert.equal(context?.page.hasMoreOlder, true);
  assert.equal(context?.page.hasMoreNewer, true);
  assert.ok(context?.page.olderCursor);

  const existing = [
    { id: "msg_10", createdAt: "2026-10-01T10:00:00.000Z", body: "new" },
    { id: "msg_11", createdAt: "2026-10-01T11:00:00.000Z", body: "newer" },
  ];
  const merged = mergeMessagesWithContext(
    existing,
    (context?.messages ?? []).map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      body: row.body,
    })),
  );
  assert.ok(merged.some((row) => row.id === "msg_05"));
  assert.ok(merged.some((row) => row.id === "msg_11"));
  assert.equal(merged[0]?.id, "msg_03");

  const pageState = applyContextPageState({
    previousHasMore: false,
    previousNextCursor: null,
    contextHasMoreOlder: true,
    contextOlderCursor: context!.page.olderCursor,
    mergedOldestId: merged[0]!.id,
    contextOldestId: "msg_03",
  });
  assert.equal(pageState.hasMore, true);
  assert.equal(pageState.nextCursor, context!.page.olderCursor);

  const payload: CustomerChatGetPayload = {
    conversation: { id: "c1", status: "OPEN", lastMessageAt: null },
    messages: existing.map((row) => ({
      id: row.id,
      channel: "CHAT",
      kind: "TEXT",
      senderKind: "CUSTOMER",
      senderName: "You",
      body: row.body,
      editedAt: null,
      deletedAt: null,
      createdAt: row.createdAt,
      payload: null,
    })),
    page: { limit: 40, hasMore: false, nextCursor: null },
    canSend: true,
    blocked: false,
    read: { customerLastReadAt: null, agentLastReadAt: null, unreadCount: 0 },
    agent: null,
  };
  const next = mergeCustomerChatContext(payload, {
    messages: (context?.messages ?? []).map((row) => ({
      id: row.id,
      channel: "CHAT",
      kind: "TEXT",
      senderKind: "AGENT",
      senderName: "Agent",
      body: row.body,
      editedAt: null,
      deletedAt: null,
      createdAt: row.createdAt.toISOString(),
      payload: null,
    })),
    page: {
      hasMoreOlder: true,
      olderCursor: context!.page.olderCursor,
    },
  });
  assert.ok(next.messages.some((row) => row.id === "msg_05"));
  assert.equal(next.page.hasMore, true);
}

async function testSearchAuthorizationAndPagination() {
  assert.equal(normalizeConversationSearchQuery("  hello  "), "hello");
  assert.equal(normalizeConversationSearchQuery(""), null);
  assert.equal(parseConversationSearchLimit("5"), 5);
  assert.equal(parseConversationSearchLimit("999"), 40);
  const cursor = parseConversationSearchCursor(
    "2026-10-10T12:00:00.000Z|msg_9",
  );
  assert.ok(cursor);
  assert.equal(cursor?.id, "msg_9");

  const rows = Array.from({ length: 3 }, (_, index) => ({
    id: `msg_${index}`,
    body: `Tour home ${index}`,
    senderName: "Ali",
    senderKind: "AGENT",
    createdAt: new Date(`2026-10-0${index + 1}T12:00:00.000Z`),
    workspaceId: "ws_a",
    conversationId: "conv_a",
  }));

  const db = {
    message: {
      findMany: async (args: { where: Record<string, unknown>; take: number }) => {
        assert.equal(args.where.workspaceId, "ws_a");
        assert.equal(args.where.conversationId, "conv_a");
        const bodyFilter = args.where.body as {
          contains: string;
          mode: string;
        };
        assert.equal(bodyFilter.contains, "home");
        assert.equal(bodyFilter.mode, "insensitive");
        return rows.slice(0, args.take);
      },
    },
  };

  const page = await searchConversationMessages(db, {
    workspaceId: "ws_a",
    conversationId: "conv_a",
    query: "home",
    limit: 2,
    cursor: null,
  });
  assert.equal(page.hits.length, 2);
  assert.equal(page.page.hasMore, true);
  assert.ok(page.page.nextCursor);
}

function testUiWiring() {
  const customerScreen = read(
    "src/components/customer-chat/CustomerChatScreen.tsx",
  );
  const customerHook = read(
    "src/components/customer-chat/useCustomerChatThread.ts",
  );
  const agentPane = read(
    "src/components/agent/chat/AgentChatTranscriptPane.tsx",
  );
  const agentHook = read("src/components/agent/chat/useAgentChatThread.ts");
  const floating = read(
    "src/components/customer-chat/CustomerChatFloatingWindow.tsx",
  );
  const inbox = read("src/components/agent/chats/AgentChatsInbox.tsx");

  assert.ok(customerScreen.includes("ChatEmojiPicker"));
  assert.ok(customerScreen.includes("ChatReactionBar"));
  assert.ok(customerScreen.includes("ChatQuotedPreview"));
  assert.ok(customerScreen.includes("ChatReceiptLabel"));
  assert.ok(customerScreen.includes("ChatConversationSearch"));
  assert.ok(customerScreen.includes("reactToMessage"));
  assert.ok(customerScreen.includes("searchMessages"));
  assert.ok(customerScreen.includes("ensureMessageLoaded"));
  assert.ok(customerScreen.includes("navigateToMessage"));
  assert.ok(customerScreen.includes("replyToMessageId"));
  assert.ok(customerScreen.includes("agentLastReadAt"));

  assert.ok(customerHook.includes("reactToMessage"));
  assert.ok(customerHook.includes("searchMessages"));
  assert.ok(customerHook.includes("ensureMessageLoaded"));
  assert.ok(customerHook.includes("customerChatReactionRoute"));
  assert.ok(customerHook.includes("customerChatContextRoute"));
  assert.ok(customerHook.includes("customerChatSearchUrl"));

  assert.ok(agentPane.includes("ChatEmojiPicker"));
  assert.ok(agentPane.includes("ChatReactionBar"));
  assert.ok(agentPane.includes("ChatQuotedPreview"));
  assert.ok(agentPane.includes("ChatReceiptLabel"));
  assert.ok(agentPane.includes("ChatConversationSearch"));
  assert.ok(agentPane.includes("customerLastReadAt"));
  assert.ok(agentPane.includes("onReact"));
  assert.ok(agentPane.includes("onSearch"));
  assert.ok(agentPane.includes("onEnsureMessage"));
  assert.ok(agentPane.includes("navigateToMessage"));

  assert.ok(agentHook.includes("reactToMessage"));
  assert.ok(agentHook.includes("searchMessages"));
  assert.ok(agentHook.includes("ensureMessageLoaded"));
  assert.ok(agentHook.includes("v2ChatReactionUrl"));
  assert.ok(agentHook.includes("v2ChatContextUrl"));
  assert.ok(agentHook.includes("v2ChatSearchUrl"));
  assert.ok(agentHook.includes("replyToMessageId"));

  assert.ok(floating.includes("CustomerChatScreen"));
  assert.ok(inbox.includes("onReact={chat.reactToMessage}"));
  assert.ok(inbox.includes("onSearch={chat.searchMessages}"));
  assert.ok(inbox.includes("onEnsureMessage={chat.ensureMessageLoaded}"));
  assert.ok(
    read(
      "src/app/api/account/conversation/messages/[messageId]/context/route.ts",
    ).includes("handleCustomerConversationMessageContext"),
  );
  assert.ok(
    read(
      "src/app/api/agent/leads/[id]/conversation/messages/[messageId]/context/route.ts",
    ).includes("loadAgentLeadConversationMessageContext"),
  );

  assert.ok(
    read("src/app/api/account/conversation/messages/[messageId]/reactions/route.ts").includes(
      "handleCustomerConversationReaction",
    ),
  );
  assert.ok(
    read("src/app/api/agent/leads/[id]/conversation/messages/[messageId]/reactions/route.ts").includes(
      "handleToggleConversationReaction",
    ),
  );
  assert.ok(
    read("src/app/api/account/conversation/search/route.ts").includes(
      "handleCustomerConversationSearch",
    ),
  );
  assert.ok(
    read("src/app/api/agent/leads/[id]/conversation/search/route.ts").includes(
      "handleConversationSearchRequest",
    ),
  );
  assert.ok(
    read("src/lib/conversations/create-conversation-message.ts").includes(
      "INVALID_REPLY",
    ),
  );
}

async function main() {
  testEmojiInsertionAndSearch();
  testReceiptLabels();
  await testReactionOwnershipAndIsolation();
  await testQuotedReplyAuthorization();
  await testMessageContextJump();
  await testSearchAuthorizationAndPagination();
  testUiWiring();
  console.log("chat-rich-messaging-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
