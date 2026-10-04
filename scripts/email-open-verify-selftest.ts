/**
 * Email-open auto-verification: safety, idempotency, account access.
 * Run: pnpm email-open-verify:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAccountAccessStatus } from "../src/lib/account-access";
import {
  EMAIL_VERIFIED_BY_SYSTEM_BODY,
  applyEmailOpenAutoVerify,
  evaluateEmailOpenAutoVerify,
  type EmailOpenAutoVerifyCustomer,
  type EmailOpenAutoVerifyLog,
  type EmailOpenVerifyStore,
} from "../src/lib/auth/email-open-verification";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function log(overrides: Partial<EmailOpenAutoVerifyLog> = {}): EmailOpenAutoVerifyLog {
  return {
    id: "log-1",
    leadId: "lead-1",
    toEmail: "buyer@example.com",
    workspaceId: "ws-1",
    leadWorkspaceId: "ws-1",
    customerId: "user-1",
    ...overrides,
  };
}

function customer(
  overrides: Partial<EmailOpenAutoVerifyCustomer> = {},
): EmailOpenAutoVerifyCustomer {
  return {
    id: "user-1",
    email: "buyer@example.com",
    emailVerified: null,
    role: "BUYER",
    disabledAt: null,
    workspaceId: "ws-1",
    ...overrides,
  };
}

function testSafetyMatrix() {
  assert.equal(evaluateEmailOpenAutoVerify({ log: log(), customer: customer() }).ok, true);
  assert.equal(
    evaluateEmailOpenAutoVerify({
      log: log({ toEmail: "Buyer@Example.com" }),
      customer: customer({ email: "buyer@example.com" }),
    }).ok,
    true,
    "case-insensitive recipient match",
  );
  assert.equal(
    evaluateEmailOpenAutoVerify({
      log: log({ toEmail: "old@example.com" }),
      customer: customer({ email: "new@example.com" }),
    }).ok,
    false,
  );
  assert.equal(
    evaluateEmailOpenAutoVerify({
      log: log(),
      customer: customer({ emailVerified: new Date() }),
    }).ok,
    false,
  );
  assert.equal(
    evaluateEmailOpenAutoVerify({
      log: log(),
      customer: customer({ role: "AGENT" }),
    }).ok,
    false,
  );
  assert.equal(
    evaluateEmailOpenAutoVerify({
      log: log(),
      customer: customer({ disabledAt: new Date() }),
    }).ok,
    false,
  );
  assert.equal(
    evaluateEmailOpenAutoVerify({
      log: log({ workspaceId: "ws-1", leadWorkspaceId: "ws-2" }),
      customer: customer(),
    }).ok,
    false,
  );
  assert.equal(
    evaluateEmailOpenAutoVerify({
      log: log({ customerId: "user-2" }),
      customer: customer(),
    }).ok,
    false,
  );
  assert.equal(
    evaluateEmailOpenAutoVerify({ log: log({ customerId: null }), customer: null }).ok,
    false,
  );
}

function memoryStore(state: {
  emailVerified: Date | null;
  activities: string[];
}): EmailOpenVerifyStore {
  let lock: Promise<void> = Promise.resolve();
  return {
    async stampEmailVerifiedIfUnverified(input) {
      const previous = lock;
      let release!: () => void;
      lock = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        if (state.emailVerified) return false;
        state.emailVerified = input.at;
        return true;
      } finally {
        release();
      }
    },
    async createSystemVerificationActivity() {
      state.activities.push(EMAIL_VERIFIED_BY_SYSTEM_BODY);
    },
  };
}

async function testFirstOpenVerifiesAndUnlocks() {
  const state = { emailVerified: null as Date | null, activities: [] as string[] };
  const createdAt = new Date("2020-01-01T00:00:00.000Z");
  const result = await applyEmailOpenAutoVerify(memoryStore(state), {
    log: log(),
    customer: customer(),
    providerId: "re_1",
    at: new Date("2026-10-04T12:00:00.000Z"),
  });
  assert.equal(result, "verified");
  assert.ok(state.emailVerified);
  assert.deepEqual(state.activities, [EMAIL_VERIFIED_BY_SYSTEM_BODY]);
  assert.equal(
    getAccountAccessStatus({
      emailVerified: state.emailVerified,
      createdAt,
    }),
    "verified_unlocked",
  );
}

async function testRepeatOpenDoesNotDuplicate() {
  const already = new Date("2026-10-01T00:00:00.000Z");
  const state = { emailVerified: already, activities: [] as string[] };
  const result = await applyEmailOpenAutoVerify(memoryStore(state), {
    log: log(),
    customer: customer({ emailVerified: already }),
    providerId: "re_2",
    at: new Date(),
  });
  assert.equal(result, "skipped");
  assert.equal(state.emailVerified, already);
  assert.equal(state.activities.length, 0);
}

async function testConcurrentOpensIdempotent() {
  const state = { emailVerified: null as Date | null, activities: [] as string[] };
  const store = memoryStore(state);
  const input = {
    log: log(),
    customer: customer(),
    providerId: "re_dup",
    at: new Date(),
  };
  const [a, b] = await Promise.all([
    applyEmailOpenAutoVerify(store, input),
    applyEmailOpenAutoVerify(store, input),
  ]);
  const verifiedCount = [a, b].filter((row) => row === "verified").length;
  assert.equal(verifiedCount, 1);
  assert.equal(state.activities.length, 1);
}

function testWiringPreservesOpenTracking() {
  const webhook = read("src/lib/email/resend-webhook.ts");
  assert.ok(webhook.includes("openCount: { increment: 1 }"));
  assert.ok(webhook.includes('type: "email_opened"'));
  assert.ok(webhook.includes("verifyCustomerEmailFromLeadEmailOpen"));
  assert.ok(webhook.includes("email.opened"));
  const table = read("src/components/agent/LeadsTableClient.tsx");
  assert.ok(table.includes("contactVerified(lead, \"email\")"));
  assert.ok(table.includes("ContactValidityIcon"));
  assert.ok(table.includes("emailVerified"));
}

function testSystemCopyDistinctFromAgent() {
  const agent = read("src/app/api/agent/leads/verify-contact/route.ts");
  assert.ok(agent.includes("Account set to Verified Unlocked by agent"));
  assert.ok(!agent.includes(EMAIL_VERIFIED_BY_SYSTEM_BODY));
  const impl = read("src/lib/auth/email-open-verification.ts");
  assert.ok(impl.includes('type: "contact_verify"'));
  assert.ok(impl.includes("userId: null"));
  assert.ok(impl.includes('source: "email_open"'));
}

async function main() {
  testSafetyMatrix();
  await testFirstOpenVerifiesAndUnlocks();
  await testRepeatOpenDoesNotDuplicate();
  await testConcurrentOpensIdempotent();
  testWiringPreservesOpenTracking();
  testSystemCopyDistinctFromAgent();
  console.log("email-open-verify-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
