/**
 * Phase 2C — post-registration continuation + engagement selftest.
 * Run: pnpm funnel-events:phase2c:selftest
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildPostRegistrationContinuedDedupeKey,
  buildRegistrationEngagedDedupeKey,
  FunnelSanitizeError,
  FUNNEL_CONTINUATION_WINDOW_MS,
  FUNNEL_ENGAGEMENT_WINDOW_MS,
  isEligibleFunnelConsumer,
  isWithinFunnelAttributionWindow,
  parseClientFunnelPayload,
  recordPostRegistrationContinuedEvent,
  recordPostRegistrationContinuedEventSafe,
  recordRegistrationEngagedEvent,
  recordRegistrationEngagedEventSafe,
  resolveFunnelConsumerEligibility,
  scheduleRegistrationEngaged,
  type FunnelEligibilityDb,
} from "../src/lib/funnel";
import { CAPTURE_INTENT_TTL_MS } from "../src/lib/auth/capture-intent";
import type { CaptureIntent } from "../src/lib/auth/capture-intent";
import {
  clearPendingSaveSearchContinuation,
  hasPendingSaveSearchContinuation,
  markPendingSaveSearchContinuation,
  reportSaveSearchContinuationIfPending,
  resumeSavedSearchIntent,
} from "../src/lib/auth/save-search-intent";
import {
  clearFunnelBrowserDedupeForTests,
  setFunnelBrowserFetchForTests,
} from "../src/lib/funnel/browser";
import type { SearchFilters } from "../src/components/listings/SearchFilterChips";
import { searchPageHref } from "../src/lib/listings/search-page-href";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

/** Fake for Phase 1 consumer-population lookup (no live Prisma). */
function ordinaryEligibilityDb(options?: {
  staffMemberIds?: Set<string>;
  platformOperatorIds?: Set<string>;
  fail?: boolean;
}): FunnelEligibilityDb {
  return {
    user: {
      async findFirst(args) {
        if (options?.fail) throw new Error("eligibility db down");
        const id = args.where.id;
        assert.ok(args.where.platformOperator);
        assert.ok(args.where.workspaceMemberships);
        if (options?.staffMemberIds?.has(id)) return null;
        if (options?.platformOperatorIds?.has(id)) return null;
        return { id };
      },
    },
  };
}

function installBrowserStorage(): void {
  const make = () => {
    const map = new Map<string, string>();
    return {
      getItem(key: string) {
        return map.has(key) ? map.get(key)! : null;
      },
      setItem(key: string, value: string) {
        map.set(key, String(value));
      },
      removeItem(key: string) {
        map.delete(key);
      },
      clear() {
        map.clear();
      },
    };
  };
  const g = globalThis as typeof globalThis & {
    window: typeof globalThis;
    sessionStorage: Storage;
  };
  g.sessionStorage = make() as Storage;
  g.window = g;
}

const PHASE2C_SEARCH_FILTERS: SearchFilters = {
  segment: "RESIDENTIAL",
  transactionType: "SALE",
  dataSource: "",
  city: "Toronto",
  community: "",
  minPrice: "",
  maxPrice: "",
  minBeds: "2",
  minBaths: "",
  propertyTypes: [],
  openHouseOnly: false,
  statuses: ["ACTIVE"],
  sort: "newest",
};

function saveSearchIntent(callbackPath: string): CaptureIntent {
  return {
    type: "SAVE_SEARCH",
    callbackPath,
    host: "acme.houzzatpro.com",
    createdAt: Date.now(),
  };
}

console.log("\n=== FUNNEL EVENTS PHASE 2C ===\n");

async function main(): Promise<void> {
  // 1. Attribution windows
  {
    assert.equal(FUNNEL_CONTINUATION_WINDOW_MS, CAPTURE_INTENT_TTL_MS);
    assert.equal(FUNNEL_CONTINUATION_WINDOW_MS, 45 * 60 * 1000);
    assert.equal(FUNNEL_ENGAGEMENT_WINDOW_MS, 7 * 24 * 60 * 60 * 1000);

    const now = new Date("2026-10-11T12:00:00.000Z");
    const fresh = new Date(now.getTime() - 10 * 60_000);
    const staleContinuation = new Date(
      now.getTime() - FUNNEL_CONTINUATION_WINDOW_MS - 1,
    );
    const withinEngagement = new Date(
      now.getTime() - 3 * 24 * 60 * 60 * 1000,
    );
    const staleEngagement = new Date(
      now.getTime() - FUNNEL_ENGAGEMENT_WINDOW_MS - 1,
    );

    assert.equal(
      isWithinFunnelAttributionWindow(
        fresh,
        now,
        FUNNEL_CONTINUATION_WINDOW_MS,
      ),
      true,
    );
    assert.equal(
      isWithinFunnelAttributionWindow(
        staleContinuation,
        now,
        FUNNEL_CONTINUATION_WINDOW_MS,
      ),
      false,
    );
    assert.equal(
      isWithinFunnelAttributionWindow(
        withinEngagement,
        now,
        FUNNEL_ENGAGEMENT_WINDOW_MS,
      ),
      true,
    );
    assert.equal(
      isWithinFunnelAttributionWindow(
        staleEngagement,
        now,
        FUNNEL_ENGAGEMENT_WINDOW_MS,
      ),
      false,
    );
    console.log("[1] Attribution windows... PASS");
  }

  // 2. Client cannot submit Phase 2C user-linked events / spoof userId
  {
    assert.throws(
      () =>
        parseClientFunnelPayload({
          eventName: "post_registration_continued",
          visitorKey: "v",
          sessionKey: "s",
        }),
      (e: unknown) =>
        e instanceof FunnelSanitizeError && e.code === "SERVER_ONLY_EVENT",
    );
    assert.throws(
      () =>
        parseClientFunnelPayload({
          eventName: "registration_engaged",
          visitorKey: "v",
          sessionKey: "s",
        }),
      (e: unknown) =>
        e instanceof FunnelSanitizeError && e.code === "SERVER_ONLY_EVENT",
    );
    const route = read("src/app/api/analytics/funnel/continued/route.ts");
    assert.ok(route.includes("CLIENT_USER_ID_FORBIDDEN"));
    assert.ok(route.includes("requireCustomerUser"));
    assert.ok(route.includes("resolveFunnelWorkspaceId"));
    console.log("[2] Spoofed userId / server-only rejection... PASS");
  }

  // 3. Successful continuation vs expired / outside window / duplicate
  {
    const rows: Array<Record<string, unknown>> = [];
    const db = {
      funnelEvent: {
        async create(args: {
          data: Record<string, unknown>;
          select: { id: true };
        }) {
          rows.push(args.data);
          return { id: `id_${rows.length}` };
        },
      },
    };
    const now = new Date();
    const registeredAt = new Date(now.getTime() - 5 * 60_000);

    const ok = await recordPostRegistrationContinuedEvent({
      workspaceId: "ws_a",
      userId: "user_new",
      role: "BUYER",
      eligibilityDb: ordinaryEligibilityDb(),
      intentType: "VIEW_LISTING",
      mlsNumber: "W1234567",
      registeredAt,
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    assert.equal(ok.status, "written");
    assert.equal(rows[0]?.eventName, "post_registration_continued");
    assert.equal(rows[0]?.userId, "user_new");
    assert.equal(rows[0]?.workspaceId, "ws_a");
    assert.equal(
      rows[0]?.dedupeKey,
      buildPostRegistrationContinuedDedupeKey("user_new"),
    );
    assert.deepEqual(rows[0]?.meta, {
      intentType: "VIEW_LISTING",
      source: "capture_intent_resume",
    });

    // Ordinary / old sign-in: outside continuation window → no write
    const old = await recordPostRegistrationContinuedEvent({
      workspaceId: "ws_a",
      userId: "user_old",
      role: "BUYER",
      eligibilityDb: ordinaryEligibilityDb(),
      intentType: "SAVE_LISTING",
      registeredAt: new Date(now.getTime() - FUNNEL_CONTINUATION_WINDOW_MS - 1000),
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    assert.equal(old.status, "disabled");
    assert.equal(rows.length, 1);

    // Duplicate continuation (same user) via P2002
    let calls = 0;
    const dupDb = {
      funnelEvent: {
        async create() {
          calls += 1;
          if (calls === 1) return { id: "c1" };
          throw Object.assign(new Error("Unique"), { code: "P2002" });
        },
      },
    };
    const first = await recordPostRegistrationContinuedEvent({
      workspaceId: "ws_a",
      userId: "user_dup",
      role: "BUYER",
      eligibilityDb: ordinaryEligibilityDb(),
      intentType: "SAVE_LISTING",
      registeredAt,
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db: dupDb,
    });
    const second = await recordPostRegistrationContinuedEvent({
      workspaceId: "ws_a",
      userId: "user_dup",
      role: "BUYER",
      eligibilityDb: ordinaryEligibilityDb(),
      intentType: "PROPERTY_WATCH",
      registeredAt,
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db: dupDb,
    });
    assert.equal(first.status, "written");
    assert.equal(second.status, "duplicate");
    console.log("[3] Continuation success / expired / duplicate... PASS");
  }

  // 4. Meaningful engagement vs failed path / outside window / types
  {
    const rows: Array<Record<string, unknown>> = [];
    const db = {
      funnelEvent: {
        async create(args: {
          data: Record<string, unknown>;
          select: { id: true };
        }) {
          rows.push(args.data);
          return { id: `e_${rows.length}` };
        },
      },
    };
    const now = new Date();
    const registeredAt = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const eng = await recordRegistrationEngagedEvent({
      workspaceId: "ws_a",
      userId: "user_e",
      role: "BUYER",
      eligibilityDb: ordinaryEligibilityDb(),
      engagementType: "SAVE_LISTING",
      mlsNumber: "X9999999",
      registeredAt,
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    assert.equal(eng.status, "written");
    assert.equal(rows[0]?.eventName, "registration_engaged");
    assert.equal(
      rows[0]?.dedupeKey,
      buildRegistrationEngagedDedupeKey("user_e", "SAVE_LISTING"),
    );

    // Different engagement type → separate row
    const eng2 = await recordRegistrationEngagedEvent({
      workspaceId: "ws_a",
      userId: "user_e",
      role: "BUYER",
      eligibilityDb: ordinaryEligibilityDb(),
      engagementType: "CONTACT_AGENT",
      registeredAt,
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    assert.equal(eng2.status, "written");
    assert.equal(rows.length, 2);

    // Outside engagement window
    const stale = await recordRegistrationEngagedEvent({
      workspaceId: "ws_a",
      userId: "user_stale",
      role: "BUYER",
      eligibilityDb: ordinaryEligibilityDb(),
      engagementType: "SAVE_SEARCH",
      registeredAt: new Date(now.getTime() - FUNNEL_ENGAGEMENT_WINDOW_MS - 1),
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    assert.equal(stale.status, "disabled");
    assert.equal(rows.length, 2);

    // VIEW_LISTING is continuation-only — not an engagement type in API hooks
    const listingsRoute = read("src/app/api/saved-listings/route.ts");
    assert.ok(listingsRoute.includes('engagementType: "SAVE_LISTING"'));
    assert.ok(!listingsRoute.includes("VIEW_LISTING"));
    console.log("[4] Engagement success / window / type isolation... PASS");
  }

  // 5. Cross-tenant isolation
  {
    const rows: Array<Record<string, unknown>> = [];
    const db = {
      funnelEvent: {
        async create(args: {
          data: Record<string, unknown>;
          select: { id: true };
        }) {
          rows.push(args.data);
          return { id: `t_${rows.length}` };
        },
      },
    };
    const now = new Date();
    const registeredAt = new Date(now.getTime() - 60_000);
    await recordPostRegistrationContinuedEvent({
      workspaceId: "ws_tenant_a",
      userId: "same_user_id",
      role: "BUYER",
      eligibilityDb: ordinaryEligibilityDb(),
      intentType: "VIEW_LISTING",
      registeredAt,
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    await recordPostRegistrationContinuedEvent({
      workspaceId: "ws_tenant_b",
      userId: "same_user_id",
      role: "BUYER",
      eligibilityDb: ordinaryEligibilityDb(),
      intentType: "VIEW_LISTING",
      registeredAt,
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.workspaceId, "ws_tenant_a");
    assert.equal(rows[1]?.workspaceId, "ws_tenant_b");
    assert.equal(rows[0]?.dedupeKey, rows[1]?.dedupeKey);
    console.log("[5] Cross-tenant isolation... PASS");
  }

  // 6. Analytics failure safety
  {
    await recordPostRegistrationContinuedEventSafe({
      workspaceId: "ws1",
      userId: "u1",
      role: "BUYER",
      eligibilityDb: ordinaryEligibilityDb(),
      intentType: "VIEW_LISTING",
      registeredAt: new Date(),
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db: {
        funnelEvent: {
          async create() {
            throw new Error("db down");
          },
        },
      },
    });
    await recordRegistrationEngagedEventSafe({
      workspaceId: "ws1",
      userId: "u1",
      role: "BUYER",
      eligibilityDb: ordinaryEligibilityDb(),
      engagementType: "SAVE_LISTING",
      registeredAt: new Date(),
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db: {
        funnelEvent: {
          async create() {
            throw new Error("db down");
          },
        },
      },
    });
    console.log("[6] Analytics failure safety... PASS");
  }

  // 7. Resume wiring + existing capture-intent regression spot checks
  {
    assert.ok(
      read("src/lib/auth/view-listing-intent.ts").includes(
        "reportPostRegistrationContinued",
      ),
    );
    assert.ok(
      read("src/lib/auth/save-listing-intent.ts").includes(
        'intentType: "SAVE_LISTING"',
      ),
    );
    assert.ok(
      read("src/lib/auth/save-search-intent.ts").includes(
        'intentType: "SAVE_SEARCH"',
      ),
    );
    assert.ok(
      read("src/lib/auth/property-watch-intent.ts").includes(
        "reportPostRegistrationContinued",
      ),
    );
    assert.ok(
      read("src/lib/auth/area-watch-intent.ts").includes(
        "reportPostRegistrationContinued",
      ),
    );
    assert.ok(
      read("src/lib/auth/lead-request-intent.ts").includes(
        'result === "restored"',
      ),
    );
    assert.ok(
      read("src/lib/auth/start-chat-intent.ts").includes(
        'intentType: "START_CHAT"',
      ),
    );

    // Capture-intent claim-before-run unchanged
    const dispatch = read("src/lib/auth/capture-intent-dispatch.ts");
    assert.ok(dispatch.includes("store.remove()"));
    assert.ok(dispatch.includes("Already claimed"));

    // VIEW_LISTING still does not POST leads / save
    const view = read("src/lib/auth/view-listing-intent.ts");
    assert.ok(view.includes("Access continuation only"));
    assert.ok(!view.includes("/api/saved-listings"));
    console.log("[7] Resume wiring + capture-intent regression... PASS");
  }

  // 8. Engagement API hooks + no Ads
  {
    assert.ok(
      read("src/app/api/saved-listings/route.ts").includes(
        "scheduleRegistrationEngaged",
      ),
    );
    assert.ok(
      read("src/app/api/saved-searches/route.ts").includes(
        'engagementType: "SAVE_SEARCH"',
      ),
    );
    assert.ok(
      read("src/app/api/account/property-monitors/route.ts").includes(
        'engagementType: "PROPERTY_WATCH"',
      ),
    );
    assert.ok(
      read("src/app/api/account/area-monitors/route.ts").includes(
        'engagementType: "AREA_WATCH"',
      ),
    );
    const leads = read("src/app/api/leads/route.ts");
    assert.ok(leads.includes("scheduleRegistrationEngaged"));
    assert.ok(leads.includes("CONTACT_AGENT"));
    assert.ok(leads.includes("REQUEST_VIEWING"));
    assert.ok(!leads.includes("reportGa4SignUp"));
    assert.ok(!leads.includes("conversion_event_signup"));

    const browser = read("src/lib/funnel/browser.ts");
    assert.ok(browser.includes("/api/analytics/funnel/continued"));
    assert.ok(!browser.includes("reportGa4SignUp"));

    assert.ok(
      existsSync("src/app/api/analytics/funnel/continued/route.ts"),
    );
    assert.ok(existsSync("src/lib/funnel/phase2c.ts"));
    console.log("[8] Engagement hooks + no Ads conversions... PASS");
  }

  // 9. Flag default + stage distinction documented
  {
    const phase = read("src/lib/funnel/phase2c.ts");
    assert.ok(phase.includes("registration_completed"));
    assert.ok(phase.includes("post_registration_continued"));
    assert.ok(phase.includes("registration_engaged"));
    assert.ok(phase.includes("45 minutes") || phase.includes("45m"));
    assert.ok(phase.includes("7 days") || phase.includes("7d"));

    const constants = read("src/lib/funnel/constants.ts");
    assert.ok(
      constants.includes('"post_registration_continued"'),
    );
    assert.ok(constants.includes('"registration_engaged"'));
    assert.ok(
      constants.includes("post_registration_continued") &&
        constants.includes("FUNNEL_SERVER_ONLY_EVENT_NAMES"),
    );
    console.log("[9] Stage docs + server-only list... PASS");
  }

  // 10. Consumer eligibility — role + staff seat + platform operator
  {
    assert.equal(isEligibleFunnelConsumer({ role: "BUYER" }), true);
    assert.equal(isEligibleFunnelConsumer({ role: "SELLER" }), true);
    assert.equal(isEligibleFunnelConsumer({ role: "AGENT" }), false);
    assert.equal(isEligibleFunnelConsumer({ role: "ADMIN" }), false);
    assert.equal(isEligibleFunnelConsumer({ role: "PLATFORM" }), false);

    const phase = read("src/lib/funnel/phase2c.ts");
    assert.ok(phase.includes("isConsumerRole"));
    assert.ok(phase.includes("buildConsumerSignupWhere"));
    assert.ok(phase.includes("resolveFunnelConsumerEligibility"));
    assert.ok(phase.includes("PlatformOperator") || phase.includes("platformOperator"));
    assert.ok(
      phase.includes("WorkspaceMember") || phase.includes("workspaceMemberships"),
    );

    // Sync role gate skips DB for staff roles
    assert.equal(
      await resolveFunnelConsumerEligibility({
        userId: "u_agent",
        role: "AGENT",
        db: ordinaryEligibilityDb({ fail: true }),
      }),
      false,
    );

    const rows: Array<Record<string, unknown>> = [];
    const db = {
      funnelEvent: {
        async create(args: {
          data: Record<string, unknown>;
          select: { id: true };
        }) {
          rows.push(args.data);
          return { id: `role_${rows.length}` };
        },
      },
    };
    const now = new Date();
    const registeredAt = new Date(now.getTime() - 60_000);

    // Ordinary BUYER eligible
    const buyer = await recordRegistrationEngagedEvent({
      workspaceId: "ws_a",
      userId: "u_buyer",
      role: "BUYER",
      eligibilityDb: ordinaryEligibilityDb(),
      engagementType: "SAVE_LISTING",
      registeredAt,
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    assert.equal(buyer.status, "written");

    // Ordinary SELLER eligible (engagement + continuation)
    const seller = await recordRegistrationEngagedEvent({
      workspaceId: "ws_a",
      userId: "u_seller",
      role: "SELLER",
      eligibilityDb: ordinaryEligibilityDb(),
      engagementType: "SAVE_SEARCH",
      registeredAt,
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    assert.equal(seller.status, "written");
    const sellerCont = await recordPostRegistrationContinuedEvent({
      workspaceId: "ws_a",
      userId: "u_seller",
      role: "SELLER",
      eligibilityDb: ordinaryEligibilityDb(),
      intentType: "SAVE_SEARCH",
      registeredAt,
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    assert.equal(sellerCont.status, "written");

    // AGENT / ADMIN excluded
    const agent = await recordRegistrationEngagedEvent({
      workspaceId: "ws_a",
      userId: "u_agent",
      role: "AGENT",
      eligibilityDb: ordinaryEligibilityDb(),
      engagementType: "SAVE_LISTING",
      registeredAt,
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    assert.equal(agent.status, "disabled");
    const admin = await recordRegistrationEngagedEvent({
      workspaceId: "ws_a",
      userId: "u_admin",
      role: "ADMIN",
      eligibilityDb: ordinaryEligibilityDb(),
      engagementType: "PROPERTY_WATCH",
      registeredAt,
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    assert.equal(admin.status, "disabled");
    const adminCont = await recordPostRegistrationContinuedEvent({
      workspaceId: "ws_a",
      userId: "u_admin",
      role: "ADMIN",
      eligibilityDb: ordinaryEligibilityDb(),
      intentType: "VIEW_LISTING",
      registeredAt,
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    assert.equal(adminCont.status, "disabled");

    // BUYER with staff WorkspaceMember excluded
    const buyerStaff = await recordRegistrationEngagedEvent({
      workspaceId: "ws_a",
      userId: "u_buyer_staff",
      role: "BUYER",
      eligibilityDb: ordinaryEligibilityDb({
        staffMemberIds: new Set(["u_buyer_staff"]),
      }),
      engagementType: "SAVE_LISTING",
      registeredAt,
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    assert.equal(buyerStaff.status, "disabled");
    const buyerStaffCont = await recordPostRegistrationContinuedEvent({
      workspaceId: "ws_a",
      userId: "u_buyer_staff",
      role: "BUYER",
      eligibilityDb: ordinaryEligibilityDb({
        staffMemberIds: new Set(["u_buyer_staff"]),
      }),
      intentType: "VIEW_LISTING",
      registeredAt,
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    assert.equal(buyerStaffCont.status, "disabled");

    // SELLER with PlatformOperator excluded
    const sellerOp = await recordRegistrationEngagedEvent({
      workspaceId: "ws_a",
      userId: "u_seller_op",
      role: "SELLER",
      eligibilityDb: ordinaryEligibilityDb({
        platformOperatorIds: new Set(["u_seller_op"]),
      }),
      engagementType: "CONTACT_AGENT",
      registeredAt,
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    assert.equal(sellerOp.status, "disabled");
    const sellerOpCont = await recordPostRegistrationContinuedEvent({
      workspaceId: "ws_a",
      userId: "u_seller_op",
      role: "SELLER",
      eligibilityDb: ordinaryEligibilityDb({
        platformOperatorIds: new Set(["u_seller_op"]),
      }),
      intentType: "CONTACT_AGENT",
      registeredAt,
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    assert.equal(sellerOpCont.status, "disabled");

    // Eligibility DB failure → analytics disabled; does not throw (API-safe)
    await recordRegistrationEngagedEventSafe({
      workspaceId: "ws_a",
      userId: "u_fail",
      role: "BUYER",
      eligibilityDb: ordinaryEligibilityDb({ fail: true }),
      engagementType: "SAVE_LISTING",
      registeredAt,
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    const failCont = await recordPostRegistrationContinuedEvent({
      workspaceId: "ws_a",
      userId: "u_fail",
      role: "BUYER",
      eligibilityDb: ordinaryEligibilityDb({ fail: true }),
      intentType: "SAVE_LISTING",
      registeredAt,
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    assert.equal(failCont.status, "disabled");

    // Detectable staff roles — schedule early-returns before write
    scheduleRegistrationEngaged({
      request: new Request("https://acme.houzzatpro.com/api/saved-listings"),
      user: {
        id: "u_agent_sched",
        workspaceId: "ws_a",
        createdAt: registeredAt,
        role: "AGENT",
      },
      engagementType: "SAVE_LISTING",
    });
    await new Promise((r) => setTimeout(r, 20));
    // buyer + seller engagement + seller continuation only
    assert.equal(rows.length, 3);

    // Existing consumer outside seven-day window
    const aged = await recordRegistrationEngagedEvent({
      workspaceId: "ws_a",
      userId: "u_aged",
      role: "BUYER",
      eligibilityDb: ordinaryEligibilityDb(),
      engagementType: "AREA_WATCH",
      registeredAt: new Date(now.getTime() - FUNNEL_ENGAGEMENT_WINDOW_MS - 1),
      now,
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    assert.equal(aged.status, "disabled");
    assert.equal(rows.length, 3);

    // APIs pass authenticated user (role from session), never client body
    const listings = read("src/app/api/saved-listings/route.ts");
    assert.ok(listings.includes("scheduleRegistrationEngaged"));
    assert.ok(listings.includes("user,"));
    assert.ok(!listings.includes("body.role"));
    const continued = read("src/app/api/analytics/funnel/continued/route.ts");
    assert.ok(continued.includes("role: user.role"));
    assert.ok(!continued.includes("raw.role"));

    // No GA4 / Ads wiring in Phase 2C paths
    assert.ok(!phase.includes("reportGa4SignUp"));
    assert.ok(!phase.includes("conversion_event_signup"));
    assert.ok(!continued.includes("reportGa4SignUp"));
    assert.ok(!listings.includes("conversion_event_signup"));

    console.log(
      "[10] Consumer eligibility (role/seat/operator/window/fail-soft)... PASS",
    );
  }

  // 11. SAVE_SEARCH confirmation continuation correlation
  {
    installBrowserStorage();
    clearFunnelBrowserDedupeForTests();
    const href = searchPageHref({
      pathname: "/search",
      filters: PHASE2C_SEARCH_FILTERS,
      view: "list",
    });

    const continuedPosts: string[] = [];
    setFunnelBrowserFetchForTests(async (input) => {
      const url = typeof input === "string" ? input : String(input);
      continuedPosts.push(url);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    // needs_confirm marks pending continuation
    const needs = await resumeSavedSearchIntent(saveSearchIntent(href), {
      list: async () => ({
        ok: true,
        items: [{ isPrimary: true, query: { city: "Ottawa" } }],
      }),
      create: async () => ({ ok: true }),
      onSaved() {},
      onNeedsConfirm() {},
    });
    assert.equal(needs, "needs_confirm");
    assert.equal(hasPendingSaveSearchContinuation(), true);
    assert.equal(continuedPosts.length, 0);

    // Confirmation accepted → continuation reported once
    const reported = reportSaveSearchContinuationIfPending();
    assert.equal(reported, true);
    assert.equal(hasPendingSaveSearchContinuation(), false);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(continuedPosts.length, 1);
    assert.ok(continuedPosts[0]?.includes("/api/analytics/funnel/continued"));

    // Duplicate continuation suppressed (flag already consumed)
    assert.equal(reportSaveSearchContinuationIfPending(), false);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(continuedPosts.length, 1);

    // Confirmation cancelled → clear, no report
    markPendingSaveSearchContinuation();
    clearPendingSaveSearchContinuation();
    assert.equal(hasPendingSaveSearchContinuation(), false);
    assert.equal(reportSaveSearchContinuationIfPending(), false);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(continuedPosts.length, 1);

    // Confirmation failed → do not report (pending may remain for retry)
    markPendingSaveSearchContinuation();
    // Simulate failed save: no reportSaveSearchContinuationIfPending call
    assert.equal(hasPendingSaveSearchContinuation(), true);
    assert.equal(continuedPosts.length, 1);
    clearPendingSaveSearchContinuation();

    // Ordinary manual save (no resume flag) not classified as continuation
    assert.equal(reportSaveSearchContinuationIfPending(), false);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(continuedPosts.length, 1);

    // Full accept path after second needs_confirm
    const needs2 = await resumeSavedSearchIntent(saveSearchIntent(href), {
      list: async () => ({
        ok: true,
        items: [{ isPrimary: true, query: { city: "Ottawa" } }],
      }),
      create: async () => ({ ok: true }),
      onSaved() {},
      onNeedsConfirm() {},
    });
    assert.equal(needs2, "needs_confirm");
    assert.equal(reportSaveSearchContinuationIfPending(), true);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(continuedPosts.length, 2);

    // Analytics failure must not throw / affect save success path
    setFunnelBrowserFetchForTests(async () => {
      throw new Error("analytics down");
    });
    markPendingSaveSearchContinuation();
    assert.equal(reportSaveSearchContinuationIfPending(), true);

    const button = read("src/components/account/SaveSearchButton.tsx");
    assert.ok(button.includes("reportSaveSearchContinuationIfPending"));
    assert.ok(button.includes("clearPendingSaveSearchContinuation"));
    assert.ok(
      read("src/lib/auth/save-search-intent.ts").includes(
        "markPendingSaveSearchContinuation",
      ),
    );

    setFunnelBrowserFetchForTests(null);
    clearFunnelBrowserDedupeForTests();
    console.log("[11] SAVE_SEARCH confirm accept/cancel/fail/manual... PASS");
  }
}

main()
  .then(() => {
    console.log("\nFUNNEL EVENTS PHASE 2C: ALL PASS\n");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
