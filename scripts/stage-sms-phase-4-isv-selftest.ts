/**
 * Twilio ISV Phase 4 — subaccount-per-workspace.
 * Run: pnpm sms-phase-4-isv:selftest
 *
 * No production writes. No Twilio network. No migrate. No deploy.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasTwilioWebhookSigningConfig,
  parseTwilioSubaccountAuthTokenMap,
  resolveTwilioWebhookAuthTokens,
} from "../src/lib/sms/credentials";
import { handleInboundTwilioSms } from "../src/lib/sms/inbound";
import { isTwilioSid } from "../src/lib/sms/sids";
import {
  validateTwilioRequestSignature,
  validateTwilioRequestSignatureWithTokens,
} from "../src/lib/sms/signature";
import { sendSms, workspaceTwilioConfigFromRow } from "../src/lib/sms/transport";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const PARENT = "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SUB_A = "ACbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SUB_B = "ACcccccccccccccccccccccccccccccccc";
const MG_A = "MGdddddddddddddddddddddddddddddddd";
const PN_A = "PNeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const FROM = "+16475550199";
const TO = "+14165550100";
const TOKEN_A = "subaccount-a-token";
const TOKEN_PARENT = "parent-token";

function sign(url: string, params: Record<string, string>, token: string) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + (params[key] ?? ""), url);
  return createHmac("sha1", token).update(data, "utf8").digest("base64");
}

function withEnv(
  values: Record<string, string | undefined>,
  fn: () => void,
) {
  const prev: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    prev[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function testSchemaAndMigration() {
  const schema = read("prisma/schema.prisma");
  const phase1 = read(
    "prisma/migrations/20260919180000_sms_phase1_foundation/migration.sql",
  );
  const phase2 = read(
    "prisma/migrations/20260919193000_sms_phase2_outbound_dead_letter/migration.sql",
  );
  const phase4 = read(
    "prisma/migrations/20260919200000_sms_phase4_isv_subaccounts/migration.sql",
  );

  assert.ok(schema.includes("twilioPhoneE164"));
  assert.ok(schema.includes("twilioSubaccountSid         String?         @unique"));
  assert.ok(schema.includes("twilioMessagingServiceSid   String?         @unique"));
  assert.ok(schema.includes("twilioPhoneSid              String?         @unique"));
  assert.equal(schema.includes("twilioAuthToken"), false);
  assert.equal(schema.includes("twilioApiKey"), false);
  assert.equal(schema.includes("TWILIO_FROM_NUMBER"), false);

  const workspaceBlock = schema.split("model Workspace")[1]?.split("model ")[0] ?? "";
  assert.equal(workspaceBlock.includes("AuthToken"), false);
  assert.equal(workspaceBlock.includes("authToken"), false);

  assert.ok(phase1.includes("NOT APPLIED"));
  assert.ok(phase2.includes("NOT APPLIED"));
  assert.ok(phase4.includes("NOT APPLIED"));
  assert.equal(phase1.includes("twilioSubaccountSid"), false);
  assert.equal(phase2.includes("twilioSubaccountSid"), false);
  assert.ok(phase4.includes('ADD COLUMN "twilioSubaccountSid" TEXT'));
  assert.ok(phase4.includes('ADD COLUMN "twilioMessagingServiceSid" TEXT'));
  assert.ok(phase4.includes('ADD COLUMN "twilioPhoneSid" TEXT'));
  assert.ok(
    existsSync(
      join(root, "prisma/migrations/20260919180000_sms_phase1_foundation/migration.sql"),
    ),
  );
}

function testSidHelpersAndWorkspaceConfig() {
  assert.equal(isTwilioSid(PARENT, "AC"), true);
  assert.equal(isTwilioSid(MG_A, "MG"), true);
  assert.equal(isTwilioSid(PN_A, "PN"), true);
  assert.equal(isTwilioSid("AC123", "AC"), false);
  assert.equal(isTwilioSid(MG_A, "AC"), false);

  assert.equal(
    workspaceTwilioConfigFromRow(null).ok,
    false,
  );
  const missingSub = workspaceTwilioConfigFromRow({
    twilioSubaccountSid: null,
    twilioMessagingServiceSid: MG_A,
    twilioPhoneE164: FROM,
  });
  assert.equal(missingSub.ok, false);
  if (!missingSub.ok) assert.equal(missingSub.reason, "missing_subaccount");

  const missingMg = workspaceTwilioConfigFromRow({
    twilioSubaccountSid: SUB_A,
    twilioMessagingServiceSid: null,
    twilioPhoneE164: FROM,
  });
  assert.equal(missingMg.ok, false);
  if (!missingMg.ok) assert.equal(missingMg.reason, "missing_messaging_service");

  const ready = workspaceTwilioConfigFromRow({
    twilioSubaccountSid: SUB_A,
    twilioMessagingServiceSid: MG_A,
    twilioPhoneE164: FROM,
  });
  assert.equal(ready.ok, true);
  if (ready.ok) {
    assert.equal(ready.config.subaccountSid, SUB_A);
    assert.equal(ready.config.messagingServiceSid, MG_A);
    assert.equal(ready.config.phoneE164, FROM);
  }
}

function testWebhookTokenResolution() {
  withEnv(
    {
      TWILIO_ACCOUNT_SID: PARENT,
      TWILIO_AUTH_TOKEN: TOKEN_PARENT,
      TWILIO_SUBACCOUNT_AUTH_TOKENS: JSON.stringify({ [SUB_A]: TOKEN_A }),
      TWILIO_WEBHOOK_SHARED_KEY: undefined,
    },
    () => {
      assert.equal(hasTwilioWebhookSigningConfig(), true);
      assert.deepEqual(parseTwilioSubaccountAuthTokenMap()[SUB_A], TOKEN_A);

      const parentTokens = resolveTwilioWebhookAuthTokens({
        accountSid: PARENT,
      });
      assert.equal(parentTokens.includes(TOKEN_PARENT), true);
      assert.equal(parentTokens.includes(TOKEN_A), false);

      const subTokens = resolveTwilioWebhookAuthTokens({
        accountSid: SUB_A,
      });
      assert.equal(subTokens.includes(TOKEN_A), true);
      assert.equal(subTokens.includes(TOKEN_PARENT), false);

      const unknown = resolveTwilioWebhookAuthTokens({
        accountSid: SUB_B,
      });
      assert.equal(unknown.includes(TOKEN_PARENT), false);
      assert.equal(unknown.includes(TOKEN_A), false);

      const url = "https://houzzat.com/api/webhooks/twilio/inbound";
      const params = { AccountSid: SUB_A, To: FROM, From: TO, Body: "Hi" };
      assert.equal(
        validateTwilioRequestSignature({
          authToken: TOKEN_PARENT,
          signature: sign(url, params, TOKEN_A),
          url,
          params,
        }),
        false,
        "parent token must not validate subaccount traffic",
      );
      assert.equal(
        validateTwilioRequestSignatureWithTokens({
          authTokens: subTokens,
          signature: sign(url, params, TOKEN_A),
          url,
          params,
        }),
        true,
      );
    },
  );

  withEnv(
    {
      TWILIO_ACCOUNT_SID: PARENT,
      TWILIO_AUTH_TOKEN: TOKEN_PARENT,
      TWILIO_SUBACCOUNT_AUTH_TOKENS: "",
      TWILIO_WEBHOOK_SHARED_KEY: "shared-secret",
    },
    () => {
      const tokens = resolveTwilioWebhookAuthTokens({
        accountSid: SUB_A,
        signatureKeySid: "SKffffffffffffffffffffffffffffffff",
      });
      assert.deepEqual(tokens, ["shared-secret"]);
    },
  );

  withEnv(
    {
      TWILIO_ACCOUNT_SID: undefined,
      TWILIO_AUTH_TOKEN: undefined,
      TWILIO_SUBACCOUNT_AUTH_TOKENS: undefined,
      TWILIO_WEBHOOK_SHARED_KEY: undefined,
    },
    () => {
      assert.equal(hasTwilioWebhookSigningConfig(), false);
    },
  );
}

async function testTransportIsvTargeting() {
  const captured: { url: string; body: URLSearchParams; auth: string }[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    captured.push({
      url: String(url),
      body: new URLSearchParams(String(init?.body ?? "")),
      auth: String((init?.headers as Record<string, string>)?.Authorization ?? ""),
    });
    return new Response(JSON.stringify({ sid: "SM_ISV", status: "queued" }), {
      status: 201,
    });
  };
  const creds = { sid: PARENT, token: TOKEN_PARENT };
  const ready = {
    ok: true as const,
    config: {
      subaccountSid: SUB_A,
      messagingServiceSid: MG_A,
      phoneE164: FROM,
    },
  };

  const prevFrom = process.env.TWILIO_FROM_NUMBER;
  process.env.TWILIO_FROM_NUMBER = "+16045550123";
  try {
    const noWorkspace = await sendSms(
      { to: TO, body: "Hello", smsClass: "transactional" },
      { getCredentials: () => creds, fetchImpl },
    );
    assert.equal(noWorkspace.status, "skipped");
    if (noWorkspace.status === "skipped") {
      assert.equal(noWorkspace.reason, "missing_workspace");
    }

    const noSub = await sendSms(
      { to: TO, body: "Hello", smsClass: "transactional", workspaceId: "ws_a" },
      {
        getCredentials: () => creds,
        fetchImpl,
        resolveWorkspaceTwilio: async () => ({
          ok: false,
          reason: "missing_subaccount",
        }),
      },
    );
    assert.equal(noSub.status, "skipped");
    if (noSub.status === "skipped") {
      assert.equal(noSub.reason, "missing_subaccount");
    }

    const sent = await sendSms(
      { to: TO, body: "Hello", smsClass: "conversational", workspaceId: "ws_a" },
      {
        getCredentials: () => creds,
        fetchImpl,
        resolveWorkspaceTwilio: async () => ready,
        isSuppressed: async () => false,
      },
    );
    assert.equal(sent.status, "sent");
    const last = captured.at(-1);
    assert.ok(last);
    assert.ok(last.url.includes(`/Accounts/${SUB_A}/Messages.json`));
    assert.equal(last.url.includes(`/Accounts/${PARENT}/Messages.json`), false);
    assert.equal(last.body.get("MessagingServiceSid"), MG_A);
    assert.equal(last.body.get("From"), FROM);
    assert.equal(last.body.get("From") === "+16045550123", false);
    assert.equal(
      last.auth,
      `Basic ${Buffer.from(`${PARENT}:${TOKEN_PARENT}`).toString("base64")}`,
    );
  } finally {
    if (prevFrom === undefined) delete process.env.TWILIO_FROM_NUMBER;
    else process.env.TWILIO_FROM_NUMBER = prevFrom;
  }
}

async function testInboundToRoutingAndAccountMismatch() {
  const workspaces = new Map<
    string,
    { id: string; twilioPhoneE164: string; twilioSubaccountSid: string | null }
  >();
  workspaces.set(FROM, {
    id: "ws_a",
    twilioPhoneE164: FROM,
    twilioSubaccountSid: SUB_A,
  });
  const quarantines: Array<{ reason: string; workspaceId: string | null }> = [];
  const db = {
    workspace: {
      findUnique: async ({
        where,
      }: {
        where: { twilioPhoneE164?: string };
      }) =>
        where.twilioPhoneE164
          ? (workspaces.get(where.twilioPhoneE164) ?? null)
          : null,
    },
    lead: {
      findUnique: async () => null,
      findMany: async () => [],
    },
    message: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async () => {
        throw new Error("must not create");
      },
    },
    conversation: {
      findUnique: async () => null,
      create: async () => {
        throw new Error("must not create conversation");
      },
    },
    inboundSmsQuarantine: {
      findUnique: async () => null,
      create: async ({
        data,
      }: {
        data: { reason: string; workspaceId?: string | null };
      }) => {
        quarantines.push({
          reason: data.reason,
          workspaceId: data.workspaceId ?? null,
        });
      },
    },
    smsSuppression: {
      findUnique: async () => null,
      upsert: async () => ({ id: "x" }),
      deleteMany: async () => ({ count: 0 }),
    },
  };

  const mismatch = await handleInboundTwilioSms(
    {
      MessageSid: "SMmismatch1",
      AccountSid: SUB_B,
      From: TO,
      To: FROM,
      Body: "Hello",
    },
    { db: db as never, scheduleNotify: () => undefined },
  );
  assert.equal(mismatch.outcome, "account_mismatch");
  assert.equal(quarantines[0]?.reason, "account_mismatch");
  assert.equal(quarantines[0]?.workspaceId, "ws_a");

  const inboundSrc = read("src/lib/sms/inbound.ts");
  assert.ok(inboundSrc.includes("where: { twilioPhoneE164: toE164 }"));
  assert.ok(inboundSrc.includes("account_mismatch"));

  const keywords = read("src/lib/sms/keywords.ts");
  assert.ok(keywords.includes('START_KEYWORDS = new Set(["START", "UNSTOP"])'));
  assert.ok(keywords.includes("does not treat YES as START"));
}

function testRoutesAndBoundaries() {
  const inbound = read("src/app/api/webhooks/twilio/inbound/route.ts");
  const status = read("src/app/api/webhooks/twilio/status/route.ts");
  const transport = read("src/lib/sms/transport.ts");
  const creds = read("src/lib/sms/credentials.ts");

  assert.ok(inbound.includes("resolveTwilioWebhookAuthTokens"));
  assert.ok(inbound.includes("params.AccountSid"));
  assert.ok(inbound.includes("handleInboundTwilioSms"));
  assert.ok(status.includes("resolveTwilioWebhookAuthTokens"));
  assert.ok(status.includes("applyTwilioStatusCallback"));
  assert.equal(transport.includes("TWILIO_FROM_NUMBER"), false);
  assert.ok(transport.includes("MessagingServiceSid"));
  assert.ok(creds.includes("TWILIO_SUBACCOUNT_AUTH_TOKENS"));
  assert.equal(creds.includes("prisma"), false);
  assert.equal(
    existsSync(join(root, "src/lib/sms/provision-twilio.ts")),
    false,
    "Phase 4 must not automate Twilio resource creation",
  );
}

async function main() {
  testSchemaAndMigration();
  testSidHelpersAndWorkspaceConfig();
  testWebhookTokenResolution();
  await testTransportIsvTargeting();
  await testInboundToRoutingAndAccountMismatch();
  testRoutesAndBoundaries();
  console.log("sms-phase-4-isv selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
