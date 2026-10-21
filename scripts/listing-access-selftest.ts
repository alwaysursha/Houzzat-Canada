/**
 * Anonymous first-listing-detail gate and VIEW_LISTING.
 * Run: pnpm listing-access:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CAPTURE_INTENT_TTL_MS,
  createCaptureIntent,
  saveCaptureIntent,
  type CaptureIntentStore,
} from "../src/lib/auth/capture-intent";
import {
  dispatchPendingCaptureIntent,
  registerCaptureIntentHandler,
} from "../src/lib/auth/capture-intent-dispatch";
import {
  resumeViewListingIntent,
  syncViewListingGate,
} from "../src/lib/auth/view-listing-intent";
import {
  LISTING_ACCESS_STORAGE_KEY,
  resolveAnonymousListingAccess,
  serializeListingAccess,
  type ListingAccessStore,
} from "../src/lib/listings/anonymous-listing-access";
import { toWorkspaceBrandPublic } from "../src/lib/tenancy/brand-dto";
import { buildLegacyHouzzatBrand } from "../src/lib/tenancy/legacy-houzzat-brand";
import { toMarketingPresentationBrand } from "../src/lib/tenancy/marketing-presentation-brand";

const HOST = "acme.houzzatpro.com";
const NOW = 1_700_000_000_000;
const MLS_A = "W1111111";
const MLS_B = "W2222222";
const PATH_A = "/listing/1-main/W1111111";
const PATH_B = "/listing/2-main/W2222222";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function memoryAccess(initial: string | null = null): ListingAccessStore & {
  raw: string | null;
  sets: string[];
  fail: boolean;
} {
  return {
    raw: initial,
    sets: [],
    fail: false,
    get() {
      if (this.fail) throw new Error("storage unavailable");
      return this.raw;
    },
    set(value: string) {
      if (this.fail) throw new Error("storage unavailable");
      this.sets.push(value);
      this.raw = value;
    },
  };
}

function memoryIntent(): CaptureIntentStore & { raw: string | null } {
  return {
    raw: null,
    get() {
      return this.raw;
    },
    set(value) {
      this.raw = value;
    },
    remove() {
      this.raw = null;
    },
  };
}

function visit(input: {
  authenticated: boolean;
  mlsNumber: string;
  callbackPath: string;
  access: ReturnType<typeof memoryAccess>;
  intent: ReturnType<typeof memoryIntent>;
  now?: number;
}) {
  if (input.authenticated) {
    return {
      blocked: false,
      intent: syncViewListingGate({
        blocked: false,
        mlsNumber: input.mlsNumber,
        callbackPath: input.callbackPath,
        host: HOST,
        now: input.now ?? NOW,
        store: input.intent,
      }),
      decision: null,
    };
  }
  const decision = resolveAnonymousListingAccess(input.access, input.mlsNumber);
  const blocked = decision.access === "gate" || decision.access === "storage_unavailable";
  return {
    blocked,
    decision,
    intent: syncViewListingGate({
      blocked,
      mlsNumber: input.mlsNumber,
      callbackPath: input.callbackPath,
      host: HOST,
      now: input.now ?? NOW,
      store: input.intent,
    }),
  };
}

function testFirstListingIsGated() {
  const access = memoryAccess();
  const intent = memoryIntent();
  const first = visit({
    authenticated: false,
    mlsNumber: MLS_A,
    callbackPath: PATH_A,
    access,
    intent,
  });
  assert.equal(first.blocked, true);
  assert.equal(first.decision?.access, "gate");
  if (first.decision?.access === "gate") {
    assert.equal(first.decision.mlsNumber, MLS_A);
  }
  assert.equal(first.intent, "created");

  const stored = JSON.parse(intent.raw ?? "null") as {
    intent: Record<string, unknown>;
  };
  assert.equal(stored.intent.type, "VIEW_LISTING");
  assert.equal(stored.intent.mlsNumber, MLS_A);

  // Search browsing itself is not gated (no ListingAccessGate on search).
  const search = read("src/components/listings/SearchExperience.tsx");
  assert.equal(search.includes("ListingAccessGate"), false);
  assert.equal(search.includes("anonymous-listing-access"), false);
}

function testAnyAnonymousListingStaysGated() {
  const access = memoryAccess();
  const intent = memoryIntent();
  visit({
    authenticated: false,
    mlsNumber: MLS_A,
    callbackPath: PATH_A,
    access,
    intent,
  });
  const second = visit({
    authenticated: false,
    mlsNumber: MLS_B,
    callbackPath: PATH_B,
    access,
    intent,
  });
  assert.equal(second.blocked, true);
  assert.equal(second.decision?.access, "gate");
  assert.equal(second.intent, "created");
}

function testAuthBypassesGateWithoutRequiringVerification() {
  const access = memoryAccess(serializeListingAccess(MLS_A));
  const intent = memoryIntent();
  const signedUp = visit({
    authenticated: true,
    mlsNumber: MLS_B,
    callbackPath: PATH_B,
    access,
    intent,
  });
  assert.equal(signedUp.blocked, false);
  assert.equal(signedUp.intent, "skipped");
  assert.equal(intent.raw, null);

  const gate = read("src/components/listings/ListingAccessGate.tsx");
  const accessLib = read("src/lib/listings/anonymous-listing-access.ts");
  const intentLib = read("src/lib/auth/view-listing-intent.ts");
  assert.ok(gate.includes('status === "authenticated"'));
  assert.equal(gate.includes("requireFullCustomerUser"), false);
  assert.equal(gate.includes("needsEmailVerification"), false);
  assert.equal(accessLib.includes("needsEmailVerification"), false);
  assert.equal(intentLib.includes("fetch("), false);
  assert.equal(intentLib.includes("captureWebsiteLead"), false);
  const resume = resumeViewListingIntent(
    {
      v: 1,
      type: "VIEW_LISTING",
      mlsNumber: MLS_B,
      callbackPath: PATH_B,
      host: HOST,
      createdAt: NOW,
    },
    { pathname: PATH_B, navigate() { throw new Error("should stay"); } },
  );
  assert.equal(resume, "opened");
}

function testResumeHostAndExpiry() {
  const intent = memoryIntent();
  const created = createCaptureIntent(
    { type: "VIEW_LISTING", mlsNumber: MLS_B, callbackPath: PATH_B },
    { host: HOST, now: NOW },
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  saveCaptureIntent(intent, created.intent);
  let navigated = 0;
  const stop = registerCaptureIntentHandler("VIEW_LISTING", (pending) => {
    resumeViewListingIntent(pending, {
      pathname: "/search",
      navigate() {
        navigated += 1;
      },
    });
  });
  try {
    const wrongHost = dispatchPendingCaptureIntent(intent, {
      host: "other.houzzatpro.com",
      now: NOW + 1_000,
    });
    assert.equal(wrongHost.status, "rejected");
    if (wrongHost.status === "rejected") assert.equal(wrongHost.reason, "host_mismatch");
    assert.equal(intent.raw, null);
    assert.equal(navigated, 0);

    saveCaptureIntent(intent, {
      ...created.intent,
      createdAt: NOW - CAPTURE_INTENT_TTL_MS - 5_000,
    });
    const expired = dispatchPendingCaptureIntent(intent, { host: HOST, now: NOW });
    assert.equal(expired.status, "rejected");
    if (expired.status === "rejected") assert.equal(expired.reason, "expired");
    assert.equal(navigated, 0);
  } finally {
    stop();
  }
}

function testInvalidMlsStorageUnavailable() {
  const access = memoryAccess();
  const bad = resolveAnonymousListingAccess(access, "!!");
  assert.equal(bad.access, "storage_unavailable");
  const ok = resolveAnonymousListingAccess(access, MLS_A);
  assert.equal(ok.access, "gate");
}

function testDoesNotOverwritePendingHighIntent() {
  const intent = memoryIntent();
  const saved = createCaptureIntent(
    {
      type: "SAVE_LISTING",
      mlsNumber: MLS_A,
      callbackPath: PATH_A,
    },
    { host: HOST, now: NOW },
  );
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  saveCaptureIntent(intent, saved.intent);
  const before = intent.raw;

  const rerender = syncViewListingGate({
    blocked: false,
    mlsNumber: MLS_A,
    callbackPath: PATH_A,
    host: HOST,
    now: NOW + 10,
    store: intent,
  });
  assert.equal(rerender, "skipped");
  assert.equal(intent.raw, before);

  const blocked = syncViewListingGate({
    blocked: true,
    mlsNumber: MLS_B,
    callbackPath: PATH_B,
    host: HOST,
    now: NOW + 20,
    store: intent,
  });
  assert.equal(blocked, "kept");
  assert.equal(intent.raw, before);
  const parsed = JSON.parse(before ?? "null") as { intent: { type: string } };
  assert.equal(parsed.intent.type, "SAVE_LISTING");
}

function testWiringLeavesServerListingUntouched() {
  assert.equal(LISTING_ACCESS_STORAGE_KEY, "houzzat:listing-access");
  const page = read("src/app/(marketing)/listing/[...parts]/listing-operational.tsx");
  const view = read("src/components/listings/ListingDetailView.tsx");
  const gate = read("src/components/listings/ListingAccessGate.tsx");
  const search = read("src/components/listings/SearchExperience.tsx");
  assert.ok(page.includes("generateMetadata"));
  assert.ok(page.includes("prisma.listingView.create"));
  assert.ok(page.includes("resolveListingDetailAccess"));
  assert.equal(page.includes("anonymous-listing-access"), false);
  assert.equal(page.includes("noindex"), false);
  assert.ok(view.includes("<ListingAccessGate"));
  assert.ok(view.includes("<RecordRecentView"));
  const opens = gate.match(/openAuth\(\{[\s\S]*?\}\)/g) ?? [];
  assert.equal(opens.length, 2);
  for (const call of opens) {
    assert.ok(call.includes('mode: "sign-up"'));
    assert.ok(call.includes("callbackUrl: callbackPath"));
    assert.ok(call.includes('intent: "VIEW_LISTING"'));
  }
  assert.equal(search.includes("ListingAccessGate"), false);
  assert.ok(read("src/components/listings/RecordRecentView.tsx").includes("pushLocalRecentView"));
  assert.ok(read("src/components/analytics/ActivityBeacon.tsx").includes('return "LISTING_VIEW"'));
  const resume = read("src/components/auth/CaptureIntentResume.tsx");
  assert.ok(resume.includes("ensureViewListingIntentHandler()"));
  const planner = read("src/components/route-planner/RoutePlannerClient.tsx");
  assert.equal(planner.includes("ListingAccessGate"), false);
  const signup = read("src/components/auth/SignUpForm.tsx");
  assert.equal(signup.includes("ListingAccessGate"), false);
  assert.equal(signup.includes("VIEW_LISTING"), false);
  assert.ok(read("src/components/Providers.tsx").includes("refetchOnWindowFocus"));

  const modal = read("src/components/auth/AuthModalProvider.tsx");
  const headerBrand = read("src/components/tenancy/TenantHeaderBrand.tsx");
  assert.ok(modal.includes("<TenantHeaderBrand"));
  assert.ok(modal.includes("!brand.isHouzzatWorkspace"));
  assert.equal(modal.includes("Powered by"), false);
  assert.equal(modal.includes("PLATFORM_PRODUCT_NAME"), false);
  assert.equal(modal.includes("function ListingGateBrand"), false);
  assert.equal(headerBrand.includes("Houzzat"), false);
  assert.ok(headerBrand.includes("<TenantTextLogo"));
  assert.ok(headerBrand.includes('textClassName = "text-2xl"'));
  assert.ok(headerBrand.includes("<BrandLogoMark"));
  const textLogo = read("src/components/tenancy/TenantTextLogo.tsx");
  assert.ok(textLogo.includes("font-display"));
  assert.ok(textLogo.includes("tracking-tight"));
  assert.ok(textLogo.includes("text-ink"));
  assert.equal(textLogo.includes("Houzzat"), false);
  const header = read("src/components/site/SiteHeaderClient.tsx");
  assert.ok(header.includes("<TenantHeaderBrand"));
}

function testTenantTextLogoUsesResolvedDisplayName() {
  const base = toWorkspaceBrandPublic(buildLegacyHouzzatBrand("ws_houzzat"));
  function present(slug: string, displayName: string) {
    return toMarketingPresentationBrand(
      {
        ok: true,
        hostname: `${slug}.example`,
        origin: `https://${slug}.example`,
        workspaceId: `ws_${slug}`,
        workspaceSlug: slug,
        verifiedHostname: true,
        resolutionMode: "workspace",
        brand: { ...base, workspaceId: `ws_${slug}`, displayName },
      },
      "https://example",
    );
  }
  const houzzat = present("houzzat", "Houzzat");
  const other = present("remax-realty", "RE/MAX REALTY");
  assert.equal(houzzat.displayName, "Houzzat");
  assert.equal(houzzat.isHouzzatWorkspace, true);
  assert.equal(other.displayName, "RE/MAX REALTY");
  assert.equal(other.isHouzzatWorkspace, false);
}

function testFreeFirstMlsRetired() {
  const lib = read("src/lib/listings/anonymous-listing-access.ts");
  assert.ok(lib.includes("first property DETAIL view is gated"));
  assert.equal(lib.includes("freeMlsNumber"), false);
  assert.ok(lib.includes('access: "gate"'));
}

function main() {
  testFirstListingIsGated();
  console.log("[1-2] first anonymous listing detail is gated; search is not");
  testAnyAnonymousListingStaysGated();
  console.log("[3] later anonymous listing details remain gated");
  testAuthBypassesGateWithoutRequiringVerification();
  console.log("[4] authenticated listing view is not gated");
  testResumeHostAndExpiry();
  console.log("[5] wrong-host and expired VIEW_LISTING do not resume");
  testInvalidMlsStorageUnavailable();
  console.log("[6] invalid MLS fails safely");
  testDoesNotOverwritePendingHighIntent();
  console.log("[7] gate does not replace a pending save on rerender");
  testWiringLeavesServerListingUntouched();
  testTenantTextLogoUsesResolvedDisplayName();
  testFreeFirstMlsRetired();
  console.log("[8] free-first-MLS counting retired");
  console.log("listing access selftest: PASS");
}

main();
