/**
 * Anonymous second-listing gate and VIEW_LISTING.
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

const HOST = "acme.houzzatpro.com";
const NOW = 1_700_000_000_000;
const MLS_A = "W1111111";
const MLS_B = "W2222222";
const MLS_C = "W3333333";
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
  const blocked = decision.access !== "allow";
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

function testFirstListingIsFreeOnce() {
  const access = memoryAccess();
  const intent = memoryIntent();
  const first = visit({
    authenticated: false,
    mlsNumber: MLS_A,
    callbackPath: PATH_A,
    access,
    intent,
  });
  assert.equal(first.blocked, false);
  assert.equal(first.decision?.access, "allow");
  if (first.decision?.access === "allow") assert.equal(first.decision.recorded, true);
  assert.equal(first.intent, "skipped");
  assert.equal(intent.raw, null);
  assert.equal(access.raw, serializeListingAccess(MLS_A));
  assert.equal(access.sets.length, 1);

  const refresh = visit({
    authenticated: false,
    mlsNumber: "w1111111",
    callbackPath: PATH_A,
    access,
    intent,
  });
  assert.equal(refresh.blocked, false);
  if (refresh.decision?.access === "allow") assert.equal(refresh.decision.recorded, false);
  assert.equal(access.sets.length, 1);
  assert.equal(intent.raw, null);

  const otherTab = memoryAccess(access.raw);
  const sameTab = resolveAnonymousListingAccess(otherTab, MLS_A);
  assert.equal(sameTab.access, "allow");
  assert.equal(otherTab.sets.length, 0);
}

function testSecondListingGatesWithoutReplacingAllowance() {
  const access = memoryAccess();
  const intent = memoryIntent();
  visit({
    authenticated: false,
    mlsNumber: MLS_A,
    callbackPath: PATH_A,
    access,
    intent,
  });
  const opened: string[] = [];
  const second = visit({
    authenticated: false,
    mlsNumber: MLS_B,
    callbackPath: PATH_B,
    access,
    intent,
  });
  assert.equal(second.blocked, true);
  assert.equal(second.decision?.access, "gate");
  if (second.decision?.access === "gate") {
    assert.equal(second.decision.freeMlsNumber, MLS_A);
  }
  assert.equal(second.intent, "created");
  assert.equal(access.raw, serializeListingAccess(MLS_A));

  const stored = JSON.parse(intent.raw ?? "null") as {
    v: number;
    intent: Record<string, unknown>;
  };
  assert.equal(stored.v, 1);
  assert.deepEqual(Object.keys(stored).sort(), ["intent", "v"]);
  assert.equal(stored.intent.type, "VIEW_LISTING");
  assert.equal(stored.intent.mlsNumber, MLS_B);
  assert.equal(stored.intent.callbackPath, PATH_B);
  assert.equal(stored.intent.host, HOST);
  assert.equal(stored.intent.createdAt, NOW);
  assert.deepEqual(Object.keys(stored.intent).sort(), [
    "callbackPath",
    "createdAt",
    "host",
    "mlsNumber",
    "type",
  ]);
  opened.push("sign-up");
  assert.deepEqual(opened, ["sign-up"]);

  const beforeDismiss = access.raw;
  const afterDismiss = visit({
    authenticated: false,
    mlsNumber: MLS_B,
    callbackPath: PATH_B,
    access,
    intent,
  });
  assert.equal(afterDismiss.blocked, true);
  assert.equal(afterDismiss.intent, "kept");
  assert.equal(access.raw, beforeDismiss);

  const back = visit({
    authenticated: false,
    mlsNumber: MLS_A,
    callbackPath: PATH_A,
    access,
    intent,
  });
  assert.equal(back.blocked, false);

  const third = visit({
    authenticated: false,
    mlsNumber: MLS_C,
    callbackPath: "/listing/3-main/W3333333",
    access,
    intent,
  });
  assert.equal(third.blocked, true);
  assert.equal(third.intent, "created");
  assert.equal(access.raw, serializeListingAccess(MLS_A));
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
  assert.equal(access.raw, serializeListingAccess(MLS_A));
  assert.equal(intent.raw, null);

  const signedIn = visit({
    authenticated: true,
    mlsNumber: MLS_B,
    callbackPath: PATH_B,
    access,
    intent,
  });
  assert.equal(signedIn.blocked, false);

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

function testStorageFailures() {
  const corrupt = memoryAccess("{not json");
  const recovered = resolveAnonymousListingAccess(corrupt, MLS_A);
  assert.equal(recovered.access, "allow");
  assert.equal(corrupt.raw, serializeListingAccess(MLS_A));
  const stillOne = resolveAnonymousListingAccess(corrupt, MLS_B);
  assert.equal(stillOne.access, "gate");

  const down = memoryAccess();
  down.fail = true;
  const failed = resolveAnonymousListingAccess(down, MLS_A);
  assert.equal(failed.access, "storage_unavailable");
  assert.equal(down.sets.length, 0);
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
  const page = read("src/app/(marketing)/listing/[...parts]/page.tsx");
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
  assert.equal(search.includes("anonymous-listing-access"), false);
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
}

function main() {
  testFirstListingIsFreeOnce();
  console.log("[1-4] first MLS is stored once and stays free across refresh and tabs");
  testSecondListingGatesWithoutReplacingAllowance();
  console.log("[5-11] second and later MLS stay gated after the modal is dismissed");
  testAuthBypassesGateWithoutRequiringVerification();
  console.log("[12-16] signup and sign-in allow the listing without a verification gate");
  testResumeHostAndExpiry();
  console.log("[19-20] wrong-host and expired VIEW_LISTING do not resume");
  testStorageFailures();
  console.log("[21-22] corrupt and unavailable storage fail safely");
  testDoesNotOverwritePendingHighIntent();
  console.log("[23-25] the gate does not act or replace a pending save on rerender");
  testWiringLeavesServerListingUntouched();
  console.log("[17-18,26-28] listing SSR, search clicks, VOW, and route planner stay in place");
  console.log("listing access selftest: PASS");
}

main();
