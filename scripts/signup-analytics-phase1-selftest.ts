/**
 * Phase 1 — Master Admin Signup Analytics selftest.
 * Run: pnpm signup-analytics:selftest
 *
 * Covers pure classification/range logic, consumer vs staff filters,
 * attribution unknown, auth wiring, aggregate-only API shape, and UI presence.
 * Optional DB integration when DATABASE_URL is set and reachable.
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildConsumerSignupWhere,
  classifySignupAcquisition,
  formatYmdInZone,
  isConsumerSignupRole,
  resolveSignupAnalyticsRange,
  SIGNUP_ANALYTICS_CLASSIFICATION_NOTES,
  SIGNUP_ANALYTICS_MAX_CUSTOM_RANGE_DAYS,
  SIGNUP_ANALYTICS_TIME_ZONE,
  SignupAnalyticsRangeError,
  zonedDayStartUtc,
} from "../src/lib/platform/signup-analytics";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

console.log("\n=== SIGNUP ANALYTICS PHASE 1 ===\n");

// 1. Consumer vs staff role classification
{
  assert.equal(isConsumerSignupRole("BUYER"), true);
  assert.equal(isConsumerSignupRole("SELLER"), true);
  assert.equal(isConsumerSignupRole("AGENT"), false);
  assert.equal(isConsumerSignupRole("ADMIN"), false);

  const where = buildConsumerSignupWhere("ws_a");
  assert.equal(where.workspaceId, "ws_a");
  assert.deepEqual(where.role, { in: ["BUYER", "SELLER"] });
  assert.deepEqual(where.platformOperator, { is: null });
  assert.deepEqual(where.workspaceMemberships, { none: {} });

  const allTenants = buildConsumerSignupWhere(null);
  assert.deepEqual(allTenants.workspaceId, { not: null });
  console.log("[1] Consumer vs staff classification... PASS");
}

// 2. Attribution — unknown when missing; no SIGNUP→ads assumption
{
  assert.equal(classifySignupAcquisition(null), "unknown");
  assert.equal(classifySignupAcquisition({}), "unknown");
  assert.equal(
    classifySignupAcquisition({ utmSource: null, utmMedium: null }),
    "unknown",
  );
  assert.equal(
    classifySignupAcquisition({ gclid: "Cj0KCQ" }),
    "google_ads",
  );
  assert.equal(
    classifySignupAcquisition({ utmSource: "google", utmMedium: "cpc" }),
    "google_ads",
  );
  assert.equal(
    classifySignupAcquisition({ utmSource: "google", utmMedium: "organic" }),
    "organic",
  );
  assert.equal(
    classifySignupAcquisition({ utmSource: "facebook", utmMedium: "social" }),
    "social",
  );
  assert.equal(
    classifySignupAcquisition({ utmSource: "newsletter", utmMedium: "email" }),
    "unknown",
  );
  // SIGNUP lead source is not a channel signal — not passed here.
  assert.equal(
    classifySignupAcquisition({ utmSource: "direct", utmMedium: "(none)" }),
    "direct",
  );
  console.log("[2] Attribution channels + unknown... PASS");
}

// 3. Date-range filtering (America/Toronto calendar days)
{
  const now = new Date("2026-10-11T16:00:00.000Z"); // afternoon ET
  const today = resolveSignupAnalyticsRange({ preset: "today", now });
  assert.equal(today.preset, "today");
  assert.ok(today.from);
  assert.equal(formatYmdInZone(today.from!, SIGNUP_ANALYTICS_TIME_ZONE), "2026-10-11");
  assert.equal(formatYmdInZone(today.to, SIGNUP_ANALYTICS_TIME_ZONE), "2026-10-12");

  const d7 = resolveSignupAnalyticsRange({ preset: "7d", now });
  assert.equal(formatYmdInZone(d7.from!, SIGNUP_ANALYTICS_TIME_ZONE), "2026-10-05");

  const d30 = resolveSignupAnalyticsRange({ preset: "30d", now });
  assert.equal(formatYmdInZone(d30.from!, SIGNUP_ANALYTICS_TIME_ZONE), "2026-09-12");

  const custom = resolveSignupAnalyticsRange({
    preset: "custom",
    from: "2026-09-01",
    to: "2026-09-07",
    now,
  });
  assert.equal(custom.preset, "custom");
  assert.equal(formatYmdInZone(custom.from!, SIGNUP_ANALYTICS_TIME_ZONE), "2026-09-01");
  assert.equal(formatYmdInZone(custom.to, SIGNUP_ANALYTICS_TIME_ZONE), "2026-09-08");

  const all = resolveSignupAnalyticsRange({ preset: "all", now });
  assert.equal(all.from, null);

  // Historical day boundary consistency
  const hist = zonedDayStartUtc(2024, 1, 15, SIGNUP_ANALYTICS_TIME_ZONE);
  assert.equal(formatYmdInZone(hist, SIGNUP_ANALYTICS_TIME_ZONE), "2024-01-15");

  // Custom range at max inclusive span (366 calendar days) is accepted.
  const maxOk = resolveSignupAnalyticsRange({
    preset: "custom",
    from: "2025-01-01",
    to: "2025-12-31",
    now,
  });
  assert.equal(maxOk.preset, "custom");
  assert.ok(
    maxOk.to.getTime() - (maxOk.from?.getTime() ?? 0) <=
      SIGNUP_ANALYTICS_MAX_CUSTOM_RANGE_DAYS * 86400000,
  );

  // Custom ranges beyond 366 days are rejected (not silently truncated).
  assert.throws(
    () =>
      resolveSignupAnalyticsRange({
        preset: "custom",
        from: "2024-01-01",
        to: "2026-01-01",
        now,
      }),
    (e: unknown) =>
      e instanceof SignupAnalyticsRangeError &&
      e.code === "DATE_RANGE_TOO_LARGE" &&
      /366 days/i.test(e.message),
  );

  // All-time remains unrestricted.
  assert.equal(
    resolveSignupAnalyticsRange({ preset: "all", now }).from,
    null,
  );

  console.log("[3] Date-range + timezone handling... PASS");
}

// 4. Duplicate prevention: one User = one signup (where shape)
{
  const where = buildConsumerSignupWhere("ws_a", {
    gte: new Date("2026-01-01T00:00:00.000Z"),
    lt: new Date("2026-02-01T00:00:00.000Z"),
  });
  assert.ok(where.createdAt);
  // Counts are User.count / groupBy — not Lead.count (enforced in source).
  const querySrc = read("src/lib/platform/signup-analytics/query.ts");
  assert.ok(querySrc.includes("db.user.count"));
  assert.ok(querySrc.includes("db.user.groupBy"));
  assert.ok(!querySrc.includes("db.lead.count"));
  assert.ok(querySrc.includes("LEFT JOIN"));
  assert.ok(
    querySrc.includes('COUNT(*)::int AS count'),
    "attribution aggregates counts, not Lead rows exported",
  );
  console.log("[4] Duplicate prevention / User-authoritative counts... PASS");
}

// 5. Master Admin authorization on reporting endpoint
{
  const route = read("src/app/api/platform/v1/signup-analytics/route.ts");
  assert.ok(route.includes("runPlatformRoute"));
  assert.ok(route.includes("getSignupAnalyticsReport"));
  assert.ok(!route.includes("requireAgentContext"));

  const handler = read("src/lib/platform/api/handler.ts");
  assert.ok(handler.includes("SignupAnalyticsQueryError"));
  assert.ok(handler.includes("withPlatformOperator"));

  const routeHelper = read("src/lib/platform/api/route.ts");
  assert.ok(routeHelper.includes("withPlatformOperator"));
  console.log("[5] Master Admin authorization wiring... PASS");
}

// 6. Tenant isolation + no PII in report types / UI
{
  const types = read("src/lib/platform/signup-analytics/types.ts");
  assert.ok(!/email\s*:/.test(types));
  assert.ok(!/phone\s*:/.test(types));
  assert.ok(!types.includes("customerName"));
  assert.ok(types.includes("byTenant"));
  assert.ok(types.includes("acquisition"));

  const ui = read("src/components/platform/SignupAnalyticsDashboard.tsx");
  assert.ok(ui.includes("Aggregates only"));
  assert.ok(!ui.includes("lead.email"));
  assert.ok(!ui.includes("user.email"));

  const querySrc = read("src/lib/platform/signup-analytics/query.ts");
  assert.ok(!querySrc.includes("select: { email"));
  assert.ok(!querySrc.includes("select: { phone"));
  assert.ok(querySrc.includes("WORKSPACE_NOT_FOUND"));
  console.log("[6] Tenant isolation + no PII in report surface... PASS");
}

// 7. Empty states + nav + page + current-period KPI clarity
{
  assert.ok(existsSync("src/app/platform/(shell)/signup-analytics/page.tsx"));
  const page = read("src/app/platform/(shell)/signup-analytics/page.tsx");
  assert.ok(page.includes("getPlatformSignupAnalytics"));
  assert.ok(page.includes("SignupAnalyticsDashboard"));

  const ui = read("src/components/platform/SignupAnalyticsDashboard.tsx");
  assert.ok(ui.includes("PlatformEmptyState"));
  assert.ok(ui.includes("PlatformErrorState"));
  assert.ok(ui.includes("No consumer signups found"));
  assert.ok(ui.includes("currentPeriod"));
  assert.ok(ui.includes("Current period KPI"));
  assert.ok(ui.includes("independent of selected range"));
  assert.ok(ui.includes("Phone OTP verified"));
  assert.ok(ui.includes("Agent-confirmed phone"));
  assert.ok(!ui.includes("phoneVerified +"));

  const shell = read("src/components/platform/PlatformShell.tsx");
  assert.ok(shell.includes("Signup Analytics"));
  assert.ok(shell.includes("/platform/signup-analytics"));
  console.log("[7] Empty/error UI + navigation + KPI clarity... PASS");
}

// 8. Classification notes + phone OTP vs agent-confirmed separation
{
  assert.ok(
    SIGNUP_ANALYTICS_CLASSIFICATION_NOTES.some((n) =>
      /Test accounts are not excluded/i.test(n),
    ),
  );
  assert.ok(
    SIGNUP_ANALYTICS_CLASSIFICATION_NOTES.some((n) =>
      /Lead rows are never counted as signups/i.test(n),
    ),
  );
  assert.ok(
    SIGNUP_ANALYTICS_CLASSIFICATION_NOTES.some((n) =>
      /phoneOtpVerifiedAt only/i.test(n),
    ),
  );
  assert.ok(
    SIGNUP_ANALYTICS_CLASSIFICATION_NOTES.some((n) =>
      /independent of the selected range/i.test(n),
    ),
  );

  const types = read("src/lib/platform/signup-analytics/types.ts");
  assert.ok(types.includes("phoneOtpVerified"));
  assert.ok(types.includes("phoneAgentConfirmed"));
  assert.ok(types.includes("currentPeriod"));
  assert.ok(!types.includes("phoneUnverified"));

  const querySrc = read("src/lib/platform/signup-analytics/query.ts");
  assert.ok(querySrc.includes("phoneOtpVerifiedAt: { not: null }"));
  assert.ok(querySrc.includes("phoneVerifiedAt: { not: null }"));
  // Must not OR agent-confirmed into OTP verified.
  assert.ok(
    !/phoneOtpVerifiedAt[\s\S]{0,120}phoneVerifiedAt[\s\S]{0,40}OR/m.test(
      querySrc,
    ),
  );
  assert.ok(querySrc.includes("DATE_RANGE_TOO_LARGE") || querySrc.includes("SignupAnalyticsRangeError"));
  assert.ok(!querySrc.includes("toExclusive.getTime() - maxSpanMs"));
  console.log("[8] Classification notes + phone/range corrections... PASS");
}

// 9. Boundary documents aggregate Lead exception
{
  const boundary = read("src/lib/platform/read/boundary.ts");
  assert.ok(boundary.includes("signup-analytics"));
  assert.ok(boundary.includes("allowedAggregateSignupAttributionSource"));
  console.log("[9] Platform read boundary exception documented... PASS");
}

// 10. Optional DB integration — tenant counts / all-tenant / empty
async function runDbIntegration(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) {
    console.log("[10] DB integration skipped (no DATABASE_URL)... SKIP");
    return;
  }
  const { prisma } = await import("../src/lib/prisma");
  const {
    getSignupAnalyticsReport,
    SignupAnalyticsQueryError,
  } = await import("../src/lib/platform/signup-analytics");

  try {
    const all = await getSignupAnalyticsReport({
      preset: "all",
      now: new Date("2026-10-11T16:00:00.000Z"),
    });
    assert.ok(typeof all.totals.allTime === "number");
    assert.ok(Array.isArray(all.byTenant));
    assert.ok(Array.isArray(all.acquisition));
    assert.equal(
      all.acquisition.reduce((s, r) => s + r.count, 0),
      all.totals.inRange,
      "acquisition channel counts must sum to in-range signups",
    );
    assert.ok(!JSON.stringify(all).includes("@"), "report must not leak emails");

    const tenantSum = all.byTenant.reduce((s, r) => s + r.count, 0);
    assert.equal(
      tenantSum,
      all.totals.inRange,
      "by-tenant counts must sum to all-tenant in-range",
    );

    if (all.byTenant[0]) {
      const one = await getSignupAnalyticsReport({
        workspaceId: all.byTenant[0].workspaceId,
        preset: "all",
        now: new Date("2026-10-11T16:00:00.000Z"),
      });
      assert.equal(one.totals.inRange, all.byTenant[0].count);
      assert.ok(one.tenantDetail);
      assert.equal(one.tenantDetail?.workspaceId, all.byTenant[0].workspaceId);
      assert.ok(
        one.byTenant.every((t) => t.workspaceId === all.byTenant[0]!.workspaceId),
      );
    }

    const emptyish = await getSignupAnalyticsReport({
      preset: "custom",
      from: "1990-01-01",
      to: "1990-01-02",
      now: new Date("2026-10-11T16:00:00.000Z"),
    });
    assert.equal(emptyish.totals.inRange, 0);

    await assert.rejects(
      () =>
        getSignupAnalyticsReport({
          workspaceId: "ws_does_not_exist_phase1",
          preset: "30d",
        }),
      (e: unknown) =>
        e instanceof SignupAnalyticsQueryError &&
        e.code === "WORKSPACE_NOT_FOUND",
    );

    console.log("[10] DB aggregation + tenant isolation... PASS");
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

runDbIntegration()
  .then(() => {
    console.log("\nSIGNUP ANALYTICS PHASE 1: ALL PASS\n");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
