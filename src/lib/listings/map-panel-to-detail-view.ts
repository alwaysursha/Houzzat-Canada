import type { ListingDetailViewProps } from "@/components/listings/ListingDetailView";
import type {
  ListingPanelListing,
  ListingPanelPayload,
} from "@/lib/listings/build-listing-panel";
import type { ListingDetail } from "@/lib/listings/types";

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDateRequired(value: string): Date {
  return toDate(value) ?? new Date(0);
}

/** Map authorized panel JSON listing → ListingDetail shape for ListingDetailView. */
export function panelListingToDetail(
  listing: ListingPanelListing,
): ListingDetail {
  const listedAt = toDateRequired(listing.listedAt);
  const history = listing.history.map((row) => ({
    id: row.id,
    listingId: listing.id,
    event: row.event,
    price: row.price,
    originalPrice: row.originalPrice,
    contractDate: toDateRequired(row.contractDate),
    lastUpdatedAt: toDate(row.lastUpdatedAt),
    externalMls: row.externalMls,
    visibility: row.visibility ?? "restricted",
    note: null as string | null,
  }));

  const media = listing.media.map((photo, index) => ({
    id: photo.id,
    listingId: listing.id,
    url: photo.url,
    sortOrder: photo.sortOrder ?? index,
    isPrimary: photo.isPrimary ?? index === 0,
    createdAt: listedAt,
  }));

  // ListingDetailView only reads the fields mapped here. Cast keeps Prisma's
  // full Listing surface without re-fetching unused columns.
  return {
    id: listing.id,
    mlsNumber: listing.mlsNumber,
    listingKey: listing.listingKey,
    status: listing.status,
    transactionType: listing.transactionType,
    segment: listing.segment,
    propertyType: listing.propertyType,
    dataSource: listing.dataSource,
    listPrice: listing.listPrice,
    soldPrice: listing.soldPrice,
    beds: listing.beds,
    baths: listing.baths,
    sqft: listing.sqft,
    parkingSpaces: listing.parkingSpaces,
    addressLine: listing.addressLine,
    unitNumber: listing.unitNumber,
    city: listing.city,
    community: listing.community,
    province: listing.province,
    postalCode: listing.postalCode,
    description: listing.description,
    brokerageName: listing.brokerageName ?? "",
    taxes: listing.taxes,
    maintenanceFee: listing.maintenanceFee,
    yearBuilt: listing.yearBuilt,
    lat: listing.lat,
    lng: listing.lng,
    listedAt,
    soldAt: toDate(listing.soldAt),
    updatedAtMls: toDate(listing.updatedAtMls),
    facts: listing.facts,
    media,
    history,
    rooms: [],
    openHouses: [],
  } as unknown as ListingDetail;
}

export function panelPayloadToDetailViewProps(
  payload: ListingPanelPayload,
): Omit<ListingDetailViewProps, "applyDocumentSheetFlags"> {
  return {
    listing: panelListingToDetail(payload.listing),
    galleryPhotos: payload.photos,
    livePhotosPromise: null,
    listingHistoryRows: payload.listingHistoryRows,
    isListingSheet: true,
    signedIn: payload.access.signedIn,
    sessionContact: payload.sessionContact ?? undefined,
    canSeeRestricted: payload.access.canSeeRestricted,
    detailsLocked: payload.access.detailsLocked,
    verifyLocked: payload.access.needsEmailVerification,
    gateDetails: payload.access.gateDetails,
    gateSold: payload.access.gateSold,
    canonicalPath: payload.canonicalPath,
  };
}
