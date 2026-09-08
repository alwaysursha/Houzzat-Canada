import { NextResponse } from "next/server";
import {
  buildAddressListingHistoryRows,
  findSiblingListingsAtAddress,
} from "@/lib/listings/address-history";
import { getListingProvider } from "@/lib/listings/provider";
import { resolveListingGalleryPhotos } from "@/lib/listings/resolve-gallery";
import {
  evaluateWebListingDetailInventoryAccess,
  resolveListingEntitlementContextForRequest,
} from "@/lib/tenancy/listing-entitlement";

type Params = { params: Promise<{ mlsNumber: string }> };

/**
 * Raw listing JSON for MLS detail consumers.
 *
 * G.10C2: Host → G.7C/G.10A → Neon → board provenance/capability → response.
 * HISTORY / MEDIA slices are stripped when those capabilities are missing.
 * No PropTx on this path. Unauthorized → 404 (no existence oracle).
 */
export async function GET(request: Request, { params }: Params) {
  const { mlsNumber: raw } = await params;
  const mlsNumber = decodeURIComponent(raw).trim().toUpperCase();
  if (!mlsNumber) {
    return NextResponse.json({ error: "Missing MLS number" }, { status: 400 });
  }

  // Never trust client workspaceId / org / provider / SAK.
  const { entitlement } =
    await resolveListingEntitlementContextForRequest(request);

  const provider = getListingProvider();
  const listing = await provider.getByMls(mlsNumber);

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const board = evaluateWebListingDetailInventoryAccess({
    entitlement,
    entitlementFilteringEnabled: true,
    organizationId: listing.organizationId,
    providerKey: listing.providerKey,
    dataSource: listing.dataSource,
    status: listing.status,
  });
  if (!board.allowed) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const mediaAllowed = evaluateWebListingDetailInventoryAccess({
    entitlement,
    entitlementFilteringEnabled: true,
    organizationId: listing.organizationId,
    providerKey: listing.providerKey,
    dataSource: listing.dataSource,
    status: listing.status,
    additionalCapabilities: ["MEDIA"],
  }).allowed;

  const historyAllowed = evaluateWebListingDetailInventoryAccess({
    entitlement,
    entitlementFilteringEnabled: true,
    organizationId: listing.organizationId,
    providerKey: listing.providerKey,
    dataSource: listing.dataSource,
    status: listing.status,
    additionalCapabilities: ["HISTORY"],
  }).allowed;

  const gallery = mediaAllowed ? resolveListingGalleryPhotos(listing) : [];
  const media = mediaAllowed
    ? gallery.length > 0
      ? gallery.map((photo, index) => ({
          id: photo.id,
          url: photo.url,
          sortOrder: photo.sortOrder ?? index,
          isPrimary: photo.isPrimary ?? index === 0,
          listingId: listing.id,
        }))
      : listing.media
    : [];

  const addressSiblings = historyAllowed
    ? await findSiblingListingsAtAddress(listing)
    : [];
  const historyRows = historyAllowed
    ? buildAddressListingHistoryRows({
        mlsNumber: listing.mlsNumber,
        listPrice: listing.listPrice,
        listedAt: listing.listedAt,
        updatedAtMls: listing.updatedAtMls,
        soldAt: listing.soldAt,
        soldPrice: listing.soldPrice,
        status: listing.status,
        transactionType: listing.transactionType,
        history: listing.history,
        siblings: addressSiblings,
      })
    : [];

  return NextResponse.json({
    listing: { ...listing, media },
    historyRows,
    provider: provider.name,
  });
}
