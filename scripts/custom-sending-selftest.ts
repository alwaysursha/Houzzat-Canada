/**
 * Custom tenant sending. No live provider calls and no production sends.
 * Run: TMPDIR=/tmp node --import tsx scripts/custom-sending-selftest.ts
 */
import assert from "node:assert/strict";
import {
  customFromAppliesToKind,
  enabledCustomFromHeader,
  prepareSendingDomain,
  CustomSendingError,
} from "../src/lib/email/custom-sending-policy";
import { parseResendDomain } from "../src/lib/email/resend-domains";
import {
  prepareCustomSending,
  setCustomSendingEnabled,
  sendCustomSendingTest,
} from "../src/lib/platform/email/master-custom-sending";

const WORKSPACE = "ws_canary";

function highOctaneRequest(from = "alerts@highoctaneniagara.ca") {
  return {
    sendingDomain: "highoctaneniagara.ca",
    returnPathHost: "send.highoctaneniagara.ca",
    senderDisplayName: "HIGH OCTANE Real Estate",
    fromEmail: from,
    replyToEmail: "saad@highoctaneniagara.ca",
  };
}

function testFromDomainMustBeVerified() {
  assert.throws(
    () =>
      prepareSendingDomain({
        ...highOctaneRequest(),
        sendingDomain: "send.highoctaneniagara.ca",
      }),
    (error: unknown) =>
      error instanceof CustomSendingError && error.code === "FROM_DOMAIN_MUST_BE_VERIFIED",
  );
  const prepared = prepareSendingDomain(highOctaneRequest());
  assert.equal(prepared.sendingDomain, "highoctaneniagara.ca");
  assert.equal(prepared.returnPathLabel, "send");
  assert.equal(prepared.returnPathHost, "send.highoctaneniagara.ca");
}

function testProductionFromStaysOffUntilEnabled() {
  const base = {
    customDomain: "highoctaneniagara.ca",
    fromEmail: "alerts@highoctaneniagara.ca",
    senderDisplayName: "HIGH OCTANE Real Estate",
  };
  assert.equal(
    enabledCustomFromHeader({
      ...base,
      domainStatus: "VERIFIED",
      customSendingEnabled: false,
    }),
    null,
  );
  assert.equal(
    enabledCustomFromHeader({
      ...base,
      domainStatus: "PENDING",
      customSendingEnabled: true,
    }),
    null,
  );
  assert.equal(
    enabledCustomFromHeader({
      ...base,
      customDomain: "send.highoctaneniagara.ca",
      domainStatus: "VERIFIED",
      customSendingEnabled: true,
    }),
    null,
  );
  assert.equal(
    enabledCustomFromHeader({
      ...base,
      domainStatus: "VERIFIED",
      customSendingEnabled: true,
    }),
    "HIGH OCTANE Real Estate <alerts@highoctaneniagara.ca>",
  );
  assert.equal(customFromAppliesToKind("price_reduction"), true);
  assert.equal(customFromAppliesToKind("password_reset"), false);
  assert.equal(customFromAppliesToKind("verify_email"), false);
}

function testProviderRecordsAreQualified() {
  const parsed = parseResendDomain(
    {
      id: "dom_1",
      name: "highoctaneniagara.ca",
      status: "not_started",
      records: [
        {
          record: "DKIM",
          name: "resend._domainkey",
          type: "TXT",
          value: "p=test",
        },
        {
          record: "SPF",
          name: "send",
          type: "MX",
          value: "feedback-smtp.us-east-1.amazonses.com",
          priority: 10,
        },
      ],
    },
    "highoctaneniagara.ca",
  );
  assert.ok(parsed);
  assert.deepEqual(
    parsed.records.map((record) => record.host),
    ["resend._domainkey.highoctaneniagara.ca", "send.highoctaneniagara.ca"],
  );
  assert.equal(
    parsed.records.some((record) => record.host === "highoctaneniagara.ca"),
    false,
  );
}

function fakeDb(status: "PENDING" | "VERIFIED" = "PENDING") {
  const row = {
    workspaceId: WORKSPACE,
    contactEmail: null,
    replyToEmail: "saad@highoctaneniagara.ca",
    senderDisplayName: "HIGH OCTANE Real Estate",
    customDomain: "highoctaneniagara.ca",
    fromEmail: "alerts@highoctaneniagara.ca",
    returnPathLabel: "send",
    providerDomainId: "dom_1",
    customSendingEnabled: false,
    domainStatus: status,
    dnsRecordsJson: [],
    fallbackFrom: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const audits: string[] = [];
  const db = {
    workspace: {
      findUnique: async () => ({ id: WORKSPACE }),
    },
    workspaceEmailIdentity: {
      findUnique: async () => row,
      update: async ({ data }: { data: Partial<typeof row> }) => {
        Object.assign(row, data);
        return row;
      },
      upsert: async ({
        create,
        update,
      }: {
        create: Partial<typeof row>;
        update: Partial<typeof row>;
      }) => {
        Object.assign(row, row.providerDomainId ? update : create);
        return row;
      },
    },
    platformAuditEvent: {
      create: async ({ data }: { data: { action: string } }) => {
        audits.push(data.action);
        return { id: "audit" };
      },
    },
  };
  return { db, row, audits };
}

function resend(status: string) {
  return {
    create: async () => ({ status: 500, body: null }),
    list: async () => ({ status: 200, body: { data: [] } }),
    get: async () => ({
      status: 200,
      body: {
        id: "dom_1",
        name: "highoctaneniagara.ca",
        status,
        records: [],
      },
    }),
  };
}

async function testEnableAndTestStayClosed() {
  const pending = fakeDb("PENDING");
  await assert.rejects(
    () =>
      setCustomSendingEnabled({
        prisma: pending.db as never,
        operatorId: "op",
        workspaceId: WORKSPACE,
        enabled: true,
        resend: resend("pending"),
      }),
    (error: unknown) => error instanceof CustomSendingError && error.code === "NOT_VERIFIED",
  );
  assert.equal(pending.row.customSendingEnabled, false);

  await assert.rejects(
    () =>
      sendCustomSendingTest({
        prisma: pending.db as never,
        operatorId: "op",
        workspaceId: WORKSPACE,
        to: "operator@example.com",
        resend: resend("pending"),
      }),
    (error: unknown) => error instanceof CustomSendingError && error.code === "NOT_VERIFIED",
  );

  const verified = fakeDb("VERIFIED");
  const enabled = await setCustomSendingEnabled({
    prisma: verified.db as never,
    operatorId: "op",
    workspaceId: WORKSPACE,
    enabled: true,
    resend: resend("verified"),
  });
  assert.equal(enabled.customSendingEnabled, true);
  assert.equal(
    enabled.activeFrom,
    "HIGH OCTANE Real Estate <alerts@highoctaneniagara.ca>",
  );

  const other = fakeDb("VERIFIED");
  other.row.workspaceId = "ws_other";
  other.row.customDomain = "other.test";
  other.row.fromEmail = "alerts@other.test";
  await assert.rejects(
    () =>
      setCustomSendingEnabled({
        prisma: other.db as never,
        operatorId: "op",
        workspaceId: WORKSPACE,
        enabled: true,
        resend: resend("verified"),
      }),
    (error: unknown) =>
      error instanceof CustomSendingError && error.code === "RESEND_DOMAIN_MISMATCH",
  );
}

async function testPrepareDoesNotEnable() {
  const empty = fakeDb("PENDING");
  empty.row.providerDomainId = null;
  empty.row.customDomain = null;
  const view = await prepareCustomSending({
    prisma: empty.db as never,
    operatorId: "op",
    workspaceId: WORKSPACE,
    request: highOctaneRequest(),
    resend: {
      create: async () => ({
        status: 201,
        body: {
          id: "dom_new",
          name: "highoctaneniagara.ca",
          status: "not_started",
          records: [
            { record: "DKIM", name: "resend._domainkey", type: "TXT", value: "p=issued" },
          ],
        },
      }),
      get: async () => ({ status: 404, body: null }),
      list: async () => ({ status: 200, body: { data: [] } }),
    },
  });
  assert.equal(view.customSendingEnabled, false);
  assert.equal(view.domainStatus, "PENDING");
  assert.equal(view.records[0]?.host, "resend._domainkey.highoctaneniagara.ca");
  assert.equal(view.activeFrom, null);
}

async function main() {
  testFromDomainMustBeVerified();
  testProductionFromStaysOffUntilEnabled();
  testProviderRecordsAreQualified();
  await testEnableAndTestStayClosed();
  await testPrepareDoesNotEnable();
  console.log("custom-sending-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
