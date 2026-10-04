/**
 * 24-hour delayed Verify-your-email job.
 * Run: pnpm verify-email-nudge:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  VERIFY_EMAIL_KIND,
  VERIFY_EMAIL_NUDGE_KIND,
} from "../src/lib/auth/email-verification";
import {
  EMAIL_VERIFY_NUDGE_CLAIM_STALE_MS,
  EMAIL_VERIFY_NUDGE_MS,
  emailAddressChangeVerificationPatch,
  emailVerifyNudgeStaleBefore,
  evaluateVerifyEmailNudge,
  nextEmailVerifyNudgeDueAt,
  runVerifyEmailNudgeJob,
  type VerifyEmailNudgeCandidate,
  type VerifyEmailNudgeStore,
} from "../src/lib/auth/verify-email-nudge";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const now = new Date("2026-10-04T12:00:00.000Z");
const staleBefore = emailVerifyNudgeStaleBefore(now);

function candidate(
  overrides: Partial<VerifyEmailNudgeCandidate> = {},
): VerifyEmailNudgeCandidate {
  return {
    id: "user-1",
    email: "buyer@example.com",
    name: "Buyer",
    role: "BUYER",
    workspaceId: "ws-1",
    disabledAt: null,
    emailVerified: null,
    emailVerifyNudgeDueAt: new Date(now.getTime() - 1000),
    emailVerifyNudgeSentAt: null,
    ...overrides,
  };
}

type NudgeLog = { userId: string; email: string; kind: string };

function memoryNudgeStore(
  rows: VerifyEmailNudgeCandidate[],
  sends: string[],
  logs: NudgeLog[] = [],
) {
  const db = new Map(rows.map((row) => [row.id, { ...row }]));
  let claimLock = Promise.resolve();

  const store: VerifyEmailNudgeStore = {
    async listDue(at) {
      const stale = emailVerifyNudgeStaleBefore(at);
      return [...db.values()].filter((row) => {
        if (row.emailVerified || row.disabledAt) return false;
        if (!row.emailVerifyNudgeDueAt || row.emailVerifyNudgeDueAt > at) {
          return false;
        }
        if (!row.emailVerifyNudgeSentAt) return true;
        return row.emailVerifyNudgeSentAt.getTime() <= stale.getTime();
      });
    },
    async reload(userId) {
      const row = db.get(userId);
      return row ? { ...row } : null;
    },
    async claimLease(input) {
      const previous = claimLock;
      let release!: () => void;
      claimLock = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        const row = db.get(input.userId);
        if (!row || row.emailVerified) return false;
        if (
          row.emailVerifyNudgeSentAt &&
          row.emailVerifyNudgeSentAt.getTime() > input.staleBefore.getTime()
        ) {
          return false;
        }
        row.emailVerifyNudgeSentAt = input.at;
        return true;
      } finally {
        release();
      }
    },
    async releaseLease(userId) {
      const row = db.get(userId);
      if (row && !row.emailVerified) row.emailVerifyNudgeSentAt = null;
    },
    async hasAutomaticNudgeDelivery(input) {
      const email = input.email.trim().toLowerCase();
      return logs.some(
        (log) =>
          log.userId === input.userId &&
          log.email.trim().toLowerCase() === email &&
          log.kind === VERIFY_EMAIL_NUDGE_KIND,
      );
    },
    async resolveOrigin() {
      return "https://houzzat.com";
    },
    async send(input) {
      const row = db.get(input.customerId);
      if (row?.emailVerified) return "skipped";
      sends.push(input.email);
      logs.push({
        userId: input.customerId,
        email: input.email,
        kind: VERIFY_EMAIL_NUDGE_KIND,
      });
      return "sent";
    },
  };
  return { db, store, logs };
}

function testEligibility() {
  assert.equal(evaluateVerifyEmailNudge(candidate(), now).ok, true);
  assert.equal(
    evaluateVerifyEmailNudge(
      candidate({
        emailVerifyNudgeDueAt: new Date(now.getTime() + 60_000),
      }),
      now,
    ).ok,
    false,
  );
  assert.equal(
    evaluateVerifyEmailNudge(
      candidate({ emailVerified: new Date() }),
      now,
    ).ok,
    false,
  );
  assert.equal(
    evaluateVerifyEmailNudge(
      candidate({ emailVerifyNudgeSentAt: now }),
      now,
    ).ok,
    false,
    "fresh claim is not stealable",
  );
  assert.equal(
    evaluateVerifyEmailNudge(
      candidate({
        emailVerifyNudgeSentAt: new Date(
          now.getTime() - EMAIL_VERIFY_NUDGE_CLAIM_STALE_MS - 1000,
        ),
      }),
      now,
    ).ok,
    true,
    "stale claim is recoverable",
  );
  assert.equal(
    evaluateVerifyEmailNudge(candidate({ disabledAt: now }), now).ok,
    false,
  );
  assert.equal(
    evaluateVerifyEmailNudge(candidate({ role: "AGENT" }), now).ok,
    false,
  );
  assert.equal(evaluateVerifyEmailNudge(null, now).ok, false);
  assert.equal(EMAIL_VERIFY_NUDGE_MS, 24 * 60 * 60 * 1000);
  assert.equal(EMAIL_VERIFY_NUDGE_CLAIM_STALE_MS, 20 * 60 * 1000);
  assert.equal(
    nextEmailVerifyNudgeDueAt(now).getTime(),
    now.getTime() + EMAIL_VERIFY_NUDGE_MS,
  );
  assert.equal(staleBefore.getTime(), now.getTime() - EMAIL_VERIFY_NUDGE_CLAIM_STALE_MS);
}

function testEmailChangeResetsDueWindow() {
  const patch = emailAddressChangeVerificationPatch(now);
  assert.equal(patch.emailVerified, null);
  assert.equal(patch.emailVerifyNudgeSentAt, null);
  assert.equal(
    patch.emailVerifyNudgeDueAt.getTime(),
    now.getTime() + EMAIL_VERIFY_NUDGE_MS,
  );
}

async function testDueUnverifiedSendsOnce() {
  const sends: string[] = [];
  const { store } = memoryNudgeStore([candidate()], sends);
  const first = await runVerifyEmailNudgeJob(store, now);
  assert.equal(first.sent, 1);
  const second = await runVerifyEmailNudgeJob(store, now);
  assert.equal(second.sent, 0);
  assert.deepEqual(sends, ["buyer@example.com"]);
}

async function testNotDueSkipped() {
  const sends: string[] = [];
  const { store } = memoryNudgeStore(
    [
      candidate({
        emailVerifyNudgeDueAt: new Date(now.getTime() + 3_600_000),
      }),
    ],
    sends,
  );
  const result = await runVerifyEmailNudgeJob(store, now);
  assert.equal(result.sent, 0);
  assert.equal(sends.length, 0);
}

async function testVerifiedBeforeDueSkipped() {
  const sends: string[] = [];
  const { store } = memoryNudgeStore(
    [candidate({ emailVerified: new Date() })],
    sends,
  );
  const result = await runVerifyEmailNudgeJob(store, now);
  assert.equal(result.sent, 0);
  assert.equal(sends.length, 0);
}

async function testVerifiedBetweenScanAndSendSkipped() {
  const sends: string[] = [];
  const { db, store } = memoryNudgeStore([candidate()], sends);
  const orig = store.claimLease.bind(store);
  store.claimLease = async (input) => {
    const ok = await orig(input);
    if (ok) {
      const row = db.get(input.userId);
      if (row) row.emailVerified = now;
    }
    return ok;
  };
  const result = await runVerifyEmailNudgeJob(store, now);
  assert.equal(result.sent, 0);
  assert.equal(sends.length, 0);
}

async function testDeletedSkipped() {
  const sends: string[] = [];
  const { store } = memoryNudgeStore([candidate()], sends);
  store.reload = async () => null;
  const result = await runVerifyEmailNudgeJob(store, now);
  assert.equal(result.sent, 0);
  assert.equal(sends.length, 0);
}

async function testThrowDuringSendReleasesClaim() {
  const sends: string[] = [];
  const { db, store } = memoryNudgeStore([candidate()], sends);
  store.send = async () => {
    throw new Error("boom");
  };
  const result = await runVerifyEmailNudgeJob(store, now);
  assert.equal(result.failed, 1);
  assert.equal(sends.length, 0);
  assert.equal(db.get("user-1")?.emailVerifyNudgeSentAt, null);
}

async function testFailedSendBecomesRetryable() {
  const sends: string[] = [];
  const { db, store } = memoryNudgeStore([candidate()], sends);
  store.send = async () => "failed";
  const first = await runVerifyEmailNudgeJob(store, now);
  assert.equal(first.failed, 1);
  assert.equal(db.get("user-1")?.emailVerifyNudgeSentAt, null);
  store.send = async (input) => {
    sends.push(input.email);
    return "sent";
  };
  const second = await runVerifyEmailNudgeJob(store, now);
  assert.equal(second.sent, 1);
  assert.deepEqual(sends, ["buyer@example.com"]);
}

async function testSkippedBecomesRetryable() {
  const sends: string[] = [];
  const { db, store } = memoryNudgeStore([candidate()], sends);
  store.send = async () => "skipped";
  const first = await runVerifyEmailNudgeJob(store, now);
  assert.equal(first.skipped, 1);
  assert.equal(db.get("user-1")?.emailVerifyNudgeSentAt, null);
  store.send = async (input) => {
    sends.push(input.email);
    return "sent";
  };
  const second = await runVerifyEmailNudgeJob(store, now);
  assert.equal(second.sent, 1);
}

async function testFreshClaimCannotBeStolen() {
  const sends: string[] = [];
  const { store } = memoryNudgeStore(
    [candidate({ emailVerifyNudgeSentAt: now })],
    sends,
  );
  const result = await runVerifyEmailNudgeJob(store, now);
  assert.equal(result.sent, 0);
  assert.equal(sends.length, 0);
}

async function testStaleClaimWithoutNudgeLogRetries() {
  const sends: string[] = [];
  const staleClaim = new Date(
    now.getTime() - EMAIL_VERIFY_NUDGE_CLAIM_STALE_MS - 5_000,
  );
  const { store } = memoryNudgeStore(
    [candidate({ emailVerifyNudgeSentAt: staleClaim })],
    sends,
  );
  const result = await runVerifyEmailNudgeJob(store, now);
  assert.equal(result.sent, 1);
  assert.deepEqual(sends, ["buyer@example.com"]);
}

async function testStaleClaimWithNudgeLogDoesNotResend() {
  const sends: string[] = [];
  const staleClaim = new Date(
    now.getTime() - EMAIL_VERIFY_NUDGE_CLAIM_STALE_MS - 5_000,
  );
  const logs: NudgeLog[] = [
    {
      userId: "user-1",
      email: "buyer@example.com",
      kind: VERIFY_EMAIL_NUDGE_KIND,
    },
  ];
  const { store } = memoryNudgeStore(
    [candidate({ emailVerifyNudgeSentAt: staleClaim })],
    sends,
    logs,
  );
  const result = await runVerifyEmailNudgeJob(store, now);
  assert.equal(result.sent, 0);
  assert.equal(sends.length, 0);
}

async function testManualVerifyEmailDoesNotCountAsNudge() {
  const sends: string[] = [];
  const staleClaim = new Date(
    now.getTime() - EMAIL_VERIFY_NUDGE_CLAIM_STALE_MS - 5_000,
  );
  const { store } = memoryNudgeStore(
    [candidate({ emailVerifyNudgeSentAt: staleClaim })],
    sends,
    [
      {
        userId: "user-1",
        email: "buyer@example.com",
        kind: VERIFY_EMAIL_KIND,
      },
    ],
  );
  const result = await runVerifyEmailNudgeJob(store, now);
  assert.equal(result.sent, 1);
  assert.deepEqual(sends, ["buyer@example.com"]);
}

async function testOldEmailNudgeLogDoesNotSuppressCurrent() {
  const sends: string[] = [];
  const staleClaim = new Date(
    now.getTime() - EMAIL_VERIFY_NUDGE_CLAIM_STALE_MS - 5_000,
  );
  const { store } = memoryNudgeStore(
    [candidate({ emailVerifyNudgeSentAt: staleClaim, email: "new@example.com" })],
    sends,
    [
      {
        userId: "user-1",
        email: "old@example.com",
        kind: VERIFY_EMAIL_NUDGE_KIND,
      },
    ],
  );
  const result = await runVerifyEmailNudgeJob(store, now);
  assert.equal(result.sent, 1);
  assert.deepEqual(sends, ["new@example.com"]);
}

async function testOverlappingWorkersOneSend() {
  const sends: string[] = [];
  const { store } = memoryNudgeStore([candidate()], sends);
  const [a, b] = await Promise.all([
    runVerifyEmailNudgeJob(store, now),
    runVerifyEmailNudgeJob(store, now),
  ]);
  assert.equal(a.sent + b.sent, 1);
  assert.equal(sends.length, 1);
}

async function testThrowAfterDeliveryKeepsClaim() {
  const sends: string[] = [];
  const { db, store, logs } = memoryNudgeStore([candidate()], sends);
  store.send = async (input) => {
    logs.push({
      userId: input.customerId,
      email: input.email,
      kind: VERIFY_EMAIL_NUDGE_KIND,
    });
    throw new Error("log after resend");
  };
  const result = await runVerifyEmailNudgeJob(store, now);
  assert.equal(result.sent, 1);
  assert.ok(db.get("user-1")?.emailVerifyNudgeSentAt);
}

function testSignupAndManualWiring() {
  const signup = read("src/app/api/auth/sign-up/route.ts");
  assert.ok(!signup.includes("sendEmailVerification"));
  assert.ok(signup.includes("sendWelcomeEmail"));
  assert.ok(signup.includes("emailVerifyNudgeDueAt"));
  const request = read("src/app/api/auth/request-verification/route.ts");
  assert.ok(request.includes("sendEmailVerification"));
  assert.ok(!request.includes('purpose: "automatic_nudge"'));
  const verify = read("src/lib/auth/email-verification.ts");
  assert.ok(verify.includes("VERIFY_EMAIL_NUDGE_KIND"));
  assert.ok(verify.includes('purpose?: "manual" | "automatic_nudge"'));
  const nudge = read("src/lib/auth/verify-email-nudge.ts");
  assert.ok(nudge.includes('purpose: "automatic_nudge"'));
  assert.ok(nudge.includes("try {"));
  assert.ok(nudge.includes("releaseLease"));
  assert.ok(nudge.includes("hasAutomaticNudgeDelivery"));
  const sql = read(
    "prisma/migrations/20261004160000_email_verify_nudge/migration.sql",
  );
  assert.ok(sql.includes("User_emailVerifyNudge_pending_idx"));
  assert.ok(sql.includes('"emailVerified" IS NULL'));
  assert.ok(sql.includes('"emailVerifyNudgeSentAt" IS NULL'));
  assert.ok(sql.includes('"disabledAt" IS NULL'));
  const mac = read("scripts/run-monitors-mac.sh");
  assert.ok(mac.includes("pnpm verify-email-nudge:run"));
}

async function main() {
  testEligibility();
  testEmailChangeResetsDueWindow();
  await testDueUnverifiedSendsOnce();
  await testNotDueSkipped();
  await testVerifiedBeforeDueSkipped();
  await testVerifiedBetweenScanAndSendSkipped();
  await testDeletedSkipped();
  await testThrowDuringSendReleasesClaim();
  await testFailedSendBecomesRetryable();
  await testSkippedBecomesRetryable();
  await testFreshClaimCannotBeStolen();
  await testStaleClaimWithoutNudgeLogRetries();
  await testStaleClaimWithNudgeLogDoesNotResend();
  await testManualVerifyEmailDoesNotCountAsNudge();
  await testOldEmailNudgeLogDoesNotSuppressCurrent();
  await testOverlappingWorkersOneSend();
  await testThrowAfterDeliveryKeepsClaim();
  testSignupAndManualWiring();
  console.log("verify-email-nudge-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
