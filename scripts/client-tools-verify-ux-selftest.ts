/**
 * Expired-grace client-tools verification UX.
 * Run: pnpm exec tsx scripts/client-tools-verify-ux-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLIENT_TOOLS_VERIFY_COPY,
  EMAIL_VERIFY_GRACE_MS,
  resolveClientAccess,
} from "../src/lib/account-access";
import { customerAccessDenialFromBody } from "../src/lib/account/customer-access-error";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testAccessKinds() {
  assert.equal(EMAIL_VERIFY_GRACE_MS, 7 * 24 * 60 * 60 * 1000);

  const visitor = resolveClientAccess(null);
  assert.equal(visitor.kind, "visitor");
  assert.equal(visitor.needsEmailVerification, false);
  assert.equal(visitor.hasClientAccess, false);

  const verified = resolveClientAccess({
    id: "u1",
    emailVerified: new Date(),
    createdAt: new Date(Date.now() - EMAIL_VERIFY_GRACE_MS * 2),
  });
  assert.equal(verified.kind, "verified_unlocked");
  assert.equal(verified.needsEmailVerification, false);
  assert.equal(verified.hasClientAccess, true);

  const inGrace = resolveClientAccess({
    id: "u2",
    emailVerified: null,
    createdAt: new Date(),
  });
  assert.equal(inGrace.kind, "unverified_unlocked");
  assert.equal(inGrace.needsEmailVerification, false);
  assert.equal(inGrace.hasClientAccess, true);

  const expired = resolveClientAccess({
    id: "u3",
    emailVerified: null,
    createdAt: new Date(Date.now() - EMAIL_VERIFY_GRACE_MS - 1000),
  });
  assert.equal(expired.kind, "unverified_locked");
  assert.equal(expired.needsEmailVerification, true);
  assert.equal(expired.hasClientAccess, false);

  console.log("[0] guest / in-grace / expired-grace / verified kinds... PASS");
}

function testDenialParser() {
  assert.deepEqual(customerAccessDenialFromBody(401, { requiresAuth: true }), {
    requiresAuth: true,
    requiresEmailVerification: false,
  });
  assert.deepEqual(
    customerAccessDenialFromBody(403, {
      requiresEmailVerification: true,
    }),
    { requiresAuth: false, requiresEmailVerification: true },
  );
  assert.equal(
    customerAccessDenialFromBody(500, { error: "fail" })
      .requiresEmailVerification,
    false,
  );
  console.log("[1] 401/403 access denial parser... PASS");
}

function testAuthGatesUnchanged() {
  const notes = read("src/app/api/account/notes/[mlsNumber]/route.ts");
  const saved = read("src/app/api/saved-listings/route.ts");
  const planner = read("src/app/api/route-planner/route.ts");
  const stops = read("src/app/api/route-planner/stops/route.ts");
  const account = read("src/lib/account.ts");

  for (const [label, src] of [
    ["notes", notes],
    ["saved-listings", saved],
    ["route-planner", planner],
    ["route-planner/stops", stops],
  ] as const) {
    assert.ok(
      src.includes("requireFullCustomerUser()"),
      `${label} must keep requireFullCustomerUser()`,
    );
    assert.ok(
      !src.includes("requireCustomerUser()"),
      `${label} must not weaken to requireCustomerUser()`,
    );
  }

  assert.ok(account.includes("needsEmailVerification(user)"));
  assert.ok(
    account.includes("Email verification required."),
    "403 copy must stay",
  );
  console.log("[2] requireFullCustomerUser gates unchanged... PASS");
}

function testSharedCopyAndSendPath() {
  const evr = read("src/components/auth/EmailVerificationRequired.tsx");
  assert.ok(evr.includes('purpose = "default"'));
  assert.ok(evr.includes('"client-tools"'));
  assert.ok(evr.includes("CLIENT_TOOLS_VERIFY_COPY"));
  assert.ok(evr.includes("/api/auth/request-verification"));
  assert.ok(evr.includes("CLIENT_TOOLS_VERIFY_COPY.sendLabel"));
  assert.ok(evr.includes("CLIENT_TOOLS_VERIFY_COPY.checkAgainLabel"));
  assert.ok(evr.includes("refreshIfVerified"));
  assert.ok(evr.includes("/api/account/access"));

  assert.equal(
    CLIENT_TOOLS_VERIFY_COPY.title,
    "Please verify your email to continue",
  );
  assert.match(
    CLIENT_TOOLS_VERIFY_COPY.body,
    /7-day verification grace period has ended/,
  );
  assert.match(CLIENT_TOOLS_VERIFY_COPY.body, /Saved Listings, Notes and Route Planner/);
  assert.equal(
    CLIENT_TOOLS_VERIFY_COPY.sendLabel,
    "Send Verification Email",
  );

  const dialog = read(
    "src/components/auth/ClientToolsVerificationProvider.tsx",
  );
  assert.ok(dialog.includes('purpose="client-tools"'));
  assert.ok(dialog.includes("openClientToolsVerification"));
  console.log("[3] shared EmailVerificationRequired + send/check-again... PASS");
}

function testNotesUx() {
  const notes = read("src/components/account/ListingNotesPanel.tsx");
  assert.ok(notes.includes('purpose="client-tools"'));
  assert.ok(notes.includes("needsEmailVerification"));
  assert.ok(notes.includes("customerAccessDenialFromBody"));
  assert.ok(
    notes.includes('setStatus("error")'),
    "generic save error still exists for non-verify failures",
  );
  const saveFn = notes.slice(notes.indexOf("function scheduleSave"));
  const verifyBranch = saveFn.slice(
    0,
    saveFn.indexOf('setStatus("error")'),
  );
  assert.ok(
    verifyBranch.includes("requiresEmailVerification"),
    "verify 403 must not fall through to Couldn’t save",
  );
  assert.ok(notes.includes("Couldn’t save"));
  const detail = read("src/components/listings/ListingDetailView.tsx");
  assert.ok(detail.includes("<ListingNotesPanel"));
  assert.ok(detail.includes("authCallbackUrl={canonicalPath}"));
  console.log("[4] notes skip Couldn’t save for verify lock... PASS");
  console.log("[4b] canonical listing mounts ListingNotesPanel... PASS");
}

function testSaveUx() {
  const toggle = read("src/components/account/useSavedListingToggle.ts");
  assert.ok(toggle.includes("openClientToolsVerification"));
  assert.ok(toggle.includes("access.needsEmailVerification"));
  assert.ok(!toggle.includes("saveRequiresEmailVerificationToast"));
  assert.ok(toggle.includes("openClientToolsVerification({ callbackUrl })"));
  console.log("[5] save listing uses verification dialog, not toast... PASS");
}

function testRoutePlannerUx() {
  const client = read("src/components/route-planner/RoutePlannerClient.tsx");
  assert.ok(client.includes('purpose="client-tools"'));
  assert.ok(client.includes("access.needsEmailVerification"));
  assert.ok(client.includes("Could not load Route Planner."));
  const load = client.slice(client.indexOf("const loadTour"));
  const fetchBlock = load.slice(
    load.indexOf('fetch("/api/route-planner")'),
    load.indexOf("Could not load Route Planner."),
  );
  assert.ok(
    fetchBlock.includes("requiresEmailVerification"),
    "route planner GET 403 must not toast before verify check",
  );

  const toggle = read(
    "src/components/route-planner/RoutePlannerToggleButton.tsx",
  );
  assert.ok(toggle.includes("openClientToolsVerification"));
  assert.ok(toggle.includes("requiresEmailVerification"));

  const page = read("src/app/(marketing)/route-planner/page.tsx");
  assert.ok(
    page.includes("guests use localStorage"),
    "guest localStorage comment must remain",
  );
  console.log("[6] route planner verify UX, guests unchanged... PASS");
}

function main() {
  testAccessKinds();
  testDenialParser();
  testAuthGatesUnchanged();
  testSharedCopyAndSendPath();
  testNotesUx();
  testSaveUx();
  testRoutePlannerUx();
  console.log("\nCLIENT TOOLS VERIFY UX SELFTEST PASSED");
}

main();
