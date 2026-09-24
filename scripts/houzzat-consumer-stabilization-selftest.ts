/**
 * Houzzat consumer stabilization regressions (Issues 1–6).
 * Run: pnpm exec tsx scripts/houzzat-consumer-stabilization-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EMAIL_VERIFIED_EVENT } from "../src/lib/auth/verification-success-signal";
import { SITE_MESSAGES } from "../src/lib/site-messages";
import { ENV_PINNED_ORIGIN_DOC } from "../src/lib/tenancy/env-pinned-origin";
import {
  isRoutePlannerChangedMessage,
  ROUTE_PLANNER_CHANGED_EVENT,
  ROUTE_PLANNER_CHANGED_MESSAGE,
} from "../src/lib/route-planner/route-planner-sync";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testHomepagePersonalizationReload() {
  const body = read("src/components/home/HomeDeferredBody.tsx");
  assert.match(
    body,
    /houzzat:homepage-personalization-changed/,
    "HomeDeferredBody must listen for personalization-changed",
  );
  assert.match(body, /EMAIL_VERIFIED_EVENT/);
  assert.match(body, /\/api\/account\/home-shell/);
  assert.match(body, /cache:\s*["']no-store["']/);
  console.log("[1] homepage personalization-changed reloads shell... PASS");
}

function testClientAccessEmailVerified() {
  const hook = read("src/hooks/use-client-access.ts");
  assert.match(hook, /EMAIL_VERIFIED_EVENT/);
  assert.match(hook, /addEventListener\(EMAIL_VERIFIED_EVENT/);
  assert.match(hook, /\/api\/account\/access/);
  assert.match(hook, /cache:\s*["']no-store["']/);
  assert.equal(EMAIL_VERIFIED_EVENT, "houzzat:email-verified");
  // Must not treat JWT/session emailVerified as authority
  assert.doesNotMatch(hook, /session\.user\.emailVerified/);
  console.log("[2] useClientAccess refetches on EMAIL_VERIFIED_EVENT... PASS");
}

function testNotesNotGatedOnAccessLoading() {
  const notes = read("src/components/account/ListingNotesPanel.tsx");
  assert.doesNotMatch(
    notes,
    /signedIn && access\.loading/,
    "Notes editor must not hide behind access.loading",
  );
  assert.doesNotMatch(notes, /Loading notes…/);
  assert.match(notes, /needsEmailVerification/);
  assert.match(notes, /scheduleSave/);
  assert.match(notes, /\/api\/account\/notes\//);
  console.log("[3] ListingNotesPanel not gated on access.loading... PASS");
}

function testListingCardClientBoundary() {
  const card = read("src/components/listings/ListingCard.tsx");
  assert.match(
    card.slice(0, 80),
    /^["']use client["']/,
    "ListingCard must be a client component",
  );
  assert.match(card, /useTemplatePresentation/);

  const saved = read("src/app/(account)/account/saved/page.tsx");
  assert.match(saved, /ListingCard/);
  assert.match(saved, /toCard/);

  const share = read("src/app/(marketing)/share/homes/[token]/page.tsx");
  assert.match(share, /ListingCard/);
  assert.match(share, /toCard/);
  assert.match(share, /base64url/);
  console.log("[4] ListingCard client boundary for saved + share... PASS");
}

function testShareTokenEncodingUnchanged() {
  const send = read("src/lib/agent/send-shortlist-email.ts");
  assert.match(send, /toString\(["']base64url["']\)/);
  assert.ok(send.includes('.replace(/=+$/, "")'), "base64url padding strip");
  assert.match(send, /resolveCanonicalPublicOrigin/);
  assert.match(send, /app\.houzzatpro\.com/);
  assert.match(send, /ENV_PINNED_ORIGIN_DOC/);

  const share = read("src/app/(marketing)/share/homes/[token]/page.tsx");
  assert.match(share, /base64url/);
  assert.match(share, /decodeSharePayload|Buffer\.from/);

  // Round-trip encode/decode parity (same algorithm as production)
  const payload = {
    mls: ["N13814940", "N13804818"],
    title: "Homes selected for you",
    by: "Demo Agent",
  };
  const token = Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64url")
    .replace(/=+$/, "");
  const padded = token + "=".repeat((4 - (token.length % 4 || 4)) % 4);
  const decoded = JSON.parse(
    Buffer.from(padded, "base64url").toString("utf8"),
  ) as typeof payload;
  assert.deepEqual(decoded.mls, payload.mls);
  assert.equal(decoded.title, payload.title);
  assert.equal(ENV_PINNED_ORIGIN_DOC.productionValueToday, "https://houzzat.com");
  console.log("[5] share base64url encode/decode unchanged... PASS");
}

function testAddToRouteFeedbackAndSheetSync() {
  assert.equal(SITE_MESSAGES.routePlannerAddedToast, "Added to Route Planner");

  const toggle = read("src/components/route-planner/RoutePlannerToggleButton.tsx");
  assert.match(toggle, /routePlannerAddedToast/);
  assert.match(toggle, /flyRouteToPlanner/);

  const bar = read("src/components/listings/ListingMobileActionBar.tsx");
  assert.match(bar, /routePlannerAddedToast/);

  const sync = read("src/lib/route-planner/route-planner-sync.ts");
  assert.equal(ROUTE_PLANNER_CHANGED_EVENT, "houzzat:route-planner-changed");
  assert.equal(ROUTE_PLANNER_CHANGED_MESSAGE, "houzzat:route-planner-changed");
  assert.match(sync, /postMessage/);
  assert.match(sync, /localStorage/);
  assert.equal(
    isRoutePlannerChangedMessage({ type: ROUTE_PLANNER_CHANGED_MESSAGE }),
    true,
  );
  assert.equal(isRoutePlannerChangedMessage({ type: "other" }), false);

  const provider = read("src/components/route-planner/RoutePlannerProvider.tsx");
  assert.match(provider, /notifyRoutePlannerChanged/);
  assert.match(provider, /isRoutePlannerChangedMessage/);
  assert.match(provider, /addEventListener\(["']message["']/);
  assert.match(provider, /try \{/);
  console.log("[6] Add to Route toast + sheet parent sync... PASS");
}

function testVowAuthorityPreserved() {
  const accessRoute = read("src/app/api/account/access/route.ts");
  assert.match(accessRoute, /resolveClientAccess/);
  assert.match(accessRoute, /prisma\.user\.findUnique/);
  assert.match(accessRoute, /emailVerified/);

  const hook = read("src/hooks/use-client-access.ts");
  assert.match(hook, /hasClientAccess/);
  assert.doesNotMatch(hook, /hasClientAccess:\s*true/);

  const notes = read("src/components/account/ListingNotesPanel.tsx");
  assert.match(notes, /EmailVerificationRequired|needsEmailVerification/);
  console.log("[7] VOW/access DB authority preserved... PASS");
}

function main() {
  testHomepagePersonalizationReload();
  testClientAccessEmailVerified();
  testNotesNotGatedOnAccessLoading();
  testListingCardClientBoundary();
  testShareTokenEncodingUnchanged();
  testAddToRouteFeedbackAndSheetSync();
  testVowAuthorityPreserved();
  console.log("\nhouzzat-consumer-stabilization-selftest: ALL PASS");
}

main();
