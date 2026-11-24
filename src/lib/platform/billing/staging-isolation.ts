/**
 * Fail closed when a staging origin is configured without the approved Neon
 * endpoints or with live Stripe keys. No-op when staging is not configured.
 * Error text never includes credentials or connection strings.
 */

import {
  readHouzzatProStagingOrigin,
  StagingBillingSafetyError,
} from "@/lib/platform/billing/staging-origin";

/** Approved HouzzatPRO Stripe staging compute. Hosts only — no credentials. */
export const STAGING_NEON_ENDPOINT_ID = "ep-long-dream-ax61gtv6";

const STAGING_NEON_HOST_SUFFIX = ".c-4.us-east-2.aws.neon.tech";

export const STAGING_NEON_POOLED_HOST =
  `${STAGING_NEON_ENDPOINT_ID}-pooler${STAGING_NEON_HOST_SUFFIX}`;

export const STAGING_NEON_DIRECT_HOST =
  `${STAGING_NEON_ENDPOINT_ID}${STAGING_NEON_HOST_SUFFIX}`;

const STAGING_DATABASE_NOT_CONFIGURED = "Staging database is not configured.";
const STAGING_DATABASE_NOT_APPROVED = "Staging database URL is not approved.";

function databaseHostname(connectionString: string): string | null {
  try {
    const hostname = new URL(connectionString).hostname.toLowerCase();
    return hostname || null;
  } catch {
    return null;
  }
}

function assertStagingOriginConfigured(
  env: NodeJS.ProcessEnv,
): { status: "absent" } | { status: "configured" } {
  const staging = readHouzzatProStagingOrigin(env);
  switch (staging.status) {
    case "absent":
      return { status: "absent" };
    case "configured":
      return { status: "configured" };
    case "invalid":
      throw new StagingBillingSafetyError(
        "HOUZZATPRO_STAGING_ORIGIN is invalid.",
      );
    default: {
      const _exhaustive: never = staging;
      void _exhaustive;
      throw new StagingBillingSafetyError(
        "HOUZZATPRO_STAGING_ORIGIN is invalid.",
      );
    }
  }
}

/**
 * Staging must use sk_test_ and pk_test_.
 * Only STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY are read.
 */
export function assertStagingStripeCredentials(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const staging = assertStagingOriginConfigured(env);
  if (staging.status === "absent") return;

  const secret = env.STRIPE_SECRET_KEY?.trim() ?? "";
  const publishable = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
  if (secret.startsWith("sk_live_") || !secret.startsWith("sk_test_")) {
    throw new StagingBillingSafetyError(
      "Staging requires a Stripe test secret key.",
    );
  }
  if (publishable.startsWith("pk_live_") || !publishable.startsWith("pk_test_")) {
    throw new StagingBillingSafetyError(
      "Staging requires a Stripe test publishable key.",
    );
  }
}

function assertApprovedDatabaseHost(
  connectionString: string,
  approvedHost: string,
): void {
  if (!connectionString) {
    throw new StagingBillingSafetyError(STAGING_DATABASE_NOT_CONFIGURED);
  }
  const hostname = databaseHostname(connectionString);
  if (hostname !== approvedHost) {
    throw new StagingBillingSafetyError(STAGING_DATABASE_NOT_APPROVED);
  }
}

/**
 * Staging runtime uses the pooled endpoint. Migrations use the direct endpoint.
 * Any other host, including production and a swapped pair, is rejected.
 */
export function assertStagingDatabaseIsolation(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const staging = assertStagingOriginConfigured(env);
  if (staging.status === "absent") return;

  assertApprovedDatabaseHost(
    env.DATABASE_URL?.trim() ?? "",
    STAGING_NEON_POOLED_HOST,
  );
  assertApprovedDatabaseHost(
    env.DIRECT_URL?.trim() ?? "",
    STAGING_NEON_DIRECT_HOST,
  );
}

/**
 * The connection string a Prisma client is about to open.
 * Also checks DATABASE_URL and DIRECT_URL.
 */
export function assertStagingConnectionString(
  connectionString: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const staging = readHouzzatProStagingOrigin(env);
  if (staging.status === "absent") return;
  assertStagingDatabaseIsolation(env);
  assertApprovedDatabaseHost(connectionString.trim(), STAGING_NEON_POOLED_HOST);
}

/** Database isolation and test-mode Stripe keys before any billing read or write. */
export function assertStagingBillingIsolation(
  env: NodeJS.ProcessEnv = process.env,
): void {
  assertStagingDatabaseIsolation(env);
  assertStagingStripeCredentials(env);
}
