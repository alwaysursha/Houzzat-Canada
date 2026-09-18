/** Reject open redirects; allow same-site relative paths only. */
export function safeInternalCallbackUrl(
  raw: string | null | undefined,
  fallback = "/",
): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }
  return trimmed;
}

/**
 * Destination after modal sign-in/sign-up.
 * Null means stay on the current page (header Sign in, no callback).
 * Rejects /auth/* so the user cannot bounce back into the bridge.
 */
export function authSuccessReturnPath(
  callbackUrl: string | null | undefined,
): string | null {
  if (!callbackUrl) return null;
  const dest = safeInternalCallbackUrl(callbackUrl, "");
  if (!dest || dest.startsWith("/auth")) return null;
  return dest;
}
