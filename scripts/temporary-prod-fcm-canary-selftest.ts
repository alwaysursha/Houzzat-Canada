/**
 * TEMPORARY PRODUCTION FCM CANARY — hermetic selftest.
 * Run: pnpm temporary-prod-fcm-canary:selftest
 * Does not send production push or mutate production rows.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FORBIDDEN_FCM_CANARY_CLIENT_KEYS,
  TEMPORARY_PROD_FCM_CANARY_AGENT_EMAIL,
  TEMPORARY_PROD_FCM_CANARY_CONFIRM,
  TEMPORARY_PROD_FCM_CANARY_CONVERSATION_ID,
  TEMPORARY_PROD_FCM_CANARY_EXPECTED_LATEST_BODY,
  TEMPORARY_PROD_FCM_CANARY_LEAD_ID,
  TEMPORARY_PROD_FCM_CANARY_MARK,
  TEMPORARY_PROD_FCM_CANARY_PAYLOAD,
  authorizeTemporaryProdFcmCanary,
  evaluateTemporaryProdFcmCanaryBaseline,
  formatTemporaryProdFcmCanaryLog,
  parseTemporaryProdFcmCanaryBody,
  runTemporaryProdFcmCanary,
  type TemporaryProdFcmCanarySnapshot,
} from "../src/lib/notifications/temporary-prod-fcm-canary";
import type { PushDeliveryResult } from "../src/lib/notifications/push";
import { GET } from "../src/app/api/admin/temporary-prod-fcm-canary/route";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const AGENT_ID = "cmrz0wkx80001d6u0ot6qtmqi";
const WS_ID = "ws_houzzat_prod";

function snapshot(
  overrides: Partial<TemporaryProdFcmCanarySnapshot> = {},
): TemporaryProdFcmCanarySnapshot {
  const created = new Date("2026-09-18T14:50:57.984Z");
  const messages = Array.from({ length: 6 }, (_, i) => ({
    id: `msg_${i}`,
    body: i === 0 ? TEMPORARY_PROD_FCM_CANARY_EXPECTED_LATEST_BODY : `older_${i}`,
    createdAt: new Date(created.getTime() - i * 1000),
  }));
  return {
    houzzatWorkspaceId: WS_ID,
    houzzatWorkspaceActive: true,
    lead: {
      id: TEMPORARY_PROD_FCM_CANARY_LEAD_ID,
      workspaceId: WS_ID,
      assignedAgentId: AGENT_ID,
    },
    conversation: {
      id: TEMPORARY_PROD_FCM_CANARY_CONVERSATION_ID,
      workspaceId: WS_ID,
      leadId: TEMPORARY_PROD_FCM_CANARY_LEAD_ID,
    },
    messages,
    agent: {
      id: AGENT_ID,
      disabledAt: null,
      pushNotificationPrefs: null,
      agentProfileActive: true,
    },
    houzzatproDeviceCount: 4,
    ...overrides,
  };
}

function assertLogSafe(line: string) {
  const lower = line.toLowerCase();
  assert.equal(lower.includes("token="), false);
  assert.equal(line.includes("@"), false);
  assert.equal(line.includes("FCM delivery test"), false);
  assert.equal(line.includes("HouzzatPRO push test"), false);
  assert.equal(line.includes(TEMPORARY_PROD_FCM_CANARY_EXPECTED_LATEST_BODY), false);
}

function testAuthz() {
  assert.deepEqual(
    authorizeTemporaryProdFcmCanary({
      authenticated: false,
      role: null,
      trustedOrigin: true,
    }),
    { ok: false, status: 401, reason: "unauthenticated" },
  );
  assert.equal(
    authorizeTemporaryProdFcmCanary({
      authenticated: true,
      role: "BUYER",
      trustedOrigin: true,
    }).ok,
    false,
  );
  assert.equal(
    authorizeTemporaryProdFcmCanary({
      authenticated: true,
      role: "AGENT",
      trustedOrigin: true,
    }).ok,
    false,
  );
  assert.equal(
    authorizeTemporaryProdFcmCanary({
      authenticated: true,
      role: "ADMIN",
      trustedOrigin: false,
    }).ok,
    false,
  );
  assert.deepEqual(
    authorizeTemporaryProdFcmCanary({
      authenticated: true,
      role: "ADMIN",
      trustedOrigin: true,
    }),
    { ok: true },
  );
}

function testParseBodyCannotOverride() {
  assert.equal(
    parseTemporaryProdFcmCanaryBody({
      mode: "send",
      confirm: TEMPORARY_PROD_FCM_CANARY_CONFIRM,
    }).ok,
    true,
  );
  assert.equal(
    parseTemporaryProdFcmCanaryBody({
      mode: "send",
      confirm: "wrong",
    }).ok,
    false,
  );
  for (const key of FORBIDDEN_FCM_CANARY_CLIENT_KEYS) {
    const body: Record<string, unknown> = {
      mode: "send",
      confirm: TEMPORARY_PROD_FCM_CANARY_CONFIRM,
      [key]: "x",
    };
    assert.equal(
      parseTemporaryProdFcmCanaryBody(body).ok,
      false,
      key,
    );
  }
  assert.equal(
    parseTemporaryProdFcmCanaryBody({
      mode: "send",
      confirm: TEMPORARY_PROD_FCM_CANARY_CONFIRM,
      href: "/evil",
    }).ok,
    false,
  );
}

function testBaselineGuards() {
  assert.equal(evaluateTemporaryProdFcmCanaryBaseline(snapshot()).ok, true);
  assert.equal(
    evaluateTemporaryProdFcmCanaryBaseline(
      snapshot({ houzzatWorkspaceActive: false }),
    ).ok,
    false,
  );
  assert.equal(
    evaluateTemporaryProdFcmCanaryBaseline(
      snapshot({
        lead: {
          id: TEMPORARY_PROD_FCM_CANARY_LEAD_ID,
          workspaceId: WS_ID,
          assignedAgentId: "someone_else",
        },
      }),
    ).error,
    "assignment_mismatch",
  );
  assert.equal(
    evaluateTemporaryProdFcmCanaryBaseline(
      snapshot({
        agent: {
          id: AGENT_ID,
          disabledAt: new Date(),
          pushNotificationPrefs: null,
          agentProfileActive: true,
        },
      }),
    ).error,
    "agent_disabled",
  );
  assert.equal(
    evaluateTemporaryProdFcmCanaryBaseline(
      snapshot({
        agent: {
          id: AGENT_ID,
          disabledAt: null,
          pushNotificationPrefs: { chat_message: false },
          agentProfileActive: true,
        },
      }),
    ).error,
    "pref_off",
  );
  assert.equal(
    evaluateTemporaryProdFcmCanaryBaseline(
      snapshot({ houzzatproDeviceCount: 0 }),
    ).error,
    "no_device",
  );
  assert.equal(
    evaluateTemporaryProdFcmCanaryBaseline(
      snapshot({
        messages: snapshot().messages.slice(0, 5),
      }),
    ).error,
    "message_count_mismatch",
  );
  assert.equal(
    evaluateTemporaryProdFcmCanaryBaseline(
      snapshot({
        conversation: {
          id: "other",
          workspaceId: WS_ID,
          leadId: TEMPORARY_PROD_FCM_CANARY_LEAD_ID,
        },
      }),
    ).error,
    "conversation_mismatch",
  );
}

async function testGetCannotSend() {
  const res = await GET();
  assert.equal(res.status, 405);
}

async function testRunGuardsAndDelivery() {
  let delivers = 0;
  let claimed = 0;
  const sentRow: PushDeliveryResult = {
    userId: AGENT_ID,
    status: "sent",
    deviceCount: 4,
    sentCount: 1,
    failedCount: 2,
    skippedCount: 0,
    unregisteredCount: 1,
  };

  const baseDeps = {
    isProductionRuntime: () => true,
    isFirebaseReady: () => true,
    loadSnapshot: async () => snapshot(),
    claimOneShot: async () => {
      claimed += 1;
      return "claimed" as const;
    },
    deliverPushToUsersNow: async (userIds: Array<string | null | undefined>) => {
      delivers += 1;
      assert.deepEqual(userIds, [AGENT_ID]);
      return [sentRow];
    },
  };

  const notProd = await runTemporaryProdFcmCanary(
    { mode: "send", confirm: TEMPORARY_PROD_FCM_CANARY_CONFIRM },
    { ...baseDeps, isProductionRuntime: () => false },
  );
  assert.equal(notProd.status, "blocked");
  assert.equal(notProd.error, "not_production");
  assert.equal(delivers, 0);

  const firebase = await runTemporaryProdFcmCanary(
    { mode: "send", confirm: TEMPORARY_PROD_FCM_CANARY_CONFIRM },
    { ...baseDeps, isFirebaseReady: () => false },
  );
  assert.equal(firebase.status, "firebase_not_configured");
  assert.equal(delivers, 0);

  const prefOff = await runTemporaryProdFcmCanary(
    { mode: "send", confirm: TEMPORARY_PROD_FCM_CANARY_CONFIRM },
    {
      ...baseDeps,
      loadSnapshot: async () =>
        snapshot({
          agent: {
            id: AGENT_ID,
            disabledAt: null,
            pushNotificationPrefs: { chat_message: false },
            agentProfileActive: true,
          },
        }),
    },
  );
  assert.equal(prefOff.error, "pref_off");
  assert.equal(delivers, 0);

  const dry = await runTemporaryProdFcmCanary(
    { mode: "dry-run", confirm: TEMPORARY_PROD_FCM_CANARY_CONFIRM },
    baseDeps,
  );
  assert.equal(dry.status, "dry-run");
  assert.equal(dry.ok, true);
  assert.equal(delivers, 0);
  assert.equal(claimed, 0);

  const sent = await runTemporaryProdFcmCanary(
    { mode: "send", confirm: TEMPORARY_PROD_FCM_CANARY_CONFIRM },
    baseDeps,
  );
  assert.equal(sent.status, "sent");
  assert.equal(sent.ok, true);
  assert.equal(sent.devices, 4);
  assert.equal(sent.sent, 1);
  assert.equal(sent.failed, 2);
  assert.equal(sent.skipped, 0);
  assert.equal(sent.unregistered, 1);
  assert.equal(delivers, 1);
  assert.equal(claimed, 1);

  const replay = await runTemporaryProdFcmCanary(
    { mode: "send", confirm: TEMPORARY_PROD_FCM_CANARY_CONFIRM },
    { ...baseDeps, claimOneShot: async () => "already" },
  );
  assert.equal(replay.status, "already_sent");
  assert.equal(delivers, 1);
}

async function testExactlyOneRecipientAndNoMutation() {
  let lastPayload: unknown;
  await runTemporaryProdFcmCanary(
    { mode: "send", confirm: TEMPORARY_PROD_FCM_CANARY_CONFIRM },
    {
      isProductionRuntime: () => true,
      isFirebaseReady: () => true,
      loadSnapshot: async () => snapshot(),
      claimOneShot: async () => "claimed",
      deliverPushToUsersNow: async (userIds, payload) => {
        lastPayload = { userIds, payload };
        return [
          {
            userId: AGENT_ID,
            status: "sent",
            deviceCount: 1,
            sentCount: 1,
            failedCount: 0,
            skippedCount: 0,
            unregisteredCount: 0,
          },
        ];
      },
    },
  );
  assert.deepEqual(lastPayload, {
    userIds: [AGENT_ID],
    payload: TEMPORARY_PROD_FCM_CANARY_PAYLOAD,
  });
}

function testSafeLogsAndResponse() {
  const line = formatTemporaryProdFcmCanaryLog(AGENT_ID, {
    status: "sent",
    deviceCount: 4,
    sentCount: 1,
    failedCount: 2,
    skippedCount: 0,
    unregisteredCount: 1,
  });
  assert.ok(line.startsWith("[push:canary] chat_message result "));
  assertLogSafe(line);
  assert.equal(line.includes(AGENT_ID), false);
  assert.ok(line.includes("userPrefix=cmrz0wkx"));
  assert.ok(line.includes("devices=4"));
  assert.ok(line.includes("unregistered=1"));
}

function testSourceContracts() {
  const lib = read("src/lib/notifications/temporary-prod-fcm-canary.ts");
  const route = read("src/app/api/admin/temporary-prod-fcm-canary/route.ts");
  assert.ok(lib.includes(TEMPORARY_PROD_FCM_CANARY_MARK));
  assert.ok(route.includes(TEMPORARY_PROD_FCM_CANARY_MARK));
  assert.ok(route.includes("requireAdminUser"));
  assert.ok(route.includes("isTrustedStaffMutationOriginForRequest"));
  assert.ok(route.includes("export async function GET"));
  assert.ok(route.includes("405"));
  assert.ok(lib.includes("deliverPushToUsersNow"));
  assert.ok(lib.includes("await deliver("));
  assert.ok(!lib.includes("sendPushToUser"));
  assert.ok(!route.includes("sendPushToUser"));
  assert.ok(!lib.includes("notifyAssignedAgentOfCustomerChatMessage"));
  assert.ok(!lib.includes("handleCustomerConversationSend"));
  assert.ok(!lib.includes("leadActivity"));
  assert.ok(!lib.includes("LeadActivity"));
  assert.ok(!lib.includes("CustomerAlert"));
  assert.ok(!lib.includes("ConsentEvent"));
  assert.ok(!lib.includes("LeadEmailLog"));
  assert.ok(!lib.includes("AgentTask"));
  assert.ok(!lib.includes("createConversationMessage"));
  assert.ok(lib.includes("verificationToken"));
  assert.ok(lib.includes('type: "chat_message"'));
  assert.ok(lib.includes(TEMPORARY_PROD_FCM_CANARY_AGENT_EMAIL));
  assert.ok(lib.includes(TEMPORARY_PROD_FCM_CANARY_LEAD_ID));
  assert.ok(lib.includes(TEMPORARY_PROD_FCM_CANARY_CONVERSATION_ID));
  assert.ok(lib.includes("isFirebaseServiceAccountReady"));
  assert.ok(lib.includes('VERCEL_ENV === "production"'));
  const push = read("src/lib/notifications/push.ts");
  assert.ok(push.includes("prisma.pushDevice.deleteMany"));
  assert.ok(lib.includes("deliverPushToUsersNow"));
}

function testPayloadHardcoded() {
  assert.equal(TEMPORARY_PROD_FCM_CANARY_PAYLOAD.type, "chat_message");
  assert.equal(
    TEMPORARY_PROD_FCM_CANARY_PAYLOAD.href,
    `/agent/chats?lead=${TEMPORARY_PROD_FCM_CANARY_LEAD_ID}`,
  );
}

async function main() {
  testAuthz();
  testParseBodyCannotOverride();
  testBaselineGuards();
  await testGetCannotSend();
  await testRunGuardsAndDelivery();
  await testExactlyOneRecipientAndNoMutation();
  testSafeLogsAndResponse();
  testSourceContracts();
  testPayloadHardcoded();
  console.log("temporary-prod-fcm-canary selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
