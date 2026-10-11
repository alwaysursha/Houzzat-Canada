/**
 * Server-side LISTING_SHARE snapshot builder (M4U).
 *
 * Client may supply mlsNumber / listingId only. Price, status, address, and
 * photo always come from the trusted Listing (+ ListingMedia) loaded by the
 * server. Never trust client workspaceId / organizationId / providerKey /
 * customerId / image URLs.
 */

import type { ListingStatus } from "@prisma/client";
import { resolveListingDetailAccess } from "@/lib/listings/build-listing-panel";
import { isOnMarketListingStatus } from "@/lib/listings/constants";
import { listingPath } from "@/lib/listings/listing-path";
import { listingPhotoSrc } from "@/lib/listings/photo-src";
import {
  evaluateWebListingDetailInventoryAccess,
  type WorkspaceListingEntitlement,
} from "@/lib/tenancy/listing-entitlement";
import {
  LISTING_SHARE_CARD,
  LISTING_SHARE_PAYLOAD_VERSION,
  listingSharePayloadSchema,
  type ListingSharePayload,
} from "@/lib/conversations/listing-share/payload";

export type ListingShareSnapshotDenialReason =
  | "LISTING_MISSING"
  | "INVALID_IDENTIFIER"
  | "WORKSPACE_NOT_ENTITLED"
  | "STATUS_NOT_SHAREABLE"
  | "RECIPIENT_RESTRICTED"
  | "SNAPSHOT_INVALID";

export type ListingShareSourceListing = {
  id: string;
  mlsNumber: string;
  status: string;
  transactionType: "SALE" | "LEASE" | string;
  propertyType: string;
  listPrice: number;
  /** Must never be copied into the share payload. */
  soldPrice?: number | null;
  beds: number;
  baths: number;
  addressLine: string;
  unitNumber: string | null;
  city: string;
  province: string | null;
  postalCode: string | null;
  dataSource: string | null;
  organizationId: string | null;
  providerKey: string | null;
};

export type BuildListingShareSnapshotInput = {
  /**
   * Host-derived workspace entitlement. Never from the client body.
   * Callers resolve via resolveListingEntitlementContextForRequest / Hostname.
   */
  entitlement: WorkspaceListingEntitlement;
  /**
   * Trusted workspace id for the conversation (auth context). Used to assert
   * entitlement.workspaceId matches — never accept a client workspaceId.
   */
  trustedWorkspaceId: string;
  /** Neon Listing row already loaded by the server. */
  listing: ListingShareSourceListing | null;
  /**
   * Primary ListingMedia.url from the server (not client). Normalized with
   * listingPhotoSrc; null when missing/unsafe.
   */
  primaryMediaUrl?: string | null;
  /**
   * Force web entitlement enforcement ON for chat shares (fail closed).
   * Default true — do not downgrade for MLS inventory.
   */
  entitlementFilteringEnabled?: boolean;
  now?: Date;
};

export type BuildListingShareSnapshotResult =
  | { ok: true; payload: ListingSharePayload }
  | { ok: false; reason: ListingShareSnapshotDenialReason };

/**
 * Client may identify a listing; never supply snapshot display fields.
 */
export type ListingShareClientRef =
  | { mlsNumber: string; listingId?: undefined }
  | { listingId: string; mlsNumber?: undefined };

export function parseListingShareClientRef(
  raw: unknown,
):
  | { ok: true; ref: ListingShareClientRef }
  | { ok: false; reason: "INVALID_IDENTIFIER" } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "INVALID_IDENTIFIER" };
  }
  const obj = raw as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== 1) return { ok: false, reason: "INVALID_IDENTIFIER" };
  if (keys[0] === "mlsNumber" && typeof obj.mlsNumber === "string") {
    const mlsNumber = obj.mlsNumber.trim().toUpperCase();
    if (!mlsNumber || mlsNumber.length > 32) {
      return { ok: false, reason: "INVALID_IDENTIFIER" };
    }
    return { ok: true, ref: { mlsNumber } };
  }
  if (keys[0] === "listingId" && typeof obj.listingId === "string") {
    const listingId = obj.listingId.trim();
    if (!listingId || listingId.length > 64) {
      return { ok: false, reason: "INVALID_IDENTIFIER" };
    }
    return { ok: true, ref: { listingId } };
  }
  return { ok: false, reason: "INVALID_IDENTIFIER" };
}

/**
 * V1 recipient floor: fields must be shareable to a guest/IDX viewer.
 * Uses resolveListingDetailAccess(null, listing) so agent VOW access cannot
 * widen what the customer receives in the transcript snapshot.
 */
export function isListingShareableToGuestRecipient(
  listing: Pick<ListingShareSourceListing, "status" | "dataSource">,
): boolean {
  if (!isOnMarketListingStatus(listing.status)) return false;
  const access = resolveListingDetailAccess(null, {
    status: listing.status as ListingStatus,
    dataSource: listing.dataSource,
  });
  if (access.detailsLocked || access.vowBlocked) return false;
  return true;
}

function normalizePrimaryImageUrl(
  primaryMediaUrl: string | null | undefined,
): string | null {
  if (primaryMediaUrl == null) return null;
  const trimmed = primaryMediaUrl.trim();
  if (!trimmed) return null;
  const normalized = listingPhotoSrc(trimmed);
  if (!normalized) return null;
  // Open proxy would accept any host — omit unsafe/unknown media instead.
  if (normalized.includes("/api/listings/photo")) return null;
  return normalized;
}

/**
 * Build a durable LISTING_SHARE snapshot from a trusted Listing row.
 * Does not persist Message rows and does not send push.
 */
export function buildListingShareSnapshot(
  input: BuildListingShareSnapshotInput,
): BuildListingShareSnapshotResult {
  const listing = input.listing;
  if (!listing) return { ok: false, reason: "LISTING_MISSING" };

  const trustedWorkspaceId = input.trustedWorkspaceId.trim();
  if (!trustedWorkspaceId) {
    return { ok: false, reason: "WORKSPACE_NOT_ENTITLED" };
  }
  if (input.entitlement.workspaceId !== trustedWorkspaceId) {
    return { ok: false, reason: "WORKSPACE_NOT_ENTITLED" };
  }

  const board = evaluateWebListingDetailInventoryAccess({
    entitlement: input.entitlement,
    entitlementFilteringEnabled: input.entitlementFilteringEnabled ?? true,
    organizationId: listing.organizationId,
    providerKey: listing.providerKey,
    dataSource: listing.dataSource,
    status: listing.status as ListingStatus,
  });
  if (!board.allowed) {
    return { ok: false, reason: "WORKSPACE_NOT_ENTITLED" };
  }

  if (
    listing.status !== "ACTIVE" &&
    listing.status !== "SOLD_CONDITIONAL"
  ) {
    return { ok: false, reason: "STATUS_NOT_SHAREABLE" };
  }

  if (!isListingShareableToGuestRecipient(listing)) {
    return { ok: false, reason: "RECIPIENT_RESTRICTED" };
  }

  const transactionType =
    listing.transactionType === "LEASE" ? "LEASE" : "SALE";
  const primaryImageUrl = normalizePrimaryImageUrl(input.primaryMediaUrl);
  const now = input.now ?? new Date();

  const href = listingPath({
    mlsNumber: listing.mlsNumber.trim().toUpperCase(),
    addressLine: listing.addressLine,
    unitNumber: listing.unitNumber,
    city: listing.city,
    province: listing.province,
    postalCode: listing.postalCode,
  });

  const candidate = {
    card: LISTING_SHARE_CARD,
    version: LISTING_SHARE_PAYLOAD_VERSION,
    listingId: listing.id.trim(),
    mlsNumber: listing.mlsNumber.trim().toUpperCase(),
    listPrice: listing.listPrice,
    status: listing.status as "ACTIVE" | "SOLD_CONDITIONAL",
    transactionType,
    propertyType: listing.propertyType,
    beds: listing.beds,
    baths: listing.baths,
    addressLine: listing.addressLine.trim(),
    unitNumber: listing.unitNumber?.trim() ? listing.unitNumber.trim() : null,
    city: listing.city.trim(),
    province: listing.province?.trim() ? listing.province.trim() : null,
    postalCode: listing.postalCode?.trim() ? listing.postalCode.trim() : null,
    primaryImageUrl,
    href,
    sharedAt: now.toISOString(),
  };

  const parsed = listingSharePayloadSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, reason: "SNAPSHOT_INVALID" };
  }

  // Defense: never leak soldPrice even if a future edit adds it to candidate.
  if (
    Object.prototype.hasOwnProperty.call(parsed.data, "soldPrice") ||
    Object.prototype.hasOwnProperty.call(candidate, "soldPrice")
  ) {
    return { ok: false, reason: "SNAPSHOT_INVALID" };
  }

  return { ok: true, payload: parsed.data };
}

/**
 * Lean Listing select for the eventual send endpoint (document only — not wired).
 */
export const LISTING_SHARE_SOURCE_SELECT = {
  id: true,
  mlsNumber: true,
  status: true,
  transactionType: true,
  propertyType: true,
  listPrice: true,
  soldPrice: true,
  beds: true,
  baths: true,
  addressLine: true,
  unitNumber: true,
  city: true,
  province: true,
  postalCode: true,
  dataSource: true,
  organizationId: true,
  providerKey: true,
} as const;
