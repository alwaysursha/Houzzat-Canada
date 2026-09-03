/**
 * Stage 6.7A — private offer token helpers.
 * Raw token never persisted; only SHA-256 hex hash is stored.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createCommercialOfferRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashCommercialOfferToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function commercialOfferTokenHashesEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length || bufA.length === 0) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
