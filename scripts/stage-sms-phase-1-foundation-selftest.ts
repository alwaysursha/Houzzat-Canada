/**
 * Twilio Two-Way SMS — Phase 1 foundation.
 * Run: pnpm sms-phase1-foundation:selftest
 *
 * No production writes. No Twilio network. No MLS sync. No deploy.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isE164,
  normalizeToE164,
  phoneColumnsForWrite,
} from "../src/lib/sms/e164";
import { quarantineInboundSms } from "../src/lib/sms/quarantine";
import { isPhoneSuppressed, suppressPhone } from "../src/lib/sms/suppression";
import {
  resolveTwilioStatusCallbackUrl,
  sendSms,
} from "../src/lib/sms/transport";
import {
  smsClassHonorsStopSuppression,
  smsClassRequiresSmsAlertsEnabled,
} from "../src/lib/sms/types";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testNormalization() {
  assert.equal(normalizeToE164("+14165550100"), "+14165550100");
  assert.equal(isE164("+14165550100"), true);
  assert.equal(normalizeToE164("416-555-0100"), "+14165550100");
  assert.equal(normalizeToE164("(416) 555-0100"), "+14165550100");
  assert.equal(normalizeToE164("14165550100"), "+14165550100");
  assert.equal(normalizeToE164("1 416 555 0100"), "+14165550100");
  assert.equal(normalizeToE164("0014165550100"), "+14165550100");
  assert.equal(normalizeToE164("+1 (416) 555-0100"), "+14165550100");
  assert.equal(normalizeToE164(""), null);
  assert.equal(normalizeToE164(null), null);
  assert.equal(normalizeToE164("   "), null);
  assert.equal(normalizeToE164("not-a-phone"), null);
  assert.equal(normalizeToE164("12345"), null);
  assert.equal(normalizeToE164("01632 960000"), null);
  assert.equal(isE164("4165550100"), false);
  assert.equal(isE164("+14165"), false);
  assert.equal(isE164("+014165550100"), false);

  const filled = phoneColumnsForWrite("416-555-0199");
  assert.equal(filled.phone, "416-555-0199");
  assert.equal(filled.phoneE164, "+14165550199");
  const cleared = phoneColumnsForWrite(null);
  assert.deepEqual(cleared, { phone: null, phoneE164: null });
  assert.deepEqual(phoneColumnsForWrite(undefined), {});
}

function testSchemaAndMigration() {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260919180000_sms_phase1_foundation/migration.sql",
  );

  assert.ok(schema.includes("phoneE164              String?"));
  assert.ok(schema.includes("@@index([phoneE164])"));
  assert.equal(
    /phoneE164[^\n]*@unique/.test(schema.split("model User")[1]?.split("model ")[0] ?? ""),
    false,
    "User.phoneE164 must not be globally unique",
  );
  assert.ok(schema.includes("twilioPhoneE164             String?         @unique"));
  assert.ok(schema.includes("twilioSubaccountSid         String?         @unique"));
  assert.ok(schema.includes("twilioMessagingServiceSid   String?         @unique"));
  assert.ok(schema.includes("twilioPhoneSid              String?         @unique"));
  assert.equal(
    migration.includes("twilioSubaccountSid"),
    false,
    "ISV SID columns belong in the Phase 4 migration",
  );

  assert.ok(schema.includes("model SmsSuppression"));
  assert.ok(schema.includes("@@unique([workspaceId, phoneE164])"));
  assert.ok(schema.includes("model InboundSmsQuarantine"));
  assert.ok(schema.includes("twilioMessageSid String   @unique"));
  const quarantineBlock =
    schema.split("model InboundSmsQuarantine")[1]?.split("model ")[0] ?? "";
  assert.equal(
    /body\s+String/.test(quarantineBlock),
    false,
    "quarantine must not store message body",
  );

  assert.ok(migration.includes("NOT APPLIED"));
  assert.ok(migration.includes('ALTER TABLE "User" ADD COLUMN "phoneE164" TEXT'));
  assert.ok(
    migration.includes(
      'CREATE UNIQUE INDEX "Workspace_twilioPhoneE164_key"',
    ),
  );
  assert.ok(
    migration.includes(
      'CREATE UNIQUE INDEX "SmsSuppression_workspaceId_phoneE164_key"',
    ),
  );
  assert.ok(
    migration.includes(
      'CREATE UNIQUE INDEX "InboundSmsQuarantine_twilioMessageSid_key"',
    ),
  );
  assert.ok(
    migration.includes("CREATE INDEX \"User_phoneE164_idx\""),
  );
  assert.ok(
    !migration.includes("UNIQUE INDEX \"User_phoneE164"),
    "backfill must not unique-index User.phoneE164",
  );
  assert.ok(
    migration.includes("^\\+[1-9][0-9]{7,14}$"),
    "SQL backfill should only copy already-valid E.164",
  );
  assert.ok(migration.includes("^[2-9][0-9]{9}$"));
  assert.equal(
    existsSync(join(root, "src/app/api/webhooks/twilio/inbound/route.ts")),
    true,
    "inbound webhook is Phase 3",
  );
}

function createMemorySuppressionDb() {
  const rows = new Map<string, { id: string }>();
  const key = (workspaceId: string, phoneE164: string) =>
    `${workspaceId}::${phoneE164}`;
  return {
    smsSuppression: {
      async findUnique(args: {
        where: {
          workspaceId_phoneE164: { workspaceId: string; phoneE164: string };
        };
      }) {
        const { workspaceId, phoneE164 } = args.where.workspaceId_phoneE164;
        return rows.get(key(workspaceId, phoneE164)) ?? null;
      },
      async upsert(args: {
        where: {
          workspaceId_phoneE164: { workspaceId: string; phoneE164: string };
        };
        create: { workspaceId: string; phoneE164: string };
      }) {
        const { workspaceId, phoneE164 } = args.where.workspaceId_phoneE164;
        const k = key(workspaceId, phoneE164);
        if (!rows.has(k)) rows.set(k, { id: `sup_${rows.size + 1}` });
        return rows.get(k);
      },
      async deleteMany(args: {
        where: { workspaceId: string; phoneE164: string };
      }) {
        const k = key(args.where.workspaceId, args.where.phoneE164);
        const had = rows.delete(k);
        return { count: had ? 1 : 0 };
      },
    },
  };
}

async function testSuppressionTenantIsolation() {
  const db = createMemorySuppressionDb();
  const phone = "+14165550100";
  assert.equal(await isPhoneSuppressed("ws_a", phone, db), false);
  assert.equal(await suppressPhone({ workspaceId: "ws_a", phoneE164: phone }, db), "ok");
  assert.equal(await isPhoneSuppressed("ws_a", phone, db), true);
  assert.equal(
    await isPhoneSuppressed("ws_b", phone, db),
    false,
    "STOP in workspace A must not suppress workspace B",
  );
  assert.equal(await isPhoneSuppressed(null, phone, db), false);
  assert.equal(smsClassHonorsStopSuppression("transactional"), true);
  assert.equal(smsClassHonorsStopSuppression("staff"), true);
  assert.equal(smsClassRequiresSmsAlertsEnabled("transactional"), false);
  assert.equal(smsClassRequiresSmsAlertsEnabled("conversational"), false);
  assert.equal(smsClassRequiresSmsAlertsEnabled("staff"), false);
  assert.equal(smsClassRequiresSmsAlertsEnabled("partner"), false);
  assert.equal(smsClassRequiresSmsAlertsEnabled("marketing"), true);
}

function createMemoryQuarantineDb() {
  const sids = new Set<string>();
  return {
    inboundSmsQuarantine: {
      async create(args: { data: { twilioMessageSid: string } }) {
        if (sids.has(args.data.twilioMessageSid)) {
          const err = Object.assign(new Error("Unique constraint"), {
            code: "P2002",
          });
          throw err;
        }
        sids.add(args.data.twilioMessageSid);
      },
      async findUnique(args: { where: { twilioMessageSid: string } }) {
        return sids.has(args.where.twilioMessageSid)
          ? { id: args.where.twilioMessageSid }
          : null;
      },
    },
  };
}

async function testQuarantineUniqueness() {
  const db = createMemoryQuarantineDb();
  const input = {
    twilioMessageSid: "SM123",
    fromE164: "+14165550100",
    toE164: "+16475550100",
    reason: "unknown_from",
    workspaceId: "ws_a",
  };
  assert.equal(await quarantineInboundSms(input, db), "created");
  assert.equal(await quarantineInboundSms(input, db), "duplicate");
  assert.equal(
    await quarantineInboundSms({ ...input, fromE164: "4165550100" }, db),
    "invalid",
  );
  const src = read("src/lib/sms/quarantine.ts");
  assert.ok(!src.includes("prisma.lead"));
  assert.ok(!src.includes("lead.create"));
  assert.ok(!src.includes("conversation.create"));
  assert.ok(!src.includes("body:"));
}

async function testTransport() {
  const captured: { url: string; body: URLSearchParams; auth: string }[] = [];
  const logs: string[] = [];
  const origInfo = console.info;
  const origError = console.error;
  console.info = (...args: unknown[]) => {
    logs.push(
      args
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join(" "),
    );
  };
  console.error = (...args: unknown[]) => {
    logs.push(
      args
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join(" "),
    );
  };

  const parentSid = "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const subSid = "ACbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const messagingSid = "MGcccccccccccccccccccccccccccccccc";
  const fromA = "+16475550199";
  const fromB = "+16475550200";

  const fetchImpl: typeof fetch = async (url, init) => {
    captured.push({
      url: String(url),
      body: new URLSearchParams(String(init?.body ?? "")),
      auth: String((init?.headers as Record<string, string>)?.Authorization ?? ""),
    });
    return new Response(JSON.stringify({ sid: "SM_TEST_SID" }), {
      status: 201,
    });
  };

  const workspaceTwilio = (phoneE164: string) => async () =>
    ({
      ok: true as const,
      config: {
        subaccountSid: subSid,
        messagingServiceSid: messagingSid,
        phoneE164,
      },
    });

  try {
    const stub = await sendSms(
      {
        to: "+14165550100",
        body: "Hello secret body",
        smsClass: "transactional",
        workspaceId: "ws_a",
      },
      {
        getCredentials: () => null,
        fetchImpl,
        resolveWorkspaceTwilio: workspaceTwilio(fromA),
      },
    );
    assert.equal(stub.status, "skipped");
    if (stub.status === "skipped") {
      assert.equal(stub.reason, "missing_credentials");
    }

    const invalidTo = await sendSms(
      {
        to: "555-home",
        body: "Hello",
        smsClass: "transactional",
        workspaceId: "ws_a",
      },
      {
        getCredentials: () => ({ sid: parentSid, token: "secret-token" }),
        fetchImpl,
        resolveWorkspaceTwilio: workspaceTwilio(fromA),
      },
    );
    assert.equal(invalidTo.status, "skipped");
    if (invalidTo.status === "skipped") assert.equal(invalidTo.reason, "invalid_to");

    const suppressed = await sendSms(
      {
        to: "416-555-0100",
        body: "Hello",
        smsClass: "transactional",
        workspaceId: "ws_a",
      },
      {
        getCredentials: () => ({ sid: parentSid, token: "secret-token" }),
        fetchImpl,
        resolveWorkspaceTwilio: workspaceTwilio(fromA),
        isSuppressed: async (workspaceId, phone) =>
          workspaceId === "ws_a" && phone === "+14165550100",
      },
    );
    assert.equal(suppressed.status, "skipped");
    if (suppressed.status === "skipped") {
      assert.equal(suppressed.reason, "suppressed");
    }

    const otherTenant = await sendSms(
      {
        to: "416-555-0100",
        body: "Hello",
        smsClass: "transactional",
        workspaceId: "ws_b",
      },
      {
        getCredentials: () => ({ sid: parentSid, token: "secret-token" }),
        fetchImpl,
        resolveWorkspaceTwilio: workspaceTwilio(fromB),
        isSuppressed: async (workspaceId, phone) =>
          workspaceId === "ws_a" && phone === "+14165550100",
      },
    );
    assert.equal(otherTenant.status, "sent");
    if (otherTenant.status === "sent") {
      assert.equal(otherTenant.sid, "SM_TEST_SID");
    }

    const staffSend = await sendSms(
      {
        to: "+14165550100",
        body: "New lead SMS",
        smsClass: "staff",
        workspaceId: "ws_a",
        statusCallbackUrl: "https://houzzat.com/api/webhooks/twilio/status",
      },
      {
        getCredentials: () => ({ sid: parentSid, token: "secret-token" }),
        fetchImpl,
        resolveWorkspaceTwilio: workspaceTwilio(fromA),
        isSuppressed: async () => false,
      },
    );
    assert.equal(staffSend.status, "sent");

    const last = captured.at(-1);
    assert.ok(last);
    assert.equal(last.body.get("To"), "+14165550100");
    assert.equal(last.body.get("From"), fromA);
    assert.equal(last.body.get("MessagingServiceSid"), messagingSid);
    assert.equal(
      last.body.get("StatusCallback"),
      "https://houzzat.com/api/webhooks/twilio/status",
    );
    assert.ok(last.url.includes(`/Accounts/${subSid}/Messages.json`));
    assert.equal(
      last.url.includes(`/Accounts/${parentSid}/Messages.json`),
      false,
    );
    assert.equal(
      last.auth,
      `Basic ${Buffer.from(`${subSid}:secret-token`).toString("base64")}`,
    );

    const joined = logs.join("\n");
    assert.equal(joined.includes("Hello secret body"), false);
    assert.equal(joined.includes("New lead SMS"), false);
    assert.equal(joined.includes("secret-token"), false);
    assert.equal(joined.includes("+14165550100"), false);
    assert.equal(joined.includes("smsAlertsEnabled"), false);

    const defaultCallback = resolveTwilioStatusCallbackUrl();
    assert.ok(defaultCallback?.endsWith("/api/webhooks/twilio/status"));
    assert.equal(resolveTwilioStatusCallbackUrl(null), null);

    const transportSrc = read("src/lib/sms/transport.ts");
    assert.equal(transportSrc.includes("smsAlertsEnabled"), false);
    assert.equal(transportSrc.includes("TWILIO_FROM_NUMBER"), false);
  } finally {
    console.info = origInfo;
    console.error = origError;
  }
}

function testExistingNotificationSms() {
  const notify = read("src/lib/notifications.ts");
  assert.ok(notify.includes("sendSms as sendTwilioSms"));
  assert.ok(notify.includes('smsClass: payload.smsClass ?? "transactional"'));
  assert.equal(notify.includes("[notify:sms:stub]"), false);
  assert.equal(notify.includes("console.info(\"[notify:sms"), false);
  assert.ok(notify.includes("sendTwilioSms({"));
  assert.equal(
    /smsAlertsEnabled/.test(notify),
    false,
    "notification SMS must not require smsAlertsEnabled",
  );

  const staff = read("src/lib/notifications/staff-events.ts");
  assert.ok(staff.includes("smsClass: \"staff\""));
  assert.ok(staff.includes("workspaceId"));
  assert.ok(staff.includes("smsText: input.smsText"));
  assert.ok(staff.includes("scheduleNewLeadStaffEmail"));

  for (const rel of [
    "src/app/api/agent/appointments/route.ts",
    "src/app/api/mobile/v2/appointments/[appointmentId]/route.ts",
    "src/app/api/mobile/v2/leads/[leadId]/appointments/[appointmentId]/route.ts",
  ]) {
    const src = read(rel);
    assert.ok(src.includes("smsClass: \"transactional\""), rel);
    assert.ok(src.includes("smsText: `Houzzat: ${label} confirmed"), rel);
    assert.ok(src.includes("workspaceId"), rel);
    assert.equal(src.includes("smsAlertsEnabled"), false, rel);
  }

  const handoff = read("src/app/api/agent/handoffs/route.ts");
  assert.ok(handoff.includes("smsClass: \"partner\""));
  assert.ok(handoff.includes("smsText: `Houzzat referral:"));
  assert.ok(handoff.includes("preferWhatsApp: true"));
  assert.equal(handoff.includes("smsAlertsEnabled"), false);

  const chatSend = read("src/lib/conversations/agent-conversation-send.ts");
  assert.ok(chatSend.includes('channel: "CHAT"'));
  const customerChat = read("src/lib/conversations/customer-conversation.ts");
  assert.ok(customerChat.includes('channel: "CHAT"'));
}

function testPhoneWriteSyncAndPhaseBoundaries() {
  const writes = [
    "src/lib/agent/create-manual-lead.ts",
    "src/app/api/account/contact/route.ts",
    "src/app/api/account/preferences/route.ts",
    "src/app/api/agent/leads/contact/route.ts",
    "src/app/api/mobile/v2/leads/[leadId]/contact/route.ts",
    "src/app/api/leads/route.ts",
    "src/app/api/valuation/route.ts",
    "src/app/api/owner/listings/route.ts",
  ];
  for (const rel of writes) {
    assert.ok(
      read(rel).includes("phoneColumnsForWrite"),
      `${rel} must sync phoneE164 on write`,
    );
  }

  const conversation = read("src/lib/conversations/lead-conversation.ts");
  assert.ok(conversation.includes("ONE workspace + ONE lead = ONE permanent Conversation"));

  const index = read("src/lib/sms/index.ts");
  assert.ok(index.includes("sendSms"));
  assert.ok(index.includes("quarantineInboundSms"));

  assert.equal(existsSync(join(root, "src/app/api/agent/sms/route.ts")), false);
  const agentSend = read("src/lib/conversations/agent-conversation-send.ts");
  assert.equal(agentSend.includes("smsClass"), false);
}

async function main() {
  testNormalization();
  testSchemaAndMigration();
  await testSuppressionTenantIsolation();
  await testQuarantineUniqueness();
  await testTransport();
  testExistingNotificationSms();
  testPhoneWriteSyncAndPhaseBoundaries();
  console.log("sms-phase1-foundation selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
