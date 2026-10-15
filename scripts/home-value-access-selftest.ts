/**
 * Home Valuation access / CX gates (VOW parity with listing-insights).
 * Run: pnpm home-value-access:selftest
 *
 * Hermetic — no DB. Does not change or assert estimate math.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EMAIL_VERIFY_GRACE_MS } from "@/lib/account-access";
import {
  HOME_VALUE_DRAFT_STORAGE_KEY,
  parseHomeValueDraft,
  serializeHomeValueDraft,
  valuationSoldAccessDenial,
} from "@/lib/market/home-value-access";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DAY_MS = 24 * 60 * 60 * 1000;

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testGuestDenial() {
  const denial = valuationSoldAccessDenial(null);
  assert.ok(denial);
  assert.equal(denial!.status, "AUTH_REQUIRED");
  assert.equal(denial!.accessKind, "visitor");
  assert.ok(denial!.message.toLowerCase().includes("sign in"));
  console.log("[guest] AUTH_REQUIRED PASS");
}

function testAuthorizedVerified() {
  const denial = valuationSoldAccessDenial({
    id: "u_verified",
    emailVerified: new Date(),
    createdAt: new Date(Date.now() - 30 * DAY_MS),
  });
  assert.equal(denial, null);
  console.log("[authorized] verified → no denial PASS");
}

function testAuthorizedGrace() {
  const denial = valuationSoldAccessDenial({
    id: "u_grace",
    emailVerified: null,
    createdAt: new Date(Date.now() - 2 * DAY_MS),
  });
  assert.equal(denial, null);
  console.log("[authorized] grace window → no denial PASS");
}

function testUnverifiedLocked() {
  const denial = valuationSoldAccessDenial({
    id: "u_locked",
    emailVerified: null,
    createdAt: new Date(Date.now() - EMAIL_VERIFY_GRACE_MS - DAY_MS),
  });
  assert.ok(denial);
  assert.equal(denial!.status, "EMAIL_VERIFY_REQUIRED");
  assert.equal(denial!.accessKind, "unverified_locked");
  assert.ok(denial!.message.toLowerCase().includes("verify"));
  console.log("[unverified] EMAIL_VERIFY_REQUIRED PASS");
}

function testDraftRoundTrip() {
  const raw = serializeHomeValueDraft({
    address: "123 Main St",
    city: "Mississauga",
    community: "Port Credit",
    lat: 43.55,
    lng: -79.58,
    placeId: "places/abc",
    verifiedAddress: "123 Main St, Mississauga, ON",
    beds: "3",
    baths: "2",
    sqft: "1800",
    basement: "finished",
    propertyType: "DETACHED",
    step: "features",
  });
  const parsed = parseHomeValueDraft(raw);
  assert.ok(parsed);
  assert.equal(parsed!.address, "123 Main St");
  assert.equal(parsed!.city, "Mississauga");
  assert.equal(parsed!.community, "Port Credit");
  assert.equal(parsed!.lat, 43.55);
  assert.equal(parsed!.lng, -79.58);
  assert.equal(parsed!.beds, "3");
  assert.equal(parsed!.propertyType, "DETACHED");
  assert.equal(parsed!.step, "features");
  assert.equal(parseHomeValueDraft(null), null);
  assert.equal(parseHomeValueDraft("{"), null);
  assert.ok(HOME_VALUE_DRAFT_STORAGE_KEY.includes("home-valuation-draft"));
  console.log("[draft] serialize/parse + key PASS");
}

function testApiGateWiring() {
  const route = read("src/app/api/valuation/route.ts");
  const accessLib = read("src/lib/market/home-value-access.ts");
  assert.ok(route.includes("valuationSoldAccessDenial"));
  assert.ok(route.includes("canSeeSoldValuation"));
  assert.ok(route.includes("estimateOnly"));
  assert.ok(route.includes("AUTH_REQUIRED"));
  assert.ok(route.includes("soldAccessDenial.status"));
  assert.ok(accessLib.includes("EMAIL_VERIFY_REQUIRED"));
  assert.ok(accessLib.includes("AUTH_REQUIRED"));
  // Aggregate range disclosure still gated before estimateHomeValue on estimateOnly.
  const denialIdx = route.indexOf("if (estimateOnly)");
  const block = route.slice(denialIdx, denialIdx + 1200);
  assert.ok(block.includes("soldAccessDenial"));
  assert.ok(block.includes("estimate: null"));
  assert.ok(
    block.includes("estimateHomeValue"),
    "estimateOnly must call estimateHomeValue only after denial check",
  );
  const denialBeforeEstimate =
    block.indexOf("soldAccessDenial") < block.indexOf("estimateHomeValue");
  assert.ok(
    denialBeforeEstimate,
    "anonymous/unauthorized must be denied before disclosing estimate",
  );
  console.log("[api] estimateOnly denial-before-estimate PASS");
}

function testFormAccessCx() {
  const form = read("src/components/valuation/HomeValuationForm.tsx");
  assert.ok(form.includes("useClientAccess"));
  assert.ok(form.includes("EMAIL_VERIFY_REQUIRED"));
  assert.ok(form.includes("HOME_VALUE_DRAFT_STORAGE_KEY"));
  assert.ok(form.includes("parseHomeValueDraft"));
  assert.ok(form.includes("serializeHomeValueDraft"));
  assert.ok(form.includes("Request an In-Person Valuation"));
  assert.ok(form.includes("Sign in to view your estimate"));
  assert.ok(form.includes("Verify email"));
  assert.ok(form.includes("Create free account"));
  assert.ok(form.includes("refreshEstimate"));
  assert.ok(form.includes("hasClientAccess"));
  // Stale "Client access required" headline replaced for visitors.
  assert.equal(
    form.includes("Client access required"),
    false,
    "must not show misleading Client access required headline",
  );
  // Post-login retry when access unlocks.
  assert.ok(form.includes("clientAccess.hasClientAccess"));
  assert.ok(form.includes("lastAccessRetryKey"));
  console.log("[form] draft + retry + access copy PASS");
}

function testAccessHelperParityWithVow() {
  const access = read("src/lib/market/home-value-access.ts");
  assert.ok(access.includes("resolveClientAccess"));
  assert.ok(access.includes("hasClientAccess"));
  assert.ok(access.includes("needsEmailVerification"));
  // Same policy surface as listing-insights / vow helpers.
  const vow = read("src/lib/vow.ts");
  assert.ok(vow.includes("hasFullClientAccess"));
  console.log("[parity] resolveClientAccess / hasFullClientAccess PASS");
}

function main() {
  testGuestDenial();
  testAuthorizedVerified();
  testAuthorizedGrace();
  testUnverifiedLocked();
  testDraftRoundTrip();
  testApiGateWiring();
  testFormAccessCx();
  testAccessHelperParityWithVow();
  console.log("\nhome-value-access-selftest: ALL PASS");
}

main();
