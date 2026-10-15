/**
 * Phase 3B safety — seller claim registration corrections.
 * Run: pnpm seller-claim-registration:selftest
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createOrReuseAreaMonitor } from "../src/lib/account/area-monitor-create";
import {
  formatSellerTimeframeState,
  mergeSellerTimeframeIntoCapture,
  parseSellerTimeframeChoice,
  readSellerTimeframeState,
  SELLER_TIMEFRAME_OPTIONS,
  sellerTimeframeLabel,
} from "../src/lib/property-address/seller-timeframe";
import { resolveLeadIntent } from "../src/lib/agent/lead-intent";
import { isOffMarketPropertySearchEnabled } from "../src/lib/property-address/feature-flag";
import {
  SIGNUP_CLAIM_PROPERTY_EMAIL_CYCLE_KEY,
  SIGNUP_CLAIM_PROPERTY_SMS_CYCLE_KEY,
  SIGNUP_QUALIFICATION_EMAIL_CYCLE_KEY,
} from "../src/lib/notifications/signup-lead-notify";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testSellerTimeframeIsolation() {
  const values = SELLER_TIMEFRAME_OPTIONS.map((o) => o.value);
  assert.ok(values.includes("JUST_EXPLORING"));
  assert.equal(parseSellerTimeframeChoice("NOW"), "NOW");

  const buyerCtx = {
    searchFilters: { city: "Toronto" },
    intent: "VIEW_LISTING",
  };

  const answered = mergeSellerTimeframeIntoCapture(buyerCtx, {
    kind: "answered",
    value: "THREE_TO_SIX_MONTHS",
  });
  assert.equal(answered.sellingTimeframeStatus, "answered");
  assert.equal(answered.sellingTimeframe, "THREE_TO_SIX_MONTHS");
  assert.deepEqual(answered.searchFilters, buyerCtx.searchFilters);
  assert.equal(answered.intent, "VIEW_LISTING");

  const exploring = mergeSellerTimeframeIntoCapture(buyerCtx, {
    kind: "exploring",
  });
  assert.equal(exploring.sellingTimeframeStatus, "exploring");
  assert.equal(exploring.sellingTimeframe, "JUST_EXPLORING");

  const skipped = mergeSellerTimeframeIntoCapture(buyerCtx, {
    kind: "skipped",
  });
  assert.equal(skipped.sellingTimeframeStatus, "skipped");
  assert.equal(skipped.sellingTimeframe, null);

  const answeredState = readSellerTimeframeState(answered as never);
  const exploringState = readSellerTimeframeState(exploring as never);
  const skippedState = readSellerTimeframeState(skipped as never);
  const unansweredState = readSellerTimeframeState({
    sellingTimeframeStatus: "unanswered",
    sellingTimeframe: null,
  } as never);

  assert.equal(
    formatSellerTimeframeState(answeredState),
    "Within 3–6 months",
  );
  assert.equal(
    formatSellerTimeframeState(exploringState),
    "Just exploring my options",
  );
  assert.equal(formatSellerTimeframeState(skippedState), "Skipped");
  assert.equal(formatSellerTimeframeState(unansweredState), null);
  assert.notEqual(
    formatSellerTimeframeState(exploringState),
    formatSellerTimeframeState(skippedState),
  );
  assert.notEqual(
    formatSellerTimeframeState(exploringState),
    formatSellerTimeframeState(unansweredState),
  );

  // Dual timeframe: buyer User.purchaseTimeframe independent of seller capture.
  assert.equal(
    sellerTimeframeLabel("ONE_TO_THREE_MONTHS"),
    "Within 3 months",
  );

  const qual = read("src/app/api/auth/qualification/route.ts");
  assert.ok(qual.includes("mergeSellerTimeframeIntoCapture"));
  assert.ok(qual.includes("Never write User.purchaseTimeframe"));
  // Seller step must not update User.purchaseTimeframe.
  const sellingBlock = qual.slice(
    qual.indexOf('case "sellingTimeframe"'),
    qual.indexOf('case "financing"'),
  );
  assert.equal(sellingBlock.includes("prisma.user.update"), false);
  assert.ok(sellingBlock.includes("captureContext"));

  console.log("[timeframe] isolation + exploring≠skipped PASS");
}

function testBuyerSellerDualIntent() {
  assert.equal(
    resolveLeadIntent({ isBuyer: true, isSeller: true }),
    "SELLER",
  );
  assert.equal(
    resolveLeadIntent({ isBuyer: true, isSeller: false }),
    "BUYER",
  );
  console.log("[intent] dual buyer+seller PASS");
}

async function testAreaWatchDedup() {
  const rows: Array<{
    userId: string;
    city: string;
    community: string | null;
    transactionType: "SALE";
    segment: "RESIDENTIAL";
    id: string;
  }> = [];
  let creates = 0;
  const store = {
    findEquivalent: async (c: {
      userId: string;
      city: string;
      community: string | null;
      transactionType: "SALE";
      segment: "RESIDENTIAL";
    }) =>
      rows.find(
        (r) =>
          r.userId === c.userId &&
          r.city === c.city &&
          r.community === c.community &&
          r.transactionType === c.transactionType &&
          r.segment === c.segment,
      ) ?? null,
    create: async (data: {
      userId: string;
      city: string;
      community: string | null;
      transactionType: "SALE";
      segment: "RESIDENTIAL";
      emailAlerts: boolean;
      lastSeenListingAt: Date;
      notifyNew: boolean;
      notifySold: boolean;
    }) => {
      creates += 1;
      const item = {
        id: `am-${creates}`,
        userId: data.userId,
        city: data.city,
        community: data.community,
        transactionType: data.transactionType,
        segment: data.segment,
      };
      rows.push(item);
      return item as never;
    },
  };

  const first = await createOrReuseAreaMonitor(store, {
    userId: "u1",
    city: "Kitchener",
    community: null,
    transactionType: "SALE",
    segment: "RESIDENTIAL",
    emailAlerts: true,
    notifyNew: true,
    notifySold: true,
    lastSeenListingAt: new Date(),
  });
  assert.equal(first.alreadyWatching, false);
  const second = await createOrReuseAreaMonitor(store, {
    userId: "u1",
    city: "Kitchener",
    community: null,
    transactionType: "SALE",
    segment: "RESIDENTIAL",
    emailAlerts: true,
    notifyNew: true,
    notifySold: true,
    lastSeenListingAt: new Date(),
  });
  assert.equal(second.alreadyWatching, true);
  assert.equal(creates, 1);
  console.log("[area-watch] dedupe PASS");
}

function testFeatureFlagDefaultOff() {
  const prev = process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED;
  delete process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED;
  assert.equal(isOffMarketPropertySearchEnabled(), false);
  process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED = "0";
  assert.equal(isOffMarketPropertySearchEnabled(), false);
  if (prev === undefined) {
    delete process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED;
  } else {
    process.env.NEXT_PUBLIC_OFF_MARKET_PROPERTY_SEARCH_ENABLED = prev;
  }
  console.log("[flag] default OFF PASS");
}

function testAgentNotifyTiming() {
  assert.equal(SIGNUP_CLAIM_PROPERTY_EMAIL_CYCLE_KEY, "claim_address:email");
  assert.equal(SIGNUP_CLAIM_PROPERTY_SMS_CYCLE_KEY, "claim_address:sms");
  assert.equal(SIGNUP_QUALIFICATION_EMAIL_CYCLE_KEY, "qualification:email");
  assert.notEqual(
    SIGNUP_CLAIM_PROPERTY_EMAIL_CYCLE_KEY,
    SIGNUP_QUALIFICATION_EMAIL_CYCLE_KEY,
  );

  const notify = read("src/lib/notifications/signup-lead-notify.ts");
  assert.ok(notify.includes("scheduleSellerClaimPropertyNotify"));
  assert.ok(notify.includes("claim_address:email"));
  assert.ok(notify.includes('mode === "claim"'));
  assert.ok(notify.includes("readSellerTimeframeState"));
  assert.equal(notify.includes("scheduleAgentNewLeadSignupSms"), false);

  const qual = read("src/app/api/auth/qualification/route.ts");
  assert.ok(qual.includes("scheduleSellerClaimPropertyNotify"));
  assert.ok(qual.includes("!claimed.alreadyClaimed"));
  // Claim notify only on seller entry (propertyPath), after persistence.
  assert.ok(qual.includes("sellerClaimEntry"));

  const signup = read("src/components/auth/SignUpForm.tsx");
  assert.ok(signup.includes('intent: "seller"'));
  assert.ok(signup.includes('step: "claimAddress"'));
  assert.ok(signup.includes("houzzat:lead-captured"));

  console.log("[notify] claim update ≠ new-lead cycle keys PASS");
}

function testStrictSellerAddressVerification() {
  const apply = read("src/lib/property-address/apply-seller-claim.ts");
  assert.ok(apply.includes("requireCanonicalResolve"));
  assert.ok(apply.includes("retryable"));
  assert.ok(apply.includes("streetNumber"));
  assert.ok(apply.includes("streetName"));
  // Soft Ontario-coords path only when requireCanonical is false.
  assert.ok(apply.includes("!requireCanonical"));
  assert.ok(apply.includes("Buyer funnel only"));

  const qual = read("src/app/api/auth/qualification/route.ts");
  assert.ok(qual.includes("requireCanonicalResolve: sellerClaimEntry"));

  const funnel = read("src/components/auth/lead-funnel/LeadCaptureFunnel.tsx");
  assert.ok(funnel.includes("claimAppliedRef.current = true"));
  assert.ok(funnel.includes("if (ok) claimAppliedRef.current = true"));

  console.log("[address] strict seller + buyer soft preserved PASS");
}

function testUnitAndTenantGuards() {
  const apply = read("src/lib/property-address/apply-seller-claim.ts");
  assert.ok(apply.includes("homeUnit: unit"));
  assert.ok(apply.includes("workspaceId: input.workspaceId"));
  assert.equal(apply.includes("ownershipVerified"), false);

  const profile = read("src/app/(marketing)/property/[slug]/page.tsx");
  assert.ok(profile.includes("isOffMarketPropertySearchEnabled"));
  assert.ok(profile.includes("notFound()"));

  const crm = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2InfoPanel.tsx",
  );
  assert.ok(crm.includes("Selling timeframe"));
  assert.ok(crm.includes("Buying timeframe"));
  assert.ok(crm.includes("readSellerTimeframeState"));

  console.log("[guards] unit + tenant + CRM dual timeframe PASS");
}

function testBuyerQualificationRegression() {
  const funnel = read("src/components/auth/lead-funnel/LeadCaptureFunnel.tsx");
  assert.ok(funnel.includes("Do you currently own a home?"));
  assert.ok(funnel.includes("When are you planning to buy?"));
  assert.ok(funnel.includes("Have you been pre-approved for a mortgage?"));
  assert.ok(funnel.includes("void finish()"));
  assert.ok(funnel.includes('go("claimAddress")'));

  const qual = read("src/app/api/auth/qualification/route.ts");
  assert.ok(qual.includes('step: z.literal("timeframe")'));
  assert.ok(qual.includes("Invalid buying timeframe."));
  assert.ok(qual.includes('data.purchaseTimeframe === "NOW"'));
  // Buyer timeframe still writes User.purchaseTimeframe.
  const buyBlock = qual.slice(
    qual.indexOf('case "timeframe"'),
    qual.indexOf('case "sellingTimeframe"'),
  );
  assert.ok(buyBlock.includes("prisma.user.update"));
  assert.ok(buyBlock.includes("purchaseTimeframe"));

  console.log("[buyer] qualification path unchanged PASS");
}

function testSourceGuards() {
  assert.ok(
    existsSync(join(root, "src/lib/property-address/apply-seller-claim.ts")),
  );
  assert.ok(
    existsSync(join(root, "src/lib/property-address/seller-timeframe.ts")),
  );
  assert.equal(
    existsSync(join(root, "src/app/api/auth/seller-claim/route.ts")),
    false,
  );
  console.log("[source] no parallel seller stack PASS");
}

async function main() {
  testSourceGuards();
  testSellerTimeframeIsolation();
  testBuyerSellerDualIntent();
  await testAreaWatchDedup();
  testFeatureFlagDefaultOff();
  testAgentNotifyTiming();
  testStrictSellerAddressVerification();
  testUnitAndTenantGuards();
  testBuyerQualificationRegression();
  console.log("seller-claim-registration-selftest: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
