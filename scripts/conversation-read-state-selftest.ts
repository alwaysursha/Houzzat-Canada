/**
 * Canonical Conversation read/unread service — in-memory selftest.
 * Does not connect to production. Does not create production rows.
 * Run: pnpm conversation-read-state:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConversationStatus, MessageKind, MessageSenderKind } from "@prisma/client";
import type { LeadConversationRecord } from "../src/lib/conversations/lead-conversation";
import {
  getConversationUnreadState,
  markConversationReadByAgent,
  markConversationReadByCustomer,
  type ConversationReadMessage,
  type ConversationReadStateDb,
} from "../src/lib/conversations/read-state";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_tenant_a";
const WS_B = "ws_tenant_b";
const LEAD_A = "lead_in_workspace_a";
const AGENT_A = "user_agent_a";
const AGENT_B = "user_agent_b";
const ADMIN_A = "user_admin_a";
const CUSTOMER_A = "user_customer_a";

const T0 = new Date("2024-01-01T00:00:00.000Z");
const T1 = new Date("2025-06-01T00:00:00.000Z");
const T_ASSIGN = new Date("2026-09-01T12:00:00.000Z");
const T_CARD_1 = new Date("2026-09-01T12:00:01.000Z");
const T_CARD_2 = new Date("2026-09-10T12:00:00.000Z");
const T_AFTER = new Date("2026-09-17T15:00:00.000Z");
const T_LATER = new Date("2026-09-17T16:00:00.000Z");
const LEAD_OTHER = "lead_other";

type FakeLeadActivity = {
  id: string;
  leadId: string;
  type: string;
  createdAt: Date;
  body: string | null;
};

class FakeReadDb implements ConversationReadStateDb {
  leads = new Map<
    string,
    { workspaceId: string; assignedAgentId: string | null; updatedAt: Date }
  >();
  conversations = new Map<string, LeadConversationRecord>();
  messages: Array<
    ConversationReadMessage & {
      workspaceId: string;
      conversationId: string;
      leadId: string;
    }
  > = [];
  activities: FakeLeadActivity[] = [];
  conversationCreates = 0;
  messageCreates = 0;
  nextMessageId = 1;
  nextActivityId = 1;

  private leadKey(workspaceId: string, leadId: string) {
    return `${workspaceId}:${leadId}`;
  }

  seedLead(
    workspaceId: string,
    leadId: string,
    assignedAgentId: string | null,
    updatedAt: Date,
  ) {
    this.leads.set(this.leadKey(workspaceId, leadId), {
      workspaceId,
      assignedAgentId,
      updatedAt,
    });
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

  addMessage(input: {
    conversationId: string;
    workspaceId?: string;
    leadId?: string;
    createdAt: Date;
    senderKind: MessageSenderKind;
    senderUserId?: string | null;
    deletedAt?: Date | null;
    kind?: MessageKind;
    payload?: ConversationReadMessage["payload"];
    providerStatus?: string | null;
    deliveredAt?: Date | null;
    twilioMessageSid?: string | null;
    id?: string;
  }) {
    const row = {
      id: input.id ?? `msg_${this.nextMessageId++}`,
      workspaceId: input.workspaceId ?? WS_A,
      conversationId: input.conversationId,
      leadId: input.leadId ?? LEAD_A,
      createdAt: input.createdAt,
      senderKind: input.senderKind,
      senderUserId: input.senderUserId ?? null,
      deletedAt: input.deletedAt ?? null,
      kind: input.kind ?? ("TEXT" as MessageKind),
      payload: input.payload ?? null,
      providerStatus: input.providerStatus ?? null,
      deliveredAt: input.deliveredAt ?? null,
      twilioMessageSid: input.twilioMessageSid ?? null,
    };
    this.messages.push(row);
    this.messageCreates += 1;
    return row;
  }

  seedActivity(input: {
    leadId: string;
    type: string;
    createdAt: Date;
    body?: string | null;
    id?: string;
  }) {
    const row: FakeLeadActivity = {
      id: input.id ?? `act_${this.nextActivityId++}`,
      leadId: input.leadId,
      type: input.type,
      createdAt: input.createdAt,
      body: input.body ?? null,
    };
    this.activities.push(row);
    return row;
  }

  bumpLeadUpdatedAt(workspaceId: string, leadId: string, updatedAt: Date) {
    const row = this.leads.get(this.leadKey(workspaceId, leadId));
    if (!row) throw new Error("missing lead");
    row.updatedAt = updatedAt;
  }

  lead: ConversationReadStateDb["lead"] = {
    findUnique: async ({ where }) => {
      const pair = where.workspaceId_id;
      if (!pair) return null;
      const row = this.leads.get(this.leadKey(pair.workspaceId, pair.id));
      if (!row) return null;
      return {
        assignedAgentId: row.assignedAgentId,
        updatedAt: row.updatedAt,
        workspaceId: row.workspaceId,
      };
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
      return null;
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
      Object.assign(row, data);
      this.conversations.set(this.leadKey(row.workspaceId, row.leadId), row);
      return { ...row };
    },
  };

  message = {
    findMany: async ({
      where,
      orderBy,
    }: {
      where: { workspaceId?: string; conversationId?: string };
      orderBy?: { createdAt?: "asc" | "desc" };
    }) => {
      const rows = this.messages.filter(
        (row) =>
          row.workspaceId === where.workspaceId &&
          row.conversationId === where.conversationId,
      );
      rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      if (orderBy?.createdAt === "desc") rows.reverse();
      return rows;
    },
    findFirst: async ({
      where,
      orderBy,
    }: {
      where: { workspaceId?: string; conversationId?: string };
      orderBy?: { createdAt?: "asc" | "desc" };
    }) => {
      const rows = await this.message.findMany({ where, orderBy });
      return rows[0] ?? null;
    },
  };

  leadActivity = {
    findFirst: async ({
      where,
      orderBy,
    }: {
      where: { leadId?: string; type?: { in?: string[] } | string };
      orderBy?: { createdAt?: "asc" | "desc" };
    }) => {
      const allowed =
        typeof where.type === "string"
          ? [where.type]
          : where.type?.in ?? null;
      const rows = this.activities.filter((row) => {
        if (where.leadId && row.leadId !== where.leadId) return false;
        if (allowed && !allowed.includes(row.type)) return false;
        return true;
      });
      rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      if (orderBy?.createdAt === "desc") rows.reverse();
      const row = rows[0];
      return row ? { id: row.id, createdAt: row.createdAt } : null;
    },
  };
}

function baseSetup(assignedAgentId: string, updatedAt: Date) {
  const db = new FakeReadDb();
  db.seedLead(WS_A, LEAD_A, assignedAgentId, updatedAt);
  const conversation = db.seedConversation({
    id: "conv_a",
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  return { db, conversation };
}

function seedAssignmentActivity(
  db: FakeReadDb,
  createdAt: Date = T_ASSIGN,
  type = "reassigned",
) {
  return db.seedActivity({
    leadId: LEAD_A,
    type,
    createdAt,
    body: "updated",
  });
}

async function testMatchingCursorOnlyLaterIncomingUnread() {
  const { db, conversation } = baseSetup(AGENT_A, T_ASSIGN);
  conversation.agentLastReadAt = T1;
  conversation.agentLastReadByUserId = AGENT_A;
  db.addMessage({
    conversationId: conversation.id,
    createdAt: T0,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  db.addMessage({
    conversationId: conversation.id,
    createdAt: T_AFTER,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  const state = await getConversationUnreadState(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  assert.equal(state.agentCursorValid, true);
  assert.equal(state.agentCutoff.mode, "matching");
  assert.equal(state.agentUnreadCount, 1);
}

async function testAgentOwnSendsExcluded() {
  const { db, conversation } = baseSetup(AGENT_A, T_ASSIGN);
  conversation.agentLastReadAt = T1;
  conversation.agentLastReadByUserId = AGENT_A;
  db.addMessage({
    conversationId: conversation.id,
    createdAt: T_AFTER,
    senderKind: "AGENT",
    senderUserId: AGENT_A,
  });
  db.addMessage({
    conversationId: conversation.id,
    createdAt: T_LATER,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  const state = await getConversationUnreadState(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  assert.equal(state.agentUnreadCount, 1);
  assert.equal(state.agentDividerMessageId?.startsWith("msg_"), true);
}

async function testMismatchedCursorDoesNotInherit() {
  const { db, conversation } = baseSetup(AGENT_B, T_ASSIGN);
  conversation.agentLastReadAt = T_LATER;
  conversation.agentLastReadByUserId = AGENT_A;
  seedAssignmentActivity(db, T_ASSIGN);
  db.addMessage({
    conversationId: conversation.id,
    createdAt: T0,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  db.addMessage({
    conversationId: conversation.id,
    createdAt: T_AFTER,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  const state = await getConversationUnreadState(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  assert.equal(state.agentCursorValid, false);
  assert.equal(state.agentCutoff.mode, "assignment_activity");
  assert.equal(state.agentUnreadCount, 1);
}

async function testLatestAssignmentCardWatermark() {
  const { db, conversation } = baseSetup(AGENT_B, T_ASSIGN);
  conversation.agentLastReadByUserId = AGENT_A;
  conversation.agentLastReadAt = T0;
  seedAssignmentActivity(db, T_ASSIGN);
  db.addMessage({
    conversationId: conversation.id,
    createdAt: T0,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  const card = db.addMessage({
    conversationId: conversation.id,
    createdAt: T_CARD_2,
    senderKind: "SYSTEM",
    kind: "SYSTEM_CARD",
    payload: { card: "REASSIGNED", toAgentId: AGENT_B },
  });
  db.addMessage({
    conversationId: conversation.id,
    createdAt: T_LATER,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  const state = await getConversationUnreadState(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  assert.equal(state.agentCutoff.mode, "assignment_card");
  if (state.agentCutoff.mode === "assignment_card") {
    assert.equal(state.agentCutoff.cardMessageId, card.id);
  }
  assert.equal(state.agentUnreadCount, 2);
  assert.equal(state.agentDividerMessageId, card.id);
}

async function testTwoReassignmentCardsUseLatest() {
  const { db, conversation } = baseSetup(AGENT_B, T_ASSIGN);
  conversation.agentLastReadByUserId = AGENT_A;
  db.addMessage({
    conversationId: conversation.id,
    createdAt: T_CARD_1,
    senderKind: "SYSTEM",
    kind: "SYSTEM_CARD",
    payload: { card: "REASSIGNED" },
  });
  const laterCard = db.addMessage({
    conversationId: conversation.id,
    createdAt: T_CARD_2,
    senderKind: "SYSTEM",
    kind: "SYSTEM_CARD",
    payload: { card: "ASSIGNED" },
  });
  db.addMessage({
    conversationId: conversation.id,
    createdAt: new Date("2026-09-05T00:00:00.000Z"),
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  const state = await getConversationUnreadState(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  assert.equal(state.agentCutoff.mode, "assignment_card");
  if (state.agentCutoff.mode === "assignment_card") {
    assert.equal(state.agentCutoff.cardMessageId, laterCard.id);
  }
  assert.equal(state.agentUnreadCount, 1);
  assert.equal(state.agentDividerMessageId, laterCard.id);
}

async function testYearsOfEarlierMessagesNotUnread() {
  const { db, conversation } = baseSetup(AGENT_B, T_ASSIGN);
  conversation.agentLastReadByUserId = AGENT_A;
  db.addMessage({
    conversationId: conversation.id,
    createdAt: T0,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  db.addMessage({
    conversationId: conversation.id,
    createdAt: T1,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  db.addMessage({
    conversationId: conversation.id,
    createdAt: T_CARD_2,
    senderKind: "SYSTEM",
    kind: "SYSTEM_CARD",
    payload: { card: "REASSIGNED" },
  });
  const state = await getConversationUnreadState(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  assert.equal(state.agentUnreadCount, 1);
}

async function testMissingCardFallbackDoesNotExposeHistory() {
  const { db, conversation } = baseSetup(AGENT_B, T_ASSIGN);
  conversation.agentLastReadByUserId = AGENT_A;
  conversation.agentLastReadAt = T0;
  const activity = seedAssignmentActivity(db, T_ASSIGN);
  db.addMessage({
    conversationId: conversation.id,
    createdAt: T0,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  db.addMessage({
    conversationId: conversation.id,
    createdAt: T1,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  const state = await getConversationUnreadState(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  assert.equal(state.agentCutoff.mode, "assignment_activity");
  if (state.agentCutoff.mode === "assignment_activity") {
    assert.equal(state.agentCutoff.activityId, activity.id);
    assert.deepEqual(state.agentCutoff.exclusiveAfter, T_ASSIGN);
  }
  assert.equal(state.agentUnreadCount, 0);
}

async function testMessageAfterMissingCardFallbackIsUnread() {
  const { db, conversation } = baseSetup(AGENT_B, T_ASSIGN);
  conversation.agentLastReadByUserId = AGENT_A;
  seedAssignmentActivity(db, T_ASSIGN);
  db.addMessage({
    conversationId: conversation.id,
    createdAt: T0,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  const newer = db.addMessage({
    conversationId: conversation.id,
    createdAt: T_AFTER,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  const state = await getConversationUnreadState(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  assert.equal(state.agentCutoff.mode, "assignment_activity");
  assert.equal(state.agentUnreadCount, 1);
  assert.equal(state.agentDividerMessageId, newer.id);
}

async function testUnrelatedLeadUpdateCannotHideUnread() {
  const { db, conversation } = baseSetup(AGENT_B, T_ASSIGN);
  conversation.agentLastReadByUserId = AGENT_A;
  seedAssignmentActivity(db, T_ASSIGN);
  const unread = db.addMessage({
    conversationId: conversation.id,
    createdAt: T_AFTER,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  db.bumpLeadUpdatedAt(WS_A, LEAD_A, T_LATER);
  const state = await getConversationUnreadState(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  assert.equal(state.agentCutoff.mode, "assignment_activity");
  assert.equal(state.agentUnreadCount, 1);
  assert.equal(state.agentDividerMessageId, unread.id);
}

async function testNoAssignmentEventFallbackIsConservative() {
  const { db, conversation } = baseSetup(AGENT_B, T_ASSIGN);
  conversation.agentLastReadByUserId = AGENT_A;
  conversation.agentLastReadAt = T_LATER;
  db.seedActivity({
    leadId: LEAD_A,
    type: "note",
    createdAt: T_LATER,
    body: "status note",
  });
  db.seedActivity({
    leadId: LEAD_A,
    type: "status_change",
    createdAt: T_LATER,
    body: "updated",
  });
  db.addMessage({
    conversationId: conversation.id,
    createdAt: T0,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  const later = db.addMessage({
    conversationId: conversation.id,
    createdAt: T_AFTER,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  db.bumpLeadUpdatedAt(WS_A, LEAD_A, T_LATER);
  const state = await getConversationUnreadState(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  assert.equal(state.agentCutoff.mode, "conservative_unanchored");
  assert.equal(state.agentUnreadCount, 2);
  assert.notEqual(state.agentDividerMessageId, later.id);
  assert.equal(state.agentDividerMessageId, "msg_1");
}

async function testForeignLeadActivityIsIgnored() {
  const { db, conversation } = baseSetup(AGENT_B, T_ASSIGN);
  conversation.agentLastReadByUserId = AGENT_A;
  db.seedActivity({
    leadId: LEAD_OTHER,
    type: "reassigned",
    createdAt: T_ASSIGN,
  });
  db.addMessage({
    conversationId: conversation.id,
    createdAt: T0,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  const state = await getConversationUnreadState(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  assert.equal(state.agentCutoff.mode, "conservative_unanchored");
  assert.equal(state.agentUnreadCount, 1);
}

async function testLatestAssignmentClassActivityIsUsed() {
  const { db, conversation } = baseSetup(AGENT_B, T_ASSIGN);
  conversation.agentLastReadByUserId = AGENT_A;
  db.seedActivity({
    leadId: LEAD_A,
    type: "assigned",
    createdAt: T0,
  });
  const latest = db.seedActivity({
    leadId: LEAD_A,
    type: "claimed",
    createdAt: T_ASSIGN,
  });
  db.seedActivity({
    leadId: LEAD_A,
    type: "unassigned",
    createdAt: T_LATER,
  });
  db.addMessage({
    conversationId: conversation.id,
    createdAt: T1,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  const unread = db.addMessage({
    conversationId: conversation.id,
    createdAt: T_AFTER,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  const state = await getConversationUnreadState(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  assert.equal(state.agentCutoff.mode, "assignment_activity");
  if (state.agentCutoff.mode === "assignment_activity") {
    assert.equal(state.agentCutoff.activityId, latest.id);
  }
  assert.equal(state.agentUnreadCount, 1);
  assert.equal(state.agentDividerMessageId, unread.id);
}

async function testCurrentAgentCanMarkRead() {
  const { db, conversation } = baseSetup(AGENT_A, T_ASSIGN);
  const latest = db.addMessage({
    conversationId: conversation.id,
    createdAt: T_AFTER,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  const result = await markConversationReadByAgent(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
    agentUserId: AGENT_A,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.conversation.agentLastReadByUserId, AGENT_A);
  assert.deepEqual(result.conversation.agentLastReadAt, latest.createdAt);
}

async function testWrongAgentCannotMarkRead() {
  const { db } = baseSetup(AGENT_A, T_ASSIGN);
  const result = await markConversationReadByAgent(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
    agentUserId: AGENT_B,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "NOT_CURRENT_ASSIGNEE");
}

async function testAdminCannotMutateAgentCursor() {
  const { db, conversation } = baseSetup(AGENT_A, T_ASSIGN);
  conversation.agentLastReadByUserId = AGENT_A;
  conversation.agentLastReadAt = T1;
  const result = await markConversationReadByAgent(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
    agentUserId: ADMIN_A,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "NOT_CURRENT_ASSIGNEE");
  assert.equal(conversation.agentLastReadByUserId, AGENT_A);
  assert.deepEqual(conversation.agentLastReadAt, T1);
}

async function testCustomerUnreadExcludesOwnSends() {
  const { db, conversation } = baseSetup(AGENT_A, T_ASSIGN);
  conversation.customerLastReadAt = T1;
  db.addMessage({
    conversationId: conversation.id,
    createdAt: T_AFTER,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  db.addMessage({
    conversationId: conversation.id,
    createdAt: T_LATER,
    senderKind: "AGENT",
    senderUserId: AGENT_A,
  });
  const state = await getConversationUnreadState(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  assert.equal(state.customerUnreadCount, 1);
}

async function testCustomerMarkRead() {
  const { db, conversation } = baseSetup(AGENT_A, T_ASSIGN);
  const latest = db.addMessage({
    conversationId: conversation.id,
    createdAt: T_AFTER,
    senderKind: "AGENT",
    senderUserId: AGENT_A,
  });
  const result = await markConversationReadByCustomer(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.conversation.customerLastReadAt, latest.createdAt);
  const state = await getConversationUnreadState(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  assert.equal(state.customerUnreadCount, 0);
}

async function testDeletedMessageNotInBadgeButOrdered() {
  const { db, conversation } = baseSetup(AGENT_A, T_ASSIGN);
  conversation.agentLastReadAt = T1;
  conversation.agentLastReadByUserId = AGENT_A;
  const tombstone = db.addMessage({
    conversationId: conversation.id,
    createdAt: T_AFTER,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
    deletedAt: T_LATER,
  });
  db.addMessage({
    conversationId: conversation.id,
    createdAt: T_LATER,
    senderKind: "CUSTOMER",
    senderUserId: CUSTOMER_A,
  });
  const state = await getConversationUnreadState(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  assert.equal(state.agentUnreadCount, 1);
  assert.equal(state.agentDividerMessageId, tombstone.id);
}

async function testMarkReadDoesNotTouchTwilioFields() {
  const { db, conversation } = baseSetup(AGENT_A, T_ASSIGN);
  const sms = db.addMessage({
    conversationId: conversation.id,
    createdAt: T_AFTER,
    senderKind: "CUSTOMER",
    senderUserId: null,
    providerStatus: "delivered",
    deliveredAt: T_AFTER,
    twilioMessageSid: "SM_KEEP",
  });
  await markConversationReadByAgent(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
    agentUserId: AGENT_A,
  });
  assert.equal(sms.providerStatus, "delivered");
  assert.deepEqual(sms.deliveredAt, T_AFTER);
  assert.equal(sms.twilioMessageSid, "SM_KEEP");
}

async function testUnreadLookupCreatesNothing() {
  const db = new FakeReadDb();
  db.seedLead(WS_A, LEAD_A, AGENT_A, T_ASSIGN);
  const before = db.conversationCreates;
  const state = await getConversationUnreadState(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  });
  assert.equal(state.conversation, null);
  assert.equal(db.conversationCreates, before);
  assert.equal(db.messageCreates, 0);
}

async function testWrongWorkspaceLead() {
  const { db } = baseSetup(AGENT_A, T_ASSIGN);
  const state = await getConversationUnreadState(db, {
    workspaceId: WS_B,
    leadId: LEAD_A,
  });
  assert.equal(state.conversation, null);
  const marked = await markConversationReadByAgent(db, {
    workspaceId: WS_B,
    leadId: LEAD_A,
    agentUserId: AGENT_A,
  });
  assert.equal(marked.ok, false);
  if (!marked.ok) assert.equal(marked.reason, "LEAD_NOT_IN_WORKSPACE");
}

function testNotWired() {
  const callers = [
    "src/app/api/leads/route.ts",
    "src/lib/agent/lead-intake.ts",
    "src/app/api/agent/leads/route.ts",
    "src/lib/notifications.ts",
  ];
  for (const rel of callers) {
    const src = read(rel);
    assert.ok(!src.includes("getConversationUnreadState"));
    assert.ok(!src.includes("markConversationReadByAgent"));
  }
}

function testFallbackSourceContract() {
  const src = read("src/lib/conversations/read-state.ts");
  assert.ok(!src.includes("lead_updated_fallback"));
  assert.ok(!src.includes("updatedAt: true"));
  assert.ok(!src.includes("loaded.lead.updatedAt"));
  assert.ok(src.includes("assignment_activity"));
  assert.ok(src.includes("conservative_unanchored"));
  assert.ok(src.includes('"assigned"'));
  assert.ok(src.includes('"reassigned"'));
  assert.ok(src.includes('"claimed"'));
  assert.ok(src.includes("workspaceId_id"));
}

async function main() {
  await testMatchingCursorOnlyLaterIncomingUnread();
  await testAgentOwnSendsExcluded();
  await testMismatchedCursorDoesNotInherit();
  await testLatestAssignmentCardWatermark();
  await testTwoReassignmentCardsUseLatest();
  await testYearsOfEarlierMessagesNotUnread();
  await testMissingCardFallbackDoesNotExposeHistory();
  await testMessageAfterMissingCardFallbackIsUnread();
  await testUnrelatedLeadUpdateCannotHideUnread();
  await testNoAssignmentEventFallbackIsConservative();
  await testForeignLeadActivityIsIgnored();
  await testLatestAssignmentClassActivityIsUsed();
  await testCurrentAgentCanMarkRead();
  await testWrongAgentCannotMarkRead();
  await testAdminCannotMutateAgentCursor();
  await testCustomerUnreadExcludesOwnSends();
  await testCustomerMarkRead();
  await testDeletedMessageNotInBadgeButOrdered();
  await testMarkReadDoesNotTouchTwilioFields();
  await testUnreadLookupCreatesNothing();
  await testWrongWorkspaceLead();
  testNotWired();
  testFallbackSourceContract();
  console.log("conversation-read-state:selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
