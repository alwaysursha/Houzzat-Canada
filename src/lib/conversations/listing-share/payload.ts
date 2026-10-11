/**
 * Chat V1 LISTING_SHARE payload contract (M4U).
 *
 * Display-safe historical snapshot only. No soldPrice, history, owner, or
 * VOW-restricted fields. Transcript presentation must parse this payload
 * without joining Listing.
 */

import { z } from "zod";
import { listingPhotoSrc } from "@/lib/listings/photo-src";

export const LISTING_SHARE_CARD = "LISTING_SHARE" as const;
export const LISTING_SHARE_PAYLOAD_VERSION = 1 as const;

/** Safe transcript + push fallback body (no listing details). */
export const LISTING_SHARE_MESSAGE_BODY =
  "An agent shared a property with you." as const;

/** Statuses permitted in a customer-safe V1 chat share (on-market / IDX). */
export const LISTING_SHARE_ALLOWED_STATUSES = [
  "ACTIVE",
  "SOLD_CONDITIONAL",
] as const;

export const LISTING_SHARE_PROPERTY_TYPES = [
  "DETACHED",
  "SEMI_DETACHED",
  "TOWNHOUSE",
  "CONDO_APT",
  "CONDO_TOWNHOUSE",
  "MULTIPLEX",
  "VACANT_LAND",
  "OFFICE",
  "RETAIL",
  "INDUSTRIAL",
  "MIXED_USE",
  "OTHER",
] as const;

const listingShareImageUrlSchema = z
  .string()
  .max(2048)
  .nullable()
  .refine((url) => isSafeListingShareImageUrl(url), {
    message: "Unsafe listing share image URL",
  });

/**
 * Strict versioned LISTING_SHARE payload.
 * `.strict()` rejects soldPrice, history, objectKey, and other extras.
 */
export const listingSharePayloadSchema = z
  .object({
    card: z.literal(LISTING_SHARE_CARD),
    version: z.literal(LISTING_SHARE_PAYLOAD_VERSION),
    listingId: z.string().trim().min(1).max(64),
    mlsNumber: z.string().trim().min(1).max(32),
    listPrice: z.number().int().nonnegative().finite(),
    status: z.enum(LISTING_SHARE_ALLOWED_STATUSES),
    transactionType: z.enum(["SALE", "LEASE"]),
    propertyType: z.enum(LISTING_SHARE_PROPERTY_TYPES),
    beds: z.number().finite().nonnegative(),
    baths: z.number().finite().nonnegative(),
    addressLine: z.string().trim().min(1).max(200),
    unitNumber: z.string().trim().max(40).nullable(),
    city: z.string().trim().min(1).max(100),
    province: z.string().trim().max(40).nullable(),
    postalCode: z.string().trim().max(20).nullable(),
    primaryImageUrl: listingShareImageUrlSchema,
    /** Canonical site path from listingPath — relative, not an arbitrary URL. */
    href: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .refine((value) => value.startsWith("/listing/"), {
        message: "href must be a /listing/ path",
      }),
    sharedAt: z.string().datetime(),
  })
  .strict();

export type ListingSharePayload = z.infer<typeof listingSharePayloadSchema>;

export type ListingSharePresentView = {
  card: typeof LISTING_SHARE_CARD;
  version: typeof LISTING_SHARE_PAYLOAD_VERSION;
  listingId: string;
  mlsNumber: string;
  listPrice: number;
  status: (typeof LISTING_SHARE_ALLOWED_STATUSES)[number];
  transactionType: "SALE" | "LEASE";
  propertyType: (typeof LISTING_SHARE_PROPERTY_TYPES)[number];
  beds: number;
  baths: number;
  addressLine: string;
  unitNumber: string | null;
  city: string;
  province: string | null;
  postalCode: string | null;
  primaryImageUrl: string | null;
  href: string;
  sharedAt: string;
};

/**
 * Image URLs stored on the share must already be normalized via listingPhotoSrc
 * (direct allowlisted CDN, /api/listings/photo proxy, or site-relative).
 * Rejects R2 object keys and arbitrary client hosts.
 */
export function isSafeListingShareImageUrl(
  url: string | null | undefined,
): boolean {
  if (url == null) return true;
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 2048) return false;
  if (trimmed.includes("objectKey") || trimmed.includes("chat-media")) {
    return false;
  }
  if (trimmed.startsWith("r2://") || trimmed.startsWith("s3://")) {
    return false;
  }
  const normalized = listingPhotoSrc(trimmed);
  if (!normalized) return false;
  // Do not persist open photo-proxy URLs (any https host can be wrapped).
  // Only direct allowlisted CDN URLs or safe site-relative paths.
  if (normalized.includes("/api/listings/photo")) return false;
  return normalized === trimmed;
}

export function parseListingSharePayload(
  raw: unknown,
):
  | { ok: true; payload: ListingSharePayload }
  | { ok: false; reason: "INVALID_PAYLOAD" } {
  const parsed = listingSharePayloadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "INVALID_PAYLOAD" };
  return { ok: true, payload: parsed.data };
}

/**
 * Present a historical share for transcript UI.
 * Does not load Listing / ListingMedia — snapshot only.
 */
export function presentListingSharePayload(
  raw: unknown,
): ListingSharePresentView | null {
  const parsed = parseListingSharePayload(raw);
  if (!parsed.ok) return null;
  return parsed.payload;
}

export function isListingSharePayload(raw: unknown): boolean {
  return parseListingSharePayload(raw).ok;
}

/**
 * Transcript UI resolver (no Listing join):
 * - valid snapshot → render card
 * - card marker present but malformed → safe text fallback (never trust URLs)
 * - other payloads → leave to plain TEXT bubble
 */
export function resolveChatListingShareView(
  payload: unknown,
):
  | { kind: "share"; view: ListingSharePresentView }
  | { kind: "fallback" }
  | { kind: "none" } {
  const view = presentListingSharePayload(payload);
  if (view) return { kind: "share", view };
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    (payload as { card?: unknown }).card === LISTING_SHARE_CARD
  ) {
    return { kind: "fallback" };
  }
  return { kind: "none" };
}
