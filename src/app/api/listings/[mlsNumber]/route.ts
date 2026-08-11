import { NextResponse } from "next/server";
import {
  buildAddressListingHistoryRows,
  findSiblingListingsAtAddress,
} from "@/lib/listings/address-history";
import { getListingProvider } from "@/lib/listings/provider";
import { resolveListingGalleryPhotos } from "@/lib/listings/resolve-gallery";

type Params = { params: Promise<{ mlsNumber: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { mlsNumber } = await params;
  const provider = getListingProvider();
  const listing = await provider.getByMls(mlsNumber);

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const gallery = resolveListingGalleryPhotos(listing);
  const addressSiblings = await findSiblingListingsAtAddress(listing);
  const media =
    gallery.length > 0
      ? gallery.map((photo, index) => ({
          id: photo.id,
          url: photo.url,
          sortOrder: photo.sortOrder ?? index,
          isPrimary: photo.isPrimary ?? index === 0,
          listingId: listing.id,
        }))
      : listing.media;

  const historyRows = buildAddressListingHistoryRows({
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
  });

  return NextResponse.json({
    listing: { ...listing, media },
    historyRows,
    provider: provider.name,
  });
}
