/** Client-safe Turnstile constants for Book a Demo. Never put the secret here. */

export const BOOK_DEMO_TURNSTILE_ACTION = "houzzatpro_book_demo";

export const BOOK_DEMO_TURNSTILE_ERROR_MESSAGE =
  "Please complete the security verification and try again.";

/** Hostnames allowed in siteverify `hostname` for production widgets. */
export const BOOK_DEMO_TURNSTILE_ALLOWED_HOSTNAMES = [
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
