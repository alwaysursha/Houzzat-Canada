/**
 * Staging host and billing isolation.
 * No Stripe API calls. No database connections.
 *
 * Run: pnpm houzzatpro-staging-billing-safety:selftest
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { createCheckoutForAcceptedOffer } from "../src/lib/platform/billing/checkout";
import { resolveCheckoutPaymentStatus } from "../src/lib/platform/billing/checkout-payment-status";
import { clearStripeClientCacheForTests, getStripeClient } from "../src/lib/platform/billing/stripe-client";
import {
  isStripeBillingConfigured,
  readStripeSecretKey,
} from "../src/lib/platform/billing/stripe-env";
import { isHouzzatProCommercialBillingHost } from "../src/lib/platform/billing/commercial-billing-host";
import {
  assertStagingBillingIsolation,
  assertStagingConnectionString,
  assertStagingDatabaseIsolation,
} from "../src/lib/platform/billing/staging-isolation";
import {
  StagingBillingSafetyError,
  privateOfferPublicOrigin,
} from "../src/lib/platform/billing/staging-origin";
import { processStripeWebhook } from "../src/lib/platform/billing/webhook";
import { acceptPrivateOfferByRawToken } from "../src/lib/platform/offers/accept";
import { buildPrivateOfferUrl } from "../src/lib/platform/offers/constants";
import { resolvePrivateOfferByRawToken } from "../src/lib/platform/offers/private-offer";
import { isHouzzatProPlatformRoot } from "../src/lib/tenancy/platform-hostname";

const STAGING_ORIGIN = "https://houzzatpro-stripe-staging.example";
const STAGING_HOST = "houzzatpro-stripe-staging.example";
const TOKEN = "a".repeat(32);
const PRODUCTION_POOLED =
  "postgresql://staging-safety:invalid@ep-snowy-river-axfgwomo-pooler.c-4.us-east-2.aws.neon.tech/neondb";
const PRODUCTION_DIRECT =
  "postgresql://staging-safety:invalid@ep-snowy-river-axfgwomo.c-4.us-east-2.aws.neon.tech/neondb";
const STAGING_DATABASE =
  "postgresql://staging-safety:ep-snowy-river-axfgwomo@ep-long-dream-ax61gtv6-pooler.c-4.us-east-2.aws.neon.tech/neondb";
const STAGING_DIRECT =
  "postgresql://staging-safety:invalid@ep-long-dream-ax61gtv6.c-4.us-east-2.aws.neon.tech/neondb";

const ENV_KEYS = [
  "HOUZZATPRO_STAGING_ORIGIN",
  "DATABASE_URL",
  "DIRECT_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_LIVE_SECRET_KEY",
] as const;

function snapshotEnv(): Map<string, string | undefined> {
  return new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(previous: Map<string, string | undefined>): void {
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  clearStripeClientCacheForTests();
}

function applyEnv(values: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function rejectsBeforeRecordAccess(
  run: (prisma: PrismaClient) => Promise<unknown>,
): Promise<void> {
  let touched = false;
  const prisma = new Proxy({} as PrismaClient, {
    get() {
      touched = true;
      throw new Error("production record access");
    },
  });
  await assert.rejects(run(prisma), (error: unknown) => {
    assert.equal(touched, false);
    assert.ok(error instanceof StagingBillingSafetyError);
    assert.equal(
      error.message,
      "Staging database URL is not approved.",
    );
    assert.equal(error.message.includes("postgresql://"), false);
    return true;
  });
  assert.equal(touched, false);
}

async function main() {
  const previous = snapshotEnv();
  try {
    applyEnv({
      HOUZZATPRO_STAGING_ORIGIN: undefined,
      DATABASE_URL: undefined,
      DIRECT_URL: undefined,
      STRIPE_SECRET_KEY: undefined,
      STRIPE_WEBHOOK_SECRET: undefined,
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: undefined,
      STRIPE_LIVE_SECRET_KEY: undefined,
    });

    assert.equal(isHouzzatProPlatformRoot("houzzatpro.com"), true);
    assert.equal(isHouzzatProPlatformRoot("www.houzzatpro.com"), true);
    assert.equal(isHouzzatProPlatformRoot("app.houzzatpro.com"), false);
    assert.equal(
      isHouzzatProCommercialBillingHost("houzzatpro.com", {}),
      true,
    );
    assert.equal(
      isHouzzatProCommercialBillingHost("www.houzzatpro.com", {}),
      true,
    );
    assert.equal(
      isHouzzatProCommercialBillingHost("HOUZZATPRO.COM", {}),
      true,
    );
    assert.equal(
      isHouzzatProCommercialBillingHost(STAGING_HOST, {}),
      false,
    );
    assert.equal(
      isHouzzatProCommercialBillingHost("app.houzzatpro.com", {}),
      false,
    );
    assert.equal(
      isHouzzatProCommercialBillingHost(
        "high-octane-real-estate.houzzatpro.com",
        {},
      ),
      false,
    );
    assert.equal(isHouzzatProCommercialBillingHost("example.com", {}), false);
    assert.equal(
      buildPrivateOfferUrl(TOKEN, {}),
      `https://houzzatpro.com/subscribe/${TOKEN}`,
    );
    assert.equal(privateOfferPublicOrigin({}), "https://houzzatpro.com");
    assert.doesNotThrow(() =>
      assertStagingDatabaseIsolation({
        DATABASE_URL: PRODUCTION_POOLED,
        DIRECT_URL: PRODUCTION_DIRECT,
      }),
    );
    assert.equal(
      readStripeSecretKey({ STRIPE_SECRET_KEY: "sk_live_production_example" }),
      "sk_live_production_example",
    );
    assert.equal(
      isStripeBillingConfigured({
        STRIPE_SECRET_KEY: "sk_live_production_example",
        STRIPE_WEBHOOK_SECRET: "whsec_production_example",
      }),
      true,
    );
    console.log("[1] Production hostname and billing behaviour preserved... PASS");

    const stagingEnv = {
      HOUZZATPRO_STAGING_ORIGIN: STAGING_ORIGIN,
    };
    assert.equal(
      isHouzzatProCommercialBillingHost(STAGING_HOST, stagingEnv),
      true,
    );
    assert.equal(
      isHouzzatProCommercialBillingHost(STAGING_HOST.toUpperCase(), stagingEnv),
      true,
    );
    assert.equal(
      isHouzzatProCommercialBillingHost("houzzatpro.com", stagingEnv),
      true,
    );
    assert.equal(
      isHouzzatProCommercialBillingHost("www.houzzatpro.com", stagingEnv),
      true,
    );
    assert.equal(
      buildPrivateOfferUrl(TOKEN, stagingEnv),
      `${STAGING_ORIGIN}/subscribe/${TOKEN}`,
    );
    assert.equal(
      buildPrivateOfferUrl(TOKEN, {
        HOUZZATPRO_STAGING_ORIGIN: `${STAGING_ORIGIN}/`,
      }),
      `${STAGING_ORIGIN}/subscribe/${TOKEN}`,
    );
    console.log("[2] Configured staging hostname and offer link... PASS");

    for (const origin of [
      "http://houzzatpro-stripe-staging.example",
      "https://houzzatpro.com",
      "https://www.houzzatpro.com",
      "https://app.houzzatpro.com",
      "https://high-octane-real-estate.houzzatpro.com",
      "https://houzzat.com",
      "https://*.vercel.app",
      "https://one.example,https://two.example",
      "https://houzzatpro-stripe-staging.example/subscribe",
      "https://user:secret@houzzatpro-stripe-staging.example",
      "https://other.example",
    ]) {
      const env = { HOUZZATPRO_STAGING_ORIGIN: origin };
      if (origin === "https://other.example") {
        assert.equal(
          isHouzzatProCommercialBillingHost(STAGING_HOST, env),
          false,
        );
        assert.equal(
          isHouzzatProCommercialBillingHost("other.example", env),
          true,
        );
        continue;
      }
      assert.equal(
        isHouzzatProCommercialBillingHost(STAGING_HOST, env),
        false,
        origin,
      );
      assert.equal(
        isHouzzatProCommercialBillingHost("evil.example", env),
        false,
        origin,
      );
      assert.throws(
        () => buildPrivateOfferUrl(TOKEN, env),
        (error: unknown) => {
          assert.ok(error instanceof StagingBillingSafetyError);
          assert.equal(
            (error as Error).message.includes("https://houzzatpro.com"),
            false,
          );
          return true;
        },
      );
    }
    assert.equal(
      isHouzzatProCommercialBillingHost(
        `preview.${STAGING_HOST}`,
        stagingEnv,
      ),
      false,
    );
    assert.equal(
      isHouzzatProCommercialBillingHost("app.houzzatpro.com", stagingEnv),
      false,
    );
    console.log("[3] Unauthorized hostnames rejected... PASS");

    const testKeys = {
      ...stagingEnv,
      STRIPE_SECRET_KEY: "sk_test_staging_example",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_staging_example",
      STRIPE_WEBHOOK_SECRET: "whsec_staging_example",
      STRIPE_LIVE_SECRET_KEY: "sk_live_must_not_be_read",
    };
    assert.equal(readStripeSecretKey(testKeys), "sk_test_staging_example");
    assert.equal(isStripeBillingConfigured(testKeys), true);
    assert.throws(
      () =>
        readStripeSecretKey({
          ...testKeys,
          STRIPE_SECRET_KEY: "sk_live_staging_rejected",
        }),
      (error: unknown) => error instanceof StagingBillingSafetyError,
    );
    assert.throws(
      () =>
        readStripeSecretKey({
          ...testKeys,
          STRIPE_SECRET_KEY: "",
        }),
      (error: unknown) => error instanceof StagingBillingSafetyError,
    );
    assert.throws(
      () =>
        readStripeSecretKey({
          ...stagingEnv,
          STRIPE_SECRET_KEY: "",
          NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_staging_example",
          STRIPE_LIVE_SECRET_KEY: "sk_test_decoy_not_used",
        }),
      (error: unknown) => error instanceof StagingBillingSafetyError,
    );
    assert.equal(
      isStripeBillingConfigured({
        ...testKeys,
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_staging_rejected",
      }),
      false,
    );
    assert.throws(
      () =>
        assertStagingBillingIsolation({
          ...testKeys,
          DATABASE_URL: STAGING_DATABASE,
          DIRECT_URL: STAGING_DIRECT,
          NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_staging_rejected",
        }),
      (error: unknown) => {
        assert.ok(error instanceof StagingBillingSafetyError);
        assert.match((error as Error).message, /test publishable key/);
        return true;
      },
    );
    applyEnv(testKeys);
    assert.throws(
      () => getStripeClient("sk_live_explicit_rejected"),
      (error: unknown) => error instanceof StagingBillingSafetyError,
    );
    console.log("[4] Live Stripe credentials rejected in staging... PASS");

    const approvedDatabaseEnv = {
      ...testKeys,
      DATABASE_URL: STAGING_DATABASE,
      DIRECT_URL: STAGING_DIRECT,
    };
    const archivedPooled =
      "postgresql://staging-safety:invalid@ep-red-credit-axp65p8a-pooler.c-4.us-east-2.aws.neon.tech/neondb";
    const archivedDirect =
      "postgresql://staging-safety:invalid@ep-red-credit-axp65p8a.c-4.us-east-2.aws.neon.tech/neondb";
    const unrelatedPooled =
      "postgresql://staging-safety:invalid@ep-plain-unit-ax000000-pooler.c-4.us-east-2.aws.neon.tech/neondb";
    const unrelatedDirect =
      "postgresql://staging-safety:invalid@ep-plain-unit-ax000000.c-4.us-east-2.aws.neon.tech/neondb";
    const lookalikePooled =
      "postgresql://staging-safety:invalid@ep-long-dream-ax61gtv6-pooler.example.com/neondb";

    function rejectsDatabase(env: NodeJS.ProcessEnv, message: string): void {
      assert.throws(
        () => assertStagingDatabaseIsolation(env),
        (error: unknown) => {
          assert.ok(error instanceof StagingBillingSafetyError);
          assert.equal((error as Error).message, message);
          assert.equal((error as Error).message.includes("postgresql://"), false);
          assert.equal((error as Error).message.includes("ep-"), false);
          return true;
        },
      );
    }

    assert.doesNotThrow(() => assertStagingDatabaseIsolation(approvedDatabaseEnv));
    assert.doesNotThrow(() =>
      assertStagingConnectionString(STAGING_DATABASE, approvedDatabaseEnv),
    );
    rejectsDatabase(
      { ...approvedDatabaseEnv, DATABASE_URL: PRODUCTION_POOLED },
      "Staging database URL is not approved.",
    );
    rejectsDatabase(
      { ...approvedDatabaseEnv, DIRECT_URL: PRODUCTION_DIRECT },
      "Staging database URL is not approved.",
    );
    rejectsDatabase(
      { ...approvedDatabaseEnv, DATABASE_URL: archivedPooled, DIRECT_URL: archivedDirect },
      "Staging database URL is not approved.",
    );
    rejectsDatabase(
      { ...approvedDatabaseEnv, DATABASE_URL: unrelatedPooled, DIRECT_URL: unrelatedDirect },
      "Staging database URL is not approved.",
    );
    rejectsDatabase(
      { ...approvedDatabaseEnv, DATABASE_URL: lookalikePooled },
      "Staging database URL is not approved.",
    );
    rejectsDatabase(
      { ...approvedDatabaseEnv, DATABASE_URL: STAGING_DIRECT, DIRECT_URL: STAGING_DATABASE },
      "Staging database URL is not approved.",
    );
    rejectsDatabase(
      { ...approvedDatabaseEnv, DATABASE_URL: "not-a-database-url" },
      "Staging database URL is not approved.",
    );
    rejectsDatabase(
      { ...approvedDatabaseEnv, DATABASE_URL: "" },
      "Staging database is not configured.",
    );
    rejectsDatabase(
      { ...approvedDatabaseEnv, DIRECT_URL: "" },
      "Staging database is not configured.",
    );
    assert.throws(
      () => assertStagingConnectionString(PRODUCTION_POOLED, approvedDatabaseEnv),
      (error: unknown) => {
        assert.ok(error instanceof StagingBillingSafetyError);
        assert.equal(
          (error as Error).message,
          "Staging database URL is not approved.",
        );
        return true;
      },
    );
    assert.throws(
      () => assertStagingConnectionString(STAGING_DIRECT, approvedDatabaseEnv),
      (error: unknown) => error instanceof StagingBillingSafetyError,
    );
    console.log("[5] Unapproved database endpoints rejected in staging... PASS");

    applyEnv({
      ...testKeys,
      DATABASE_URL: PRODUCTION_POOLED,
      DIRECT_URL: PRODUCTION_DIRECT,
    });
    await Promise.all([
      rejectsBeforeRecordAccess((prisma) =>
        createCheckoutForAcceptedOffer({
          rawToken: TOKEN,
          returnOrigin: STAGING_ORIGIN,
          prisma,
        }),
      ),
      rejectsBeforeRecordAccess((prisma) =>
        processStripeWebhook({
          rawBody: "{}",
          signatureHeader: "t=1,v1=abc",
          prisma,
          stripe: {
            webhooks: {
              constructEvent() {
                throw new Error("production record access");
              },
            },
          } as never,
        }),
      ),
      rejectsBeforeRecordAccess((prisma) =>
        resolvePrivateOfferByRawToken({ rawToken: TOKEN, prisma }),
      ),
      rejectsBeforeRecordAccess((prisma) =>
        acceptPrivateOfferByRawToken({
          rawToken: TOKEN,
          email: "buyer@example.com",
          acceptTerms: true,
          acceptPrivacy: true,
          acceptCommercialTerms: true,
          prisma,
        }),
      ),
      rejectsBeforeRecordAccess((prisma) =>
        resolveCheckoutPaymentStatus({
          stripeCheckoutSessionId: "cs_test_staging_blocked",
          prisma,
        }),
      ),
    ]);

    const checkout = readFileSync(
      join(process.cwd(), "src/lib/platform/billing/checkout.ts"),
      "utf8",
    );
    const subscriptionData = checkout.slice(
      checkout.indexOf("const subscriptionData"),
      checkout.indexOf("const createParams"),
    );
    assert.ok(subscriptionData.includes("offer.trialDays > 0"));
    assert.ok(
      subscriptionData.includes(
        "subscriptionData.trial_period_days = offer.trialDays",
      ),
    );
    assert.equal(subscriptionData.includes("billing_cycle_anchor"), false);
    assert.equal(subscriptionData.includes("trial_end"), false);
    assert.equal(subscriptionData.includes("proposedStartDate"), false);
    console.log("[6] Billing records untouched and billing cycle unchanged... PASS");
    console.log("houzzatpro staging billing safety selftest: all passed");
  } finally {
    restoreEnv(previous);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "selftest failed";
  console.error(message);
  process.exit(1);
});
