/**
 * CLI planning/dispatch for digests:run (buyer-only / seller-only isolation).
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
  type DigestCliDeps,
} from "./run-digests-cli";

const emptyBuyerStats: DigestRunStats = {
  checked: 0,
  sent: 0,
  skipped: 0,
  failed: 0,
};

function unusedSellerDep(): DigestCliDeps["runSellerNeighborhoodReports"] {
  return async () => {
    assert.fail("runSellerNeighborhoodReports must not be called");
  };
}

function unusedBuyerDep(): DigestCliDeps["runBuyerSavedSearchDigests"] {
  return async () => {
    assert.fail("runBuyerSavedSearchDigests must not be called");
  };
}

function unusedJobsDep(): DigestCliDeps["runDigestJobs"] {
  return async () => {
    assert.fail("runDigestJobs must not be called");
  };
}

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

function testSellerOnlyRequiresUserId() {
  const missing = parseDigestRunArgs(["--seller-only"]);
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.match(missing.error, /--seller-only requires a non-empty --userId/);
  }

  const empty = parseDigestRunArgs(["--seller-only", "--userId="]);
  assert.equal(empty.ok, false);

  const whitespace = parseDigestRunArgs(["--seller-only", "--userId=   "]);
  assert.equal(whitespace.ok, false);
}

function testBuyerAndSellerOnlyRejectedTogether() {
  const both = parseDigestRunArgs([
    "--buyer-only",
    "--seller-only",
    "--userId=abc",
  ]);
  assert.equal(both.ok, false);
  if (!both.ok) {
    assert.match(both.error, /Cannot combine --buyer-only and --seller-only/);
  }
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

function testSellerOnlyPlanDefaultsMonday() {
  const plan = parseDigestRunArgs([
    "--seller-only",
    "--userId=cmsgv80pa0004psp7xl2l2yzj",
  ]);
  assert.equal(plan.ok, true);
  if (!plan.ok || plan.mode !== "seller-only") {
    assert.fail("expected seller-only plan");
  }
  assert.equal(plan.userId, "cmsgv80pa0004psp7xl2l2yzj");
  assert.equal(plan.dryRun, false);
  assert.equal(plan.forceSeller, false);
}

function testSellerOnlyDryRunAndForceSeller() {
  const dry = parseDigestRunArgs([
    "--seller-only",
    "--dry-run",
    "--userId=user-1",
  ]);
  assert.equal(dry.ok, true);
  if (!dry.ok || dry.mode !== "seller-only") {
    assert.fail("expected seller-only dry-run plan");
  }
  assert.equal(dry.dryRun, true);
  assert.equal(dry.forceSeller, false);

  const forced = parseDigestRunArgs([
    "--seller-only",
    "--force-seller",
    "--dry-run",
    "--userId=user-1",
  ]);
  assert.equal(forced.ok, true);
  if (!forced.ok || forced.mode !== "seller-only") {
    assert.fail("expected seller-only force-seller plan");
  }
  assert.equal(forced.dryRun, true);
  assert.equal(forced.forceSeller, true);
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
  let sellerCalls = 0;
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
      runSellerNeighborhoodReports: async () => {
        sellerCalls += 1;
        return emptyBuyerStats;
      },
    },
  );

  assert.equal(buyerCalls, 1);
  assert.equal(jobsCalls, 0);
  assert.equal(sellerCalls, 0);
  assert.equal(seenUserId, "buyer-user");
  assert.equal(seenDryRun, true);
  assert.equal(result.seller, null);
  assert.equal(result.buyer?.checked, 1);
}

async function testSellerOnlyInvokesOnlySellerDigest() {
  let buyerCalls = 0;
  let jobsCalls = 0;
  let sellerCalls = 0;
  let seenOpts:
    | {
        userId?: string;
        dryRun?: boolean;
        requireMonday?: boolean;
        since?: Date;
      }
    | undefined;

  const result = await executeDigestCliPlan(
    {
      ok: true,
      mode: "seller-only",
      userId: "seller-user",
      dryRun: true,
      forceSeller: false,
    },
    {
      runDigestJobs: unusedJobsDep(),
      runBuyerSavedSearchDigests: unusedBuyerDep(),
      runSellerNeighborhoodReports: async (opts) => {
        sellerCalls += 1;
        seenOpts = opts;
        return { ...emptyBuyerStats, checked: 1, skipped: 1 };
      },
    },
  );

  assert.equal(sellerCalls, 1);
  assert.equal(buyerCalls, 0);
  assert.equal(jobsCalls, 0);
  assert.equal(seenOpts?.userId, "seller-user");
  assert.equal(seenOpts?.dryRun, true);
  assert.equal(seenOpts?.requireMonday, true);
  assert.equal(seenOpts?.since, undefined);
  assert.equal(result.buyer, null);
  assert.equal(result.seller?.checked, 1);
}

async function testSellerOnlyForceSellerBypassesMondayOnly() {
  let seenRequireMonday: boolean | undefined;
  let seenSince: Date | undefined;

  await executeDigestCliPlan(
    {
      ok: true,
      mode: "seller-only",
      userId: "seller-user",
      dryRun: false,
      forceSeller: true,
    },
    {
      runDigestJobs: unusedJobsDep(),
      runBuyerSavedSearchDigests: unusedBuyerDep(),
      runSellerNeighborhoodReports: async (opts) => {
        seenRequireMonday = opts.requireMonday;
        seenSince = opts.since;
        return emptyBuyerStats;
      },
    },
  );

  assert.equal(seenRequireMonday, false);
  assert.equal(seenSince, undefined);
}

async function testJobsModeStillUsesRunDigestJobs() {
  let buyerCalls = 0;
  let sellerCalls = 0;
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
      runSellerNeighborhoodReports: async () => {
        sellerCalls += 1;
        return emptyBuyerStats;
      },
    },
  );

  assert.equal(jobsCalls, 1);
  assert.equal(buyerCalls, 0);
  assert.equal(sellerCalls, 0);
  assert.equal(result.buyer?.sent, 1);
  assert.equal(result.seller?.skipped, 1);
}

function testCooldownNotBypassedByCliSource() {
  const cli = readFileSync(
    join(process.cwd(), "scripts/run-digests-cli.ts"),
    "utf8",
  );
  // Seller-only dispatch must never invent a `since` override that skips cooldown.
  assert.match(cli, /Do not pass `since`/);
  assert.match(cli, /requireMonday: !plan\.forceSeller/);
  assert.doesNotMatch(
    cli,
    /mode === "seller-only"[\s\S]*since:\s*new Date/,
  );
}

function testEntrypointWiresBuyerAndSellerOnly() {
  const entry = readFileSync(join(process.cwd(), "scripts/run-digests.ts"), "utf8");
  assert.match(entry, /parseDigestRunArgs/);
  assert.match(entry, /executeDigestCliPlan/);
  assert.match(entry, /runBuyerSavedSearchDigests/);
  assert.match(entry, /runSellerNeighborhoodReports/);
  assert.match(entry, /--buyer-only/);
  assert.match(entry, /--seller-only/);
  // Fail closed before importing digests when plan is invalid.
  assert.match(entry, /if \(!plan\.ok\)/);
}

async function main() {
  testBuyerOnlyRequiresUserId();
  testSellerOnlyRequiresUserId();
  testBuyerAndSellerOnlyRejectedTogether();
  testBuyerOnlyPlan();
  testBuyerOnlyDryRunPlan();
  testSellerOnlyPlanDefaultsMonday();
  testSellerOnlyDryRunAndForceSeller();
  testLegacyJobsBehaviorUnchanged();
  await testBuyerOnlyInvokesOnlyBuyerDigest();
  await testSellerOnlyInvokesOnlySellerDigest();
  await testSellerOnlyForceSellerBypassesMondayOnly();
  await testJobsModeStillUsesRunDigestJobs();
  testCooldownNotBypassedByCliSource();
  testEntrypointWiresBuyerAndSellerOnly();
  console.log("run-digests-cli-selftest: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
