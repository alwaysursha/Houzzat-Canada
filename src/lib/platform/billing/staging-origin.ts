/**
 * One optional HTTPS origin for a separately hosted HouzzatPRO staging deployment.
 * Absent or blank preserves production hostname and offer-link behavior.
 */

export const HOUZZATPRO_STAGING_ORIGIN_ENV = "HOUZZATPRO_STAGING_ORIGIN";

/** Customer offer links when no staging origin is configured. */
export const PRODUCTION_PRIVATE_OFFER_ORIGIN = "https://houzzatpro.com";

export class StagingBillingSafetyError extends Error {
  readonly code = "STAGING_BILLING_UNSAFE";

  constructor(message: string) {
    super(message);
    this.name = "StagingBillingSafetyError";
  }
}

export type StagingOriginState =
  | { status: "absent" }
  | { status: "configured"; origin: string; hostname: string }
  | { status: "invalid" };

function isProductionPlatformHostname(hostname: string): boolean {
  if (
    hostname === "houzzatpro.com" ||
    hostname === "www.houzzatpro.com" ||
    hostname === "app.houzzatpro.com" ||
    hostname === "houzzat.com" ||
    hostname === "www.houzzat.com"
  ) {
    return true;
  }
  return hostname.endsWith(".houzzatpro.com") || hostname.endsWith(".houzzat.com");
}

/**
 * Parse HOUZZATPRO_STAGING_ORIGIN.
 * Blank is absent. A non-empty value that is not one exact https origin is invalid.
 */
export function readHouzzatProStagingOrigin(
  env: NodeJS.ProcessEnv = process.env,
): StagingOriginState {
  const raw = env.HOUZZATPRO_STAGING_ORIGIN;
  if (typeof raw !== "string") return { status: "absent" };
  const trimmed = raw.trim();
  if (!trimmed) return { status: "absent" };
  if (/[\s,*]/.test(trimmed)) return { status: "invalid" };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { status: "invalid" };
  }

  if (parsed.protocol !== "https:") return { status: "invalid" };
  if (parsed.username || parsed.password) return { status: "invalid" };
  if (parsed.port !== "") return { status: "invalid" };
  if (parsed.search || parsed.hash) return { status: "invalid" };
  if (parsed.pathname !== "/" && parsed.pathname !== "") return { status: "invalid" };

  const canonical = parsed.origin;
  if (trimmed !== canonical && trimmed !== `${canonical}/`) return { status: "invalid" };

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || isProductionPlatformHostname(hostname)) return { status: "invalid" };

  return {
    status: "configured",
    origin: canonical,
    hostname,
  };
}

/**
 * Offer-link origin. Production stays https://houzzatpro.com.
 * An invalid staging value fails closed and does not fall back to production.
 */
export function privateOfferPublicOrigin(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const staging = readHouzzatProStagingOrigin(env);
  switch (staging.status) {
    case "absent":
      return PRODUCTION_PRIVATE_OFFER_ORIGIN;
    case "configured":
      return staging.origin;
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
