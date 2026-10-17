/**
 * CLI planning/dispatch for digests:run (buyer-only isolation).
 * Run: pnpm digests:cli:selftest
 *
 * Never imports Production digest runners or touches the database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DigestJobResult, DigestRunStats } from "../src/lib/email/digests";
import {
  executeDigestCliPlan,
  parseDigestRunArgs,
} from "./run-digests-cli";

const emptyBuyerStats: DigestRunStats = {
  checked: 0,
  sent: 0,
  skipped: 0,
  failed: 0,
};

function testBuyerOnlyRequiresUserId() {
  const missing = parseDigestRunArgs(["--buyer-only"]);
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.match(missing.error, /--buyer-only requires a non-empty --userId/);
  }

  const empty = parseDigestRunArgs(["--buyer-only", "--userId="]);
  assert.equal(empty.ok, false);

  const whitespace = parseDigestRunArgs(["--buyer-only", "--userId=   "]);
  assert.equal(whitespace.ok, false);
}

function testBuyerOnlyPlan() {
  const plan = parseDigestRunArgs([
    "--buyer-only",
    "--userId=cmsgv80pa0004psp7xl2l2yzj",
  ]);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.mode, "buyer-only");
  if (plan.mode !== "buyer-only") return;
  assert.equal(plan.userId, "cmsgv80pa0004psp7xl2l2yzj");
  assert.equal(plan.dryRun, false);
}

function testBuyerOnlyDryRunPlan() {
  const plan = parseDigestRunArgs([
    "--buyer-only",
    "--dry-run",
    "--userId=user-1",
  ]);
  assert.equal(plan.ok, true);
  if (!plan.ok || plan.mode !== "buyer-only") {
    assert.fail("expected buyer-only dry-run plan");
  }
  assert.equal(plan.dryRun, true);
  assert.equal(plan.userId, "user-1");
}

function testLegacyJobsBehaviorUnchanged() {
  const unscoped = parseDigestRunArgs([]);
  assert.deepEqual(unscoped, {
    ok: true,
    mode: "jobs",
    userId: undefined,
    dryRun: false,
    forceSeller: false,
  });

  const scoped = parseDigestRunArgs(["--userId=abc"]);
  assert.deepEqual(scoped, {
    ok: true,
    mode: "jobs",
    userId: "abc",
    dryRun: false,
    forceSeller: true,
  });

  const dryScoped = parseDigestRunArgs(["--dry-run", "--userId=abc"]);
  assert.deepEqual(dryScoped, {
    ok: true,
    mode: "jobs",
    userId: "abc",
    dryRun: true,
    forceSeller: true,
  });

  const forceSeller = parseDigestRunArgs(["--force-seller"]);
  assert.deepEqual(forceSeller, {
    ok: true,
    mode: "jobs",
    userId: undefined,
    dryRun: false,
    forceSeller: true,
  });
}

async function testBuyerOnlyInvokesOnlyBuyerDigest() {
  let buyerCalls = 0;
  let jobsCalls = 0;
  let seenUserId: string | undefined;
  let seenDryRun: boolean | undefined;

  const result = await executeDigestCliPlan(
    {
      ok: true,
      mode: "buyer-only",
      userId: "buyer-user",
      dryRun: true,
    },
    {
      runDigestJobs: async () => {
        jobsCalls += 1;
        return {
          buyer: emptyBuyerStats,
          seller: emptyBuyerStats,
        } satisfies DigestJobResult;
      },
      runBuyerSavedSearchDigests: async (opts) => {
        buyerCalls += 1;
        seenUserId = opts.userId;
        seenDryRun = opts.dryRun;
        return { ...emptyBuyerStats, checked: 1, skipped: 1 };
      },
    },
  );

  assert.equal(buyerCalls, 1);
  assert.equal(jobsCalls, 0);
  assert.equal(seenUserId, "buyer-user");
  assert.equal(seenDryRun, true);
  assert.equal(result.seller, null);
  assert.equal(result.buyer.checked, 1);
}

async function testJobsModeStillUsesRunDigestJobs() {
  let buyerCalls = 0;
  let jobsCalls = 0;

  const result = await executeDigestCliPlan(
    {
      ok: true,
      mode: "jobs",
      userId: "abc",
      dryRun: false,
      forceSeller: true,
    },
    {
      runDigestJobs: async (opts) => {
        jobsCalls += 1;
        assert.equal(opts.userId, "abc");
        assert.equal(opts.forceSeller, true);
        assert.equal(opts.dryRun, false);
        return {
          buyer: { ...emptyBuyerStats, sent: 1 },
          seller: { ...emptyBuyerStats, skipped: 1 },
        };
      },
      runBuyerSavedSearchDigests: async () => {
        buyerCalls += 1;
        return emptyBuyerStats;
      },
    },
  );

  assert.equal(jobsCalls, 1);
  assert.equal(buyerCalls, 0);
  assert.equal(result.buyer.sent, 1);
  assert.equal(result.seller?.skipped, 1);
}

function testEntrypointWiresBuyerOnly() {
  const entry = readFileSync(join(process.cwd(), "scripts/run-digests.ts"), "utf8");
  assert.match(entry, /parseDigestRunArgs/);
  assert.match(entry, /executeDigestCliPlan/);
  assert.match(entry, /runBuyerSavedSearchDigests/);
  assert.match(entry, /--buyer-only/);
  // Fail closed before importing digests when plan is invalid.
  assert.match(entry, /if \(!plan\.ok\)/);
}

async function main() {
  testBuyerOnlyRequiresUserId();
  testBuyerOnlyPlan();
  testBuyerOnlyDryRunPlan();
  testLegacyJobsBehaviorUnchanged();
  await testBuyerOnlyInvokesOnlyBuyerDigest();
  await testJobsModeStillUsesRunDigestJobs();
  testEntrypointWiresBuyerOnly();
  console.log("run-digests-cli-selftest: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
