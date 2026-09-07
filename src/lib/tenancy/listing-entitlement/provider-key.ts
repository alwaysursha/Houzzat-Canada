/**
 * Stage 6.11G.10A — recognized listing-data providerKey validation.
 *
 * Extensible registry: add keys here as new integrations ship.
 * Currently only PropTx is production-recognized (G.5 CURRENT_PROPTX_PROVIDER_KEY).
 * Blank / unrecognized keys never become authorities (no invent/fallback).
 */

import { CURRENT_PROPTX_PROVIDER_KEY } from "@/lib/tenancy/listing-provenance";

/**
 * Canonical lowercase provider keys eligible for MLS entitlement.
 * Architecture stays additive — do not hardwire a single-provider redesign.
 */
export const RECOGNIZED_LISTING_DATA_PROVIDER_KEYS = [
  CURRENT_PROPTX_PROVIDER_KEY,
] as const;

export type RecognizedListingDataProviderKey =
  (typeof RECOGNIZED_LISTING_DATA_PROVIDER_KEYS)[number];

const RECOGNIZED = new Set<string>(RECOGNIZED_LISTING_DATA_PROVIDER_KEYS);

/**
 * Trim + lowercase; return canonical key only if recognized.
 * Blank / whitespace / unknown → null (denied).
 */
export function normalizeRecognizedListingProviderKey(
  raw: string | null | undefined,
): RecognizedListingDataProviderKey | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (!RECOGNIZED.has(trimmed)) return null;
  return trimmed as RecognizedListingDataProviderKey;
}
