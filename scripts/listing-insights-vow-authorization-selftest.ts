/**
 * Hermetic VOW redaction for GET /api/listings/[mlsNumber]/insights timeline.
 * Run: pnpm listing-insights-vow-authorization:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EMAIL_VERIFY_GRACE_MS,
  hasFullClientAccess,
} from "@/lib/account-access";
import { resolveListingDetailAccess } from "@/lib/listings/build-listing-panel";
import { buildInsightsTimeline } from "@/lib/market/listing-insights";
import { hasClientAccess } from "@/lib/vow";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const SOLD_PRICE = 875_000;
const LIST_PRICE = 899_000;
const RESTRICTED_HISTORY_PRICE = 840_000;
const RESTRICTED_ORIGINAL = 860_000;
const MLS_A = "W1111111";
const MLS_B = "W2222222";
const now = new Date("2026-09-01T12:00:00.000Z");

function sampleListing(mlsNumber: string) {
  return {
    mlsNumber,
    listPrice: LIST_PRICE,
    soldPrice: SOLD_PRICE,
    listedAt: new Date("2026-03-01T00:00:00.000Z"),
    soldAt: new Date("2026-06-15T00:00:00.000Z"),
    updatedAtMls: now,
    status: "SOLD",
    transactionType: "SALE",
    dataSource: "mls",
    history: [
      {
        id: "hist_public_listed",
        event: "Listed",
        price: LIST_PRICE,
        originalPrice: null,
        contractDate: new Date("2026-03-01T00:00:00.000Z"),
        lastUpdatedAt: now,
        externalMls: null,
        visibility: "public",
        note: null,
      },
      {
        id: "hist_restricted_cut",
        event: "Price Change",
        price: RESTRICTED_HISTORY_PRICE,
        originalPrice: RESTRICTED_ORIGINAL,
        contractDate: new Date("2026-04-01T00:00:00.000Z"),
        lastUpdatedAt: now,
        externalMls: null,
        visibility: "restricted",
        note: null,
      },
    ],
  };
}

function insightsPayload(mlsNumber: string, user: Parameters<typeof hasClientAccess>[0]) {
  const listing = sampleListing(mlsNumber);
  const access = resolveListingDetailAccess(user, listing);
  const { timeline, historyRows } = buildInsightsTimeline({
    listing,
    canSeeRestricted: access.canSeeRestricted,
  });
  return JSON.parse(
    JSON.stringify({
      insights: {
        signedIn: access.canSeeRestricted,
        pricePosition: {
          listPrice: LIST_PRICE,
          medianSold: access.canSeeRestricted ? 800_000 : null,
          soldRestricted: !access.canSeeRestricted,
        },
        timeline,
        comps: {
          restricted: !access.canSeeRestricted,
          items: [
            {
              soldPrice: access.canSeeRestricted ? 810_000 : null,
              listPrice: 820_000,
            },
          ],
          rangeLow: access.canSeeRestricted ? 780_000 : null,
          rangeMid: access.canSeeRestricted ? 800_000 : null,
          rangeHigh: access.canSeeRestricted ? 830_000 : null,
        },
        valuation: {
          restricted: !access.canSeeRestricted,
          mid: access.canSeeRestricted ? 805_000 : null,
          communityAvgSold: access.canSeeRestricted ? 790_000 : null,
        },
      },
      historyRows,
    }),
  ) as {
    insights: {
      signedIn: boolean;
      timeline: Array<{ price: number; label: string; public: boolean }>;
      comps: { items: Array<{ soldPrice: number | null }> };
    };
    historyRows: Array<{
      price: number | null;
      originalPrice: number | null;
      public: boolean;
    }>;
  };
}

function assertNoRestrictedSoldDollars(payload: unknown, label: string) {
  const raw = JSON.stringify(payload);
  for (const amount of [SOLD_PRICE, RESTRICTED_HISTORY_PRICE, RESTRICTED_ORIGINAL]) {
    assert.equal(
      raw.includes(String(amount)),
      false,
      `${label}: restricted amount ${amount} leaked`,
    );
  }
}

function chartVisiblePoints(
  timeline: Array<{ price: number; public: boolean }>,
  signedIn: boolean,
) {
  return timeline.filter((p) => signedIn || p.public);
}

function main() {
  const guest = insightsPayload(MLS_A, null);
  assert.equal(guest.insights.signedIn, false);
  assert.equal(
    guest.insights.timeline.some((p) => p.price === SOLD_PRICE),
    false,
  );
  assert.equal(
    guest.insights.timeline.some((p) => p.price === RESTRICTED_HISTORY_PRICE),
    false,
  );
  for (const row of guest.historyRows) {
    if (!row.public) {
      assert.equal(row.price, null);
      assert.equal(row.originalPrice, null);
    }
  }
  const guestCurrent = guest.insights.timeline.find((p) =>
    /sold/i.test(p.label),
  );
  if (guestCurrent) {
    assert.equal(guestCurrent.price, LIST_PRICE);
    assert.equal(guestCurrent.public, true);
  }
  assertNoRestrictedSoldDollars(guest, "signed-out");
  const guestVisible = chartVisiblePoints(
    guest.insights.timeline,
    guest.insights.signedIn,
  );
  assert.equal(guestVisible.some((p) => p.price === SOLD_PRICE), false);

  const lockedUser = {
    id: "cust_locked",
    emailVerified: null,
    createdAt: new Date(Date.now() - EMAIL_VERIFY_GRACE_MS - 86_400_000),
  };
  assert.equal(hasClientAccess(lockedUser), false);
  const locked = insightsPayload(MLS_A, lockedUser);
  assert.equal(locked.insights.signedIn, false);
  assertNoRestrictedSoldDollars(locked, "unauthorized-customer");

  const verified = {
    id: "cust_ok",
    emailVerified: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  assert.equal(hasFullClientAccess(verified), true);
  const authorized = insightsPayload(MLS_A, verified);
  assert.equal(authorized.insights.signedIn, true);
  const authSold = authorized.insights.timeline.find((p) =>
    /sold/i.test(p.label),
  );
  assert.ok(authSold);
  assert.equal(authSold!.price, SOLD_PRICE);
  assert.ok(
    authorized.historyRows.some((r) => r.price === RESTRICTED_HISTORY_PRICE),
  );

  const graceUser = {
    id: "cust_grace",
    emailVerified: null,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  };
  assert.equal(hasClientAccess(graceUser), true);
  const grace = insightsPayload(MLS_A, graceUser);
  assert.equal(grace.insights.timeline.some((p) => p.price === SOLD_PRICE), true);

  const otherMls = insightsPayload(MLS_B, null);
  assertNoRestrictedSoldDollars(otherMls, "mls-swap");

  const lib = read("src/lib/market/listing-insights.ts");
  assert.ok(lib.includes("buildAuthorizedAddressListingHistoryRows"));
  assert.ok(lib.includes("buildInsightsTimeline"));
  assert.ok(lib.includes("canSeeRestricted: signedIn"));
  assert.ok(!lib.includes("buildListingHistoryRows({"));

  const route = read("src/app/api/listings/[mlsNumber]/insights/route.ts");
  assert.ok(route.includes("resolveListingDetailAccess"));
  const boardIdx = route.indexOf("evaluateWebListingDetailInventoryAccess({");
  const vowIdx = route.indexOf("resolveListingDetailAccess(user, listing)");
  const buildIdx = route.indexOf("buildListingInsights({");
  assert.ok(boardIdx >= 0 && vowIdx > boardIdx && buildIdx > vowIdx);

  const chart = read("src/components/listings/insights/InsightCharts.tsx");
  assert.ok(chart.includes("points.filter((p) => signedIn || p.public)"));
  assert.ok(!chart.includes("formatPrice"));
  const insightsUi = read("src/components/listings/insights/HouzzatInsights.tsx");
  assert.ok(
    insightsUi.includes("PriceTimelineChart points={timeline} signedIn={signedIn}"),
  );

  const compsStillGated = lib.includes("soldPrice: signedIn ? c.soldPrice : null");
  const rangesStillGated = lib.includes(
    "rangeLow: signedIn ? rangeLow",
  );
  const valuationStillGated = lib.includes("const valMid = signedIn ? homeValue.mid : null");
  assert.ok(compsStillGated && rangesStillGated && valuationStillGated);

  console.log("listing-insights-vow-authorization selftest: ok");
}

main();
