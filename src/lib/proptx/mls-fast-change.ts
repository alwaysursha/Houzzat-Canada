/**
 * Fast Sync unchanged-listing gate.
 *
 * Authoritative signal is Property.ModificationTimestamp vs Listing.updatedAtMls.
 * Defensive field checks still run when the timestamp is not newer, so a
 * price/status/sold/photo divergence is never skipped.
 *
 * daysOnMarket and map pins are excluded: DOM ticks daily, and fast sync
 * must not treat a city-centroid pin as a change against a stored street pin.
 *
 * Full sync does not call this.
 */

export type FastListingComparable = {
  status: string;
  listPrice: number;
  soldPrice: number | null;
  soldAt: Date | null;
  updatedAtMls: Date | null;
  transactionType: string;
  segment: string;
  propertyType: string;
  beds: number;
  baths: number;
  sqft: number | null;
  parkingSpaces: number;
  yearBuilt: number | null;
  taxes: number | null;
  maintenanceFee: number | null;
  addressLine: string;
  unitNumber: string | null;
  city: string;
  community: string | null;
  postalCode: string | null;
  province: string;
  description: string;
  brokerageName: string;
  listedAt: Date | null;
  listingKey: string | null;
};

export type FastIncomingProperty = FastListingComparable & {
  modificationTimestamp: Date | null;
  photosChangeTimestamp: Date | null;
};

export type FastChangeFlags = {
  newerModification: boolean;
  statusChanged: boolean;
  priceChanged: boolean;
  soldChanged: boolean;
  photoChanged: boolean;
  otherMaterialChanged: boolean;
};

export type FastChangeDecision =
  | { write: false }
  | {
      write: true;
      isNew: boolean;
      flags: FastChangeFlags;
      /** FAST may call PropTx Media. False when photo state did not change. */
      fetchMedia: boolean;
    };

function parseStamp(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function readMlsTimestamps(row: {
  ModificationTimestamp?: unknown;
  PhotosChangeTimestamp?: unknown;
}): { modificationTimestamp: Date | null; photosChangeTimestamp: Date | null } {
  return {
    modificationTimestamp: parseStamp(row.ModificationTimestamp),
    photosChangeTimestamp: parseStamp(row.PhotosChangeTimestamp),
  };
}

function sameInstant(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim() === (b ?? "").trim();
}

function sameNumber(a: number | null | undefined, b: number | null | undefined): boolean {
  const left = a == null || Number.isNaN(a) ? null : a;
  const right = b == null || Number.isNaN(b) ? null : b;
  return left === right;
}

function isClosedStatus(status: string): boolean {
  return status === "SOLD" || status === "LEASED";
}

function soldMateriallyDifferent(
  existing: FastListingComparable,
  incoming: FastListingComparable,
): boolean {
  if (isClosedStatus(incoming.status)) {
    if (incoming.soldAt && !sameInstant(incoming.soldAt, existing.soldAt)) {
      return true;
    }
    if (
      incoming.soldPrice != null &&
      !sameNumber(incoming.soldPrice, existing.soldPrice)
    ) {
      return true;
    }
    return false;
  }
  if (isClosedStatus(existing.status)) return true;
  if (existing.soldAt || existing.soldPrice != null) return true;
  return false;
}

function otherMateriallyDifferent(
  existing: FastListingComparable,
  incoming: FastListingComparable,
): boolean {
  return (
    !sameText(existing.transactionType, incoming.transactionType) ||
    !sameText(existing.segment, incoming.segment) ||
    !sameText(existing.propertyType, incoming.propertyType) ||
    !sameNumber(existing.beds, incoming.beds) ||
    !sameNumber(existing.baths, incoming.baths) ||
    !sameNumber(existing.sqft, incoming.sqft) ||
    !sameNumber(existing.parkingSpaces, incoming.parkingSpaces) ||
    !sameNumber(existing.yearBuilt, incoming.yearBuilt) ||
    !sameNumber(existing.taxes, incoming.taxes) ||
    !sameNumber(existing.maintenanceFee, incoming.maintenanceFee) ||
    !sameText(existing.addressLine, incoming.addressLine) ||
    !sameText(existing.unitNumber, incoming.unitNumber) ||
    !sameText(existing.city, incoming.city) ||
    !sameText(existing.community, incoming.community) ||
    !sameText(existing.postalCode, incoming.postalCode) ||
    !sameText(existing.province, incoming.province) ||
    !sameText(existing.description, incoming.description) ||
    !sameText(existing.brokerageName, incoming.brokerageName) ||
    !sameInstant(existing.listedAt, incoming.listedAt) ||
    !sameText(existing.listingKey, incoming.listingKey)
  );
}

function isNewer(incoming: Date | null, stored: Date | null): boolean {
  if (!incoming) return false;
  if (!stored) return true;
  return incoming.getTime() > stored.getTime();
}

function emptyFlags(): FastChangeFlags {
  return {
    newerModification: false,
    statusChanged: false,
    priceChanged: false,
    soldChanged: false,
    photoChanged: false,
    otherMaterialChanged: false,
  };
}

/**
 * Decide whether Fast Sync must persist this Property.
 * `write: false` means identical for customer-visible purposes.
 */
export function evaluateFastListingChange(
  existing: FastListingComparable | null,
  incoming: FastIncomingProperty,
): FastChangeDecision {
  if (!existing) {
    return {
      write: true,
      isNew: true,
      flags: emptyFlags(),
      fetchMedia: true,
    };
  }

  const storedStamp = existing.updatedAtMls;
  const flags: FastChangeFlags = {
    newerModification: isNewer(incoming.modificationTimestamp, storedStamp),
    statusChanged: existing.status !== incoming.status,
    priceChanged: !sameNumber(existing.listPrice, incoming.listPrice),
    soldChanged: soldMateriallyDifferent(existing, incoming),
    photoChanged: isNewer(incoming.photosChangeTimestamp, storedStamp),
    otherMaterialChanged: otherMateriallyDifferent(existing, incoming),
  };

  const timestampsMissing =
    !incoming.modificationTimestamp && !incoming.photosChangeTimestamp;
  const material =
    flags.newerModification ||
    flags.statusChanged ||
    flags.priceChanged ||
    flags.soldChanged ||
    flags.photoChanged ||
    flags.otherMaterialChanged;

  if (!timestampsMissing && !material) {
    return { write: false };
  }

  const fetchMedia =
    flags.photoChanged ||
    (flags.newerModification && !incoming.photosChangeTimestamp);

  return {
    write: true,
    isNew: false,
    flags,
    fetchMedia,
  };
}
