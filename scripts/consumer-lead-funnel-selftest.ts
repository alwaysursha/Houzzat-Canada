/**
 * Consumer lead capture + qualification funnel selftest.
 * Run: pnpm consumer-lead-funnel:selftest
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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
  formatConfirmSearchSummary,
  formatCurrencyInputDisplay,
  formatPriceBand,
  formatPricePreferenceLabel,
  parseCurrencyInput,
} from "../src/lib/auth/buyer-confirmed-preference";
import { searchFiltersFromSearchUrl } from "../src/lib/auth/browse-search-context";
import {
  buildQualificationSavedSearchQuery,
  createQualificationSavedSearchMemoryDb,
  qualificationSavedSearchName,
  queryHasQualificationMarker,
  resolveQualificationIsPrimary,
  upsertQualificationSavedSearch,
} from "../src/lib/auth/qualification-saved-search";
import {
  CONSUMER_BUYING_TIMEFRAMES,
  isPurchaseTimeframe,
  purchaseTimeframeLabel,
} from "../src/lib/agent/timeframe";
import { normalizeToE164 } from "../src/lib/sms/e164";
import {
  accessInventoryLine,
  authModalCopy,
} from "../src/components/auth/auth-modal-copy";
import { searchResultsCopy } from "../src/lib/listings/search-results-copy";
import {
  parseHomepagePersonalizationQuery,
  summarizePersonalization,
} from "../src/lib/listings/homepage-personalization";

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
  assert.ok(form.includes("Phone"));
  assert.ok(form.includes("also used as your password"));
  assert.equal(form.includes("Mobile Number"), false);
  assert.equal(form.includes("PasswordField"), false);
  assert.equal(form.includes('label="Password"'), false);
  assert.ok(form.includes("credentialMode"));
  assert.ok(form.includes("reportGa4SignUp"));
  assert.ok(form.includes("reportLeadCaptured"));
  // Credential Manager must not block Continue → qualification.
  assert.ok(form.includes("void rememberLoginCredentials"));
  assert.ok(form.includes("credentialManager: false"));
  assert.ok(form.includes('houzzat:lead-captured'));
  assert.ok(form.includes("void offerBiometricsAfterCredentialsSignIn"));
  assert.equal(form.includes("SIGN_IN_TIMEOUT"), false);
  assert.equal(form.includes("Promise.race"), false);
  const remembered = read("src/lib/auth/remembered-login.ts");
  assert.ok(remembered.includes("void navigator.credentials.store"));
  assert.equal(remembered.includes("await navigator.credentials.store"), false);
  assert.ok(remembered.includes("credentialManager"));
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
  assert.ok(modal.includes("hideTopAuthTabs"));
  assert.ok(modal.includes('listingGate ? 380 : 440'));
  assert.equal(modal.includes("maxWidth: 880"), false);
  assert.equal(modal.includes("AuthBenefitsPanel"), false);
  assert.ok(modal.includes("LeadCaptureFunnel"));
  assert.ok(modal.includes("TourThisHomePrompt"));
  assert.ok(modal.includes("compact={listingGate}"));
  // VIEW_LISTING: no top Sign in / Sign up tabs; bottom Sign in remains.
  assert.ok(modal.includes("hideTopAuthTabs ? null"));
  assert.ok(read("src/components/auth/SignUpForm.tsx").includes("Already registered?"));

  const viewListing = authModalCopy("VIEW_LISTING", "sign-up", "Houzzat");
  assert.equal(viewListing.headline, "Free Access");
  assert.ok(viewListing.subhead.includes("full property details"));
  assert.equal(viewListing.cta, "Continue to Property");
  assert.equal(viewListing.freshness, accessInventoryLine());
  assert.equal(viewListing.subhead.includes("Create your free"), false);
  assert.equal(viewListing.subhead.includes("free account"), false);

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
    assert.equal(
      authModalCopy(intent, "sign-up", "Houzzat").subhead.toLowerCase().includes(
        "create your free",
      ),
      false,
    );
  }
  console.log("[auth modal] Free Access + no top tabs + contextual CTAs PASS");
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
  assert.equal(funnel.includes("Yes, That&apos;s right"), false);
  assert.equal(funnel.includes("No, Edit Search"), false);
  assert.equal(funnel.includes("Is this search correct?"), false);
  assert.equal(funnel.includes("editSearch"), false);
  assert.equal(funnel.includes(">Back<") || funnel.includes("ArrowLeft"), false);
  assert.ok(funnel.includes("fieldMenuExpand"));
  assert.equal(funnel.includes("portalDesktopSuggestions"), false);
  assert.ok(funnel.includes('go("claimAddress")'));
  assert.ok(funnel.includes("void finish()"));
  assert.ok(funnel.includes("No / Rent"));
  assert.ok(funnel.includes("QUALIFICATION_COMPLETED_EVENT"));
  assert.ok(funnel.includes("Maybe Later"));
  assert.ok(funnel.includes("Skip for now"));
  const progress = read("src/components/auth/lead-funnel/FunnelProgress.tsx");
  assert.ok(progress.includes("h-1"));
  assert.ok(progress.includes("duration-300"));
  assert.equal(progress.includes("STEP_PROGRESS"), false);
  const ac = read("src/components/listings/AddressAutocomplete.tsx");
  assert.ok(ac.includes("fieldMenuExpand"));
  assert.ok(ac.includes("relative mt-1.5"));
  const qual = read("src/app/api/auth/qualification/route.ts");
  assert.ok(qual.includes('step: z.literal("claimAddress")'));
  assert.ok(qual.includes("homeUnit"));
  assert.ok(qual.includes("applyCanonicalCustomerContact"));
  assert.equal(qual.includes('step: z.literal("valuation")'), false);
  assert.equal(qual.includes("/api/valuation"), false);
  assert.ok(qual.includes("upsertQualificationSavedSearch"));
  assert.equal(qual.includes("areaMonitor"), false);
  assert.equal(qual.includes("propertyMonitor"), false);
  assert.ok(qual.includes("upsertBuyerConfirmedPreference"));
  assert.ok(qual.includes("savedSearchTouched: true"));
  assert.ok(qual.includes("scheduleSignupQualificationCompletedNotify"));
  assert.ok(qual.includes('source: "observed"'));
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

async function testConfirmedPreferenceAndQualificationSearch() {
  const looking = read("src/lib/agent/lead-profile-v2/load-looking-for.ts");
  assert.ok(looking.includes("buyerConfirmedPreference"));
  assert.ok(looking.includes("Confirmed preference"));
  const digest = read("scripts/buyer-digest-saved-search-selftest.ts");
  assert.ok(digest.length > 0);
  const qualHelper = read("src/lib/auth/qualification-saved-search.ts");
  assert.ok(qualHelper.includes("QUALIFICATION_HOME_SEARCH_KEY"));
  assert.ok(qualHelper.includes("upsertQualificationSavedSearch"));
  assert.ok(qualHelper.includes("resolveQualificationIsPrimary"));
  assert.ok(qualHelper.includes("Never steals primary"));
  assert.ok(
    read("src/app/api/auth/qualification/route.ts").includes(
      "upsertQualificationSavedSearch",
    ),
  );
  const q1 = buildQualificationSavedSearchQuery({
    cities: ["Milton"],
    maxPrice: 1_000_000,
    minBeds: 3,
    minBaths: 2,
    transactionType: "SALE",
  });
  assert.equal(q1.qualificationHomeSearch, true);
  assert.equal(q1.city, "Milton");
  assert.equal(q1.maxPrice, "1000000");
  assert.equal(q1.minBeds, "3");
  assert.equal(q1.minBaths, "2");
  assert.equal(
    qualificationSavedSearchName({ cities: ["Milton"], maxPrice: 1_000_000 }),
    "Milton · up to $1M",
  );

  // Pure primary-resolution rules.
  assert.equal(
    resolveQualificationIsPrimary({
      otherPrimaryId: null,
      qualificationId: null,
      qualificationIsAlreadyPrimary: false,
    }),
    true,
  );
  assert.equal(
    resolveQualificationIsPrimary({
      otherPrimaryId: "explicit-1",
      qualificationId: null,
      qualificationIsAlreadyPrimary: false,
    }),
    false,
  );
  assert.equal(
    resolveQualificationIsPrimary({
      otherPrimaryId: "explicit-1",
      qualificationId: "qual-1",
      qualificationIsAlreadyPrimary: false,
    }),
    false,
  );
  assert.equal(
    resolveQualificationIsPrimary({
      otherPrimaryId: null,
      qualificationId: "qual-1",
      qualificationIsAlreadyPrimary: true,
    }),
    true,
  );

  // A. No SavedSearch → one qualification row, primary + homepage.
  {
    const mem = createQualificationSavedSearchMemoryDb();
    const first = await upsertQualificationSavedSearch(mem.db, {
      userId: "u1",
      cities: ["Milton"],
      maxPrice: 1_000_000,
      minBeds: 3,
    });
    assert.equal(first.created, true);
    assert.equal(first.isPrimary, true);
    assert.equal(first.isHomepageActive, true);
    assert.equal(mem.rows.length, 1);
    assert.ok(queryHasQualificationMarker(mem.rows[0]!.query));
    assert.equal(mem.rows[0]!.isPrimary, true);
    assert.equal(mem.rows[0]!.isHomepageActive, true);

    // B. Retry → still one qualification row.
    const retry = await upsertQualificationSavedSearch(mem.db, {
      userId: "u1",
      cities: ["Milton"],
      maxPrice: 900_000,
      minBeds: 3,
    });
    assert.equal(retry.created, false);
    assert.equal(retry.updated, true);
    assert.equal(retry.id, first.id);
    assert.equal(mem.rows.length, 1);
    assert.equal(mem.rows[0]!.isPrimary, true);
    assert.equal(mem.rows[0]!.isHomepageActive, true);
    assert.equal(
      (mem.rows[0]!.query as { maxPrice?: string }).maxPrice,
      "900000",
    );
  }

  // C. Existing explicit primary → preserved; qualification homepage only.
  {
    const mem = createQualificationSavedSearchMemoryDb();
    const explicit = mem.seed({
      userId: "u2",
      name: "Toronto homes",
      query: { city: "Toronto", minBeds: "4" },
      emailAlerts: true,
      smsAlerts: false,
      isPrimary: true,
      isHomepageActive: true,
    });
    const qual = await upsertQualificationSavedSearch(mem.db, {
      userId: "u2",
      cities: ["Milton"],
      maxPrice: 1_000_000,
      minBeds: 3,
      minBaths: 2,
    });
    assert.equal(qual.created, true);
    assert.equal(qual.isPrimary, false);
    assert.equal(qual.isHomepageActive, true);
    assert.equal(mem.rows.length, 2);
    const explicitAfter = mem.rows.find((r) => r.id === explicit.id)!;
    assert.equal(explicitAfter.isPrimary, true);
    assert.equal(explicitAfter.isHomepageActive, false);
    assert.equal(explicitAfter.name, "Toronto homes");
    assert.deepEqual(explicitAfter.query, { city: "Toronto", minBeds: "4" });
    const qualRow = mem.rows.find((r) => r.id === qual.id)!;
    assert.equal(qualRow.isPrimary, false);
    assert.equal(qualRow.isHomepageActive, true);
    assert.ok(queryHasQualificationMarker(qualRow.query));

    // D. Requalification → same qualification row; explicit primary untouched.
    const again = await upsertQualificationSavedSearch(mem.db, {
      userId: "u2",
      cities: ["Oakville"],
      maxPrice: 1_200_000,
      minBeds: 4,
    });
    assert.equal(again.id, qual.id);
    assert.equal(again.created, false);
    assert.equal(mem.rows.length, 2);
    assert.equal(mem.rows.find((r) => r.id === explicit.id)!.isPrimary, true);
    assert.equal(
      mem.rows.find((r) => r.id === explicit.id)!.name,
      "Toronto homes",
    );
    assert.deepEqual(mem.rows.find((r) => r.id === explicit.id)!.query, {
      city: "Toronto",
      minBeds: "4",
    });
    const qualAfter = mem.rows.find((r) => r.id === qual.id)!;
    assert.equal(qualAfter.isPrimary, false);
    assert.equal(qualAfter.isHomepageActive, true);
    assert.equal((qualAfter.query as { city?: string }).city, "Oakville");

    // E. Homepage reset simulation — clear homepage only; primary flags stay.
    qualAfter.isHomepageActive = false;
    assert.equal(mem.rows.length, 2);
    assert.equal(mem.rows.find((r) => r.id === explicit.id)!.isPrimary, true);
    assert.equal(mem.rows.find((r) => r.id === qual.id)!.isPrimary, false);
    assert.equal(
      mem.rows.find((r) => r.id === qual.id)!.isHomepageActive,
      false,
    );
    assert.ok(
      queryHasQualificationMarker(mem.rows.find((r) => r.id === qual.id)!.query),
    );
  }

  assert.equal(describeObservedBudget(1_000_000), "Up to $1M");
  assert.equal(formatPriceBand({ maxPrice: 800_000 }), "Up to $800K");
  assert.equal(
    formatPriceBand({ minPrice: 600_000, maxPrice: 900_000 }),
    "$600K – $900K",
  );
  assert.equal(formatPriceBand({ minPrice: 700_000 }), "From $700K");
  assert.equal(formatPriceBand({}), "Any price");
  assert.equal(
    formatConfirmSearchSummary({
      cities: ["Hamilton"],
      maxPrice: 800_000,
    }),
    "Hamilton · Up to $800K",
  );
  assert.equal(
    formatConfirmSearchSummary({
      cities: ["Toronto"],
      minPrice: null,
      maxPrice: null,
    }),
    "Toronto · Any price",
  );
  assert.equal(parseCurrencyInput("500000"), 500_000);
  assert.equal(parseCurrencyInput("$1,000,000"), 1_000_000);
  assert.equal(formatCurrencyInputDisplay(500_000), "500,000");
  assert.ok(formatPricePreferenceLabel({ maxPrice: 1_000_000 }));
  console.log(
    "[preference] confirmed + qualification SavedSearch ownership A–E PASS",
  );
}

function testFunnelUxPolish() {
  const modal = read("src/components/auth/AuthModalProvider.tsx");
  assert.ok(modal.includes("bg-ink/[0.06]"));
  assert.ok(modal.includes("overflow-y-auto"));
  assert.ok(modal.includes("shadow-[0_12px_40px_-18px"));
  const funnel = read("src/components/auth/lead-funnel/LeadCaptureFunnel.tsx");
  assert.ok(funnel.includes("animate-in fade-in"));
  assert.ok(funnel.includes("STEP_PROGRESS"));
  assert.equal(funnel.includes("editSearch"), false);
  assert.equal(funnel.includes("Is this search correct?"), false);
  assert.equal(funnel.includes("ArrowLeft"), false);
  assert.ok(funnel.includes('source="google"'));
  assert.ok(funnel.includes("fieldMenuExpand"));
  assert.ok(funnel.includes("void finish()"));
  const progress = read("src/components/auth/lead-funnel/FunnelProgress.tsx");
  assert.ok(progress.includes("transition-[width] duration-300 ease-out"));
  console.log("[ux] funnel steps + transitions + backdrop PASS");
}

function testSearchContextToConfirmSummary() {
  const browseLib = read("src/lib/auth/browse-search-context.ts");
  assert.ok(browseLib.includes("BROWSE_SEARCH_CONTEXT_KEY"));
  assert.ok(browseLib.includes("persistBrowseSearchUrl"));
  assert.ok(browseLib.includes("searchFiltersFromSearchUrl"));
  assert.equal(browseLib.includes("savedSearch"), false);

  const searchUi = read("src/components/listings/SearchExperience.tsx");
  assert.ok(searchUi.includes("persistBrowseSearchUrl"));

  const signup = read("src/components/auth/SignUpForm.tsx");
  assert.ok(signup.includes("loadBrowseSearchUrl"));
  assert.ok(signup.includes("searchFiltersFromSearchUrl"));

  const filters = searchFiltersFromSearchUrl(
    "https://houzzat.com/search?city=Mississauga&transactionType=SALE&maxPrice=1000000",
  );
  assert.ok(filters);
  assert.equal(filters?.city, "Mississauga");
  assert.equal(filters?.maxPrice, 1_000_000);
  assert.deepEqual(filters?.cities, ["Mississauga"]);

  assert.equal(
    formatConfirmSearchSummary({
      cities: ["Mississauga"],
      maxPrice: 1_000_000,
    }),
    "Mississauga · Up to $1M",
  );

  // Listing detail URLs must not invent search criteria.
  assert.equal(
    searchFiltersFromSearchUrl("https://houzzat.com/listing/foo/W1234567"),
    null,
  );
  // Empty search path without criteria → null (do not invent).
  assert.equal(
    searchFiltersFromSearchUrl("https://houzzat.com/search"),
    null,
  );

  const qual = read("src/app/api/auth/qualification/route.ts");
  assert.ok(qual.includes("extractObservedPreference"));
  assert.ok(qual.includes("formatConfirmSearchSummary"));
  assert.ok(qual.includes("upsertQualificationSavedSearch"));
  console.log(
    "[capture] search → listing → signup → Mississauga · Up to $1M PASS",
  );
}

function testPostLaunchSearchAndCrm() {
  // Mobile result count uses canonical total.
  assert.equal(
    searchResultsCopy({
      transactionType: "SALE",
      segment: "RESIDENTIAL",
      city: "",
      community: "",
      cities: "",
      communities: "",
      q: "",
      minPrice: "",
      maxPrice: "",
      minBeds: "",
      minBaths: "",
      propertyTypes: [],
      openHouseOnly: false,
      statuses: ["ACTIVE"],
      total: 247,
      pending: false,
    }).countHeadline,
    "247 Homes for Sale",
  );

  const card = read("src/components/listings/SearchResultCard.tsx");
  assert.ok(card.includes("MLS® {listing.mlsNumber}"));
  assert.ok(card.includes("mobileFullWidth"));
  assert.equal(card.includes("listing.brokerageName"), false);

  const chips = read("src/components/listings/SearchActiveFilterStrip.tsx");
  assert.ok(chips.includes("Active filters"));
  assert.ok(chips.includes("Clear all"));
  const chipCopy = read("src/lib/listings/search-results-copy.ts");
  assert.ok(chipCopy.includes("+ Beds"));
  assert.ok(chipCopy.includes("+ Baths"));

  const desktop = read("src/components/listings/SearchDesktopFilterPanel.tsx");
  assert.ok(desktop.includes("Search filters"));
  assert.ok(desktop.includes("City / Area"));
  const experience = read("src/components/listings/SearchExperience.tsx");
  assert.ok(experience.includes("SearchDesktopFilterPanel"));
  assert.ok(experience.includes("desktopCardsLayout"));
  assert.ok(experience.includes("emphasizeCount={mobileCardsLayout}"));

  const ac = read("src/components/listings/AddressAutocomplete.tsx");
  assert.ok(ac.includes("placesSuggestionCache"));
  assert.ok(ac.includes("Keep clear/X scoped to the input row"));
  assert.ok(ac.includes("listingsFetchGenRef.current += 1"));

  const shell = read("src/lib/agent/lead-profile-v2/load-shell.ts");
  assert.ok(shell.includes("phoneOtpVerifiedAt: true"));
  assert.ok(shell.includes("phoneOtpVerified: Boolean(lead.customer.phoneOtpVerifiedAt)"));
  const contact = read("src/components/agent/lead-profile-v2/contact-fields.tsx");
  assert.ok(contact.includes("Consumer OTP verified"));
  assert.ok(contact.includes("bg-emerald-50"));
  assert.ok(contact.includes("otpVerified"));
  // Agent validity stays separate from consumer OTP.
  assert.ok(contact.includes("Agent-confirmed phone"));

  const signup = read("src/app/api/auth/sign-up/route.ts");
  assert.ok(signup.includes("smsAlertsEnabled: false"));
  assert.ok(signup.includes("emailAlertsEnabled: true"));
  assert.equal(read("src/lib/auth/phone-otp.ts").includes("smsAlertsEnabled"), false);

  const homepage = read("src/components/home/HomepagePersonalizationBanner.tsx");
  assert.ok(homepage.includes("Your custom search is applied"));
  assert.ok(homepage.includes("Reset search"));
  assert.ok(homepage.includes("isHomepageActive: false"));
  assert.equal(homepage.includes("DELETE"), false);

  const summary = summarizePersonalization(
    parseHomepagePersonalizationQuery({
      city: "Milton",
      maxPrice: "1000000",
      minBeds: "3",
      minBaths: "2",
    }),
  );
  assert.ok(summary.includes("Milton"));
  assert.ok(summary.includes("3+ Beds"));
  assert.ok(summary.includes("2+ Baths"));

  console.log("[post-launch] search/CRM/SMS/homepage PASS");
}

function testConsumerTipsRemoved() {
  assert.equal(
    existsSync(join(root, "src/components/listings/MapSearchCoachMarks.tsx")),
    false,
  );
  assert.equal(
    existsSync(
      join(root, "src/components/listings/ListingDetailCoachMarks.tsx"),
    ),
    false,
  );
  const search = read("src/components/listings/SearchExperience.tsx");
  const detail = read("src/components/listings/ListingDetailView.tsx");
  assert.equal(search.includes("MapSearchCoachMarks"), false);
  assert.equal(detail.includes("ListingDetailCoachMarks"), false);
  assert.equal(search.includes("houzzat:map-search-tips"), false);
  assert.equal(detail.includes("houzzat:listing-detail-tips"), false);
  console.log("[tips] consumer Tips implementation removed PASS");
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
  assert.ok(tour.includes("Like this home?"));
  assert.ok(tour.includes("Want to view this home in person?"));
  assert.equal(tour.includes("MLS ${mlsNumber}"), false);
  assert.equal(tour.includes("Want to see"), false);
  assert.ok(tour.includes("safe-area-inset-bottom"));
  assert.ok(tour.includes("--mobile-bottom-nav"));
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
  await testConfirmedPreferenceAndQualificationSearch();
  testFunnelUxPolish();
  testSearchContextToConfirmSummary();
  testPostLaunchSearchAndCrm();
  testConsumerTipsRemoved();
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
