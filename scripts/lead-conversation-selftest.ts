/**
 * Canonical Lead Conversation service — in-memory isolation selftest.
 * Does not connect to production. Does not create production rows.
 * Run: pnpm lead-conversation:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConversationStatus } from "@prisma/client";
import {
  findLeadConversation,
  getOrCreateLeadConversation,
  type LeadConversationDb,
  type LeadConversationRecord,
} from "../src/lib/conversations/lead-conversation";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_tenant_a";
const WS_B = "ws_tenant_b";
const LEAD_A = "lead_in_workspace_a";
const LEAD_MISSING = "lead_does_not_exist";

type FakeLead = { id: string; workspaceId: string };

function uniqueError(): Error & { code: string } {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

function makeConversation(
  workspaceId: string,
  leadId: string,
  id: string,
): LeadConversationRecord {
  const now = new Date("2026-09-17T18:00:00.000Z");
  return {
    id,
    workspaceId,
    leadId,
    status: "OPEN" as ConversationStatus,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    customerLastReadAt: null,
    agentLastReadAt: null,
    agentLastReadByUserId: null,
  };
}

class FakeConversationDb implements LeadConversationDb {
  leads = new Map<string, FakeLead>();
  conversations = new Map<string, LeadConversationRecord>();
  createCalls = 0;
  createPayloads: Array<Record<string, unknown>> = [];
  nextId = 1;

  private leadKey(workspaceId: string, leadId: string) {
    return `${workspaceId}:${leadId}`;
  }

  lead: LeadConversationDb["lead"] = {
    findUnique: async ({ where }) => {
      const pair = where.workspaceId_id;
      if (!pair) return null;
      return this.leads.get(this.leadKey(pair.workspaceId, pair.id)) ?? null;
    },
  };

  conversation: LeadConversationDb["conversation"] = {
    findUnique: async ({ where }) => {
      const pair = where.workspaceId_leadId;
      if (!pair) return null;
      return (
        this.conversations.get(this.leadKey(pair.workspaceId, pair.leadId)) ??
        null
      );
    },
    create: async ({ data }) => {
      const key = this.leadKey(data.workspaceId, data.leadId);
      this.createCalls += 1;
      this.createPayloads.push({ ...data });
      if (this.conversations.has(key)) {
        throw uniqueError();
      }
      const row = makeConversation(
        data.workspaceId,
        data.leadId,
        `conv_${this.nextId++}`,
      );
      this.conversations.set(key, row);
      return row;
    },
  };

  addLead(workspaceId: string, leadId: string) {
    this.leads.set(this.leadKey(workspaceId, leadId), {
      id: leadId,
      workspaceId,
    });
  }
}

function testExistingConversationReturned() {
  const db = new FakeConversationDb();
  db.addLead(WS_A, LEAD_A);
  const existing = makeConversation(WS_A, LEAD_A, "conv_existing");
  db.conversations.set(`${WS_A}:${LEAD_A}`, existing);

  return getOrCreateLeadConversation(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  }).then((result) => {
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.created, false);
    assert.equal(result.conversation.id, "conv_existing");
    assert.equal(db.createCalls, 0);
  });
}

function testMissingConversationLazilyCreated() {
  const db = new FakeConversationDb();
  db.addLead(WS_A, LEAD_A);

  return getOrCreateLeadConversation(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  }).then((result) => {
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.created, true);
    assert.equal(result.conversation.workspaceId, WS_A);
    assert.equal(result.conversation.leadId, LEAD_A);
    assert.equal(result.conversation.status, "OPEN");
    assert.equal(db.createCalls, 1);
    assert.equal(db.conversations.size, 1);
  });
}

function testSecondGetOrCreateReturnsSameConversation() {
  const db = new FakeConversationDb();
  db.addLead(WS_A, LEAD_A);

  return getOrCreateLeadConversation(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  }).then((first) => {
    assert.equal(first.ok, true);
    if (!first.ok) return;
    return getOrCreateLeadConversation(db, {
      workspaceId: WS_A,
      leadId: LEAD_A,
    }).then((second) => {
      assert.equal(second.ok, true);
      if (!second.ok) return;
      assert.equal(second.created, false);
      assert.equal(second.conversation.id, first.conversation.id);
      assert.equal(db.createCalls, 1);
      assert.equal(db.conversations.size, 1);
    });
  });
}

function testWrongWorkspaceCannotAccessOrCreate() {
  const db = new FakeConversationDb();
  db.addLead(WS_A, LEAD_A);

  return getOrCreateLeadConversation(db, {
    workspaceId: WS_B,
    leadId: LEAD_A,
  }).then((result) => {
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "LEAD_NOT_IN_WORKSPACE");
    assert.equal(db.createCalls, 0);
    assert.equal(db.conversations.size, 0);
  });
}

function testNonexistentLeadRejected() {
  const db = new FakeConversationDb();

  return getOrCreateLeadConversation(db, {
    workspaceId: WS_A,
    leadId: LEAD_MISSING,
  }).then((result) => {
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "LEAD_NOT_IN_WORKSPACE");
    assert.equal(db.createCalls, 0);
  });
}

function testLegacyLeadWithoutWorkspaceRejected() {
  const db = new FakeConversationDb();
  db.lead.findUnique = async () => ({ id: LEAD_A, workspaceId: null as unknown as string });

  return getOrCreateLeadConversation(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  }).then((result) => {
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "LEAD_NOT_IN_WORKSPACE");
    assert.equal(db.createCalls, 0);
  });
}

function testReadOnlyLookupDoesNotCreate() {
  const db = new FakeConversationDb();
  db.addLead(WS_A, LEAD_A);

  return findLeadConversation(db, { workspaceId: WS_A, leadId: LEAD_A }).then(
    (missing) => {
      assert.equal(missing, null);
      assert.equal(db.createCalls, 0);
      const existing = makeConversation(WS_A, LEAD_A, "conv_ro");
      db.conversations.set(`${WS_A}:${LEAD_A}`, existing);
      return findLeadConversation(db, {
        workspaceId: WS_A,
        leadId: LEAD_A,
      }).then((found) => {
        assert.equal(found?.id, "conv_ro");
        assert.equal(db.createCalls, 0);
      });
    },
  );
}

function testReadOnlyWrongWorkspaceIsNull() {
  const db = new FakeConversationDb();
  db.addLead(WS_A, LEAD_A);
  db.conversations.set(
    `${WS_A}:${LEAD_A}`,
    makeConversation(WS_A, LEAD_A, "conv_a"),
  );

  return findLeadConversation(db, { workspaceId: WS_B, leadId: LEAD_A }).then(
    (row) => {
      assert.equal(row, null);
    },
  );
}

function testNoAgentOwnershipOnCreate() {
  const db = new FakeConversationDb();
  db.addLead(WS_A, LEAD_A);

  return getOrCreateLeadConversation(db, {
    workspaceId: WS_A,
    leadId: LEAD_A,
  }).then((result) => {
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const payload = db.createPayloads[0];
    assert.ok(payload);
    assert.equal("assignedAgentId" in payload, false);
    assert.equal(result.conversation.agentLastReadByUserId, null);
  });
}

function testInvalidInputRejected() {
  const db = new FakeConversationDb();
  db.addLead(WS_A, LEAD_A);

  return Promise.all([
    getOrCreateLeadConversation(db, { workspaceId: "", leadId: LEAD_A }),
    getOrCreateLeadConversation(db, { workspaceId: WS_A, leadId: "  " }),
  ]).then(([emptyWs, emptyLead]) => {
    assert.equal(emptyWs.ok, false);
    assert.equal(emptyLead.ok, false);
    if (!emptyWs.ok) assert.equal(emptyWs.reason, "INVALID_INPUT");
    if (!emptyLead.ok) assert.equal(emptyLead.reason, "INVALID_INPUT");
    assert.equal(db.createCalls, 0);
  });
}

function testUniqueRaceRecoversExistingConversation() {
  const db = new FakeConversationDb();
  db.addLead(WS_A, LEAD_A);

  return Promise.all([
    getOrCreateLeadConversation(db, { workspaceId: WS_A, leadId: LEAD_A }),
    getOrCreateLeadConversation(db, { workspaceId: WS_A, leadId: LEAD_A }),
  ]).then(([a, b]) => {
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (!a.ok || !b.ok) return;
    assert.equal(a.conversation.id, b.conversation.id);
    assert.equal(db.conversations.size, 1);
    const createdFlags = [a.created, b.created];
    assert.ok(createdFlags.includes(true));
    assert.ok(createdFlags.includes(false) || db.createCalls === 1);
  });
}

function testServiceNotWiredIntoProductPaths() {
  const service = read("src/lib/conversations/lead-conversation.ts");
  assert.ok(service.includes("getOrCreateLeadConversation"));
  assert.ok(service.includes("findLeadConversation"));
  assert.ok(service.includes("AUTHORIZATION BOUNDARY"));
  assert.ok(service.includes("workspaceId_id"));
  assert.ok(service.includes("workspaceId_leadId"));
  assert.ok(!service.includes("prisma.leadActivity"));
  assert.ok(!service.includes("assignedAgentId:"));
  assert.ok(!service.includes("where: { id: ids.leadId }"));
  assert.ok(!service.includes("where: { id: input.leadId }"));

  const callers = [
    "src/app/api/leads/route.ts",
    "src/lib/agent/lead-intake.ts",
    "src/app/api/agent/leads/route.ts",
    "src/app/api/agent/email/route.ts",
    "src/app/api/agent/appointments/route.ts",
    "src/lib/notifications.ts",
  ];
  for (const rel of callers) {
    const src = read(rel);
    assert.ok(
      !src.includes("getOrCreateLeadConversation"),
      `${rel} must not call conversation service yet`,
    );
    assert.ok(
      !src.includes("findLeadConversation"),
      `${rel} must not call conversation lookup yet`,
    );
  }
}

async function main() {
  await testExistingConversationReturned();
  await testMissingConversationLazilyCreated();
  await testSecondGetOrCreateReturnsSameConversation();
  await testWrongWorkspaceCannotAccessOrCreate();
  await testNonexistentLeadRejected();
  await testLegacyLeadWithoutWorkspaceRejected();
  await testReadOnlyLookupDoesNotCreate();
  await testReadOnlyWrongWorkspaceIsNull();
  await testNoAgentOwnershipOnCreate();
  await testInvalidInputRejected();
  await testUniqueRaceRecoversExistingConversation();
  testServiceNotWiredIntoProductPaths();
  console.log("lead-conversation:selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
