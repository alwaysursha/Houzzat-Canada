/**
 * Client-side token helpers for test verification & payload inspection.
 */

import { createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { MobileWorkspaceRole } from "./workspace";

export type MobileTokenType = "mobile_platform_access" | "mobile_workspace_access" | "mobile_refresh";

export interface MobileTokenPayload {
  sub: string;
  email: string;
  type: MobileTokenType;
  jti: string;
  iat: number;
  exp: number;
  wsId?: string;
  role?: MobileWorkspaceRole;
}

const ACCESS_TOKEN_TTL_SEC = 15 * 60;
const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

function getAuthSecret(): string {
  return process.env.AUTH_SECRET || "dev_houzzatpro_mobile_v2_fallback_secret_32bytes_min!";
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

export function verifyMobileToken(token: string): { ok: true; payload: MobileTokenPayload } | { ok: false; error: string } {
  if (!token) return { ok: false, error: "Missing token" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "Malformed token" };

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
    return { ok: true, payload };
  } catch {
    return { ok: false, error: "Invalid token payload" };
  }
}

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

  return { token: signMobileToken(payload), expiresAt: exp * 1000 };
}

export function createWorkspaceAccessToken(input: {
  userId: string;
  email: string;
  workspaceId: string;
  role: MobileWorkspaceRole;
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

  return { token: signMobileToken(payload), expiresAt: exp * 1000 };
}

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

  return { token: signMobileToken(payload), jti, expiresAt: exp * 1000 };
}

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
