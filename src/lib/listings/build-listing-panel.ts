import type { AccessGateCopy, AccessUser } from "@/lib/account-access";
import {
  accessGateCopy,
  needsEmailVerification,
  resolveClientAccess,
} from "@/lib/account-access";
import { buildAddressListingHistoryRows } from "@/lib/listings/address-history";
import { isOnMarketListingStatus } from "@/lib/listings/constants";
import type { HistoryRow } from "@/lib/listings/history-rows";
import { listingPath } from "@/lib/listings/listing-path";
import type { GalleryMedia } from "@/lib/listings/resolve-gallery";
import { resolveListingGalleryPhotos } from "@/lib/listings/resolve-gallery";
import type { ListingDetail } from "@/lib/listings/types";
import type { PublicAgentIdentity } from "@/lib/tenancy/resolve-public-agent-identity";
import { isVowOnlyMlsMode } from "@/lib/proptx/config";
import { hasVowAccess } from "@/lib/vow";

export type ListingPanelAccess = {
  signedIn: boolean;
  canSeeRestricted: boolean;
  detailsLocked: boolean;
  needsEmailVerification: boolean;
  vowBlocked: boolean;
  gateDetails: AccessGateCopy;
  gateSold: AccessGateCopy;
};

export type ListingPanelSessionContact = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

/** Authorized listing view — dates as ISO strings, restricted fields redacted. */
export type ListingPanelListing = {
  id: string;
  mlsNumber: string;
  listingKey: string | null;
  status: ListingDetail["status"];
  transactionType: ListingDetail["transactionType"];
  segment: ListingDetail["segment"];
  propertyType: ListingDetail["propertyType"];
  dataSource: string | null;
  listPrice: number;
  soldPrice: number | null;
  beds: number;
  baths: number;
  sqft: number | null;
  parkingSpaces: number;
  addressLine: string;
  unitNumber: string | null;
  city: string;
  community: string | null;
  province: string | null;
  postalCode: string | null;
  description: string;
  brokerageName: string | null;
  taxes: number | null;
  maintenanceFee: number | null;
  yearBuilt: number | null;
  lat: number;
  lng: number;
  listedAt: string;
  soldAt: string | null;
  updatedAtMls: string | null;
  facts: ListingDetail["facts"];
  /** Price-change history already filtered for the caller's access. */
  history: Array<{
    id: string;
    event: string;
    price: number | null;
    originalPrice: number | null;
    contractDate: string;
    lastUpdatedAt: string | null;
    externalMls: string | null;
    visibility: string | null;
  }>;
  media: GalleryMedia[];
  rooms: [];
  openHouses: [];
};

export type ListingPanelPayload = {
  access: ListingPanelAccess;
  canonicalPath: string;
  photos: GalleryMedia[];
  listing: ListingPanelListing;
  listingHistoryRows: HistoryRow[];
  sessionContact: ListingPanelSessionContact | null;
  /**
   * Same public agent as the listing page. Set by the panel route from the
   * request workspace. Absent on payloads built without that route.
   */
  publicAgent?: PublicAgentIdentity | null;
};

export type ListingPanelErrorBody = {
  error: string;
  vowBlocked?: boolean;
  requiresAuth?: boolean;
  requiresEmailVerification?: boolean;
};

export type ListingPanelResult =
  | { ok: true; payload: ListingPanelPayload }
  | { ok: false; status: 401 | 403 | 404; body: ListingPanelErrorBody };

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return value.toISOString();
}

function toIsoRequired(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

/**
 * Same access flags as /listing/... RSC (VOW-only, client access, inactive lock).
 * Shared so panel API and page cannot drift.
 */
export function resolveListingDetailAccess(
  user: AccessUser | null | undefined,
  listing: Pick<ListingDetail, "status" | "dataSource">,
): ListingPanelAccess {
  const access = resolveClientAccess(user);
  const canSeeRestricted = access.hasClientAccess;
  const verifyLocked = access.needsEmailVerification;
  const isInactive = !isOnMarketListingStatus(listing.status);
  const detailsLocked = isInactive && !canSeeRestricted;
  const vowBlocked =
    isVowOnlyMlsMode() &&
    listing.dataSource !== "fsbo" &&
    !hasVowAccess(user);

  return {
    signedIn: access.isSignedIn,
    canSeeRestricted,
    detailsLocked,
    needsEmailVerification: verifyLocked,
    vowBlocked,
    gateDetails: accessGateCopy(access, "details"),
    gateSold: accessGateCopy(access, "sold"),
  };
}

function redactHistoryRows(
  rows: HistoryRow[],
  canSeeRestricted: boolean,
): HistoryRow[] {
  if (canSeeRestricted) return rows;
  return rows.map((row) => {
    if (row.public) return row;
    return {
      ...row,
      price: null,
      originalPrice: null,
    };
  });
}

/**
 * Authorize history rows for API responses (panel + address-history enrich).
 * Guests never receive restricted prices; closed-cycle public rows use listPrice
 * instead of sold/close price when the caller is not a client.
 */
export function authorizeHistoryRowsForClient(
  rows: HistoryRow[],
  options: {
    canSeeRestricted: boolean;
    listPrice: number;
    status: string;
  },
): HistoryRow[] {
  if (options.canSeeRestricted) return rows;
  const isClosed =
    options.status === "SOLD" || options.status === "LEASED";
  return redactHistoryRows(rows, false).map((row) => {
    if (
      isClosed &&
      row.public &&
      row.id.startsWith("current-") &&
      /^(sold|leased)$/i.test(row.event.trim())
    ) {
      return { ...row, price: options.listPrice };
    }
    return row;
  });
}

/** Same VOW history filter as the listing panel — omit synthetic + restricted rows. */
export function listingHistoryVisibleForClient<
  T extends {
    note?: string | null;
    event: string;
    visibility?: string | null;
  },
>(history: T[], canSeeRestricted: boolean): T[] {
  return history.filter((h) => {
    if (h.note === "synthetic:empty" || h.event === "Synced") return false;
    if (!canSeeRestricted && h.visibility !== "public") return false;
    return true;
  });
}

/**
 * Canonical VOW redaction for a raw listing JSON payload.
 * Guests keep public IDX fields; soldPrice and restricted history are stripped.
 * soldAt is left intact — same as {@link buildListingPanelPayload}.
 */
export function redactListingVowRestrictedFields<
  T extends {
    soldPrice: number | null;
    history: Array<{
      note?: string | null;
      event: string;
      visibility?: string | null;
    }>;
  },
>(listing: T, canSeeRestricted: boolean): T {
  return {
    ...listing,
    soldPrice: canSeeRestricted ? listing.soldPrice : null,
    history: listingHistoryVisibleForClient(listing.history, canSeeRestricted),
  };
}

/** History table rows with the same sold/VOW redaction as the listing panel. */
export function buildAuthorizedAddressListingHistoryRows(input: {
  mlsNumber: string;
  listPrice: number;
  listedAt: Date | string;
  updatedAtMls?: Date | string | null;
  soldAt?: Date | string | null;
  soldPrice?: number | null;
  status: string;
  transactionType: string;
  history: Parameters<typeof buildAddressListingHistoryRows>[0]["history"];
  siblings: Parameters<typeof buildAddressListingHistoryRows>[0]["siblings"];
  canSeeRestricted: boolean;
}): HistoryRow[] {
  const soldPrice = input.canSeeRestricted ? (input.soldPrice ?? null) : null;
  return authorizeHistoryRowsForClient(
    buildAddressListingHistoryRows({
      mlsNumber: input.mlsNumber,
      listPrice: input.listPrice,
      listedAt: input.listedAt,
      updatedAtMls: input.updatedAtMls,
      soldAt: input.soldAt,
      soldPrice,
      status: input.status,
      transactionType: input.transactionType,
      history: input.history,
      siblings: input.siblings,
    }),
    {
      canSeeRestricted: input.canSeeRestricted,
      listPrice: input.listPrice,
      status: input.status,
    },
  );
}

/**
 * Listing-page / RSC client-prop boundary.
 * Restricted sold/close dollars must be stripped before `"use client"` props.
 */
export function serializeListingDetailClientModel(
  listing: ListingDetail,
  canSeeRestricted: boolean,
): {
  listing: ListingDetail;
  listingHistoryRows: HistoryRow[];
} {
  return {
    listing: redactListingVowRestrictedFields(listing, canSeeRestricted),
    listingHistoryRows: buildAuthorizedAddressListingHistoryRows({
      mlsNumber: listing.mlsNumber,
      listPrice: listing.listPrice,
      listedAt: listing.listedAt,
      updatedAtMls: listing.updatedAtMls,
      soldAt: listing.soldAt,
      soldPrice: listing.soldPrice,
      status: listing.status,
      transactionType: listing.transactionType,
      history: listing.history,
      siblings: [],
      canSeeRestricted,
    }),
  };
}

function serializeHistoryForAccess(
  listing: ListingDetail,
  canSeeRestricted: boolean,
): ListingPanelListing["history"] {
  return listingHistoryVisibleForClient(listing.history, canSeeRestricted).map(
    (h) => ({
      id: h.id,
      event: h.event,
      price: h.price,
      originalPrice: h.originalPrice ?? null,
      contractDate: toIsoRequired(h.contractDate),
      lastUpdatedAt: toIso(h.lastUpdatedAt ?? null),
      externalMls: h.externalMls ?? null,
      visibility: h.visibility ?? null,
    }),
  );
}

/**
 * Build the authorized panel JSON for a loaded lean listing + session user.
 * Does not load from DB — caller supplies listing from {@link loadListingForDetailPage}.
 */
export function buildListingPanelPayload(
  listing: ListingDetail,
  user: AccessUser | null | undefined,
  sessionContact?: ListingPanelSessionContact | null,
): ListingPanelResult {
  const panelAccess = resolveListingDetailAccess(user, listing);

  if (panelAccess.vowBlocked) {
    if (needsEmailVerification(user)) {
      return {
        ok: false,
        status: 403,
        body: {
          error: "Email verification required.",
          vowBlocked: true,
          requiresEmailVerification: true,
        },
      };
    }
    return {
      ok: false,
      status: 401,
      body: {
        error: "VOW access requires a Houzzat account.",
        vowBlocked: true,
        requiresAuth: true,
      },
    };
  }

  const { canSeeRestricted } = panelAccess;
  const photos = resolveListingGalleryPhotos(listing);
  const soldPrice = canSeeRestricted ? listing.soldPrice : null;

  // Guests must not receive sold/close price in history either (stricter than
  // RSC HTML blur) — pass redacted soldPrice into the shared history builder.
  const listingHistoryRows = authorizeHistoryRowsForClient(
    buildAddressListingHistoryRows({
      mlsNumber: listing.mlsNumber,
      listPrice: listing.listPrice,
      listedAt: listing.listedAt,
      updatedAtMls: listing.updatedAtMls,
      soldAt: listing.soldAt,
      soldPrice,
      status: listing.status,
      transactionType: listing.transactionType,
      history: listing.history,
      siblings: [],
    }),
    {
      canSeeRestricted,
      listPrice: listing.listPrice,
      status: listing.status,
    },
  );

  const panelListing: ListingPanelListing = {
    id: listing.id,
    mlsNumber: listing.mlsNumber,
    listingKey: listing.listingKey ?? null,
    status: listing.status,
    transactionType: listing.transactionType,
    segment: listing.segment,
    propertyType: listing.propertyType,
    dataSource: listing.dataSource ?? null,
    listPrice: listing.listPrice,
    soldPrice,
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
    brokerageName: listing.brokerageName,
    taxes: listing.taxes,
    maintenanceFee: listing.maintenanceFee,
    yearBuilt: listing.yearBuilt,
    lat: listing.lat,
    lng: listing.lng,
    listedAt: toIsoRequired(listing.listedAt),
    soldAt: toIso(listing.soldAt),
    updatedAtMls: toIso(listing.updatedAtMls),
    facts: listing.facts,
    history: serializeHistoryForAccess(listing, canSeeRestricted),
    media: photos,
    rooms: [],
    openHouses: [],
  };

  return {
    ok: true,
    payload: {
      access: panelAccess,
      canonicalPath: listingPath(listing),
      photos,
      listing: panelListing,
      listingHistoryRows,
      sessionContact: panelAccess.signedIn
        ? (sessionContact ?? {
            name: null,
            email: null,
            phone: null,
          })
        : null,
    },
  };
}
