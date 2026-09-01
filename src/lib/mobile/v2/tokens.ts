/**
 * Stage 4.1 — HouzzatPRO Mobile v2 Cryptographic Token Engine.
 *
 * Implements high-security, compact HMAC-SHA256 tokens for native Mobile v2 auth.
 * Supports:
 * - Short-lived platform & workspace access tokens (15m default)
 * - Long-lived revocable refresh credentials (30d default) with SHA-256 hash tracking
 * - Explicit claims typing: userId, email, workspaceId, workspaceRole, tokenType, jti, exp
 */

import { createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { WorkspaceMemberRole } from "@prisma/client";

export type MobileTokenType = "mobile_platform_access" | "mobile_workspace_access" | "mobile_refresh";

export interface MobileTokenPayload {
  sub: string; // userId
  email: string;
  type: MobileTokenType;
  jti: string; // unique session/token ID
  iat: number; // unix seconds
  exp: number; // unix seconds
  wsId?: string; // workspaceId (only for mobile_workspace_access)
  role?: WorkspaceMemberRole; // WorkspaceMember.role (only for mobile_workspace_access)
}

const ACCESS_TOKEN_TTL_SEC = 15 * 60; // 15 minutes (silently refreshed by the app)
/** Sliding refresh lifetime — each successful refresh extends another year. */
const REFRESH_TOKEN_TTL_SEC = 365 * 24 * 60 * 60; // 365 days

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[mobile-tokens] AUTH_SECRET is not configured");
    }
    return "dev_houzzatpro_mobile_v2_fallback_secret_32bytes_min!";
  }
  return secret;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf8");
}

/**
 * Sign a payload into a standard 3-part HMAC-SHA256 JWT string.
 */
export function signMobileToken(payload: MobileTokenPayload): string {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const secret = getAuthSecret();
  const signature = createHmac("sha256", secret)
    .update(data)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${data}.${signature}`;
}

/**
 * Verify and decode an HMAC-SHA256 JWT string.
 */
export function verifyMobileToken(token: string): { ok: true; payload: MobileTokenPayload } | { ok: false; error: string } {
  if (!token || typeof token !== "string") {
    return { ok: false, error: "Missing token" };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, error: "Malformed token" };
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;
  const secret = getAuthSecret();

  const expectedSig = createHmac("sha256", secret)
    .update(data)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, error: "Invalid signature" };
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as MobileTokenPayload;
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return { ok: false, error: "Token expired" };
    }

    return { ok: true, payload };
  } catch {
    return { ok: false, error: "Invalid token payload" };
  }
}

/**
 * Mint a short-lived Platform Access Token.
 */
export function createPlatformAccessToken(user: { id: string; email: string }): { token: string; expiresAt: number } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ACCESS_TOKEN_TTL_SEC;
  const jti = randomBytes(16).toString("hex");

  const payload: MobileTokenPayload = {
    sub: user.id,
    email: user.email,
    type: "mobile_platform_access",
    jti,
    iat: now,
    exp,
  };

  return {
    token: signMobileToken(payload),
    expiresAt: exp * 1000,
  };
}

/**
 * Mint a short-lived Workspace Access Token bound strictly to userId + workspaceId + WorkspaceMember.role.
 */
export function createWorkspaceAccessToken(input: {
  userId: string;
  email: string;
  workspaceId: string;
  role: WorkspaceMemberRole;
}): { token: string; expiresAt: number } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ACCESS_TOKEN_TTL_SEC;
  const jti = randomBytes(16).toString("hex");

  const payload: MobileTokenPayload = {
    sub: input.userId,
    email: input.email,
    wsId: input.workspaceId,
    role: input.role,
    type: "mobile_workspace_access",
    jti,
    iat: now,
    exp,
  };

  return {
    token: signMobileToken(payload),
    expiresAt: exp * 1000,
  };
}

/**
 * Mint a revocable Mobile Refresh Token.
 */
export function createMobileRefreshToken(user: { id: string; email: string }): { token: string; jti: string; expiresAt: number } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + REFRESH_TOKEN_TTL_SEC;
  const jti = randomBytes(24).toString("hex");

  const payload: MobileTokenPayload = {
    sub: user.id,
    email: user.email,
    type: "mobile_refresh",
    jti,
    iat: now,
    exp,
  };

  return {
    token: signMobileToken(payload),
    jti,
    expiresAt: exp * 1000,
  };
}

/**
 * Cryptographic hash of refresh token for revokable lookup / session storage.
 */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
