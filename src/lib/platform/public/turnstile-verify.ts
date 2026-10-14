/**
 * Cloudflare Turnstile server verification for public forms.
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

export type AssertTurnstileContextOptions = {
  /** Defaults to Book a Demo action for backward compatibility. */
  expectedAction?: string;
  /** Defaults to Book a Demo hostname allowlist. */
  allowedHostnames?: readonly string[];
  /**
   * When set, siteverify hostname may match this request host
   * (supports custom tenant marketing domains).
   */
  requestHostname?: string | null;
  /** Generic client-facing message (defaults to Book a Demo copy). */
  errorMessage?: string;
};

export type VerifyTurnstileInput = {
  token: string;
  remoteIp?: string | null;
  /** Override for tests — never use in production handlers without injection. */
  secret?: string;
  fetchImpl?: typeof fetch;
  expectedAction?: string;
  allowedHostnames?: readonly string[];
  requestHostname?: string | null;
  errorMessage?: string;
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

function normalizeHostname(hostname: string | undefined | null): string {
  return (hostname ?? "").trim().toLowerCase().replace(/\.$/, "");
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0"
  );
}

function isHostnameAllowed(
  hostname: string | undefined,
  options?: AssertTurnstileContextOptions,
): boolean {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return false;
  if (isLocalHostname(normalized)) return true;

  const allowlist =
    options?.allowedHostnames ?? BOOK_DEMO_TURNSTILE_ALLOWED_HOSTNAMES;
  if (
    (allowlist as readonly string[]).includes(normalized)
  ) {
    return true;
  }

  const requestHost = normalizeHostname(options?.requestHostname ?? null);
  if (requestHost && requestHost === normalized) {
    return true;
  }

  return false;
}

export function assertTurnstileSiteverifyContext(
  result: TurnstileSiteverifyResponse,
  options?: AssertTurnstileContextOptions,
): void {
  const errorMessage =
    options?.errorMessage ?? BOOK_DEMO_TURNSTILE_ERROR_MESSAGE;
  const expectedAction =
    options?.expectedAction ?? BOOK_DEMO_TURNSTILE_ACTION;

  if (!result.success) {
    throw new BookDemoPublicError(errorMessage, "TURNSTILE_FAILED", 400);
  }
  if (!isHostnameAllowed(result.hostname, options)) {
    throw new BookDemoPublicError(
      errorMessage,
      "TURNSTILE_HOSTNAME_MISMATCH",
      400,
    );
  }
  const action = result.action?.trim() ?? "";
  const hostname = normalizeHostname(result.hostname);
  const localHost = isLocalHostname(hostname);
  // Fail closed when action is missing or mismatched. Dummy keys may echo "test".
  if (action !== expectedAction && !(localHost && action === "test")) {
    throw new BookDemoPublicError(
      errorMessage,
      "TURNSTILE_ACTION_MISMATCH",
      400,
    );
  }
}

/**
 * Verify a Turnstile response token with Cloudflare siteverify.
 * Fail closed on missing secret, network errors, or invalid tokens.
 */
export async function verifyTurnstileToken(
  input: VerifyTurnstileInput,
): Promise<TurnstileSiteverifyResponse> {
  const errorMessage =
    input.errorMessage ?? BOOK_DEMO_TURNSTILE_ERROR_MESSAGE;
  const token = input.token?.trim();
  if (!token) {
    throw new BookDemoPublicError(errorMessage, "TURNSTILE_REQUIRED", 400);
  }

  const secret = input.secret?.trim() || readTurnstileSecret();
  if (!secret) {
    console.error(
      "[turnstile] TURNSTILE_SECRET_KEY is not configured",
    );
    throw new BookDemoPublicError(
      errorMessage,
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
    console.error("[turnstile] siteverify network", error);
    throw new BookDemoPublicError(
      errorMessage,
      "TURNSTILE_UNAVAILABLE",
      503,
    );
  }

  if (!response.ok) {
    console.error("[turnstile] siteverify HTTP", response.status);
    throw new BookDemoPublicError(
      errorMessage,
      "TURNSTILE_UNAVAILABLE",
      503,
    );
  }

  let result: TurnstileSiteverifyResponse;
  try {
    result = (await response.json()) as TurnstileSiteverifyResponse;
  } catch {
    throw new BookDemoPublicError(
      errorMessage,
      "TURNSTILE_UNAVAILABLE",
      503,
    );
  }

  assertTurnstileSiteverifyContext(result, {
    expectedAction: input.expectedAction,
    allowedHostnames: input.allowedHostnames,
    requestHostname: input.requestHostname,
    errorMessage,
  });
  return result;
}

/** Selftest helper — always-pass dummy secret from Cloudflare docs. */
export function turnstileTestPassSecret(): string {
  return TURNSTILE_TEST_SECRET_KEY_PASS;
}

/** Hostname from public request (Cloudflare / proxy aware). */
export function hostnameFromPublicRequest(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-host");
  const host = (forwarded || request.headers.get("host") || "").trim();
  if (!host) return null;
  return normalizeHostname(host.split(",")[0]?.split(":")[0] ?? "");
}
