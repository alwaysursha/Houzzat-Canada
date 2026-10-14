/** Client-safe Turnstile constants. Never put the secret here. */

export const BOOK_DEMO_TURNSTILE_ACTION = "houzzatpro_book_demo";

export const BOOK_DEMO_TURNSTILE_ERROR_MESSAGE =
  "Please complete the security verification and try again.";

/** Hostnames allowed in siteverify `hostname` for Book a Demo widgets. */
export const BOOK_DEMO_TURNSTILE_ALLOWED_HOSTNAMES = [
  "houzzatpro.com",
  "www.houzzatpro.com",
] as const;

/** Seller Readiness / public tool lead forms (tenant marketing hosts). */
export const SELLER_READINESS_TURNSTILE_ACTION = "seller_readiness";

export const SELLER_READINESS_TURNSTILE_ERROR_MESSAGE =
  "Please complete the security verification and try again.";

/**
 * Baseline hostnames for Seller Readiness siteverify.
 * Custom tenant domains may also pass when they match the request Host.
 */
export const SELLER_READINESS_TURNSTILE_ALLOWED_HOSTNAMES = [
  "houzzat.com",
  "www.houzzat.com",
  "houzzatpro.com",
  "www.houzzatpro.com",
] as const;

/**
 * Cloudflare documented dummy keys for automated/local testing only.
 * @see https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
export const TURNSTILE_TEST_SITE_KEY_PASS = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET_KEY_PASS =
  "1x0000000000000000000000000000000AA";
export const TURNSTILE_TEST_SECRET_KEY_FAIL =
  "2x0000000000000000000000000000000AA";
export const TURNSTILE_TEST_DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
