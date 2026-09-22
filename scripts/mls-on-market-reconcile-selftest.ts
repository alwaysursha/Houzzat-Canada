/**
 * Off-market reconciliation. In-memory feeds only — no PropTx, no MLS sync.
 * Run: pnpm mls:on-market-reconcile:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ListingStatus, ListingTransactionType } from "@prisma/client";
import {
  assertListingMirrorsCompatible,
  PROPTX_LISTING_PROVIDER_KEY,
  PROPTX_TRREB_ORGANIZATION_SLUG,
  PropTxProvenanceError,
} from "@/lib/proptx/listing-provenance";
import {
  buildDiscoveryPath,
  classifyVowProperty,
  emptyOnMarketReconcileStats,
  listingEligibleForReconcile,
  ON_MARKET_DISCOVER_CURSOR,
  ON_MARKET_ROTATE_CURSOR,
  ON_MARKET_TYPESENSE_RETRY_CURSOR,
  rotationDailyBudget,
  runOnMarketReconciliation,
  type PropertyFetchResult,
  type ReconcileDeps,
  type ReconcileListing,
  type StatusUpdate,
} from "@/lib/proptx/mls-on-market-reconcile";
import type { PropTxProperty } from "@/lib/proptx/map-listing";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const provenance = {
  organizationId: "org-trreb",
  organizationSlug: PROPTX_TRREB_ORGANIZATION_SLUG,
  providerKey: PROPTX_LISTING_PROVIDER_KEY,
};

function listing(
  listingKey: string,
  patch: Partial<ReconcileListing> = {},
): ReconcileListing {
  return {
    id: listingKey,
    listingKey,
    mlsNumber: listingKey,
    status: "ACTIVE",
    transactionType: "SALE",
    city: "Toronto",
    soldAt: null,
    soldPrice: null,
    dataSource: "mls",
    isMock: false,
    organizationId: provenance.organizationId,
    providerKey: provenance.providerKey,
    ...patch,
  };
}

function property(
  listingKey: string,
  patch: PropTxProperty,
): PropTxProperty {
  return { ListingKey: listingKey, ...patch };
}

type Harness = {
  cursors: Map<string, string>;
  applied: StatusUpdate[];
  pushed: string[];
  fetched: string[];
  discoverCalls: string[];
  deps: ReconcileDeps;
};

function harness(options: {
  rows?: ReconcileListing[];
  soldAt?: ReconcileListing[];
  byKey?: ReconcileListing[];
  fetch?: (listingKey: string) => PropertyFetchResult;
  discover?: ReconcileDeps["discoverPage"];
  count?: number;
  pushOk?: boolean | ((id: string) => boolean);
  allowlist?: string[];
}): Harness {
  const cursors = new Map<string, string>();
  const applied: StatusUpdate[] = [];
  const pushed: string[] = [];
  const fetched: string[] = [];
  const discoverCalls: string[] = [];
  const rows = options.rows ?? [];
  const resources = new Set<string>();
  const deps: ReconcileDeps = {
    now: () => new Date("2026-09-21T22:00:00Z"),
    async getCursor(resource) {
      resources.add(resource);
      if (resource === "Property" || resource === "Media") {
        throw new Error(`reconcile touched ${resource} cursor`);
      }
      return cursors.get(resource) ?? null;
    },
    async setCursor(resource, cursor) {
      resources.add(resource);
      if (resource === "Property" || resource === "Media") {
        throw new Error(`reconcile touched ${resource} cursor`);
      }
      cursors.set(resource, cursor);
    },
    async loadOnMarketByKeys(keys) {
      const wanted = new Set(keys);
      return (options.byKey ?? rows).filter((row) => wanted.has(row.listingKey));
    },
    async loadActiveWithSoldAt() {
      return options.soldAt ?? [];
    },
    async loadRotationPage(afterKey, limit) {
      return rows
        .filter((row) => row.listingKey > afterKey)
        .sort((a, b) => a.listingKey.localeCompare(b.listingKey))
        .slice(0, limit);
    },
    async countAllowlistedOnMarket() {
      return options.count ?? rows.length;
    },
    async discoverPage(path) {
      discoverCalls.push(path);
      if (!options.discover) return { ok: true, listingKeys: [], nextPath: null };
      return options.discover(path);
    },
    async fetchProperty(listingKey) {
      fetched.push(listingKey);
      return (
        options.fetch?.(listingKey) ?? {
          ok: true,
          row: property(listingKey, { StandardStatus: "Active" }),
        }
      );
    },
    async applyStatus(row, update) {
      try {
        assertListingMirrorsCompatible(
          provenance,
          {
            organizationId: row.organizationId,
            providerKey: row.providerKey,
          },
          { listingId: row.id, mlsNumber: row.mlsNumber },
        );
      } catch (err) {
        if (err instanceof PropTxProvenanceError) return "provenance_blocked";
        throw err;
      }
      applied.push(update);
      row.status = update.status;
      row.transactionType = update.transactionType;
      return "applied";
    },
    async pushTypesense(listingId) {
      pushed.push(listingId);
      if (typeof options.pushOk === "function") return options.pushOk(listingId);
      return options.pushOk !== false;
    },
  };
  return { cursors, applied, pushed, fetched, discoverCalls, deps };
}

async function rotateOne(
  row: ReconcileListing,
  fetch: PropertyFetchResult,
  extra: Partial<Parameters<typeof harness>[0]> = {},
) {
  const h = harness({
    rows: [row],
    count: 1,
    fetch: () => fetch,
    ...extra,
  });
  h.cursors.set(ON_MARKET_DISCOVER_CURSOR, "2026-09-21T00:00:00Z");
  const stats = await runOnMarketReconciliation(h.deps, {
    mode: "full",
    maxDiscoverPages: 5,
    rotationDays: 7,
    rotationBudgetOverride: 1,
    allowlist: extra.allowlist ?? ["Toronto"],
  });
  return { ...h, stats };
}

async function main() {
  console.log("\n=== MLS ON-MARKET RECONCILE SELFTEST ===\n");

  assert.equal(rotationDailyBudget(78814, 7), Math.ceil(78814 / 7));
  assert.equal(rotationDailyBudget(78814, 1), 78814);
  assert.equal(rotationDailyBudget(78814, 3), Math.ceil(78814 / 3));
  assert.equal(rotationDailyBudget(78814, 14), Math.ceil(78814 / 14));
  assert.equal(rotationDailyBudget(10, 5), 2);
  assert.equal(rotationDailyBudget(1, 7), 1);
  assert.equal(rotationDailyBudget(0, 7), 0);
  assert.equal(Math.ceil(78814 / 7), 11260);
  console.log("[1] 7-day budget follows inventory size... PASS");

  {
    const recognized = (
      key: string,
      patch: PropTxProperty,
    ): ListingStatus | null => {
      const result = classifyVowProperty(key, property(key, patch));
      return result.kind === "recognized" ? result.status : null;
    };
    assert.equal(
      recognized("K", { StandardStatus: "Closed", TransactionType: "For Sale" }),
      "SOLD",
    );
    assert.equal(
      recognized("K", { StandardStatus: "Closed", TransactionType: "For Lease" }),
      "LEASED",
    );
    assert.equal(recognized("K", { MlsStatus: "Leased" }), "LEASED");
    assert.equal(recognized("K", { StandardStatus: "Expired" }), "EXPIRED");
    assert.equal(recognized("K", { MlsStatus: "Terminated" }), "TERMINATED");
    assert.equal(recognized("K", { StandardStatus: "Suspended" }), "SUSPENDED");
    assert.equal(recognized("K", { StandardStatus: "Active" }), "ACTIVE");
    assert.equal(
      recognized("K", { StandardStatus: "Active Under Contract" }),
      "SOLD_CONDITIONAL",
    );
    assert.equal(
      classifyVowProperty("K", property("K", { StandardStatus: "Coming Soon" }))
        .kind,
      "unknown_status",
    );
    assert.equal(
      classifyVowProperty("K", property("K", { ContractStatus: "Active" })).kind,
      "missing_status",
    );
    assert.equal(
      classifyVowProperty("K", property("OTHER", { StandardStatus: "Closed" }))
        .kind,
      "key_mismatch",
    );
    assert.equal(classifyAuthoritativeIgnoresDefault(), null);
    console.log("[2] Explicit statuses only; unknown/missing/mismatch rejected... PASS");
  }

  {
    const sold = await rotateOne(listing("A"), {
      ok: true,
      row: property("A", { StandardStatus: "Closed", ClosePrice: 900000 }),
    });
    assert.equal(sold.applied.length, 1);
    assert.equal(sold.applied[0]?.status, "SOLD");
    assert.equal(sold.pushed.length, 1);
    assert.equal(sold.stats.sold, 1);
    assert.equal(sold.cursors.get(ON_MARKET_ROTATE_CURSOR), "A");

    const leased = await rotateOne(
      listing("A", { transactionType: "LEASE" }),
      { ok: true, row: property("A", { MlsStatus: "Leased", TransactionType: "For Lease" }) },
    );
    assert.equal(leased.applied[0]?.status, "LEASED");
    assert.equal(leased.stats.leased, 1);

    const expired = await rotateOne(listing("A"), {
      ok: true,
      row: property("A", { StandardStatus: "Expired" }),
    });
    assert.equal(expired.applied[0]?.status, "EXPIRED");
    assert.equal(expired.stats.expired, 1);

    const terminated = await rotateOne(listing("A"), {
      ok: true,
      row: property("A", { MlsStatus: "Terminated" }),
    });
    assert.equal(terminated.applied[0]?.status, "TERMINATED");

    const suspended = await rotateOne(listing("A"), {
      ok: true,
      row: property("A", { StandardStatus: "Suspended" }),
    });
    assert.equal(suspended.applied[0]?.status, "SUSPENDED");
    console.log("[3] SOLD / LEASED / EXPIRED / TERMINATED / SUSPENDED write... PASS");
  }

  {
    const active = await rotateOne(listing("A"), {
      ok: true,
      row: property("A", { StandardStatus: "Active" }),
    });
    assert.equal(active.applied.length, 0);
    assert.equal(active.pushed.length, 0);
    assert.equal(active.stats.unchanged, 1);
    assert.equal(active.cursors.get(ON_MARKET_ROTATE_CURSOR), "A");

    const conditional = await rotateOne(
      listing("A", { status: "SOLD_CONDITIONAL" }),
      {
        ok: true,
        row: property("A", { StandardStatus: "Active Under Contract" }),
      },
    );
    assert.equal(conditional.applied.length, 0);
    assert.equal(conditional.stats.unchanged, 1);
    assert.notEqual(conditional.stats.sold, 1);
    console.log("[4] ACTIVE and SOLD_CONDITIONAL stay on-market without a write... PASS");
  }

  {
    const unknown = await rotateOne(listing("A"), {
      ok: true,
      row: property("A", { StandardStatus: "Coming Soon" }),
    });
    assert.equal(unknown.applied.length, 0);
    assert.equal(unknown.stats.unresolved, 1);
    assert.equal(unknown.cursors.get(ON_MARKET_ROTATE_CURSOR), "A");

    const missing = await rotateOne(listing("A"), {
      ok: true,
      row: property("A", {}),
    });
    assert.equal(missing.applied.length, 0);
    assert.equal(missing.stats.unresolved, 1);

    const mismatch = await rotateOne(listing("A"), {
      ok: true,
      row: property("OTHER", { StandardStatus: "Closed" }),
    });
    assert.equal(mismatch.applied.length, 0);
    assert.equal(mismatch.stats.unresolved, 1);
    assert.equal(mismatch.cursors.get(ON_MARKET_ROTATE_CURSOR), "A");

    for (const kind of ["not_found", "empty"] as const) {
      const unresolved = await rotateOne(listing("A"), { ok: false, kind });
      assert.equal(unresolved.applied.length, 0);
      assert.equal(unresolved.stats.unresolved, 1);
      assert.equal(unresolved.cursors.get(ON_MARKET_ROTATE_CURSOR), "A");
    }
    console.log("[5] Unknown, missing, mismatch, 404, and empty do not change status... PASS");
  }

  {
    for (const kind of ["timeout", "rate_limited", "server"] as const) {
      const stopped = await rotateOne(listing("A"), { ok: false, kind });
      assert.equal(stopped.applied.length, 0);
      assert.equal(stopped.cursors.get(ON_MARKET_ROTATE_CURSOR), undefined);
      assert.equal(stopped.stats.rotationChecked, 0);
      if (kind === "rate_limited") assert.equal(stopped.stats.rateLimited, 1);
      else assert.equal(stopped.stats.transient, 1);
    }
    console.log("[6] Timeout, 429, and 5xx do not complete the key... PASS");
  }

  {
    const h = harness({
      count: 0,
      byKey: [listing("DISC")],
      discover(path) {
        assert.ok(path.includes("$select=ListingKey"));
        return { ok: true, listingKeys: ["DISC"], nextPath: null };
      },
      fetch: () => ({
        ok: true,
        row: property("DISC", { StandardStatus: "Closed" }),
      }),
    });
    h.cursors.set(ON_MARKET_DISCOVER_CURSOR, "2026-09-20T00:00:00Z");
    const stats = await runOnMarketReconciliation(h.deps, {
      mode: "full",
      maxDiscoverPages: 5,
      rotationDays: 7,
      rotationBudgetOverride: null,
      allowlist: ["Toronto"],
    });
    assert.equal(h.fetched.length, 1);
    assert.equal(h.fetched[0], "DISC");
    assert.equal(h.applied[0]?.status, "SOLD");
    assert.equal(stats.discovered, 1);
    assert.equal(stats.candidates, 1);
    assert.equal(stats.discoveryComplete, true);
    assert.notEqual(
      h.cursors.get(ON_MARKET_DISCOVER_CURSOR),
      "2026-09-20T00:00:00Z",
    );
    console.log("[7] Discovery candidate is verified individually before a write... PASS");
  }

  {
    const h = harness({
      count: 0,
      byKey: [listing("DISC")],
      discover() {
        return { ok: true, listingKeys: ["DISC"], nextPath: "Property?$skip=100" };
      },
      fetch: () => {
        throw new Error("incomplete discovery must not verify");
      },
    });
    h.cursors.set(ON_MARKET_DISCOVER_CURSOR, "2026-09-20T00:00:00Z");
    const stats = await runOnMarketReconciliation(h.deps, {
      mode: "full",
      maxDiscoverPages: 1,
      rotationDays: 7,
      allowlist: ["Toronto"],
    });
    assert.equal(h.discoverCalls.length, 1);
    assert.equal(h.fetched.length, 0);
    assert.equal(h.applied.length, 0);
    assert.equal(stats.discoveryComplete, false);
    assert.equal(h.cursors.get(ON_MARKET_DISCOVER_CURSOR), "2026-09-20T00:00:00Z");
    console.log("[8] Incomplete discovery does not write and keeps its cursor... PASS");
  }

  {
    const nominee = listing("SOLDAT", { soldAt: new Date("2026-09-01T00:00:00Z") });
    const h = harness({
      count: 0,
      soldAt: [nominee],
      discover: async () => ({ ok: true, listingKeys: [], nextPath: null }),
      fetch: () => ({
        ok: true,
        row: property("SOLDAT", { StandardStatus: "Closed" }),
      }),
    });
    h.cursors.set(ON_MARKET_DISCOVER_CURSOR, "2026-09-20T00:00:00Z");
    const stats = await runOnMarketReconciliation(h.deps, {
      mode: "full",
      maxDiscoverPages: 5,
      rotationDays: 7,
      allowlist: ["Toronto"],
    });
    assert.deepEqual(h.fetched, ["SOLDAT"]);
    assert.equal(h.applied[0]?.status, "SOLD");
    assert.equal(stats.candidates, 1);
    console.log("[9] ACTIVE + soldAt is nominated and verified... PASS");
  }

  {
    const row = listing("SAME");
    const unchanged = await rotateOne(row, {
      ok: true,
      row: property("SAME", { StandardStatus: "Active", TransactionType: "For Sale" }),
    });
    assert.equal(unchanged.applied.length, 0);
    assert.equal(unchanged.pushed.length, 0);

    const changed = await rotateOne(listing("CHG"), {
      ok: true,
      row: property("CHG", {
        StandardStatus: "Closed",
        ClosePrice: 500000,
        PurchaseContractDate: "2026-09-01",
      }),
    });
    assert.equal(changed.applied.length, 1);
    assert.equal(changed.applied[0]?.clearSold, false);
    assert.equal(changed.pushed.length, 1);
    console.log("[10] Unchanged verification skips writes; a change updates Neon and Typesense... PASS");
  }

  {
    let fail = true;
    const h = harness({
      rows: [listing("TS")],
      count: 1,
      pushOk: () => {
        const ok = !fail;
        fail = false;
        return ok;
      },
      fetch: () => ({
        ok: true,
        row: property("TS", { StandardStatus: "Expired" }),
      }),
      discover: async () => ({ ok: true, listingKeys: [], nextPath: null }),
    });
    h.cursors.set(ON_MARKET_DISCOVER_CURSOR, "2026-09-20T00:00:00Z");
    const first = await runOnMarketReconciliation(h.deps, {
      mode: "full",
      maxDiscoverPages: 5,
      rotationDays: 7,
      rotationBudgetOverride: 1,
      allowlist: ["Toronto"],
    });
    assert.equal(first.typesenseFailed, 1);
    assert.equal(first.expired, 1);
    assert.equal(h.cursors.get(ON_MARKET_ROTATE_CURSOR), "TS");
    const retry = JSON.parse(
      h.cursors.get(ON_MARKET_TYPESENSE_RETRY_CURSOR) ?? "[]",
    ) as string[];
    assert.deepEqual(retry, ["TS"]);
    const fetchesAfter = h.fetched.length;
    const second = await runOnMarketReconciliation(h.deps, {
      mode: "full",
      maxDiscoverPages: 5,
      rotationDays: 7,
      rotationBudgetOverride: 1,
      allowlist: ["Toronto"],
    });
    assert.equal(h.fetched.length, fetchesAfter);
    assert.equal(h.pushed.filter((id) => id === "TS").length, 2);
    assert.equal(h.cursors.get(ON_MARKET_TYPESENSE_RETRY_CURSOR), "[]");
    assert.equal(second.typesenseFailed, 0);
    console.log("[11] Typesense failure stays on the retry cursor... PASS");
  }

  {
    const rows = [listing("a"), listing("b"), listing("c")];
    let blockC = true;
    const h = harness({
      rows,
      count: 3,
      fetch(listingKey) {
        if (listingKey === "c" && blockC) {
          blockC = false;
          return { ok: false, kind: "rate_limited" };
        }
        return { ok: true, row: property(listingKey, { StandardStatus: "Active" }) };
      },
      discover: async () => ({ ok: true, listingKeys: [], nextPath: null }),
    });
    h.cursors.set(ON_MARKET_DISCOVER_CURSOR, "2026-09-20T00:00:00Z");
    const first = await runOnMarketReconciliation(h.deps, {
      mode: "full",
      maxDiscoverPages: 5,
      rotationDays: 7,
      rotationBudgetOverride: 3,
      allowlist: ["Toronto"],
    });
    assert.equal(h.cursors.get(ON_MARKET_ROTATE_CURSOR), "b");
    assert.equal(first.rotationChecked, 2);
    assert.equal(first.rateLimited, 1);
    assert.equal(h.fetched[2], "c");
    const fetchedBeforeResume = h.fetched.length;
    const second = await runOnMarketReconciliation(h.deps, {
      mode: "full",
      maxDiscoverPages: 5,
      rotationDays: 7,
      rotationBudgetOverride: 1,
      allowlist: ["Toronto"],
    });
    assert.equal(h.fetched[fetchedBeforeResume], "c");
    assert.equal(second.rateLimited, 0);
    assert.equal(second.rotationChecked, 1);
    assert.equal(h.cursors.get(ON_MARKET_ROTATE_CURSOR), "c");
    console.log("[12] Rotation resumes after a 429 without skipping the key... PASS");
  }

  {
    const rows = Array.from({ length: 10 }, (_, i) =>
      listing(String(i).padStart(2, "0")),
    );
    const h = harness({
      rows,
      count: 10,
      fetch: (listingKey) => ({
        ok: true,
        row: property(listingKey, { StandardStatus: "Active" }),
      }),
      discover: async () => ({ ok: true, listingKeys: [], nextPath: null }),
    });
    h.cursors.set(ON_MARKET_DISCOVER_CURSOR, "2026-09-20T00:00:00Z");
    const stats = await runOnMarketReconciliation(h.deps, {
      mode: "full",
      maxDiscoverPages: 5,
      rotationDays: 5,
      allowlist: ["Toronto"],
    });
    assert.equal(stats.rotationBudget, 2);
    assert.equal(stats.rotationChecked, 2);
    assert.equal(h.fetched.length, 2);
    assert.equal(h.cursors.get(ON_MARKET_ROTATE_CURSOR), "01");
    console.log("[13] Daily rotation budget is ceil(count / days)... PASS");
  }

  {
    const blocked = listing("P", { organizationId: "other-tenant" });
    const result = await rotateOne(blocked, {
      ok: true,
      row: property("P", { StandardStatus: "Closed" }),
    });
    assert.equal(result.applied.length, 0);
    assert.equal(result.pushed.length, 0);
    assert.equal(result.stats.unresolved, 1);
    assert.equal(blocked.status, "ACTIVE");

    const outside = listing("K", { city: "Kingston" });
    const inside = listing("T", { city: "Toronto" });
    const h = harness({
      rows: [outside, inside],
      count: 1,
      fetch: (listingKey) => ({
        ok: true,
        row: property(listingKey, { StandardStatus: "Active" }),
      }),
      discover: async () => ({ ok: true, listingKeys: [], nextPath: null }),
    });
    h.cursors.set(ON_MARKET_DISCOVER_CURSOR, "2026-09-20T00:00:00Z");
    await runOnMarketReconciliation(h.deps, {
      mode: "full",
      maxDiscoverPages: 5,
      rotationDays: 7,
      rotationBudgetOverride: 1,
      allowlist: ["Toronto"],
    });
    assert.deepEqual(h.fetched, ["T"]);
    assert.equal(listingEligibleForReconcile(outside, ["Toronto"]), false);
    assert.equal(listingEligibleForReconcile(listing("M", { isMock: true }), ["Toronto"]), false);
    assert.equal(
      listingEligibleForReconcile(listing("N", { dataSource: "fsbo" }), ["Toronto"]),
      false,
    );
    console.log("[14] Allowlist, mock, non-MLS, and provenance conflicts do not write... PASS");
  }

  {
    const h = harness({});
    let cursorReads = 0;
    h.deps.getCursor = async () => {
      cursorReads += 1;
      return null;
    };
    const stats = await runOnMarketReconciliation(h.deps, {
      mode: "fast",
      maxDiscoverPages: 5,
      rotationDays: 7,
    });
    assert.equal(cursorReads, 0);
    assert.deepEqual(stats, emptyOnMarketReconcileStats());
    console.log("[15] Fast sync does not touch reconcile cursors... PASS");
  }

  {
    const path = buildDiscoveryPath("2026-09-21T00:00:00Z");
    assert.ok(path.startsWith("Property?$select=ListingKey&"));
    assert.ok(decodeURIComponent(path).includes("ModificationTimestamp ge "));
    assert.ok(decodeURIComponent(path).includes("StandardStatus eq 'Closed'"));
    assert.ok(!decodeURIComponent(path).includes("City eq"));
    assert.equal(ON_MARKET_DISCOVER_CURSOR, "OnMarketDiscover");
    assert.equal(ON_MARKET_ROTATE_CURSOR, "OnMarketRotate");
    assert.notEqual(ON_MARKET_DISCOVER_CURSOR, "Property");
    console.log("[16] Discovery query is ListingKey-only and has no city OR... PASS");
  }

  {
    const syncTs = read("src/lib/proptx/sync.ts");
    const reconcileTs = read("src/lib/proptx/mls-on-market-reconcile.ts");
    const fastStart = syncTs.indexOf("async function runMlsFastPropertyPasses");
    const fastEnd = syncTs.indexOf("export async function runPropTxMlsSync");
    const fastFn = syncTs.slice(fastStart, fastEnd);
    const runStart = syncTs.indexOf("export async function runPropTxMlsSync");
    const runEnd = syncTs.indexOf("function emptyStats");
    const runFn = syncTs.slice(runStart, runEnd);
    assert.ok(!fastFn.includes("executeOnMarketReconciliation"));
    assert.ok(!fastFn.includes("OnMarketDiscover"));
    assert.ok(!fastFn.includes("OnMarketRotate"));
    assert.ok(!fastFn.includes("setCursor"));
    assert.ok(runFn.includes('process.env.MLS_ON_MARKET_RECONCILE === "1"'));
    assert.ok(runFn.includes("executeOnMarketReconciliation"));
    assert.ok(runFn.includes("if (!isFast && process.env.MLS_ON_MARKET_RECONCILE"));
    assert.ok(runFn.includes("await syncProperties("));
    assert.ok(runFn.includes("await syncSoldAtBackfill"));
    assert.ok(runFn.includes("await syncMediaBackfill"));
    assert.ok(!runFn.includes("fastUnchangedSkip"));
    assert.ok(reconcileTs.includes('orderBy: { listingKey: "asc" }'));
    assert.ok(!reconcileTs.includes("orderBy: { updatedAtMls"));
    assert.ok(!reconcileTs.includes("geocodeListing"));
    assert.ok(!reconcileTs.includes("fetchRawPropertyMedia"));
    assert.ok(!reconcileTs.includes("PropertyRooms"));
    assert.ok(!reconcileTs.includes('setCursor(RESOURCE_PROPERTY'));
    assert.ok(!reconcileTs.includes('"Property"'));
    const fastPlist = read("scripts/mac/com.houzzat.mls-fast-sync.plist");
    const fullPlist = read("scripts/mac/com.houzzat.mls-sync.plist");
    assert.ok(fastPlist.includes("<integer>600</integer>"));
    assert.ok(fullPlist.includes("<integer>3600</integer>"));
    assert.ok(!fastPlist.includes("mls-on-market-reconcile"));
    assert.ok(!fullPlist.includes("MLS_ON_MARKET_RECONCILE"));
    console.log("[17] Property cursor and Fast sync stay untouched; Full sync gate is opt-in... PASS");
  }

  console.log("\nMLS on-market reconcile selftest: PASS\n");
}

function classifyAuthoritativeIgnoresDefault(): ListingStatus | null {
  const result = classifyVowProperty(
    "K",
    property("K", { ContractStatus: "Something Else" }),
  );
  return result.kind === "recognized" ? result.status : null;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
