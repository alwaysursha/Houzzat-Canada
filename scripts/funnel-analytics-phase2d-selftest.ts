/**
 * Phase 2D — Master Admin conversion funnel analytics selftest.
 * Run: pnpm funnel-analytics:selftest
 *
 * Prefers executable calculation coverage over source-text assertions.
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildCompletedToEngagedConversion,
  classifyGateIdentityCoverage,
  countCohortEngagedUsers,
  countDistinctTenantScopedKeys,
  countGateToCompletedFromFixtures,
  countSearchToListingFromFixtures,
  evaluateConversionRate,
  FUNNEL_ANALYTICS_TIME_ZONE,
  FUNNEL_ANALYTICS_UNINSTRUMENTED_STAGES,
  isEngagementObservationComplete,
  safeConversionRate,
} from "../src/lib/platform/funnel-analytics";
import { FUNNEL_ENGAGEMENT_WINDOW_MS } from "../src/lib/funnel/phase2c";
import {
  resolveSignupAnalyticsRange,
  SignupAnalyticsRangeError,
} from "../src/lib/platform/signup-analytics";
import { isFunnelEventsEnabled } from "../src/lib/funnel/constants";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-11T16:00:00.000Z");
const rangeFrom = new Date("2026-10-10T04:00:00.000Z"); // ~Oct 10 Toronto start approx for fixtures
const rangeTo = new Date("2026-10-12T04:00:00.000Z");

console.log("\n=== FUNNEL ANALYTICS PHASE 2D ===\n");

// 1. Master Admin authorization wiring
{
  const route = read("src/app/api/platform/v1/funnel-analytics/route.ts");
  assert.ok(route.includes("runPlatformRoute"));
  const auth = read("src/lib/platform/auth/require-platform-operator.ts");
  assert.ok(auth.includes("MASTER_ADMIN"));
  console.log("[1] Master Admin authorization... PASS");
}

// 2. Rate evaluation — no silent clamp; invalid cohort visible
{
  assert.deepEqual(evaluateConversionRate(0, 10), { status: "ok", rate: 0 });
  assert.deepEqual(evaluateConversionRate(3, 10), { status: "ok", rate: 0.3 });
  assert.equal(evaluateConversionRate(0, 0).status, "zero_denominator");
  assert.equal(evaluateConversionRate(5, 2).status, "invalid_cohort");
  assert.equal(evaluateConversionRate(5, 2).rate, null);
  // safeConversionRate must NOT cap at 1
  assert.equal(safeConversionRate(5, 2), null);
  assert.notEqual(safeConversionRate(5, 2), 1);

  const invalid = buildCompletedToEngagedConversion({
    engagedUsers: 5,
    registeredUsers: 2,
  });
  assert.equal(invalid.status, "insufficient_data");
  assert.equal(invalid.rate, null);
  assert.ok(invalid.reason?.includes("numerator exceeds denominator"));
  console.log("[2] Numerator>denominator / zero denom / no clamp... PASS");
}

// 3. Registration-cohort engagement — registered yesterday, engaged today
{
  const yesterday = new Date(now.getTime() - DAY);
  const today = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const result = countCohortEngagedUsers({
    registrations: [
      { userId: "u1", workspaceId: "ws_a", occurredAt: yesterday },
    ],
    engagements: [
      {
        userId: "u1",
        workspaceId: "ws_a",
        occurredAt: today,
        engagementType: "SAVE_LISTING",
      },
    ],
    from: rangeFrom,
    to: rangeTo,
    now,
  });
  assert.equal(result.registeredUsers, 1);
  assert.equal(result.engagedUsers, 1);
  assert.equal(result.rate, 1);
  assert.equal(result.rateStatus, "ok");
  console.log("[3] Registered yesterday, engaged today... PASS");
}

// 4. Registered today, not engaged
{
  const todayReg = new Date(now.getTime() - 60 * 60 * 1000);
  const result = countCohortEngagedUsers({
    registrations: [
      { userId: "u2", workspaceId: "ws_a", occurredAt: todayReg },
    ],
    engagements: [],
    from: rangeFrom,
    to: rangeTo,
    now,
  });
  assert.equal(result.registeredUsers, 1);
  assert.equal(result.engagedUsers, 0);
  assert.equal(result.rate, 0);
  assert.equal(result.observationComplete, false);
  console.log("[4] Registered today, not engaged (observed-to-date)... PASS");
}

// 5. Multiple engagement types from one user → still one engaged user
{
  const regAt = new Date(rangeFrom.getTime() + 6 * 60 * 60 * 1000);
  const result = countCohortEngagedUsers({
    registrations: [
      { userId: "u3", workspaceId: "ws_a", occurredAt: regAt },
      { userId: "u4", workspaceId: "ws_a", occurredAt: regAt },
    ],
    engagements: [
      {
        userId: "u3",
        workspaceId: "ws_a",
        occurredAt: new Date(regAt.getTime() + 1000),
        engagementType: "SAVE_LISTING",
      },
      {
        userId: "u3",
        workspaceId: "ws_a",
        occurredAt: new Date(regAt.getTime() + 2000),
        engagementType: "SAVE_SEARCH",
      },
      {
        userId: "u3",
        workspaceId: "ws_a",
        occurredAt: new Date(regAt.getTime() + 3000),
        engagementType: "CONTACT_AGENT",
      },
    ],
    from: rangeFrom,
    to: rangeTo,
    now,
  });
  assert.equal(result.registeredUsers, 2);
  assert.equal(result.engagedUsers, 1);
  assert.equal(result.rate, 0.5);
  console.log("[5] Multiple engagement types → one engaged user... PASS");
}

// 6. User registered before period but engaged today — excluded from numerator
{
  const before = new Date(rangeFrom.getTime() - DAY);
  const result = countCohortEngagedUsers({
    registrations: [
      { userId: "old", workspaceId: "ws_a", occurredAt: before },
      {
        userId: "new",
        workspaceId: "ws_a",
        occurredAt: new Date(rangeFrom.getTime() + 1000),
      },
    ],
    engagements: [
      {
        userId: "old",
        workspaceId: "ws_a",
        occurredAt: new Date(now.getTime() - 1000),
        engagementType: "SAVE_LISTING",
      },
    ],
    from: rangeFrom,
    to: rangeTo,
    now,
  });
  assert.equal(result.registeredUsers, 1);
  assert.equal(result.engagedUsers, 0);
  assert.equal(result.rate, 0);
  console.log("[6] Pre-period registration excluded from cohort numerator... PASS");
}

// 7. Seven-day engagement window boundary
{
  const regAt = new Date(now.getTime() - 10 * DAY);
  const inside = new Date(regAt.getTime() + FUNNEL_ENGAGEMENT_WINDOW_MS - 1000);
  const outside = new Date(regAt.getTime() + FUNNEL_ENGAGEMENT_WINDOW_MS + 1000);
  const from = new Date(regAt.getTime() - DAY);
  const to = new Date(regAt.getTime() + DAY);

  const inWindow = countCohortEngagedUsers({
    registrations: [{ userId: "w1", workspaceId: "ws_a", occurredAt: regAt }],
    engagements: [
      {
        userId: "w1",
        workspaceId: "ws_a",
        occurredAt: inside,
        engagementType: "SAVE_LISTING",
      },
    ],
    from,
    to,
    now,
  });
  assert.equal(inWindow.engagedUsers, 1);

  const outWindow = countCohortEngagedUsers({
    registrations: [{ userId: "w2", workspaceId: "ws_a", occurredAt: regAt }],
    engagements: [
      {
        userId: "w2",
        workspaceId: "ws_a",
        occurredAt: outside,
        engagementType: "SAVE_LISTING",
      },
    ],
    from,
    to,
    now,
  });
  assert.equal(outWindow.engagedUsers, 0);
  console.log("[7] Seven-day engagement attribution window... PASS");
}

// 8. Observation complete vs incomplete
{
  assert.equal(
    isEngagementObservationComplete({
      newestRegistrationAt: new Date(now.getTime() - FUNNEL_ENGAGEMENT_WINDOW_MS - 1),
      now,
    }),
    true,
  );
  assert.equal(
    isEngagementObservationComplete({
      newestRegistrationAt: new Date(now.getTime() - DAY),
      now,
    }),
    false,
  );
  const recent = buildCompletedToEngagedConversion({
    engagedUsers: 1,
    registeredUsers: 2,
    observationComplete: false,
  });
  assert.ok(recent.cohortNote.includes("Observed-to-date"));
  const final = buildCompletedToEngagedConversion({
    engagedUsers: 1,
    registeredUsers: 2,
    observationComplete: true,
  });
  assert.ok(final.cohortNote.includes("full 7-day"));
  console.log("[8] Observed-to-date vs finalized labeling... PASS");
}

// 9. Gate identity coverage matrix
{
  const dayStart = new Date("2026-10-11T04:00:00.000Z");
  const dayEnd = new Date("2026-10-12T04:00:00.000Z");
  const t = (ms: number) => new Date(dayStart.getTime() + ms);

  // 9a. Zero gate visitors → Insufficient data
  {
    const result = countGateToCompletedFromFixtures({
      gates: [],
      completions: [
        {
          userId: "u1",
          visitorKey: "vk1",
          workspaceId: "ws_a",
          occurredAt: t(1000),
        },
      ],
      from: dayStart,
      to: dayEnd,
    });
    assert.equal(result.gateVisitors, 0);
    assert.equal(result.metric.status, "insufficient_data");
    assert.equal(result.metric.rateKind, "none");
    assert.equal(
      classifyGateIdentityCoverage({
        completedUsers: result.completedUsers,
        completedUsersWithVisitorKey: result.completedUsersWithVisitorKey,
      }),
      "complete",
    );
  }

  // 9b. No registration completions + gates → genuine zero with no_completions
  {
    const result = countGateToCompletedFromFixtures({
      gates: [
        { visitorKey: "vk_a", workspaceId: "ws_a", occurredAt: t(3600_000) },
        { visitorKey: "vk_b", workspaceId: "ws_a", occurredAt: t(7200_000) },
      ],
      completions: [],
      from: dayStart,
      to: dayEnd,
    });
    assert.equal(result.gateVisitors, 2);
    assert.equal(result.convertedVisitors, 0);
    assert.equal(result.metric.status, "available");
    assert.equal(result.metric.rate, 0);
    assert.equal(result.metric.rateKind, "definitive_linked");
    assert.equal(result.metric.identityCoverageKind, "no_completions");
    assert.ok(result.metric.identityCoverageNote?.includes("0/0"));
  }

  // 9c. All completions have visitorKey (complete coverage)
  {
    const result = countGateToCompletedFromFixtures({
      gates: [
        { visitorKey: "vk_a", workspaceId: "ws_a", occurredAt: t(1000) },
        { visitorKey: "vk_b", workspaceId: "ws_a", occurredAt: t(2000) },
      ],
      completions: [
        {
          userId: "u_a",
          visitorKey: "vk_a",
          workspaceId: "ws_a",
          occurredAt: t(3000),
        },
      ],
      from: dayStart,
      to: dayEnd,
    });
    assert.equal(result.metric.identityCoverageKind, "complete");
    assert.equal(result.metric.rateKind, "definitive_linked");
    assert.equal(result.metric.status, "available");
    assert.equal(result.metric.rate, 0.5);
    assert.ok(result.metric.identityCoverageNote?.includes("1/1"));
    assert.ok(
      result.metric.reason?.includes("does not claim every gate visitor"),
    );
    assert.ok(!result.metric.label.includes("observed matched"));
  }

  // 9d. Some completions lack visitorKey → observed matched rate
  {
    const result = countGateToCompletedFromFixtures({
      gates: [
        { visitorKey: "vk_link", workspaceId: "ws_a", occurredAt: t(1000) },
      ],
      completions: [
        {
          userId: "u_ok",
          visitorKey: "vk_link",
          workspaceId: "ws_a",
          occurredAt: t(2000),
        },
        {
          userId: "u_null",
          visitorKey: null,
          workspaceId: "ws_a",
          occurredAt: t(3000),
        },
      ],
      from: dayStart,
      to: dayEnd,
    });
    assert.equal(result.metric.identityCoverageKind, "partial");
    assert.equal(result.metric.rateKind, "observed_matched");
    assert.equal(result.metric.status, "available");
    assert.equal(result.metric.rate, 1);
    assert.ok(result.metric.label.includes("observed matched rate"));
    assert.ok(result.metric.identityCoverageNote?.includes("1/2"));
    assert.ok(result.metric.reason?.includes("not a definitive conversion rate"));
  }

  // 9e. All completions lack visitorKey → Insufficient data
  {
    const result = countGateToCompletedFromFixtures({
      gates: [
        { visitorKey: "vk_a", workspaceId: "ws_a", occurredAt: t(1000) },
      ],
      completions: [
        {
          userId: "u_missing",
          visitorKey: null,
          workspaceId: "ws_a",
          occurredAt: t(2000),
        },
      ],
      from: dayStart,
      to: dayEnd,
    });
    assert.equal(result.metric.identityCoverageKind, "none");
    assert.equal(result.metric.status, "insufficient_data");
    assert.equal(result.metric.rate, null);
    assert.equal(result.metric.rateKind, "none");
    assert.ok(result.metric.identityCoverageNote?.includes("0/1"));
  }

  // 9f. Genuine zero matches with usable (complete) identity
  {
    const result = countGateToCompletedFromFixtures({
      gates: [
        { visitorKey: "vk_gate", workspaceId: "ws_a", occurredAt: t(1000) },
      ],
      completions: [
        {
          userId: "u_other",
          visitorKey: "vk_other",
          workspaceId: "ws_a",
          occurredAt: t(2000),
        },
      ],
      from: dayStart,
      to: dayEnd,
    });
    assert.equal(result.metric.identityCoverageKind, "complete");
    assert.equal(result.metric.status, "available");
    assert.equal(result.metric.rate, 0);
    assert.equal(result.convertedVisitors, 0);
  }

  // 9g. Duplicate completion events for same user — distinct user coverage
  {
    const result = countGateToCompletedFromFixtures({
      gates: [
        { visitorKey: "vk_dup", workspaceId: "ws_a", occurredAt: t(1000) },
      ],
      completions: [
        {
          userId: "u_dup",
          visitorKey: "vk_dup",
          workspaceId: "ws_a",
          occurredAt: t(2000),
        },
        {
          userId: "u_dup",
          visitorKey: "vk_dup",
          workspaceId: "ws_a",
          occurredAt: t(3000),
        },
      ],
      from: dayStart,
      to: dayEnd,
    });
    assert.equal(result.completedUsers, 1);
    assert.equal(result.completedUsersWithVisitorKey, 1);
    assert.equal(result.convertedVisitors, 1);
    assert.equal(result.metric.identityCoverageKind, "complete");
    assert.ok(result.metric.identityCoverageNote?.includes("1/1"));
  }

  console.log("[9] Gate identity coverage matrix... PASS");
}

// 10. Multi-tenant distinct identity counting (all-tenants vs single-tenant)
{
  const dayStart = new Date("2026-10-11T04:00:00.000Z");
  const dayEnd = new Date("2026-10-12T04:00:00.000Z");
  const t = (ms: number) => new Date(dayStart.getTime() + ms);

  // 10a. Same visitorKey in two workspaces → 2 all-tenants, 1 per tenant
  {
    const rows = [
      { workspaceId: "ws_a", key: "vk_shared" },
      { workspaceId: "ws_b", key: "vk_shared" },
    ];
    assert.equal(countDistinctTenantScopedKeys({ rows }), 2);
    assert.equal(
      countDistinctTenantScopedKeys({ rows, workspaceId: "ws_a" }),
      1,
    );
    assert.equal(
      countDistinctTenantScopedKeys({ rows, workspaceId: "ws_b" }),
      1,
    );
  }

  // 10b. Same sessionKey in two workspaces
  {
    const search = countSearchToListingFromFixtures({
      searches: [
        { sessionKey: "sk_shared", workspaceId: "ws_a", occurredAt: t(1000) },
        { sessionKey: "sk_shared", workspaceId: "ws_b", occurredAt: t(2000) },
      ],
      details: [
        { sessionKey: "sk_shared", workspaceId: "ws_a", occurredAt: t(1500) },
        // ws_b search has no same-workspace detail
      ],
      from: dayStart,
      to: dayEnd,
    });
    assert.equal(search.searchSessions, 2);
    assert.equal(search.convertedSessions, 1);
    const onlyA = countSearchToListingFromFixtures({
      searches: [
        { sessionKey: "sk_shared", workspaceId: "ws_a", occurredAt: t(1000) },
        { sessionKey: "sk_shared", workspaceId: "ws_b", occurredAt: t(2000) },
      ],
      details: [
        { sessionKey: "sk_shared", workspaceId: "ws_a", occurredAt: t(1500) },
        { sessionKey: "sk_shared", workspaceId: "ws_b", occurredAt: t(2500) },
      ],
      from: dayStart,
      to: dayEnd,
      workspaceId: "ws_a",
    });
    assert.equal(onlyA.searchSessions, 1);
    assert.equal(onlyA.convertedSessions, 1);
  }

  // 10c. Same userId in different workspace contexts — counted once per workspace
  {
    const engaged = countCohortEngagedUsers({
      registrations: [
        { userId: "u_shared", workspaceId: "ws_a", occurredAt: t(1000) },
        { userId: "u_shared", workspaceId: "ws_b", occurredAt: t(2000) },
      ],
      engagements: [
        {
          userId: "u_shared",
          workspaceId: "ws_a",
          occurredAt: t(3000),
          engagementType: "SAVE_LISTING",
        },
        {
          userId: "u_shared",
          workspaceId: "ws_b",
          occurredAt: t(4000),
          engagementType: "SAVE_LISTING",
        },
      ],
      from: dayStart,
      to: dayEnd,
      now,
    });
    assert.equal(engaged.registeredUsers, 2);
    assert.equal(engaged.engagedUsers, 2);
    const onlyB = countCohortEngagedUsers({
      registrations: [
        { userId: "u_shared", workspaceId: "ws_a", occurredAt: t(1000) },
        { userId: "u_shared", workspaceId: "ws_b", occurredAt: t(2000) },
      ],
      engagements: [
        {
          userId: "u_shared",
          workspaceId: "ws_a",
          occurredAt: t(3000),
        },
        {
          userId: "u_shared",
          workspaceId: "ws_b",
          occurredAt: t(4000),
        },
      ],
      from: dayStart,
      to: dayEnd,
      now,
      workspaceId: "ws_b",
    });
    assert.equal(onlyB.registeredUsers, 1);
    assert.equal(onlyB.engagedUsers, 1);
  }

  // 10d. All-tenants gate totals vs individual-tenant + cross-tenant match rejected
  {
    const allTenants = countGateToCompletedFromFixtures({
      gates: [
        { visitorKey: "vk_shared", workspaceId: "ws_a", occurredAt: t(1000) },
        { visitorKey: "vk_shared", workspaceId: "ws_b", occurredAt: t(2000) },
      ],
      completions: [
        {
          userId: "u_a",
          visitorKey: "vk_shared",
          workspaceId: "ws_a",
          occurredAt: t(3000),
        },
        // Same visitorKey in ws_b must NOT convert ws_a gate (and vice versa)
        {
          userId: "u_b",
          visitorKey: "vk_shared",
          workspaceId: "ws_b",
          occurredAt: t(4000),
        },
      ],
      from: dayStart,
      to: dayEnd,
    });
    assert.equal(allTenants.gateVisitors, 2);
    assert.equal(allTenants.convertedVisitors, 2);
    assert.equal(allTenants.completedUsers, 2);

    const crossRejected = countGateToCompletedFromFixtures({
      gates: [
        { visitorKey: "vk_shared", workspaceId: "ws_a", occurredAt: t(1000) },
      ],
      completions: [
        {
          userId: "u_b",
          visitorKey: "vk_shared",
          workspaceId: "ws_b",
          occurredAt: t(2000),
        },
      ],
      from: dayStart,
      to: dayEnd,
    });
    assert.equal(crossRejected.gateVisitors, 1);
    assert.equal(crossRejected.convertedVisitors, 0);
    assert.equal(crossRejected.metric.rate, 0);

    const tenantA = countGateToCompletedFromFixtures({
      gates: [
        { visitorKey: "vk_shared", workspaceId: "ws_a", occurredAt: t(1000) },
        { visitorKey: "vk_shared", workspaceId: "ws_b", occurredAt: t(2000) },
      ],
      completions: [
        {
          userId: "u_a",
          visitorKey: "vk_shared",
          workspaceId: "ws_a",
          occurredAt: t(3000),
        },
        {
          userId: "u_b",
          visitorKey: "vk_shared",
          workspaceId: "ws_b",
          occurredAt: t(4000),
        },
      ],
      from: dayStart,
      to: dayEnd,
      workspaceId: "ws_a",
    });
    assert.equal(tenantA.gateVisitors, 1);
    assert.equal(tenantA.convertedVisitors, 1);
    assert.equal(tenantA.completedUsers, 1);
  }

  // 10e. Partial-coverage reporting unchanged under multi-tenant fixtures
  {
    const partial = countGateToCompletedFromFixtures({
      gates: [
        { visitorKey: "vk_a", workspaceId: "ws_a", occurredAt: t(1000) },
        { visitorKey: "vk_b", workspaceId: "ws_b", occurredAt: t(1500) },
      ],
      completions: [
        {
          userId: "u_ok",
          visitorKey: "vk_a",
          workspaceId: "ws_a",
          occurredAt: t(2000),
        },
        {
          userId: "u_null",
          visitorKey: null,
          workspaceId: "ws_b",
          occurredAt: t(3000),
        },
      ],
      from: dayStart,
      to: dayEnd,
    });
    assert.equal(partial.metric.identityCoverageKind, "partial");
    assert.equal(partial.metric.rateKind, "observed_matched");
    assert.ok(partial.metric.label.includes("observed matched rate"));
    assert.ok(partial.metric.identityCoverageNote?.includes("1/2"));
    assert.equal(partial.gateVisitors, 2);
    assert.equal(partial.convertedVisitors, 1);
  }

  // 10f. Query SQL uses composite DISTINCT (workspaceId, key)
  {
    const query = read("src/lib/platform/funnel-analytics/query.ts");
    assert.ok(
      query.includes(
        'COUNT(DISTINCT (fe."workspaceId", fe."visitorKey"))',
      ),
    );
    assert.ok(
      query.includes(
        'COUNT(DISTINCT (fe."workspaceId", fe."sessionKey"))',
      ),
    );
    assert.ok(
      query.includes('COUNT(DISTINCT (fe."workspaceId", fe."userId"))'),
    );
    assert.ok(
      query.includes('COUNT(DISTINCT (g."workspaceId", g."visitorKey"))'),
    );
    assert.ok(
      query.includes('COUNT(DISTINCT (s."workspaceId", s."sessionKey"))'),
    );
    assert.ok(
      query.includes('COUNT(DISTINCT (c."workspaceId", c."userId"))'),
    );
    // Must not globally dedupe bare keys in stage aggregates
    assert.ok(
      !query.includes(
        'COUNT(DISTINCT fe."visitorKey") FILTER (WHERE fe."visitorKey" IS NOT NULL)',
      ),
    );
  }

  console.log("[10] Multi-tenant distinct identity counting... PASS");
}

// 11. Cross-midnight gate and registration (same-period exclusion)
{
  const dayStart = new Date("2026-10-11T04:00:00.000Z");
  const dayEnd = new Date("2026-10-12T04:00:00.000Z");
  // Gate just before period end; completion after period end → excluded
  const result = countGateToCompletedFromFixtures({
    gates: [
      {
        visitorKey: "vk_mid",
        workspaceId: "ws_a",
        occurredAt: new Date(dayEnd.getTime() - 60_000),
      },
    ],
    completions: [
      {
        userId: "u_mid",
        visitorKey: "vk_mid",
        workspaceId: "ws_a",
        occurredAt: new Date(dayEnd.getTime() + 60_000),
      },
    ],
    from: dayStart,
    to: dayEnd,
  });
  assert.equal(result.gateVisitors, 1);
  assert.equal(result.convertedVisitors, 0);
  assert.equal(result.completedUsers, 0);
  assert.equal(result.metric.rate, 0);
  assert.equal(result.metric.identityCoverageKind, "no_completions");
  console.log("[11] Cross-midnight same-period exclusion... PASS");
}

// 12. Date boundaries America/Toronto
{
  const torontoNow = new Date("2026-10-11T16:00:00.000Z");
  const today = resolveSignupAnalyticsRange({
    preset: "today",
    now: torontoNow,
  });
  assert.equal(today.timeZone, FUNNEL_ANALYTICS_TIME_ZONE);
  assert.ok(today.from);
  assert.ok(today.to.getTime() > today.from!.getTime());
  assert.throws(
    () =>
      resolveSignupAnalyticsRange({
        preset: "custom",
        from: "2024-01-01",
        to: "2026-01-01",
        now: torontoNow,
      }),
    (e: unknown) => e instanceof SignupAnalyticsRangeError,
  );
  console.log("[12] Date boundaries (Toronto)... PASS");
}

// 13. Feature flag default off + uninstrumented stage + UI labels
{
  assert.equal(isFunnelEventsEnabled({}), false);
  assert.ok(
    (FUNNEL_ANALYTICS_UNINSTRUMENTED_STAGES as readonly string[]).includes(
      "visitor_session_started",
    ),
  );
  const ui = read("src/components/platform/FunnelAnalyticsSection.tsx");
  assert.ok(ui.includes("Event-period"));
  assert.ok(ui.includes("Registration-cohort"));
  assert.ok(ui.includes("Same-period linked"));
  assert.ok(ui.includes("Unavailable"));
  assert.ok(ui.includes("Insufficient data"));
  assert.ok(ui.includes("observed_matched"));
  assert.ok(ui.includes("identityCoverageNote"));
  assert.ok(
    !read("src/lib/platform/funnel-analytics/conversions.ts").includes(
      "Math.min(1",
    ),
  );
  console.log("[13] Flag off / unavailable stage / UI coverage labels... PASS");
}

// 14. Wiring + no Ads/GA4 + files exist
{
  assert.ok(existsSync("src/lib/platform/funnel-analytics/query.ts"));
  assert.ok(existsSync("src/app/api/platform/v1/funnel-analytics/route.ts"));
  const query = read("src/lib/platform/funnel-analytics/query.ts");
  assert.ok(query.includes("FUNNEL_ENGAGEMENT_WINDOW_MS"));
  assert.ok(query.includes("FUNNEL_CONTINUATION_WINDOW_MS"));
  assert.ok(query.includes("countCompletedIdentityCoverage"));
  assert.ok(query.includes("engagementRateKind"));
  assert.ok(
    query.includes('COUNT(DISTINCT (fe."workspaceId", fe."visitorKey"))'),
  );
  assert.ok(!query.includes("reportGa4SignUp"));
  assert.ok(!query.includes("conversion_event_signup"));
  console.log("[14] Query wiring + no Ads/GA4... PASS");
}

console.log("\nFUNNEL ANALYTICS PHASE 2D: ALL PASS\n");
