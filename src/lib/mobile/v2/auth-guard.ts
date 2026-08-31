/**
 * Stage 4.1 — Mobile v2 Request Authentication Resolver.
 * Extracts and verifies Bearer token from incoming mobile requests.
 */

import { verifyMobileToken, type MobileTokenPayload } from "./tokens";

export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7).trim();
}

export function authenticateMobileRequest(
  request: Request,
  expectedType?: "mobile_platform_access" | "mobile_workspace_access",
): { ok: true; payload: MobileTokenPayload } | { ok: false; error: string; status: number } {
  const token = extractBearerToken(request);
  if (!token) {
    return { ok: false, error: "Missing authorization bearer token", status: 401 };
  }

  const result = verifyMobileToken(token);
  if (!result.ok) {
    return { ok: false, error: result.error, status: 401 };
  }

  if (expectedType && result.payload.type !== expectedType && result.payload.type !== "mobile_workspace_access") {
    return { ok: false, error: "Invalid token type for endpoint", status: 403 };
  }

  return { ok: true, payload: result.payload };
}
