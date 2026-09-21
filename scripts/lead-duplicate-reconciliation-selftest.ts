/**
 * Duplicate Lead reconciliation — in-memory execute + dry-run ownership rules.
 * Run: pnpm lead-duplicate-reconciliation:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXECUTE_LEAD_DUPLICATE_RECONCILIATION,
  LEAD_DUPLICATE_FK_AUDIT,
  executeLeadDuplicateReconciliation,
  pickCanonicalDuplicateLead,
  planLeadDuplicateReconciliation,
  type LeadDuplicateReconciliationDb,
} from "../src/lib/agent/lead-duplicate-reconciliation";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

type Row = Record<string, unknown> & { id: string };

function collection<T extends Row>(rows: T[]) {
  return {
    rows,
    async findMany(args?: { where?: Record<string, unknown>; select?: unknown }) {
      return filterRows(rows, args?.where);
    },
    async findFirst(args?: { where?: Record<string, unknown> }) {
      return filterRows(rows, args?.where)[0] ?? null;
    },
    async findUnique(args: { where: Record<string, unknown> }) {
      if (args.where.id) return rows.find((row) => row.id === args.where.id) ?? null;
      if (args.where.leadId) {
        return rows.find((row) => row.leadId === args.where.leadId) ?? null;
      }
      return null;
    },
    async count(args?: { where?: Record<string, unknown> }) {
      return filterRows(rows, args?.where).length;
    },
    async update(args: { where: { id?: string; leadId?: string }; data: Record<string, unknown> }) {
      const row = args.where.id
        ? rows.find((item) => item.id === args.where.id)
        : rows.find((item) => item.leadId === args.where.leadId);
      if (row) Object.assign(row, args.data);
      return row;
    },
    async updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }) {
      const matched = filterRows(rows, args.where);
      for (const row of matched) Object.assign(row, args.data);
      return { count: matched.length };
    },
    async delete(args: { where: { id?: string; leadId?: string } }) {
      const idx = rows.findIndex((row) =>
        args.where.id ? row.id === args.where.id : row.leadId === args.where.leadId,
      );
      if (idx >= 0) rows.splice(idx, 1);
    },
    async deleteMany(args: { where: Record<string, unknown> }) {
      const matched = new Set(filterRows(rows, args.where).map((row) => row.id));
      for (let i = rows.length - 1; i >= 0; i--) {
        if (matched.has(rows[i]!.id)) rows.splice(i, 1);
      }
      return { count: matched.size };
    },
  };
}

function filterRows<T extends Record<string, unknown>>(
  rows: T[],
  where?: Record<string, unknown>,
): T[] {
  if (!where) return [...rows];
  return rows.filter((row) => {
    for (const [key, value] of Object.entries(where)) {
      if (value && typeof value === "object" && value !== null && "in" in value) {
        const list = (value as { in: unknown[] }).in;
        if (!list.includes(row[key])) return false;
        continue;
      }
      if (value && typeof value === "object" && value !== null && "notIn" in value) {
        const list = (value as { notIn: unknown[] }).notIn;
        if (list.includes(row[key])) return false;
        continue;
      }
      if (value && typeof value === "object" && value !== null && "not" in value) {
        if (row[key] === (value as { not: unknown }).not) return false;
        continue;
      }
      if (row[key] !== value) return false;
    }
    return true;
  });
}

function testCanonicalIsEarliest() {
  const picked = pickCanonicalDuplicateLead([
    { id: "newer", createdAt: "2026-09-02T00:00:00.000Z" },
    { id: "original", createdAt: "2026-01-01T00:00:00.000Z" },
  ]);
  assert.equal(picked.id, "original");
}

function testFkAuditCoversSchema() {
  const schema = read("prisma/schema.prisma");
  for (const row of LEAD_DUPLICATE_FK_AUDIT) {
    assert.ok(schema.includes(`model ${row.model}`), row.model);
  }
  assert.ok(schema.includes("leadId"));
}

function makeDb() {
  const leads = [
    {
      id: "lead_buyer",
      workspaceId: "ws_a",
      customerId: "cust_omer",
      assignedAgentId: "agent_houzzat",
      source: "SIGNUP" as const,
      status: "ATTEMPTED_CONTACT",
      intent: "BUYER" as const,
      isBuyer: true,
      isSeller: false,
      notes: "Original buyer",
      listingMls: null,
      inquiryTag: null,
      score: 20,
      firstRespondedAt: new Date("2026-01-02"),
      contactConsentAt: new Date("2026-01-01"),
      createdAt: new Date("2026-01-01"),
      assignedAgent: { id: "agent_houzzat", email: "agent@houzzat.ca" },
      customer: { name: "Omer Ali", email: "omer@example.com" },
    },
    {
      id: "lead_seller",
      workspaceId: "ws_a",
      customerId: "cust_omer",
      assignedAgentId: "agent_other",
      source: "HOME_VALUATION" as const,
      status: "NEW_LEAD",
      intent: "SELLER" as const,
      isBuyer: false,
      isSeller: true,
      notes: "Valuation duplicate",
      listingMls: null,
      inquiryTag: null,
      score: 72,
      firstRespondedAt: null,
      contactConsentAt: new Date("2026-09-01"),
      createdAt: new Date("2026-09-01"),
      assignedAgent: { id: "agent_other", email: "other@example.com" },
      customer: { name: "Omer Ali", email: "omer@example.com" },
    },
    {
      id: "lead_other_ws",
      workspaceId: "ws_b",
      customerId: "cust_omer",
      assignedAgentId: "agent_b",
      source: "SIGNUP" as const,
      status: "NEW_LEAD",
      intent: "BUYER" as const,
      isBuyer: true,
      isSeller: false,
      notes: null,
      listingMls: null,
      inquiryTag: null,
      score: 10,
      firstRespondedAt: null,
      contactConsentAt: null,
      createdAt: new Date("2026-02-01"),
      assignedAgent: { id: "agent_b", email: "b@example.com" },
      customer: { name: "Omer Ali", email: "omer@example.com" },
    },
  ];

  const activities = [
    { id: "act1", leadId: "lead_buyer" },
    { id: "act2", leadId: "lead_seller" },
  ];
  const messages = [
    { id: "m1", leadId: "lead_buyer", conversationId: "c_buyer" },
    { id: "m2", leadId: "lead_seller", conversationId: "c_seller" },
  ];
  const conversations = [
    { id: "c_buyer", workspaceId: "ws_a", leadId: "lead_buyer", lastMessageAt: new Date("2026-01-03") },
    { id: "c_seller", workspaceId: "ws_a", leadId: "lead_seller", lastMessageAt: new Date("2026-09-02") },
  ];
  const appointments = [{ id: "a1", leadId: "lead_seller" }];
  const notes = [{ id: "n1", leadId: "lead_seller" }];
  const tasks = [{ id: "t1", leadId: "lead_seller" }];
  const empty: Row[] = [];

  const db = {
    lead: collection(leads as unknown as Row[]),
    leadActivity: collection(activities),
    appointment: collection(appointments),
    viewingTour: collection(empty),
    agentTask: collection(tasks),
    leadNote: collection(notes),
    leadEmailLog: collection(empty),
    cmaReport: collection(empty),
    leadTag: collection(empty),
    leadOrigin: collection(empty),
    leadImportRow: collection(empty),
    conversation: collection(conversations as unknown as Row[]),
    message: collection(messages),
    consentEvent: collection([{ id: "ce1", leadId: "lead_seller" }]),
    referralHandoff: collection(empty),
    smsMassBatchRecipient: collection(empty),
    smsAutomationDispatch: collection(empty),
    outboundSmsDeadLetter: collection(empty),
  };

  return { db: db as unknown as LeadDuplicateReconciliationDb, leads, activities, messages, conversations };
}

async function testDryRunAndExecute() {
  const { db, leads, activities, messages, conversations } = makeDb();
  const plans = await planLeadDuplicateReconciliation(db);
  assert.equal(plans.length, 1, "must not merge across workspaces");
  const plan = plans[0]!;
  assert.equal(plan.canonicalLeadId, "lead_buyer");
  assert.equal(plan.survivingAgentEmail, "agent@houzzat.ca");
  assert.deepEqual(plan.duplicateLeadIds, ["lead_seller"]);
  assert.equal(plan.after.isBuyer, true);
  assert.equal(plan.after.isSeller, true);
  assert.equal(plan.after.source, "SIGNUP");
  assert.equal(plan.after.assignedAgentEmail, "agent@houzzat.ca");
  assert.equal(plan.moves.activities, 1);
  assert.equal(plan.moves.messagesMoved, 1);
  assert.equal(plan.moves.appointments, 1);

  await assert.rejects(
    () =>
      executeLeadDuplicateReconciliation(db, {
        confirm: "nope" as typeof EXECUTE_LEAD_DUPLICATE_RECONCILIATION,
        plans,
      }),
  );

  const executed = await executeLeadDuplicateReconciliation(db, {
    confirm: EXECUTE_LEAD_DUPLICATE_RECONCILIATION,
    plans,
  });
  assert.equal(executed.deletedLeads, 1);
  assert.equal(leads.some((row) => row.id === "lead_seller"), false);
  assert.equal(leads.find((row) => row.id === "lead_buyer")?.assignedAgentId, "agent_houzzat");
  assert.equal(leads.find((row) => row.id === "lead_buyer")?.isBuyer, true);
  assert.equal(leads.find((row) => row.id === "lead_buyer")?.isSeller, true);
  assert.equal(leads.find((row) => row.id === "lead_buyer")?.source, "SIGNUP");
  assert.ok(activities.every((row) => row.leadId === "lead_buyer"));
  assert.ok(messages.every((row) => row.leadId === "lead_buyer"));
  assert.equal(messages.filter((row) => row.conversationId === "c_buyer").length, 2);
  assert.equal(conversations.some((row) => row.id === "c_seller"), false);
  assert.equal(leads.some((row) => row.id === "lead_other_ws"), true);
}

async function main() {
  testCanonicalIsEarliest();
  testFkAuditCoversSchema();
  await testDryRunAndExecute();
  console.log("lead-duplicate-reconciliation-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
