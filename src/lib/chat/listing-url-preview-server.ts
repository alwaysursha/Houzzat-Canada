/**
 * Server-only: resolve an authorized chat listing URL preview.
 * Prefer LISTING_SHARE guest-safe snapshot; fall back to panel-authorized
 * fields for the current viewer (never scrapes HTML, never returns soldPrice).
 */

import { auth } from "@/lib/auth";
import {
  LISTING_SHARE_CARD,
  LISTING_SHARE_PAYLOAD_VERSION,
  type ListingSharePresentView,
} from "@/lib/conversations/listing-share/payload";
import {
  LISTING_SHARE_SOURCE_SELECT,
  buildListingShareSnapshot,
  type ListingShareSourceListing,
} from "@/lib/conversations/listing-share/snapshot";
import { buildListingPanelPayload } from "@/lib/listings/build-listing-panel";
import { listingPath } from "@/lib/listings/listing-path";
import { listingPhotoSrc } from "@/lib/listings/photo-src";
import { loadListingForDetailPage } from "@/lib/listings/load-listing-for-detail";
import { prisma } from "@/lib/prisma";
import { resolveListingEntitlementContextForRequest } from "@/lib/tenancy/listing-entitlement";
import type { ChatListingUrlPreviewResponse } from "@/lib/chat/listing-url-preview";
import {
  LISTING_SHARE_ALLOWED_STATUSES,
  LISTING_SHARE_PROPERTY_TYPES,
} from "@/lib/conversations/listing-share/payload";

function primaryMediaUrl(
  media: Array<{ url: string; isPrimary: boolean; sortOrder: number }> | undefined,
): string | null {
  if (!media?.length) return null;
  const primary =
    media.find((row) => row.isPrimary) ??
    [...media].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  if (!primary?.url) return null;
  const normalized = listingPhotoSrc(primary.url.trim());
  if (!normalized || normalized.includes("/api/listings/photo")) return null;
  return normalized;
}

function panelToPresentView(input: {
  listingId: string;
  mlsNumber: string;
  listPrice: number;
  status: string;
  transactionType: string;
  propertyType: string;
  beds: number;
  baths: number;
  addressLine: string;
  unitNumber: string | null;
  city: string;
  province: string | null;
  postalCode: string | null;
  primaryImageUrl: string | null;
  href: string;
}): ListingSharePresentView | null {
  const status = LISTING_SHARE_ALLOWED_STATUSES.includes(
    input.status as (typeof LISTING_SHARE_ALLOWED_STATUSES)[number],
  )
    ? (input.status as ListingSharePresentView["status"])
    : null;
  if (!status) return null;
  const propertyType = LISTING_SHARE_PROPERTY_TYPES.includes(
    input.propertyType as (typeof LISTING_SHARE_PROPERTY_TYPES)[number],
  )
    ? (input.propertyType as ListingSharePresentView["propertyType"])
    : "OTHER";
  return {
    card: LISTING_SHARE_CARD,
    version: LISTING_SHARE_PAYLOAD_VERSION,
    listingId: input.listingId,
    mlsNumber: input.mlsNumber,
    listPrice: input.listPrice,
    status,
    transactionType: input.transactionType === "LEASE" ? "LEASE" : "SALE",
    propertyType,
    beds: input.beds,
    baths: input.baths,
    addressLine: input.addressLine,
    unitNumber: input.unitNumber,
    city: input.city,
    province: input.province,
    postalCode: input.postalCode,
    primaryImageUrl: input.primaryImageUrl,
    href: input.href,
    sharedAt: new Date().toISOString(),
  };
}

export async function resolveChatListingUrlPreview(input: {
  request: Request;
  mlsNumber: string;
  hostname?: string;
}): Promise<ChatListingUrlPreviewResponse> {
  const mlsNumber = input.mlsNumber.trim().toUpperCase();
  if (!mlsNumber || mlsNumber.length > 32) {
    return {
      ok: false,
      reason: "INVALID",
      message: "That doesn’t look like a valid listing link.",
    };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      reason: "UNAUTHORIZED",
      message: "Sign in to preview this listing.",
    };
  }

  const { entitlement } = await resolveListingEntitlementContextForRequest(
    input.request,
  );
  const workspaceId = entitlement.workspaceId?.trim();
  if (!workspaceId) {
    return {
      ok: false,
      reason: "RESTRICTED",
      message: "This listing isn’t available here.",
    };
  }

  const listing = await prisma.listing.findUnique({
    where: { mlsNumber },
    select: {
      ...LISTING_SHARE_SOURCE_SELECT,
      media: {
        select: { url: true, isPrimary: true, sortOrder: true },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        take: 4,
      },
    },
  });

  if (!listing) {
    return {
      ok: false,
      reason: "NOT_FOUND",
      message: "This listing isn’t available.",
    };
  }

  const mediaUrl = primaryMediaUrl(listing.media);
  const share = buildListingShareSnapshot({
    entitlement,
    trustedWorkspaceId: workspaceId,
    listing: listing as ListingShareSourceListing,
    primaryMediaUrl: mediaUrl,
    entitlementFilteringEnabled: true,
  });

  if (share.ok) {
    return {
      ok: true,
      shareable: true,
      listingId: share.payload.listingId,
      mlsNumber: share.payload.mlsNumber,
      hostname: input.hostname ?? "houzzat.com",
      preview: share.payload,
    };
  }

  // Authorized viewer fallback (VOW / restricted) — panel rules, no soldPrice.
  const detail = await loadListingForDetailPage(mlsNumber, {
    entitlement,
    entitlementFilteringEnabled: true,
  });
  if (!detail) {
    return {
      ok: false,
      reason:
        share.reason === "RECIPIENT_RESTRICTED" ||
        share.reason === "STATUS_NOT_SHAREABLE"
          ? "RESTRICTED"
          : "NOT_FOUND",
      message:
        share.reason === "STATUS_NOT_SHAREABLE"
          ? "This listing can’t be previewed in chat."
          : "This listing isn’t available to preview.",
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, emailVerified: true, createdAt: true },
  });
  const panel = buildListingPanelPayload(detail, user, null);
  if (!panel.ok) {
    return {
      ok: false,
      reason: panel.status === 401 ? "UNAUTHORIZED" : "RESTRICTED",
      message:
        panel.body.error ||
        "This listing isn’t available to preview in chat.",
    };
  }

  const L = panel.payload.listing;
  // Never surface soldPrice in chat previews.
  const photo =
    primaryMediaUrl(
      panel.payload.photos.map((p, index) => ({
        url: p.url,
        isPrimary: index === 0,
        sortOrder: index,
      })),
    ) ?? mediaUrl;
  const present = panelToPresentView({
    listingId: L.id,
    mlsNumber: L.mlsNumber,
    listPrice: L.listPrice,
    status: L.status,
    transactionType: L.transactionType,
    propertyType: L.propertyType,
    beds: L.beds,
    baths: L.baths,
    addressLine: L.addressLine,
    unitNumber: L.unitNumber,
    city: L.city,
    province: L.province,
    postalCode: L.postalCode,
    primaryImageUrl: photo,
    href:
      panel.payload.canonicalPath ||
      listingPath({
        mlsNumber: L.mlsNumber,
        addressLine: L.addressLine,
        unitNumber: L.unitNumber,
        city: L.city,
        province: L.province,
        postalCode: L.postalCode,
      }),
  });

  if (!present) {
    return {
      ok: false,
      reason: "RESTRICTED",
      message: "This listing can’t be previewed in chat.",
    };
  }

  return {
    ok: true,
    shareable: false,
    listingId: present.listingId,
    mlsNumber: present.mlsNumber,
    hostname: input.hostname ?? "houzzat.com",
    preview: present,
  };
}
