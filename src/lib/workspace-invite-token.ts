/**
 * Stage 3I.1 — WorkspaceInvite token hashing (raw never persisted).
 *
 * Email receives rawToken; DB `token` column stores SHA-256 hex of raw.
 * OrganizationInvite flow is untouched (still plaintext cuid).
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createWorkspaceInviteRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashWorkspaceInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/** Compare two hex digests in constant time (equal length required). */
export function workspaceInviteHashesEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length || bufA.length === 0) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/** @deprecated Use createWorkspaceInviteRawToken — name kept for selftest imports. */
export function createWorkspaceInviteToken(): string {
  return createWorkspaceInviteRawToken();
}
