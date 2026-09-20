/**
 * Agent individual SMS, Quick Texts, and SMS usage/allowance foundation.
 * Run: pnpm sms-agent-individual-quick-texts-usage:selftest
 *
 * No production writes. No Mass SMS. No automation trigger wiring. No deploy.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PlanCode } from "@prisma/client";
import { evaluateAgentSmsEligibility } from "../src/lib/conversations/agent-conversation-sms";
import { smsQuickTextContextFromLead } from "../src/lib/conversations/sms-quick-texts";
import {
  createSmsQuickText,
  ensureSmsQuickTextCatalog,
  listActiveSmsQuickTexts,
  updateSmsQuickText,
  type SmsQuickTextDb,
  type SmsQuickTextRow,
} from "../src/lib/platform/sms-quick-texts";
import { SmsQuickTextActionError } from "../src/lib/platform/sms-quick-texts/errors";
import { SMS_QUICK_TEXT_CATALOG } from "../src/lib/sms/quick-texts/catalog";
import {
  renderSmsQuickText,
  validateSmsQuickTextBody,
} from "../src/lib/sms/quick-texts/render";
import { estimateSmsSegmentCount } from "../src/lib/sms/segments";
import {
  evaluateSmsAllowance,
  finalizeSmsUsageFromProvider,
  hasSmsUsageDelegate,
  inspectSmsAllowance,
  recordSmsUsageEvent,
  resolveIncludedSmsSegments,
  resolveSmsUsagePeriod,
  type SmsUsageDb,
  type SmsUsageEventRow,
} from "../src/lib/sms/usage";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

class FakeQuickTextDb implements SmsQuickTextDb {
  rows = new Map<string, SmsQuickTextRow>();
  next = 1;

  smsQuickText: SmsQuickTextDb["smsQuickText"] = {
    findUnique: async ({ where }) => {
      if ("key" in where) {
        return (
          [...this.rows.values()].find((row) => row.key === where.key) ?? null
        );
      }
      return this.rows.get(where.id) ?? null;
    },
    findMany: async (args) => {
      const where = (args as { where?: { active?: boolean } } | undefined)?.where;
      let rows = [...this.rows.values()];
      if (where?.active != null) {
        rows = rows.filter((row) => row.active === where.active);
      }
      return rows.sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
    },
    create: async ({ data }) => {
      const now = new Date("2026-09-20T12:00:00.000Z");
      const row: SmsQuickTextRow = {
        id: data.id ?? `qt_${this.next++}`,
        key: data.key,
        name: data.name,
        category: data.category,
        body: data.body,
        sortOrder: data.sortOrder,
        active: data.active,
        allowedVariables: [...data.allowedVariables],
        createdAt: now,
        updatedAt: now,
        createdByOperatorId: data.createdByOperatorId,
        updatedByOperatorId: data.updatedByOperatorId,
      };
      this.rows.set(row.id, row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = this.rows.get(where.id);
      if (!row) throw new Error("missing quick text");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  };
}

class FakeUsageDb implements SmsUsageDb {
  events: SmsUsageEventRow[] = [];
  next = 1;
  currentSubscriptionId: string | null = "sub_1";
  plan: {
    planCode: PlanCode | null;
    entitlementProfileCode: string | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
  } | null = {
    planCode: "TEAM",
    entitlementProfileCode: "TEAM",
    currentPeriodStart: new Date("2026-09-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
  };

  workspace: NonNullable<SmsUsageDb["workspace"]> = {
    findUnique: async ({ where }) =>
      where.id
        ? { currentSubscriptionId: this.currentSubscriptionId }
        : null,
  };

  subscription: NonNullable<SmsUsageDb["subscription"]> = {
    findUnique: async () => this.plan,
  };

  smsUsageEvent: SmsUsageDb["smsUsageEvent"] = {
    findUnique: async ({ where }) =>
      this.events.find((row) => row.twilioMessageSid === where.twilioMessageSid) ??
      null,
    findMany: async ({ where }) =>
      this.events.filter(
        (row) =>
          row.workspaceId === where.workspaceId &&
          row.periodStart.getTime() === where.periodStart.getTime() &&
          row.periodEnd.getTime() === where.periodEnd.getTime(),
      ),
    create: async ({ data }) => {
      const now = new Date("2026-09-20T12:00:00.000Z");
      const row: SmsUsageEventRow = {
        id: data.id ?? `use_${this.next++}`,
        workspaceId: data.workspaceId,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        category: data.category,
        recipientType: data.recipientType,
        twilioMessageSid: data.twilioMessageSid,
        messageId: data.messageId,
        segmentCount: data.segmentCount,
        segmentCountSource: data.segmentCountSource,
        finalized: data.finalized,
        createdAt: now,
        updatedAt: now,
      };
      this.events.push(row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = this.events.find((item) => item.id === where.id);
      if (!row) throw new Error("missing usage");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  };
}

function testQuickTextCatalogAndRender() {
  assert.equal(SMS_QUICK_TEXT_CATALOG.length, 5);
  assert.deepEqual(
    SMS_QUICK_TEXT_CATALOG.map((row) => row.name),
    [
      "New Lead Introduction",
      "Still Looking?",
      "Viewing Help",
      "Need More Options?",
      "Quick Follow-Up",
    ],
  );
  const context = smsQuickTextContextFromLead({
    leadName: "Jordan Customer",
    agentName: "Alex Agent",
    workspaceName: "Houzzat",
    propertyAddress: "123 King St W",
  });
  const rendered = renderSmsQuickText(
    "Hi {{firstName}}, it's {{agentName}} at {{workspaceName}}.",
    context,
  );
  assert.equal(rendered, "Hi Jordan, it's Alex Agent at Houzzat.");
  assert.equal(rendered.includes("{{"), false);
  assert.equal(validateSmsQuickTextBody("Hi {{firstName}}").ok, true);
  const unknown = validateSmsQuickTextBody("Hi {{notAVar}}");
  assert.equal(unknown.ok, false);
  const notAllowed = validateSmsQuickTextBody("Open {{leadProfileUrl}}", [
    "firstName",
  ]);
  assert.equal(notAllowed.ok, false);
}

async function testQuickTextActiveInactiveAndTenantGlobal() {
  const db = new FakeQuickTextDb();
  await ensureSmsQuickTextCatalog(db);
  const again = await ensureSmsQuickTextCatalog(db);
  assert.equal(again.createdKeys.length, 0);
  assert.equal(db.rows.size, 5);
  const active = await listActiveSmsQuickTexts(db);
  assert.equal(active.length, 5);
  const first = [...db.rows.values()][0];
  assert.ok(first);
  await updateSmsQuickText({
    db,
    operatorId: "op_1",
    id: first.id,
    active: false,
  });
  const after = await listActiveSmsQuickTexts(db);
  assert.equal(after.length, 4);
  assert.equal(
    after.some((row) => row.id === first.id),
    false,
  );
  await createSmsQuickText({
    db,
    operatorId: "op_1",
    name: "Custom check-in",
    category: "Follow-up",
    body: "Hi {{firstName}}, it's {{agentName}}.",
  }).then(
    (row) => {
      assert.equal(row.key.includes("custom_check_in"), true);
    },
  );
  await createSmsQuickText({
    db,
    operatorId: "op_1",
    name: "Bad",
    category: "Bad",
    body: "Hi {{unknownVar}}",
  }).then(
    () => {
      throw new Error("invalid variable should not save");
    },
    (error) => {
      assert.ok(error instanceof SmsQuickTextActionError);
      assert.equal(error.code, "INVALID_VARIABLES");
    },
  );
}

function testSegmentsAndAllowanceMath() {
  assert.equal(estimateSmsSegmentCount("Hi there"), 1);
  assert.ok(estimateSmsSegmentCount("a".repeat(161)) >= 2);
  assert.ok(estimateSmsSegmentCount("🙂".repeat(80)) >= 2);
  assert.equal(
    resolveIncludedSmsSegments({
      planCode: "TEAM",
      entitlementProfileCode: "TEAM",
    }),
    500,
  );
  assert.equal(resolveIncludedSmsSegments(null), null);
  const none = evaluateSmsAllowance({
    allowanceSegments: null,
    usedSegments: 0,
    requestedSegments: 1,
  });
  assert.equal(none.permitted, false);
  assert.equal(none.reason, "ALLOWANCE_NOT_CONFIGURED");
  const over = evaluateSmsAllowance({
    allowanceSegments: 500,
    usedSegments: 500,
    requestedSegments: 1,
  });
  assert.equal(over.permitted, false);
  assert.equal(over.reason, "ALLOWANCE_EXCEEDED");
  const ok = evaluateSmsAllowance({
    allowanceSegments: 500,
    usedSegments: 10,
    requestedSegments: 2,
  });
  assert.equal(ok.permitted, true);
  assert.equal(ok.remainingSegments, 490);
}

async function testUsageIdempotentAndTenantIsolation() {
  const db = new FakeUsageDb();
  const first = await recordSmsUsageEvent(
    {
      workspaceId: "ws_a",
      category: "AGENT_INDIVIDUAL",
      recipientType: "LEAD",
      twilioMessageSid: "SM_1",
      body: "Hi",
    },
    db,
  );
  const again = await recordSmsUsageEvent(
    {
      workspaceId: "ws_a",
      category: "AGENT_INDIVIDUAL",
      recipientType: "LEAD",
      twilioMessageSid: "SM_1",
      messageId: "msg_1",
      body: "Hi",
    },
    db,
  );
  assert.equal(db.events.length, 1);
  assert.equal(first?.id, again?.id);
  assert.equal(again?.messageId, "msg_1");
  assert.equal(again?.segmentCountSource, "ESTIMATED");
  const finalized = await finalizeSmsUsageFromProvider("SM_1", 2, db);
  assert.equal(finalized?.segmentCount, 2);
  assert.equal(finalized?.segmentCountSource, "PROVIDER");
  assert.equal(finalized?.finalized, true);

  await recordSmsUsageEvent(
    {
      workspaceId: "ws_b",
      category: "AGENT_INDIVIDUAL",
      recipientType: "LEAD",
      twilioMessageSid: "SM_B",
      body: "Hi",
    },
    db,
  );
  const a = await inspectSmsAllowance("ws_a", { db });
  const b = await inspectSmsAllowance("ws_b", { db });
  assert.equal(a.usedSegments, 2);
  assert.equal(b.usedSegments, 1);
  assert.equal(a.workspaceId, "ws_a");
  assert.equal(b.workspaceId, "ws_b");
}

function testHasSmsUsageDelegateSeesPrismaStyleProxy() {
  const inner = new FakeUsageDb();
  const proxy = new Proxy({} as FakeUsageDb, {
    get(_target, prop) {
      return inner[prop as keyof FakeUsageDb];
    },
  });
  assert.equal("smsUsageEvent" in proxy, false);
  assert.equal(hasSmsUsageDelegate(proxy), true);
  assert.equal(hasSmsUsageDelegate(inner), true);
  assert.equal(hasSmsUsageDelegate({}), false);
  assert.equal(hasSmsUsageDelegate(null), false);
}

async function testNoAllowanceBlocks() {
  const db = new FakeUsageDb();
  db.currentSubscriptionId = null;
  db.plan = null;
  const snap = await inspectSmsAllowance("ws_none", {
    db,
    requestedSegments: 1,
  });
  assert.equal(snap.permitted, false);
  assert.equal(snap.reason, "ALLOWANCE_NOT_CONFIGURED");
  assert.equal(snap.allowanceSegments, null);
}

function testEligibilityAllowsInitiate() {
  const ready = {
    viewerUserId: "agent_a",
    assignedAgentId: "agent_a",
    toE164: "+12895550100",
    fromE164: "+12895550101",
    twilioSubaccountSid: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    twilioMessagingServiceSid: "MGaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    suppressed: false,
  };
  assert.equal(evaluateAgentSmsEligibility(ready).enabled, true);
  assert.equal(
    evaluateAgentSmsEligibility({ ...ready, assignedAgentId: "agent_b" }).reason,
    "NOT_ASSIGNED",
  );
  assert.equal(
    evaluateAgentSmsEligibility({ ...ready, toE164: null }).reason,
    "NO_CUSTOMER_E164",
  );
  assert.equal(
    evaluateAgentSmsEligibility({
      ...ready,
      twilioMessagingServiceSid: null,
    }).reason,
    "NO_WORKSPACE_NUMBER",
  );
  assert.equal(
    evaluateAgentSmsEligibility({ ...ready, suppressed: true }).reason,
    "SUPPRESSED",
  );
}

function testFilesAndNoMassOrTriggers() {
  assert.equal(
    existsSync(
      join(root, "prisma/migrations/20260920010000_sms_quick_texts_and_usage/migration.sql"),
    ),
    true,
  );
  assert.ok(
    read(
      "prisma/migrations/20260920010000_sms_quick_texts_and_usage/migration.sql",
    ).includes("NOT APPLIED"),
  );
  const usage = read("src/lib/sms/usage.ts");
  assert.equal(usage.includes("sendSms("), false);
  assert.ok(usage.includes("AGENT_MASS"));
  assert.ok(usage.includes("ALLOWANCE_NOT_CONFIGURED"));
  assert.equal(usage.includes('"smsUsageEvent" in db'), false);
  assert.ok(usage.includes("smsUsageEvent"));
  const manage = read("src/lib/platform/sms-automations/manage.ts");
  assert.equal(manage.includes("sendSms("), false);
  const pane = read("src/components/agent/chat/AgentChatTranscriptPane.tsx");
  assert.ok(pane.includes("setDraft(quickText.rendered)"));
  assert.equal(pane.includes("onSend(quickText"), false);
  const sms = read("src/lib/conversations/agent-conversation-sms.ts");
  assert.equal(sms.includes("LOCKED_UNTIL_REPLY"), false);
  const period = resolveSmsUsagePeriod(null, new Date("2026-09-20T12:00:00.000Z"));
  assert.equal(period.start.toISOString(), "2026-09-01T00:00:00.000Z");
}

async function main() {
  testQuickTextCatalogAndRender();
  await testQuickTextActiveInactiveAndTenantGlobal();
  testSegmentsAndAllowanceMath();
  await testUsageIdempotentAndTenantIsolation();
  testHasSmsUsageDelegateSeesPrismaStyleProxy();
  await testNoAllowanceBlocks();
  testEligibilityAllowsInitiate();
  testFilesAndNoMassOrTriggers();
  console.log("sms-agent-individual-quick-texts-usage selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
