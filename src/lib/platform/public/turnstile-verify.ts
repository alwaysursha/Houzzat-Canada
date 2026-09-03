/**
 * Stage 6.6B.1 — Cloudflare Turnstile server verification for Book a Demo.
 * Fail closed. Secret never leaves the server.
 */

import {
  BOOK_DEMO_TURNSTILE_ACTION,
  BOOK_DEMO_TURNSTILE_ALLOWED_HOSTNAMES,
  BOOK_DEMO_TURNSTILE_ERROR_MESSAGE,
  TURNSTILE_TEST_SECRET_KEY_PASS,
} from "@/lib/platform/public/turnstile-constants";
import { BookDemoPublicError } from "@/lib/platform/public/book-demo";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileSiteverifyResponse = {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
};

export type VerifyTurnstileInput = {
  token: string;
  remoteIp?: string | null;
  /** Override for tests — never use in production handlers without injection. */
  secret?: string;
  fetchImpl?: typeof fetch;
};

function readTurnstileSecret(): string | null {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  return secret || null;
}

/**
 * Site key for the browser widget. Public by design.
 * Prefers NEXT_PUBLIC_TURNSTILE_SITE_KEY (Stage 6.6B.1 naming).
 */
export function readTurnstileSiteKey(): string | null {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  return siteKey || null;
}

function isHostnameAllowed(hostname: string | undefined): boolean {
  if (!hostname) return false;
  const normalized = hostname.trim().toLowerCase();
  if (
    (BOOK_DEMO_TURNSTILE_ALLOWED_HOSTNAMES as readonly string[]).includes(
      normalized,
    )
  ) {
    return true;
  }
  // Cloudflare dummy keys return "localhost" (or similar) during local/test use.
  if (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0"
  ) {
    return true;
  }
  return false;
}

export function assertTurnstileSiteverifyContext(
  result: TurnstileSiteverifyResponse,
): void {
  if (!result.success) {
    throw new BookDemoPublicError(
      BOOK_DEMO_TURNSTILE_ERROR_MESSAGE,
      "TURNSTILE_FAILED",
      400,
    );
  }
  if (!isHostnameAllowed(result.hostname)) {
    throw new BookDemoPublicError(
      BOOK_DEMO_TURNSTILE_ERROR_MESSAGE,
      "TURNSTILE_HOSTNAME_MISMATCH",
      400,
    );
  }
  const action = result.action?.trim();
  if (action) {
    const hostname = (result.hostname ?? "").trim().toLowerCase();
    const localHost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0";
    // Cloudflare dummy keys may echo action "test"; production widgets must match.
    if (
      action !== BOOK_DEMO_TURNSTILE_ACTION &&
      !(localHost && action === "test")
    ) {
      throw new BookDemoPublicError(
        BOOK_DEMO_TURNSTILE_ERROR_MESSAGE,
        "TURNSTILE_ACTION_MISMATCH",
        400,
      );
    }
  }
}

/**
 * Verify a Turnstile response token with Cloudflare siteverify.
 * Fail closed on missing secret, network errors, or invalid tokens.
 */
export async function verifyTurnstileToken(
  input: VerifyTurnstileInput,
): Promise<TurnstileSiteverifyResponse> {
  const token = input.token?.trim();
  if (!token) {
    throw new BookDemoPublicError(
      BOOK_DEMO_TURNSTILE_ERROR_MESSAGE,
      "TURNSTILE_REQUIRED",
      400,
    );
  }

  const secret = input.secret?.trim() || readTurnstileSecret();
  if (!secret) {
    console.error(
      "[platform-public-book-demo] TURNSTILE_SECRET_KEY is not configured",
    );
    throw new BookDemoPublicError(
      BOOK_DEMO_TURNSTILE_ERROR_MESSAGE,
      "TURNSTILE_NOT_CONFIGURED",
      503,
    );
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (input.remoteIp?.trim()) {
    body.set("remoteip", input.remoteIp.trim());
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (error) {
    console.error("[platform-public-book-demo] turnstile siteverify network", error);
    throw new BookDemoPublicError(
      BOOK_DEMO_TURNSTILE_ERROR_MESSAGE,
      "TURNSTILE_UNAVAILABLE",
      503,
    );
  }

  if (!response.ok) {
    console.error(
      "[platform-public-book-demo] turnstile siteverify HTTP",
      response.status,
    );
    throw new BookDemoPublicError(
      BOOK_DEMO_TURNSTILE_ERROR_MESSAGE,
      "TURNSTILE_UNAVAILABLE",
      503,
    );
  }

  let result: TurnstileSiteverifyResponse;
  try {
    result = (await response.json()) as TurnstileSiteverifyResponse;
  } catch {
    throw new BookDemoPublicError(
      BOOK_DEMO_TURNSTILE_ERROR_MESSAGE,
      "TURNSTILE_UNAVAILABLE",
      503,
    );
  }

  assertTurnstileSiteverifyContext(result);
  return result;
}

/** Selftest helper — always-pass dummy secret from Cloudflare docs. */
export function turnstileTestPassSecret(): string {
  return TURNSTILE_TEST_SECRET_KEY_PASS;
}
