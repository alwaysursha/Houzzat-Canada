/**
 * Stage 3K.5.22 — Safe Server-Side Auth Diagnostics Buffer.
 *
 * In-memory ring buffer for safe runtime diagnostic tracing of authentication requests.
 * Zero secrets: NO passwords, NO hashes, NO emails, NO cookies, NO JWTs, NO handoff codes.
 */

export const AUTH_BUILD_MARKER = "STAGE_3K_5_22_PRO_AUTH_V1";

export type SafeAuthServerDiagnosticEvent = {
  diagId: string;
  timestamp: string;
  buildMarker: string;
  incomingHost: string | null;
  requestUrlHost: string | null;
  resolvedAuthHostname: string | null;
  isPlatformHost: boolean;
  nativeShell: boolean;
  userAgentSnippet: string | null;
  userFound: boolean;
  passwordMatch: "MATCH" | "NO_MATCH" | "SKIPPED";
  tenantValidationInvoked: boolean;
  tenantValidationReason: string;
  authorizeResult: "ACCEPT" | "REJECT";
  signInCallbackResult: "ALLOW" | "DENY" | "NOT_REACHED";
  userIdMasked: string | null;
};

const MAX_ENTRIES = 20;
const ringBuffer: SafeAuthServerDiagnosticEvent[] = [];

export function recordAuthServerDiagnostic(
  event: SafeAuthServerDiagnosticEvent,
): void {
  ringBuffer.unshift(event);
  if (ringBuffer.length > MAX_ENTRIES) {
    ringBuffer.pop();
  }
}

export function getRecentAuthServerDiagnostics(): SafeAuthServerDiagnosticEvent[] {
  return [...ringBuffer];
}
