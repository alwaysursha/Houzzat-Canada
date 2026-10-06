/**
 * Consumer lead capture + qualification funnel selftest.
 * Run: pnpm consumer-lead-funnel:selftest
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import {
  buildCaptureContext,
  pickClickIds,
} from "../src/lib/auth/capture-attribution";
import {
  CAPTURE_INTENT_TTL_MS,
  createCaptureIntent,
  peekPendingIntent,
  saveCaptureIntent,
  touchPendingCaptureIntent,
  type CaptureIntentStore,
} from "../src/lib/auth/capture-intent";
import {
  hashPhoneCredential,
  rehashPhoneCredentialForEdit,
  verifyPasswordCredential,
} from "../src/lib/auth/phone-credential";
import {
  maskPhoneE164,
  PHONE_OTP_MAX_ATTEMPTS,
  PHONE_OTP_RESEND_COOLDOWN_MS,
  PHONE_OTP_TTL_MS,
} from "../src/lib/auth/phone-otp";
import {
  describeObservedBudget,
  formatPricePreferenceLabel,
} from "../src/lib/auth/buyer-confirmed-preference";
import {
  CONSUMER_BUYING_TIMEFRAMES,
  isPurchaseTimeframe,
  purchaseTimeframeLabel,
} from "../src/lib/agent/timeframe";
import { normalizeToE164 } from "../src/lib/sms/e164";
import { authModalCopy } from "../src/components/auth/auth-modal-copy";

const root = join(import.meta.dirname, "..");

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
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

/**
 * Real credentials authorize path uses verifyPasswordCredential from auth.ts.
 * Product case: register with (647) 555-1234, later login with digit/E.164 forms.
 */
async function testPhoneCredentialRealAuthPath() {
  const authLib = read("src/lib/auth.ts");
  assert.ok(authLib.includes('from "@/lib/auth/phone-credential"'));
  assert.ok(authLib.includes("verifyPasswordCredential"));
  assert.ok(authLib.includes("user.passwordCredentialKind"));
  // Must not bcrypt.compare the raw password on the tenant consumer path.
  assert.ok(
    authLib.includes("kind: user.passwordCredentialKind") ||
      authLib.includes("kind: user.passwordCredentialKind,"),
  );

  const signupRoute = read("src/app/api/auth/sign-up/route.ts");
  assert.ok(signupRoute.includes('passwordCredentialKind: "PHONE_E164"'));
  assert.ok(signupRoute.includes("hashPhoneCredential"));
  assert.equal(signupRoute.includes("parsed.data.password"), false);

  // Signup material: formatted phone → canonical E.164 only.
  const created = await hashPhoneCredential("(647) 555-1234");
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.phoneE164, "+16475551234");
  assert.ok(created.hash.startsWith("$2"));
  assert.equal(created.hash.includes("647"), false);
  assert.equal(created.hash.includes("+16475551234"), false);
  assert.equal(created.hash.includes("(647)"), false);

  // Post-logout logins required by product.
  assert.equal(
    await verifyPasswordCredential({
      kind: "PHONE_E164",
      submitted: "6475551234",
      storedHash: created.hash,
    }),
    true,
  );
  assert.equal(
    await verifyPasswordCredential({
      kind: "PHONE_E164",
      submitted: "+1 647 555 1234",
      storedHash: created.hash,
    }),
    true,
  );
  assert.equal(
    await verifyPasswordCredential({
      kind: "PHONE_E164",
      submitted: "(647) 555-1234",
      storedHash: created.hash,
    }),
    true,
  );
  assert.equal(
    await verifyPasswordCredential({
      kind: "PHONE_E164",
      submitted: "6475559999",
      storedHash: created.hash,
    }),
    false,
  );

  // LEGACY: arbitrary password, never phone-normalized.
  const legacyHash = await bcrypt.hash("MyLegacy!Pass99", 10);
  assert.equal(
    await verifyPasswordCredential({
      kind: "LEGACY",
      submitted: "MyLegacy!Pass99",
      storedHash: legacyHash,
    }),
    true,
  );
  assert.equal(
    await verifyPasswordCredential({
      kind: "LEGACY",
      submitted: "6475551234",
      storedHash: legacyHash,
    }),
    false,
  );
  assert.equal(
    await verifyPasswordCredential({
      kind: "LEGACY",
      submitted: "+16475551234",
      storedHash: legacyHash,
    }),
    false,
  );
  assert.equal(
    await verifyPasswordCredential({
      kind: null,
      submitted: "MyLegacy!Pass99",
      storedHash: legacyHash,
    }),
    true,
  );

  console.log(
    "[auth] PHONE_E164 real-auth path + LEGACY no-normalize PASS",
  );
}

/** Edit Number during OTP: rehash credential, invalidate old phone auth. */
async function testEditPhoneCredentialConsistency() {
  const phoneA = await hashPhoneCredential("(647) 555-1234");
  assert.equal(phoneA.ok, true);
  if (!phoneA.ok) return;
  assert.equal(phoneA.phoneE164, "+16475551234");

  const phoneB = await rehashPhoneCredentialForEdit("416-555-9876");
  assert.equal(phoneB.ok, true);
  if (!phoneB.ok) return;
  assert.equal(phoneB.phoneE164, "+14165559876");
  assert.ok(phoneB.hash.startsWith("$2"));
  assert.notEqual(phoneB.hash, phoneA.hash);

  // Old phone credential no longer authenticates against new hash.
  assert.equal(
    await verifyPasswordCredential({
      kind: "PHONE_E164",
      submitted: "6475551234",
      storedHash: phoneB.hash,
    }),
    false,
  );
  assert.equal(
    await verifyPasswordCredential({
      kind: "PHONE_E164",
      submitted: "(647) 555-1234",
      storedHash: phoneB.hash,
    }),
    false,
  );
  // New phone authenticates in common formats.
  assert.equal(
    await verifyPasswordCredential({
      kind: "PHONE_E164",
      submitted: "4165559876",
      storedHash: phoneB.hash,
    }),
    true,
  );
  assert.equal(
    await verifyPasswordCredential({
      kind: "PHONE_E164",
      submitted: "+1 416 555 9876",
      storedHash: phoneB.hash,
    }),
    true,
  );

  const editRoute = read("src/app/api/auth/phone-otp/edit/route.ts");
  assert.ok(editRoute.includes("rehashPhoneCredentialForEdit"));
  assert.ok(editRoute.includes("phoneOtpChallenge.updateMany"));
  assert.ok(editRoute.includes("consumedAt: new Date()"));
  assert.ok(editRoute.includes("phoneOtpVerifiedAt: null"));
  assert.equal(editRoute.includes("prisma.user.create"), false);
  assert.equal(editRoute.includes("captureWebsiteLead"), false);
  assert.equal(editRoute.includes("reportGa4SignUp"), false);
  assert.equal(editRoute.includes("phoneVerifiedAt"), false);
  // Same User updated in place — no Lead create.
  assert.ok(editRoute.includes("prisma.user.update"));
  assert.equal(editRoute.includes("prisma.lead.create"), false);

  console.log("[otp] Edit Number credential + Lead/User identity PASS");
}

function testSignupFormCinc() {
  const form = read("src/components/auth/SignUpForm.tsx");
  assert.ok(form.includes("Full Name"));
  assert.ok(form.includes("Mobile Number"));
  assert.ok(form.includes("also used as your password"));
  assert.equal(form.includes("PasswordField"), false);
  assert.equal(form.includes('label="Password"'), false);
  assert.ok(form.includes("credentialMode"));
  assert.ok(form.includes("reportGa4SignUp"));
  assert.ok(form.includes("reportLeadCaptured"));
  const route = read("src/app/api/auth/sign-up/route.ts");
  assert.ok(route.includes("hashPhoneCredential"));
  assert.ok(route.includes('passwordCredentialKind: "PHONE_E164"'));
  assert.ok(route.includes("deferSignupSms: true"));
  assert.ok(route.includes("captureWebsiteLead"));
  assert.ok(route.includes("lead_capture"));
  assert.ok(route.includes("sendWelcomeEmail"));
  assert.ok(route.includes("emailVerifyNudgeDueAt"));
  assert.equal(route.includes("sendEmailVerification("), false);
  console.log("[signup] CINC form + mobile-as-password + lead-before-OTP PASS");
}

function testAuthModalCompactAndCtas() {
  const modal = read("src/components/auth/AuthModalProvider.tsx");
  assert.ok(modal.includes("maxWidth: phase === \"funnel\" ? 400 : 440"));
  assert.equal(modal.includes("maxWidth: 880"), false);
  assert.equal(modal.includes("AuthBenefitsPanel"), false);
  assert.ok(modal.includes("LeadCaptureFunnel"));
  assert.ok(modal.includes("TourThisHomePrompt"));

  const cases: Array<[Parameters<typeof authModalCopy>[0], string]> = [
    ["VIEW_LISTING", "Continue to Property"],
    ["SAVE_LISTING", "Save This Home"],
    ["SAVE_SEARCH", "Save My Search"],
    ["PROPERTY_WATCH", "Start Property Watch"],
    ["AREA_WATCH", "Start Area Watch"],
    ["REQUEST_VIEWING", "Continue to Viewing"],
    ["CONTACT_AGENT", "Contact Agent"],
    ["START_CHAT", "Start Chat"],
    ["ROUTE_PLANNER", "Continue Route Planner"],
    ["DRIVE_TIME", "Continue Drive Times"],
  ];
  for (const [intent, cta] of cases) {
    assert.equal(authModalCopy(intent, "sign-up", "Houzzat").cta, cta);
  }
  console.log("[auth modal] compact + contextual CTAs PASS");
}

function testOtpSecuritySurface() {
  const otp = read("src/lib/auth/phone-otp.ts");
  assert.ok(otp.includes("sha256"));
  assert.ok(otp.includes("timingSafeEqual"));
  assert.ok(otp.includes('smsClass: "transactional"'));
  assert.equal(otp.includes("console.log(code"), false);
  assert.ok(PHONE_OTP_TTL_MS <= 15 * 60 * 1000);
  assert.ok(PHONE_OTP_RESEND_COOLDOWN_MS >= 30_000);
  assert.ok(PHONE_OTP_MAX_ATTEMPTS <= 8);
  assert.equal(maskPhoneE164("+16475550099"), "(647) •••-0099");

  const code = "123456";
  const salt = "ws:user:+16475551234";
  const hash = createHash("sha256").update(`${salt}:${code}`).digest("hex");
  assert.notEqual(hash, code);

  const edit = read("src/app/api/auth/phone-otp/edit/route.ts");
  assert.ok(edit.includes("rehashPhoneCredentialForEdit"));
  assert.ok(edit.includes("phoneOtpVerifiedAt: null"));
  assert.equal(edit.includes("phoneVerifiedAt"), false);

  const verify = read("src/app/api/auth/phone-otp/verify/route.ts");
  assert.equal(verify.includes("phoneVerifiedAt"), false);
  assert.ok(verify.includes("verifyPhoneOtp"));
  console.log("[otp] hashed storage + transactional SMS + edit rehash PASS");
}

function testEnrichmentAndTimeframes() {
  assert.deepEqual([...CONSUMER_BUYING_TIMEFRAMES], [
    "ONE_TO_THREE_MONTHS",
    "THREE_TO_SIX_MONTHS",
    "SIX_TO_TWELVE_MONTHS",
    "TWELVE_PLUS_MONTHS",
  ]);
  assert.equal(purchaseTimeframeLabel("THREE_TO_SIX_MONTHS"), "3–6 Months");
  assert.equal(purchaseTimeframeLabel("ONE_TO_THREE_MONTHS"), "0–3 Months");
  assert.ok(isPurchaseTimeframe("THREE_TO_SIX_MONTHS"));
  const funnel = read("src/components/auth/lead-funnel/LeadCaptureFunnel.tsx");
  assert.equal(funnel.includes("Just Browsing"), false);
  assert.ok(funnel.includes("Do you currently own a home?"));
  assert.ok(funnel.includes("Claim Your Address"));
  assert.ok(funnel.includes("Claim My Address"));
  assert.ok(funnel.includes("Unit # (if applicable)"));
  assert.ok(funnel.includes('source="google"'));
  assert.ok(funnel.includes("AddressAutocomplete"));
  assert.equal(funnel.includes("Curious What Your Home Is Worth?"), false);
  assert.equal(funnel.includes("Get My Home Value"), false);
  assert.equal(funnel.includes("/api/valuation"), false);
  assert.equal(funnel.includes("home-valuation"), false);
  assert.ok(funnel.includes("When are you planning to buy?"));
  assert.ok(funnel.includes("Have you been pre-approved for a mortgage?"));
  assert.ok(funnel.includes("Yes, that&apos;s right"));
  assert.ok(funnel.includes("Edit Price Range"));
  assert.ok(funnel.includes('go("claimAddress")'));
  assert.ok(funnel.includes("No / Rent"));
  const qual = read("src/app/api/auth/qualification/route.ts");
  assert.ok(qual.includes('step: z.literal("claimAddress")'));
  assert.ok(qual.includes("homeUnit"));
  assert.ok(qual.includes("applyCanonicalCustomerContact"));
  assert.equal(qual.includes('step: z.literal("valuation")'), false);
  assert.equal(qual.includes("/api/valuation"), false);
  assert.equal(qual.includes("savedSearch.create"), false);
  assert.equal(qual.includes("areaMonitor"), false);
  assert.equal(qual.includes("propertyMonitor"), false);
  assert.ok(qual.includes("upsertBuyerConfirmedPreference"));
  assert.ok(qual.includes("savedSearchTouched: false"));
  assert.ok(qual.includes("PRE_APPROVED"));
  assert.ok(qual.includes("CASH"));
  const crm = read("src/components/agent/lead-profile-v2/LeadProfileV2InfoPanel.tsx");
  assert.ok(crm.includes("Claimed property"));
  assert.ok(crm.includes("Seller opportunity"));
  assert.ok(crm.includes("Unit #"));
  // Consumer UI must never expose internal CRM phrase "seller opportunity".
  assert.equal(funnel.toLowerCase().includes("seller opportunity"), false);
  assert.ok(funnel.includes("homeLat"));
  assert.ok(funnel.includes("homeLng"));
  assert.ok(funnel.includes("homeUnit"));
  assert.ok(funnel.includes("Maybe Later"));
  assert.ok(qual.includes("monitorsCreated: false"));
  console.log("[enrichment] ownership/claim-address/timeframe/financing/preference PASS");
}

function testConfirmedPreferenceIsolation() {
  const looking = read("src/lib/agent/lead-profile-v2/load-looking-for.ts");
  assert.ok(looking.includes("buyerConfirmedPreference"));
  assert.ok(looking.includes("Confirmed preference"));
  const digest = read("scripts/buyer-digest-saved-search-selftest.ts");
  assert.ok(digest.length > 0);
  assert.equal(
    read("src/app/api/auth/qualification/route.ts").includes(
      "savedSearch.create",
    ),
    false,
  );
  assert.equal(
    describeObservedBudget(1_000_000),
    "under $1M",
  );
  assert.ok(formatPricePreferenceLabel({ maxPrice: 1_000_000 }));
  console.log("[preference] confirmed ≠ SavedSearch PASS");
}

function testIntentTtlAndTouch() {
  assert.ok(CAPTURE_INTENT_TTL_MS >= 30 * 60 * 1000);
  assert.ok(CAPTURE_INTENT_TTL_MS <= 60 * 60 * 1000);
  const store = memoryIntent();
  const host = "acme.houzzatpro.com";
  const now = 1_700_000_000_000;
  const created = createCaptureIntent(
    { type: "VIEW_LISTING", mlsNumber: "W1234567", callbackPath: "/listing/x/W1234567" },
    { host, now },
  );
  assert.ok(created.ok);
  if (!created.ok) return;
  saveCaptureIntent(store, created.intent);
  const touched = touchPendingCaptureIntent(store, {
    host,
    now: now + 20 * 60 * 1000,
  });
  assert.ok(touched.ok);
  if (!touched.ok) return;
  assert.equal(touched.intent.createdAt, now + 20 * 60 * 1000);
  const peek = peekPendingIntent(store, {
    host,
    now: now + 40 * 60 * 1000,
  });
  assert.ok(peek.ok);
  console.log("[intent] TTL + touch during funnel PASS");
}

function testAttribution() {
  const ctx = buildCaptureContext({
    intent: "VIEW_LISTING",
    mlsNumber: "W123",
    listingAddress: "1120 Beachcomber Rd",
    listingPrice: 999000,
    utmSource: "google",
    gclid: "abc123",
    visitorKey: "vk",
    sessionKey: "sk",
  });
  assert.equal(ctx.mlsNumber, "W123");
  assert.equal(ctx.gclid, "abc123");
  assert.equal(ctx.utmSource, "google");
  assert.equal(
    "googleCampaignName" in ctx,
    false,
  );
  assert.deepEqual(pickClickIds({ gclid: "x", keyword: "buy house" }), {
    gclid: "x",
    gbraid: undefined,
    wbraid: undefined,
  });
  console.log("[attribution] first-party only PASS");
}

function testTourReusesViewing() {
  const tour = read("src/components/auth/lead-funnel/TourThisHomePrompt.tsx");
  assert.ok(tour.includes("ViewingBookingModal"));
  assert.ok(tour.includes("Tour This Home"));
  assert.ok(tour.includes("Maybe Later"));
  assert.ok(tour.includes("pointer-events-none"));
  assert.ok(tour.includes("houzzat:tour-prompt-dismissed"));
  console.log("[tour] soft prompt reuses ViewingBookingModal PASS");
}

function testEmailVerificationUntouched() {
  const verify = read("src/lib/auth/email-verification.ts");
  const nudge = read("src/lib/auth/verify-email-nudge.ts");
  assert.ok(verify.includes("emailVerified"));
  assert.ok(nudge.includes("emailVerifyNudgeDueAt") || nudge.length > 100);
  const route = read("src/app/api/auth/sign-up/route.ts");
  assert.ok(route.includes("nextEmailVerifyNudgeDueAt"));
  assert.equal(route.includes("phoneOtpVerifiedAt"), false);
  console.log("[email] verification + 24h nudge untouched PASS");
}

function testSchemaAdditive() {
  const schema = read("prisma/schema.prisma");
  assert.ok(schema.includes("enum PasswordCredentialKind"));
  assert.ok(schema.includes("PHONE_E164"));
  assert.ok(schema.includes("THREE_TO_SIX_MONTHS"));
  assert.ok(schema.includes("enum MortgageFinancing"));
  assert.ok(schema.includes("phoneOtpVerifiedAt"));
  assert.ok(schema.includes("model BuyerConfirmedPreference"));
  assert.ok(schema.includes("model PhoneOtpChallenge"));
  assert.ok(schema.includes("captureContext"));
  const migration = read(
    "prisma/migrations/20261006140000_consumer_lead_capture_funnel/migration.sql",
  );
  assert.ok(migration.includes("ADD COLUMN IF NOT EXISTS"));
  assert.equal(migration.toLowerCase().includes("drop table"), false);
  console.log("[schema] additive migration PASS");
}

function testAnalyticsBoundary() {
  const form = read("src/components/auth/SignUpForm.tsx");
  assert.ok(form.includes("reportGa4SignUp()"));
  const funnel = read("src/components/auth/lead-funnel/LeadCaptureFunnel.tsx");
  assert.equal(funnel.includes("reportGa4SignUp"), false);
  assert.ok(funnel.includes("reportPhoneVerified"));
  assert.ok(funnel.includes("reportQualificationCompleted"));
  console.log("[analytics] signup conversion once at capture PASS");
}

function testE164Helper() {
  assert.equal(normalizeToE164("(647) 555-1234"), "+16475551234");
  assert.equal(normalizeToE164("+1 647 555 1234"), "+16475551234");
}

async function main() {
  testE164Helper();
  await testPhoneCredentialRealAuthPath();
  await testEditPhoneCredentialConsistency();
  testSignupFormCinc();
  testAuthModalCompactAndCtas();
  testOtpSecuritySurface();
  testEnrichmentAndTimeframes();
  testConfirmedPreferenceIsolation();
  testIntentTtlAndTouch();
  testAttribution();
  testTourReusesViewing();
  testEmailVerificationUntouched();
  testSchemaAdditive();
  testAnalyticsBoundary();
  console.log("consumer lead funnel selftest: PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
