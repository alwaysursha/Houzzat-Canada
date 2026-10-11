/**
 * Phase 2B — visitor conversion funnel instrumentation selftest.
 * Run: pnpm funnel-events:phase2b:selftest
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildClientFunnelDedupeKey,
  buildRegistrationCompletedDedupeKey,
  FUNNEL_CLIENT_DEDUPE_PREFIX,
  ingestClientFunnelEvent,
  parseClientFunnelPayload,
  resolveListingLinkClickAction,
  shouldReportRegistrationGateShown,
  shouldReportRegistrationStarted,
} from "../src/lib/funnel";
import {
  clearFunnelBrowserDedupeForTests,
  flushFunnelBrowserInflightForTests,
  funnelPolygonFingerprint,
  funnelSearchHash,
  funnelSearchViewHash,
  getFunnelBrowserDedupeSnapshotForTests,
  isFunnelPersistAck,
  isFunnelSkippedResponse,
  reportFunnelEvent,
  setFunnelBrowserFetchForTests,
} from "../src/lib/funnel/browser";
import {
  buildCriteriaKey,
  defaultCommittedSearch,
} from "../src/lib/listings/search-state";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
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
    };
  };
  const g = globalThis as typeof globalThis & {
    window: typeof globalThis;
    localStorage: Storage;
    sessionStorage: Storage;
  };
  g.localStorage = make() as Storage;
  g.sessionStorage = make() as Storage;
  g.window = g;
}

console.log("\n=== FUNNEL EVENTS PHASE 2B ===\n");

async function main(): Promise<void> {
  // 1. Server-controlled dedupe — ignore client dedupeKey; c: prefix
  {
    const spoofed = parseClientFunnelPayload({
      eventName: "registration_gate_shown",
      visitorKey: "vk1",
      sessionKey: "sk1",
      mlsNumber: "W1234567",
      dedupeKey: "registration_completed:user:attacker",
    });
    assert.equal(
      spoofed.dedupeKey,
      "c:registration_gate_shown:sk1:W1234567",
    );
    assert.ok(spoofed.dedupeKey.startsWith(FUNNEL_CLIENT_DEDUPE_PREFIX));
    assert.notEqual(
      spoofed.dedupeKey,
      buildRegistrationCompletedDedupeKey("attacker"),
    );

    const searchA = parseClientFunnelPayload({
      eventName: "search_results_viewed",
      visitorKey: "vk1",
      sessionKey: "sk1",
      meta: { searchHash: "abc123" },
      dedupeKey: "totally-different",
    });
    const searchB = parseClientFunnelPayload({
      eventName: "search_results_viewed",
      visitorKey: "vk1",
      sessionKey: "sk1",
      meta: { searchHash: "abc123" },
      dedupeKey: "another-spoof",
    });
    assert.equal(searchA.dedupeKey, searchB.dedupeKey);
    assert.equal(searchA.dedupeKey, "c:search_results_viewed:sk1:abc123");

    const searchC = parseClientFunnelPayload({
      eventName: "search_results_viewed",
      visitorKey: "vk1",
      sessionKey: "sk1",
      meta: { searchHash: "other" },
    });
    assert.notEqual(searchA.dedupeKey, searchC.dedupeKey);

    const started = parseClientFunnelPayload({
      eventName: "registration_started",
      visitorKey: "vk1",
      sessionKey: "sk1",
    });
    assert.equal(started.dedupeKey, "c:registration_started:sk1:once");

    assert.equal(
      buildClientFunnelDedupeKey({
        eventName: "property_card_clicked",
        sessionKey: "s",
        mlsNumber: "X1",
        meta: null,
      }),
      "c:property_card_clicked:s:X1",
    );
    console.log("[1] Server-controlled deduplication... PASS");
  }

  // 2. Tenant isolation on ingest (workspace from server only)
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
    await ingestClientFunnelEvent({
      workspaceId: "ws_tenant_a",
      body: {
        eventName: "listing_detail_opened",
        visitorKey: "vk",
        sessionKey: "sk",
        mlsNumber: "W1111111",
      },
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    await ingestClientFunnelEvent({
      workspaceId: "ws_tenant_b",
      body: {
        eventName: "listing_detail_opened",
        visitorKey: "vk",
        sessionKey: "sk",
        mlsNumber: "W1111111",
      },
      env: { FUNNEL_EVENTS_ENABLED: "1" },
      db,
    });
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.workspaceId, "ws_tenant_a");
    assert.equal(rows[1]?.workspaceId, "ws_tenant_b");
    assert.equal(rows[0]?.dedupeKey, rows[1]?.dedupeKey);
    console.log("[2] Tenant isolation... PASS");
  }

  // 3. Browser dedupe: fail → retry, concurrent coalesce, persist ack, skipped quiet
  {
    installBrowserStorage();
    clearFunnelBrowserDedupeForTests();

    assert.equal(isFunnelPersistAck({ ok: true, status: "written" }), true);
    assert.equal(isFunnelPersistAck({ ok: true, status: "duplicate" }), true);
    assert.equal(isFunnelPersistAck({ ok: true, skipped: true }), false);
    assert.equal(isFunnelPersistAck({ ok: true, status: "disabled" }), false);
    assert.equal(isFunnelSkippedResponse({ ok: true, skipped: true }), true);
    assert.equal(
      isFunnelSkippedResponse({ ok: true, status: "disabled" }),
      true,
    );

    let posts = 0;
    let mode: "fail" | "ok" | "skip" | "hang" = "fail";
    let hangResolve: (() => void) | null = null;

    setFunnelBrowserFetchForTests(async () => {
      posts += 1;
      if (mode === "fail") {
        throw new Error("network down");
      }
      if (mode === "hang") {
        await new Promise<void>((resolve) => {
          hangResolve = resolve;
        });
        return new Response(
          JSON.stringify({ ok: true, status: "written", id: "late" }),
          { status: 200 },
        );
      }
      if (mode === "skip") {
        return new Response(
          JSON.stringify({ ok: true, skipped: true, reason: "disabled" }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ ok: true, status: "written", id: "evt1" }),
        { status: 200 },
      );
    });

    // Failed POST then successful retry
    mode = "fail";
    reportFunnelEvent({
      eventName: "listing_detail_opened",
      mlsNumber: "W1000001",
      meta: { source: "test" },
    });
    await flushFunnelBrowserInflightForTests();
    assert.equal(posts, 1);
    assert.equal(getFunnelBrowserDedupeSnapshotForTests().confirmed.length, 0);

    mode = "ok";
    reportFunnelEvent({
      eventName: "listing_detail_opened",
      mlsNumber: "W1000001",
      meta: { source: "test" },
    });
    await flushFunnelBrowserInflightForTests();
    assert.equal(posts, 2);
    assert.equal(getFunnelBrowserDedupeSnapshotForTests().confirmed.length, 1);

    // Already confirmed — no more posts
    reportFunnelEvent({
      eventName: "listing_detail_opened",
      mlsNumber: "W1000001",
      meta: { source: "test" },
    });
    await flushFunnelBrowserInflightForTests();
    assert.equal(posts, 2);

    // Concurrent duplicate submissions coalesce to one in-flight POST
    clearFunnelBrowserDedupeForTests();
    posts = 0;
    mode = "hang";
    reportFunnelEvent({
      eventName: "property_card_clicked",
      mlsNumber: "W2000002",
    });
    reportFunnelEvent({
      eventName: "property_card_clicked",
      mlsNumber: "W2000002",
    });
    reportFunnelEvent({
      eventName: "property_card_clicked",
      mlsNumber: "W2000002",
    });
    assert.equal(posts, 1);
    assert.equal(getFunnelBrowserDedupeSnapshotForTests().inflight.length, 1);
    hangResolve?.();
    await flushFunnelBrowserInflightForTests();
    assert.equal(getFunnelBrowserDedupeSnapshotForTests().confirmed.length, 1);

    // Successful duplicate acknowledgement
    clearFunnelBrowserDedupeForTests();
    posts = 0;
    mode = "ok";
    setFunnelBrowserFetchForTests(async () => {
      posts += 1;
      return new Response(
        JSON.stringify({ ok: true, status: "duplicate", id: null }),
        { status: 200 },
      );
    });
    reportFunnelEvent({
      eventName: "registration_gate_shown",
      mlsNumber: "W3000003",
    });
    await flushFunnelBrowserInflightForTests();
    assert.equal(posts, 1);
    assert.equal(getFunnelBrowserDedupeSnapshotForTests().confirmed.length, 1);

    // Feature-disabled / skipped — quiet, not confirmed; no unbounded retries
    clearFunnelBrowserDedupeForTests();
    posts = 0;
    setFunnelBrowserFetchForTests(async () => {
      posts += 1;
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "disabled" }),
        { status: 200 },
      );
    });
    reportFunnelEvent({
      eventName: "search_results_viewed",
      meta: { searchHash: "hash-skip", source: "search" },
    });
    await flushFunnelBrowserInflightForTests();
    assert.equal(posts, 1);
    const skipSnap = getFunnelBrowserDedupeSnapshotForTests();
    assert.equal(skipSnap.confirmed.length, 0);
    assert.equal(skipSnap.quiet.length, 1);
    reportFunnelEvent({
      eventName: "search_results_viewed",
      meta: { searchHash: "hash-skip", source: "search" },
    });
    await flushFunnelBrowserInflightForTests();
    assert.equal(posts, 1);

    setFunnelBrowserFetchForTests(null);
    clearFunnelBrowserDedupeForTests();
    console.log("[3] Browser dedupe + retry + skipped quiet... PASS");
  }

  // 4. Search criteria identity (view switch vs filters vs polygon)
  {
    const base = defaultCommittedSearch({
      cities: ["Toronto"],
      minPrice: "500000",
      view: "cards",
      mapArea: { west: -79.5, south: 43.6, east: -79.3, north: 43.8 },
    });
    const asMap = { ...base, view: "map" as const };
    const asSplit = { ...base, view: "split" as const };
    const filtered = { ...base, minPrice: "600000" };
    const geoMoved = {
      ...base,
      mapArea: { west: -79.6, south: 43.5, east: -79.4, north: 43.7 },
    };

    assert.equal(buildCriteriaKey(base), buildCriteriaKey(asMap));
    assert.equal(buildCriteriaKey(base), buildCriteriaKey(asSplit));
    assert.notEqual(buildCriteriaKey(base), buildCriteriaKey(filtered));
    assert.notEqual(buildCriteriaKey(base), buildCriteriaKey(geoMoved));

    const hCards = funnelSearchViewHash(buildCriteriaKey(base));
    const hMap = funnelSearchViewHash(buildCriteriaKey(asMap));
    const hSplit = funnelSearchViewHash(buildCriteriaKey(asSplit));
    assert.equal(hCards, hMap);
    assert.equal(hCards, hSplit);
    assert.notEqual(
      hCards,
      funnelSearchViewHash(buildCriteriaKey(filtered)),
    );
    assert.notEqual(
      hCards,
      funnelSearchViewHash(buildCriteriaKey(geoMoved)),
    );

    const polyA: Array<[number, number]> = [
      [-79.4, 43.65],
      [-79.35, 43.65],
      [-79.35, 43.7],
      [-79.4, 43.7],
    ];
    const polyB: Array<[number, number]> = [
      [-79.5, 43.6],
      [-79.45, 43.6],
      [-79.45, 43.65],
      [-79.5, 43.65],
    ];
    const fpA = funnelPolygonFingerprint(polyA);
    const fpB = funnelPolygonFingerprint(polyB);
    assert.ok(fpA);
    assert.ok(fpB);
    assert.notEqual(fpA, fpB);
    assert.notEqual(
      funnelSearchViewHash(buildCriteriaKey(base), fpA),
      funnelSearchViewHash(buildCriteriaKey(base), fpB),
    );
    assert.notEqual(
      funnelSearchViewHash(buildCriteriaKey(base), fpA),
      funnelSearchViewHash(buildCriteriaKey(base), ""),
    );
    // Payload carries only the short hash — fingerprint helper never embeds raw rings.
    assert.ok(!fpA.includes("-79"));
    assert.equal(funnelSearchHash("a"), funnelSearchHash("a"));

    const experience = read("src/components/listings/SearchExperience.tsx");
    assert.ok(experience.includes("buildCriteriaKey"));
    assert.ok(experience.includes("funnelSearchViewHash"));
    assert.ok(experience.includes("funnelPolygonFingerprint"));
    assert.ok(experience.includes('eventName: "search_results_viewed"'));
    assert.ok(experience.includes("if (!res.ok) return"));
    console.log("[4] Search criteria / view / polygon identity... PASS");
  }

  // 5. ListingLink modified-click and onOpen behavior
  {
    assert.deepEqual(
      resolveListingLinkClickAction({
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        button: 0,
        defaultPrevented: false,
      }),
      { trackCardClick: false, openOverlay: false },
    );
    assert.deepEqual(
      resolveListingLinkClickAction({
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        button: 0,
        defaultPrevented: false,
      }),
      { trackCardClick: true, openOverlay: true },
    );
    assert.deepEqual(
      resolveListingLinkClickAction({
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        button: 0,
        defaultPrevented: true,
      }),
      { trackCardClick: true, openOverlay: false },
    );

    const link = read("src/components/listings/ListingLink.tsx");
    assert.ok(link.includes("resolveListingLinkClickAction"));
    assert.ok(link.includes("reportPropertyCardClicked"));
    console.log("[5] ListingLink click actions... PASS");
  }

  // 6. Registration gate once per MLS
  {
    assert.equal(
      shouldReportRegistrationGateShown({
        blocked: true,
        normalizedMls: "W1111111",
        alreadyPresentedMls: null,
      }),
      true,
    );
    assert.equal(
      shouldReportRegistrationGateShown({
        blocked: true,
        normalizedMls: "W1111111",
        alreadyPresentedMls: "W1111111",
      }),
      false,
    );
    assert.equal(
      shouldReportRegistrationGateShown({
        blocked: true,
        normalizedMls: "W2222222",
        alreadyPresentedMls: "W1111111",
      }),
      true,
    );
    assert.equal(
      shouldReportRegistrationGateShown({
        blocked: false,
        normalizedMls: "W1111111",
        alreadyPresentedMls: null,
      }),
      false,
    );

    const gate = read("src/components/listings/ListingAccessGate.tsx");
    assert.ok(gate.includes("shouldReportRegistrationGateShown"));
    assert.ok(gate.includes('eventName: "registration_gate_shown"'));
    assert.ok(gate.includes("syncViewListingGate"));
    console.log("[6] Registration gate once-per-MLS... PASS");
  }

  // 7. Signup modal open vs meaningful interaction
  {
    assert.equal(
      shouldReportRegistrationStarted({ alreadyStarted: false }),
      false,
    );
    assert.equal(
      shouldReportRegistrationStarted({
        alreadyStarted: false,
        fieldValue: "   ",
      }),
      false,
    );
    assert.equal(
      shouldReportRegistrationStarted({
        alreadyStarted: false,
        fieldValue: "Ali",
      }),
      true,
    );
    assert.equal(
      shouldReportRegistrationStarted({
        alreadyStarted: true,
        fieldValue: "Ali",
      }),
      false,
    );
    assert.equal(
      shouldReportRegistrationStarted({
        alreadyStarted: false,
        isSubmit: true,
      }),
      true,
    );

    const form = read("src/components/auth/SignUpForm.tsx");
    assert.ok(form.includes("shouldReportRegistrationStarted"));
    assert.ok(form.includes('eventName: "registration_started"'));
    assert.ok(form.includes("reportLeadCaptureStarted()"));
    assert.equal((form.match(/reportGa4SignUp\(\)/g) ?? []).length, 1);
    assert.ok(!form.includes("conversion_event_signup"));
    console.log("[7] Registration started signals... PASS");
  }

  // 8. Property card coverage + listing detail + ActivityBeacon
  {
    assert.ok(
      read("src/components/listings/SearchResultCard.tsx").includes(
        'funnelPathClass="search_card"',
      ),
    );
    assert.ok(
      read("src/components/listings/ListingCard.tsx").includes(
        'funnelPathClass="listing_card"',
      ),
    );
    assert.ok(
      read("src/components/listings/CompactPropertyCard.tsx").includes(
        'funnelPathClass="compact_card"',
      ),
    );
    assert.ok(
      read("src/components/listings/SearchMapPopupCard.tsx").includes(
        "reportPropertyCardClicked",
      ),
    );
    assert.ok(
      read("src/components/listings/ListingDetailView.tsx").includes(
        "FunnelListingOpenedBeacon",
      ),
    );
    assert.ok(
      existsSync("src/components/analytics/FunnelListingOpenedBeacon.tsx"),
    );
    const beacon = read("src/components/analytics/ActivityBeacon.tsx");
    assert.ok(!beacon.includes("@/lib/funnel"));
    assert.ok(!beacon.includes("reportFunnelEvent"));
    console.log("[8] Card/detail coverage + ActivityBeacon isolation... PASS");
  }

  // 9. Existing signup / gate behavior + no Ads in funnel path
  {
    const gate = read("src/components/listings/ListingAccessGate.tsx");
    assert.ok(gate.includes("acquireScrollLock"));
    assert.ok(gate.includes('mode: "sign-up"'));
    assert.ok(gate.includes('intent: "VIEW_LISTING"'));

    const form = read("src/components/auth/SignUpForm.tsx");
    assert.ok(form.includes("reportGa4SignUp()"));
    assert.ok(form.includes("reportLeadCaptured()"));
    assert.ok(form.includes("/api/auth/sign-up"));
    assert.ok(form.includes("acceptTerms: true"));

    const signUpRoute = read("src/app/api/auth/sign-up/route.ts");
    assert.ok(signUpRoute.includes("recordRegistrationCompletedEventSafe"));
    assert.ok(!signUpRoute.includes("reportGa4SignUp"));

    const browser = read("src/lib/funnel/browser.ts");
    assert.ok(!browser.includes("reportGa4SignUp"));
    assert.ok(!browser.includes("gtag"));
    assert.ok(browser.includes("confirmedLocal"));
    assert.ok(browser.includes("quietLocal"));
    assert.ok(browser.includes("inflightLocal"));
    console.log("[9] Signup/gate preserved + no Ads in funnel... PASS");
  }
}

main()
  .then(() => {
    console.log("\nFUNNEL EVENTS PHASE 2B: ALL PASS\n");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
