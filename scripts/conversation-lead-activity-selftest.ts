/**
 * Conversation Chat/SMS LeadActivity: four combinations + duplicate protection.
 * Run: pnpm conversation-lead-activity:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { conversationActivityHeadline } from "../src/lib/agent/conversation-activity";
import {
  recordConversationLeadActivity,
  recordSmsLeadActivity,
  type ConversationLeadActivityDb,
} from "../src/lib/conversations/sms-lead-activity";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

class FakeActivityDb implements ConversationLeadActivityDb {
  creates = 0;
  rows: Array<{
    id: string;
    leadId: string;
    type: string;
    body: string | null;
    meta: Record<string, unknown> | null;
  }> = [];

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
      const row = this.rows.find(
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
      this.creates += 1;
      const meta =
        data.meta && typeof data.meta === "object" && !Array.isArray(data.meta)
          ? (data.meta as Record<string, unknown>)
          : null;
      const row = {
        id: `act_${this.creates}`,
        leadId: data.leadId,
        type: data.type,
        body: data.body ?? null,
        meta,
      };
      this.rows.push(row);
      return row;
    },
  };
}

async function record(
  db: FakeActivityDb,
  input: {
    messageId: string;
    channel: "CHAT" | "SMS";
    direction: "inbound" | "outbound";
    body?: string;
  },
) {
  return recordConversationLeadActivity(db, {
    leadId: "lead-1",
    workspaceId: "ws-1",
    messageId: input.messageId,
    body: input.body ?? `${input.channel} ${input.direction}`,
    channel: input.channel,
    direction: input.direction,
    userId: input.direction === "outbound" ? "agent-1" : "customer-1",
  });
}

async function testFourCombinations() {
  const db = new FakeActivityDb();
  const outboundChat = await record(db, {
    messageId: "msg-chat-out",
    channel: "CHAT",
    direction: "outbound",
  });
  const inboundChat = await record(db, {
    messageId: "msg-chat-in",
    channel: "CHAT",
    direction: "inbound",
  });
  await recordSmsLeadActivity(db, {
    leadId: "lead-1",
    workspaceId: "ws-1",
    messageId: "msg-sms-out",
    body: "SMS outbound",
    direction: "outbound",
    userId: "agent-1",
  });
  await recordSmsLeadActivity(db, {
    leadId: "lead-1",
    workspaceId: "ws-1",
    messageId: "msg-sms-in",
    body: "SMS inbound",
    direction: "inbound",
  });

  assert.equal(outboundChat.created, true);
  assert.equal(inboundChat.created, true);
  assert.equal(db.creates, 4);
  assert.deepEqual(
    db.rows.map((row) => ({
      type: row.type,
      channel: row.meta?.channel,
      direction: row.meta?.direction,
      headline: conversationActivityHeadline({
        type: row.type,
        meta: row.meta,
      }),
    })),
    [
      {
        type: "CHAT",
        channel: "CHAT",
        direction: "outbound",
        headline: "Conversation · Chat · Sent",
      },
      {
        type: "CHAT",
        channel: "CHAT",
        direction: "inbound",
        headline: "Conversation · Chat · Received",
      },
      {
        type: "SMS",
        channel: "SMS",
        direction: "outbound",
        headline: "Conversation · SMS · Sent",
      },
      {
        type: "SMS",
        channel: "SMS",
        direction: "inbound",
        headline: "Conversation · SMS · Received",
      },
    ],
  );
}

async function testDuplicateProtection() {
  const db = new FakeActivityDb();
  const first = await record(db, {
    messageId: "msg-same",
    channel: "CHAT",
    direction: "inbound",
  });
  const retry = await record(db, {
    messageId: "msg-same",
    channel: "CHAT",
    direction: "inbound",
    body: "retry must not insert",
  });
  const other = await record(db, {
    messageId: "msg-other",
    channel: "CHAT",
    direction: "inbound",
  });
  assert.equal(first.created, true);
  assert.equal(retry.created, false);
  assert.equal(other.created, true);
  assert.equal(db.creates, 2);
  assert.equal(db.rows[0]?.body, "CHAT inbound");
  assert.equal(db.rows[1]?.meta?.messageId, "msg-other");

  const smsFirst = await recordSmsLeadActivity(db, {
    leadId: "lead-1",
    workspaceId: "ws-1",
    messageId: "sms-same",
    body: "first",
    direction: "outbound",
  });
  const smsRetry = await recordSmsLeadActivity(db, {
    leadId: "lead-1",
    workspaceId: "ws-1",
    messageId: "sms-same",
    body: "second",
    direction: "outbound",
  });
  assert.equal(smsFirst, undefined);
  assert.equal(smsRetry, undefined);
  assert.equal(db.creates, 3);
  assert.equal(
    db.rows.filter((row) => row.meta?.messageId === "sms-same").length,
    1,
  );
}

function testWiringDoesNotDuplicatePaths() {
  const agentSend = read("src/lib/conversations/agent-conversation-send.ts");
  const customerSend = read("src/lib/conversations/customer-conversation.ts");
  const smsSend = read("src/lib/conversations/agent-conversation-sms.ts");
  const inbound = read("src/lib/sms/inbound.ts");
  const persist = read("src/lib/conversations/create-conversation-message.ts");
  const route = read(
    "src/app/api/agent/leads/[id]/conversation/messages/route.ts",
  );

  assert.ok(agentSend.includes("recordConversationLeadActivity"));
  assert.ok(agentSend.includes('channel: "CHAT"'));
  assert.ok(agentSend.includes('direction: "outbound"'));
  assert.equal(agentSend.includes("recordSmsLeadActivity"), false);

  assert.ok(customerSend.includes("recordConversationLeadActivity"));
  assert.ok(customerSend.includes('channel: "CHAT"'));
  assert.ok(customerSend.includes('direction: "inbound"'));

  assert.ok(smsSend.includes("recordSmsLeadActivity"));
  assert.equal(smsSend.includes("recordConversationLeadActivity("), false);
  assert.ok(inbound.includes("recordSmsLeadActivity"));
  assert.equal(inbound.includes("recordConversationLeadActivity("), false);

  assert.ok(persist.includes("Do not write"));
  assert.ok(persist.includes("LeadActivity"));
  assert.equal(persist.includes("recordConversationLeadActivity"), false);
  assert.equal(persist.includes("recordSmsLeadActivity"), false);
  assert.equal(route.includes("leadActivity"), false);
}

async function main() {
  await testFourCombinations();
  await testDuplicateProtection();
  testWiringDoesNotDuplicatePaths();
  console.log("conversation-lead-activity-selftest: ok");
}

void main();
