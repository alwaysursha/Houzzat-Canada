/**
 * Platform SMS Automations: catalog, draft/publish/rollback, variables, buckets.
 * Run: pnpm sms-automations:selftest
 *
 * No production writes. No trigger wiring. No deploy.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SMS_AUTOMATION_CATALOG } from "../src/lib/platform/sms-automations/catalog";
import {
  LEAD_RETURNED_INACTIVITY_BUCKETS_DAYS,
  SMS_AUTOMATION_PROTECTION_COPY,
  SMS_AUTOMATION_VARIABLES,
} from "../src/lib/platform/sms-automations/constants";
import { selectLeadReturnedInactivityBucket } from "../src/lib/platform/sms-automations/buckets";
import { SmsAutomationActionError } from "../src/lib/platform/sms-automations/errors";
import {
  currentDraftVersion,
  ensureSmsAutomationCatalog,
  latestPublishedVersion,
  previewSmsAutomationTemplate,
  publishSmsAutomation,
  resolvePublishedSmsAutomation,
  rollbackSmsAutomation,
  saveSmsAutomationDraft,
  setSmsAutomationActive,
  type SmsAutomationDb,
  type SmsAutomationDefinitionRow,
  type SmsAutomationVersionRow,
} from "../src/lib/platform/sms-automations/manage";
import { serializeSmsAutomation } from "../src/lib/platform/sms-automations/serialize";
import { validateSmsTemplateBody } from "../src/lib/platform/sms-automations/variables";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

class FakeSmsAutomationDb implements SmsAutomationDb {
  definitions = new Map<string, SmsAutomationDefinitionRow>();
  versions: SmsAutomationVersionRow[] = [];
  audits: Array<{ action: string; entityId: string; summary: string }> = [];
  nextDef = 1;
  nextVer = 1;

  smsAutomationDefinition: SmsAutomationDb["smsAutomationDefinition"] = {
    findUnique: async ({ where }) => {
      if ("key" in where) {
        return (
          [...this.definitions.values()].find((row) => row.key === where.key) ??
          null
        );
      }
      return this.definitions.get(where.id) ?? null;
    },
    findMany: async () =>
      [...this.definitions.values()].sort((a, b) =>
        a.key.localeCompare(b.key),
      ),
    create: async ({ data }) => {
      const now = new Date("2026-09-19T18:00:00.000Z");
      const row: SmsAutomationDefinitionRow = {
        id: data.id ?? `def_${this.nextDef++}`,
        key: data.key,
        name: data.name,
        recipient: data.recipient,
        triggerKey: data.triggerKey,
        description: data.description,
        active: data.active,
        replyEnabled: data.replyEnabled,
        delayMinutes: data.delayMinutes,
        inactivityDays: data.inactivityDays,
        inactivityBucketsJson: data.inactivityBucketsJson,
        allowedVariables: [...data.allowedVariables],
        createdAt: now,
        updatedAt: now,
      };
      this.definitions.set(row.id, row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = this.definitions.get(where.id);
      if (!row) throw new Error("missing definition");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  };

  smsAutomationVersion: SmsAutomationDb["smsAutomationVersion"] = {
    findMany: async ({ where }) =>
      this.versions.filter((row) => {
        if (row.definitionId !== where.definitionId) return false;
        if (where.status && row.status !== where.status) return false;
        return true;
      }),
    findFirst: async ({ where }) =>
      this.versions.find((row) => {
        if (row.definitionId !== where.definitionId) return false;
        if (where.status && row.status !== where.status) return false;
        return true;
      }) ?? null,
    findUnique: async ({ where }) =>
      this.versions.find((row) => row.id === where.id) ?? null,
    create: async ({ data }) => {
      const row: SmsAutomationVersionRow = {
        id: data.id ?? `ver_${this.nextVer++}`,
        definitionId: data.definitionId,
        versionNumber: data.versionNumber,
        status: data.status,
        body: data.body,
        delayMinutes: data.delayMinutes,
        inactivityDays: data.inactivityDays,
        inactivityBucketsJson: data.inactivityBucketsJson,
        createdAt: new Date("2026-09-19T18:00:00.000Z"),
        createdByOperatorId: data.createdByOperatorId,
        publishedAt: data.publishedAt,
        publishedByOperatorId: data.publishedByOperatorId,
        rollbackOfVersionId: data.rollbackOfVersionId,
      };
      this.versions.push(row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = this.versions.find((item) => item.id === where.id);
      if (!row) throw new Error("missing version");
      Object.assign(row, data);
      return row;
    },
  };
}

async function seeded() {
  const db = new FakeSmsAutomationDb();
  await ensureSmsAutomationCatalog(db);
  return db;
}

function testCatalogAndBuckets() {
  assert.equal(SMS_AUTOMATION_CATALOG.length, 7);
  assert.equal(
    SMS_AUTOMATION_CATALOG.filter((row) => row.recipient === "AGENT").length,
    4,
  );
  assert.equal(
    SMS_AUTOMATION_CATALOG.filter((row) => row.recipient === "LEAD").length,
    3,
  );
  assert.deepEqual(
    [...LEAD_RETURNED_INACTIVITY_BUCKETS_DAYS],
    [14, 30, 45, 60, 120, 180, 365],
  );
  assert.equal(selectLeadReturnedInactivityBucket(13), null);
  assert.equal(selectLeadReturnedInactivityBucket(14), 14);
  assert.equal(selectLeadReturnedInactivityBucket(29), 14);
  assert.equal(selectLeadReturnedInactivityBucket(50), 45);
  assert.equal(selectLeadReturnedInactivityBucket(400), 365);
  const returned = SMS_AUTOMATION_CATALOG.filter(
    (row) => row.triggerKey === "LEAD_RETURNED_AFTER_INACTIVITY",
  );
  assert.equal(returned.length, 2);
  for (const row of returned) {
    assert.deepEqual(row.inactivityBuckets, [...LEAD_RETURNED_INACTIVITY_BUCKETS_DAYS]);
  }
  const intro = SMS_AUTOMATION_CATALOG.find(
    (row) => row.key === "lead.welcome_new_signup",
  );
  assert.equal(intro?.name, "Customer Introduction");
  assert.equal(intro?.triggerKey, "CUSTOMER_FIRST_CELLPHONE");
  assert.equal(intro?.recipient, "LEAD");
  assert.ok(intro?.body.includes("{{agentName}} here from {{workspaceName}}"));
}

function testInvalidVariables() {
  const allowed = ["firstName", "agentName"];
  assert.equal(validateSmsTemplateBody("Hi {{firstName}}", allowed).ok, true);
  const unknown = validateSmsTemplateBody("Hi {{notAVar}}", allowed);
  assert.equal(unknown.ok, false);
  if (!unknown.ok) {
    assert.equal(unknown.issues[0]?.reason, "unknown");
  }
  const notAllowed = validateSmsTemplateBody("See {{leadProfileUrl}}", allowed);
  assert.equal(notAllowed.ok, false);
  if (!notAllowed.ok) {
    assert.equal(notAllowed.issues[0]?.reason, "not_allowed");
  }
  const empty = validateSmsTemplateBody("   ", allowed);
  assert.equal(empty.ok, false);
  const broken = validateSmsTemplateBody("Hello {{", allowed);
  assert.equal(broken.ok, false);
}

async function testDraftPublishRollback() {
  const db = await seeded();
  const key = "lead.welcome_new_signup";
  const published1 = await resolvePublishedSmsAutomation(db, key);
  assert.ok(published1);
  assert.equal(published1?.version.versionNumber, 1);
  assert.equal(published1?.version.status, "PUBLISHED");

  const opened = await saveSmsAutomationDraft({
    db,
    key,
    operatorId: "op_1",
    body: "Hi {{firstName}}, this is a draft from {{agentName}}.",
  });
  assert.equal(opened.created, true);
  assert.equal(opened.draft.status, "DRAFT");
  assert.equal(opened.draft.versionNumber, 2);

  const stillLive = await resolvePublishedSmsAutomation(db, key);
  assert.equal(stillLive?.version.versionNumber, 1);
  assert.equal(stillLive?.version.body.includes("this is a draft"), false);

  await publishSmsAutomation({ db, key, operatorId: "op_1" });
  const live2 = await resolvePublishedSmsAutomation(db, key);
  assert.equal(live2?.version.versionNumber, 2);
  assert.equal(live2?.version.status, "PUBLISHED");
  assert.equal(live2?.version.publishedByOperatorId, "op_1");
  assert.ok(live2?.version.body.includes("this is a draft"));
  assert.equal(currentDraftVersion(db.versions.filter((row) => row.definitionId === live2?.definition.id)), null);

  await saveSmsAutomationDraft({
    db,
    key,
    operatorId: "op_2",
    body: "Hi {{firstName}}, unpublished {{agentName}}.",
  });
  const v1 = db.versions.find(
    (row) => row.versionNumber === 1 && row.definitionId === live2?.definition.id,
  );
  assert.ok(v1);
  const rolled = await rollbackSmsAutomation({
    db,
    key,
    operatorId: "op_2",
    versionId: v1!.id,
  });
  assert.equal(rolled.version.versionNumber, 4);
  assert.equal(rolled.version.rollbackOfVersionId, v1!.id);
  const live3 = await resolvePublishedSmsAutomation(db, key);
  assert.equal(live3?.version.id, rolled.version.id);
  assert.equal(live3?.version.body.includes("this is a draft"), false);
  assert.equal(latestPublishedVersion(db.versions.filter((row) => row.definitionId === live3?.definition.id))?.versionNumber, 4);

  const draftStill = currentDraftVersion(
    db.versions.filter((row) => row.definitionId === live3?.definition.id),
  );
  assert.ok(draftStill);
  assert.equal(draftStill?.status, "DRAFT");
  assert.ok(draftStill?.body.includes("unpublished"));
}

async function testPublishRejectsInvalidVariables() {
  const db = await seeded();
  const key = "agent.new_lead_signup";
  await saveSmsAutomationDraft({
    db,
    key,
    operatorId: "op_1",
    body: "{{leadName}} {{unknownVar}}",
  }).then(
    () => {
      throw new Error("unknown placeholder should not save");
    },
    (error) => {
      assert.ok(error instanceof SmsAutomationActionError);
      assert.equal(error.code, "INVALID_VARIABLES");
    },
  );

  await saveSmsAutomationDraft({
    db,
    key,
    operatorId: "op_1",
    body: "See {{propertyAddress}}",
  });
  await publishSmsAutomation({ db, key, operatorId: "op_1" }).then(
    () => {
      throw new Error("not_allowed variable should not publish");
    },
    (error) => {
      assert.ok(error instanceof SmsAutomationActionError);
      assert.equal(error.code, "INVALID_VARIABLES");
    },
  );
  const live = await resolvePublishedSmsAutomation(db, key);
  assert.equal(live?.version.versionNumber, 1);
}

async function testInactiveSkipsResolution() {
  const db = await seeded();
  const key = "agent.viewing_requested";
  const before = await resolvePublishedSmsAutomation(db, key);
  assert.ok(before);
  await setSmsAutomationActive({
    db,
    key,
    operatorId: "op_1",
    active: false,
  });
  const after = await resolvePublishedSmsAutomation(db, key);
  assert.equal(after, null);
  await setSmsAutomationActive({
    db,
    key,
    operatorId: "op_1",
    active: true,
  });
  const restored = await resolvePublishedSmsAutomation(db, key);
  assert.equal(restored?.version.id, before?.version.id);
}

async function testGlobalPublishedResolutionAndEnsureIdempotent() {
  const db = await seeded();
  const again = await ensureSmsAutomationCatalog(db);
  assert.equal(again.createdKeys.length, 0);
  assert.equal(db.definitions.size, 7);
  for (const spec of SMS_AUTOMATION_CATALOG) {
    const resolved = await resolvePublishedSmsAutomation(db, spec.key);
    assert.ok(resolved, spec.key);
    assert.equal(resolved?.definition.key, spec.key);
    assert.equal(resolved?.version.status, "PUBLISHED");
    assert.equal(resolved?.version.body, spec.body);
    const serialized = serializeSmsAutomation(
      resolved!.definition,
      db.versions.filter((row) => row.definitionId === resolved!.definition.id),
    );
    assert.equal(serialized.publishedVersion?.versionNumber, 1);
    assert.equal(serialized.draftVersion, null);
  }
}

function testPreviewAndProtections() {
  const preview = previewSmsAutomationTemplate({
    body: "Hi {{firstName}} from {{workspaceName}}",
    allowedVariables: ["firstName", "workspaceName"],
  });
  assert.equal(preview.valid, true);
  assert.ok(preview.rendered.includes("Jordan"));
  assert.ok(preview.rendered.includes("Houzzat"));
  assert.ok(SMS_AUTOMATION_PROTECTION_COPY.includes("STOP/START/HELP"));
  assert.ok(SMS_AUTOMATION_VARIABLES.includes("leadProfileUrl"));
}

function testFilesAndNoTriggerWiring() {
  assert.equal(
    existsSync(join(root, "prisma/migrations/20260919220000_sms_automations_catalog/migration.sql")),
    true,
  );
  assert.ok(
    read("prisma/migrations/20260919220000_sms_automations_catalog/migration.sql").includes(
      "NOT APPLIED",
    ),
  );
  const manage = read("src/lib/platform/sms-automations/manage.ts");
  assert.equal(manage.includes("sendSms("), false);
  assert.equal(manage.includes("@/lib/agent"), false);
  assert.equal(manage.includes("@/lib/sms/transport"), false);
  const shell = read("src/components/platform/PlatformShell.tsx");
  assert.ok(shell.includes("SMS Automations"));
  const tenantCrm = read("src/components/agent/chat/AgentChatTranscriptPane.tsx");
  assert.equal(tenantCrm.includes("sms-automations"), false);
}

async function testEnsureSyncsCatalogMetadata() {
  const db = await seeded();
  const intro = [...db.definitions.values()].find(
    (row) => row.key === "lead.welcome_new_signup",
  );
  assert.ok(intro);
  intro!.name = "Welcome / New Lead Signup";
  intro!.triggerKey = "NEW_LEAD_SIGNUP";
  intro!.description = "old";
  const publishedBody = db.versions.find(
    (row) => row.definitionId === intro!.id && row.status === "PUBLISHED",
  )?.body;
  await ensureSmsAutomationCatalog(db);
  const after = [...db.definitions.values()].find(
    (row) => row.key === "lead.welcome_new_signup",
  );
  assert.equal(after?.name, "Customer Introduction");
  assert.equal(after?.triggerKey, "CUSTOMER_FIRST_CELLPHONE");
  assert.equal(
    db.versions.find(
      (row) => row.definitionId === intro!.id && row.status === "PUBLISHED",
    )?.body,
    publishedBody,
  );
}

async function main() {
  testCatalogAndBuckets();
  testInvalidVariables();
  testPreviewAndProtections();
  testFilesAndNoTriggerWiring();
  await testGlobalPublishedResolutionAndEnsureIdempotent();
  await testEnsureSyncsCatalogMetadata();
  await testDraftPublishRollback();
  await testPublishRejectsInvalidVariables();
  await testInactiveSkipsResolution();
  console.log("sms-automations selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
