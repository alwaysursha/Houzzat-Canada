/**
 * Stage 6.10A — owner activation token hashing (raw never persisted).
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createOwnerActivationRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOwnerActivationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function ownerActivationHashesEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length || bufA.length === 0) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
