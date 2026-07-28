import type {
  ListingSegment,
  ListingStatus,
  ListingTransactionType,
  PropertyType,
  Prisma,
} from "@prisma/client";

/** Loose RESO / PropTx Property row — fields vary by agreement. */
export type PropTxProperty = Record<string, unknown>;

function str(row: PropTxProperty, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v === "bigint") return String(v);
  }
  return null;
}

function num(row: PropTxProperty, ...keys: string[]): number | null {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "bigint") return Number(v);
    if (typeof v === "string" && v.trim()) {
      const n = Number(v.replace(/[,$]/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function bool(row: PropTxProperty, ...keys: string[]): boolean | null {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (s === "true" || s === "1" || s === "y" || s === "yes") return true;
      if (s === "false" || s === "0" || s === "n" || s === "no") return false;
    }
  }
  return null;
}

function date(row: PropTxProperty, ...keys: string[]): Date | null {
  const raw = str(row, ...keys);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function mapMlsNumber(row: PropTxProperty): string | null {
  // AMPRE: ListingId is MLS® # when present; ListingKey is always the OData key.
  return str(
    row,
    "ListingId",
    "MlsNumber",
    "ListingID",
    "listingId",
    "ListingKey",
    "ListingKeyNumeric",
  );
}

export function mapListingKey(row: PropTxProperty): string | null {
  return str(row, "ListingKey", "ListingKeyNumeric", "listingKey");
}

export function mapTransactionType(
  row: PropTxProperty,
): ListingTransactionType {
  const raw = (
    str(
      row,
      "TransactionType",
      "PropertyType",
      "LeaseTerms",
      "ListingAgreement",
    ) ?? ""
  ).toLowerCase();
  if (
    raw.includes("lease") ||
    raw.includes("rent") ||
    raw.includes("for lease")
  ) {
    return "LEASE";
  }
  const status = (str(row, "StandardStatus", "MlsStatus") ?? "").toLowerCase();
  if (status.includes("leased") || status === "leased") return "LEASE";
  return "SALE";
}

export function mapListingStatus(
  row: PropTxProperty,
  transactionType: ListingTransactionType,
): ListingStatus {
  const raw = (
    str(row, "StandardStatus", "MlsStatus", "ContractStatus") ?? "Active"
  ).toLowerCase();

  if (
    raw.includes("active") ||
    raw === "a" ||
    raw.includes("available") ||
    raw.includes("new")
  ) {
    return "ACTIVE";
  }
  if (raw.includes("suspend")) return "SUSPENDED";
  if (raw.includes("expir")) return "EXPIRED";
  if (raw.includes("termin") || raw.includes("cancel") || raw.includes("withdr"))
    return "TERMINATED";
  if (raw.includes("leased") || raw === "l") return "LEASED";
  if (raw.includes("sold") || raw.includes("closed") || raw === "s") {
    return transactionType === "LEASE" ? "LEASED" : "SOLD";
  }
  return "ACTIVE";
}

export function mapPropertyType(row: PropTxProperty): PropertyType {
  const raw = (
    str(row, "PropertySubType", "PropertyType", "ArchitecturalStyle") ?? ""
  ).toLowerCase();

  if (raw.includes("semi")) return "SEMI_DETACHED";
  if (raw.includes("condo town") || raw.includes("condo-town"))
    return "CONDO_TOWNHOUSE";
  if (
    raw.includes("condo") ||
    raw.includes("apartment") ||
    raw.includes("apt")
  ) {
    return "CONDO_APT";
  }
  if (
    raw.includes("town") ||
    raw.includes("row") ||
    raw.includes("att/") ||
    raw.includes("freehold town")
  ) {
    return "TOWNHOUSE";
  }
  if (
    raw.includes("multiplex") ||
    raw.includes("duplex") ||
    raw.includes("triplex") ||
    raw.includes("fourplex")
  ) {
    return "MULTIPLEX";
  }
  if (raw.includes("vacant") || raw.includes("land")) return "VACANT_LAND";
  if (raw.includes("office")) return "OFFICE";
  if (raw.includes("retail") || raw.includes("store")) return "RETAIL";
  if (raw.includes("industrial") || raw.includes("warehouse"))
    return "INDUSTRIAL";
  if (raw.includes("mixed")) return "MIXED_USE";
  if (raw.includes("detach")) return "DETACHED";
  return "OTHER";
}

export function mapSegment(
  row: PropTxProperty,
  propertyType: PropertyType,
): ListingSegment {
  const raw = (str(row, "PropertyType", "PropertyClass") ?? "").toLowerCase();
  if (raw.includes("commercial") || raw.includes("business"))
    return "COMMERCIAL";
  if (
    propertyType === "OFFICE" ||
    propertyType === "RETAIL" ||
    propertyType === "INDUSTRIAL" ||
    propertyType === "MIXED_USE"
  ) {
    return "COMMERCIAL";
  }
  return "RESIDENTIAL";
}

function buildAddressLine(row: PropTxProperty): string {
  const unparsed = str(row, "UnparsedAddress");
  if (unparsed) return unparsed;

  const parts = [
    str(row, "StreetNumber"),
    str(row, "StreetDirPrefix"),
    str(row, "StreetName"),
    str(row, "StreetSuffix"),
    str(row, "StreetDirSuffix"),
  ].filter(Boolean);
  if (parts.length) return parts.join(" ");

  return str(row, "Address", "StreetAddress") ?? "Address pending";
}

const CITY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  toronto: { lat: 43.6532, lng: -79.3832 },
  mississauga: { lat: 43.589, lng: -79.6441 },
  brampton: { lat: 43.7315, lng: -79.7624 },
  markham: { lat: 43.8561, lng: -79.337 },
  vaughan: { lat: 43.8361, lng: -79.4983 },
  oakville: { lat: 43.4675, lng: -79.6877 },
  burlington: { lat: 43.3255, lng: -79.799 },
  "richmond hill": { lat: 43.8828, lng: -79.4403 },
  pickering: { lat: 43.8384, lng: -79.0868 },
  ajax: { lat: 43.8509, lng: -79.0204 },
  whitby: { lat: 43.8971, lng: -78.9429 },
  oshawa: { lat: 43.8971, lng: -78.8658 },
  milton: { lat: 43.5183, lng: -79.8774 },
  ottawa: { lat: 45.4215, lng: -75.6972 },
};

function resolveCoordinates(row: PropTxProperty): {
  lat: number;
  lng: number;
  approximate: boolean;
} {
  let lat = num(
    row,
    "Latitude",
    "Lat",
    "GeoLat",
    "PropertyLatitude",
    "ListingLatitude",
  );
  let lng = num(
    row,
    "Longitude",
    "Long",
    "Lng",
    "GeoLng",
    "PropertyLongitude",
    "ListingLongitude",
  );

  const geo = row.GeoLocation ?? row.Location ?? row.Coordinates;
  if ((lat == null || lng == null) && geo && typeof geo === "object") {
    const g = geo as Record<string, unknown>;
    lat ??= num(g, "latitude", "Latitude", "lat", "Lat");
    lng ??= num(g, "longitude", "Longitude", "lng", "Lng", "lon", "Lon");
    if (
      (lat == null || lng == null) &&
      Array.isArray(g.coordinates) &&
      g.coordinates.length >= 2
    ) {
      const [a, b] = g.coordinates as unknown[];
      if (typeof a === "number" && typeof b === "number") {
        lng = a;
        lat = b;
      }
    }
  }

  if (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01)
  ) {
    return { lat, lng, approximate: false };
  }

  const city = (
    str(row, "City", "CityRegion", "Municipality") ?? ""
  ).toLowerCase();
  const hit = CITY_CENTROIDS[city];
  if (hit) return { ...hit, approximate: true };

  return { lat: 43.7, lng: -79.4, approximate: true };
}

export type MapPropertyResult =
  | { ok: true; data: Prisma.ListingCreateInput }
  | { ok: false; reason: string };

export function mapPropertyToListingResult(
  row: PropTxProperty,
): MapPropertyResult {
  const mlsNumber = mapMlsNumber(row);
  if (!mlsNumber) {
    return {
      ok: false,
      reason: `missing mls (keys: ${Object.keys(row).slice(0, 20).join(",")})`,
    };
  }

  const listingKey = mapListingKey(row);
  const transactionType = mapTransactionType(row);
  const status = mapListingStatus(row, transactionType);
  const propertyType = mapPropertyType(row);
  const segment = mapSegment(row, propertyType);
  const coords = resolveCoordinates(row);

  const listPrice = Math.round(
    num(row, "ListPrice", "OriginalListPrice", "CurrentPrice") ?? 0,
  );
  const soldPriceRaw = num(row, "ClosePrice", "SoldPrice", "LeaseAmount");
  const soldPrice =
    soldPriceRaw != null &&
    (status === "SOLD" || status === "LEASED" || soldPriceRaw > 0)
      ? Math.round(soldPriceRaw)
      : null;

  const listedAt =
    date(row, "ListingContractDate", "OriginalEntryTimestamp", "OnMarketDate") ??
    date(row, "ModificationTimestamp") ??
    new Date();
  const updatedAtMls =
    date(row, "ModificationTimestamp", "PhotosChangeTimestamp") ?? listedAt;
  const soldAt = date(row, "CloseDate", "PurchaseContractDate", "SoldDate");

  const beds = num(row, "BedroomsTotal", "BedsTotal", "Bedrooms") ?? 0;
  const baths =
    num(
      row,
      "BathroomsTotalInteger",
      "BathroomsTotalDecimal",
      "BathroomsTotal",
      "BathsTotal",
    ) ?? 0;
  const sqftRaw = num(
    row,
    "LivingArea",
    "BuildingAreaTotal",
    "AboveGradeFinishedArea",
    "SquareFootage",
  );
  const sqft = sqftRaw != null ? Math.round(sqftRaw) : null;
  const parking =
    Math.round(
      num(
        row,
        "ParkingTotal",
        "GarageSpaces",
        "CoveredSpaces",
        "ParkingSpaces",
      ) ?? 0,
    ) || 0;
  const yearBuiltRaw = num(row, "YearBuilt");
  const yearBuilt = yearBuiltRaw != null ? Math.round(yearBuiltRaw) : null;
  const taxesRaw = num(row, "TaxAnnualAmount", "Taxes");
  const taxes = taxesRaw != null ? Math.round(taxesRaw) : null;
  const feeRaw = num(row, "AssociationFee", "MaintenanceFee", "CondoFee");
  const maintenanceFee = feeRaw != null ? Math.round(feeRaw) : null;
  const daysOnMarket =
    Math.round(num(row, "DaysOnMarket", "CumulativeDaysOnMarket") ?? 0) || 0;

  const city = str(row, "City", "CityRegion", "Municipality") ?? "Ontario";
  const community = str(
    row,
    "CityRegion",
    "SubdivisionName",
    "Community",
    "Neighborhood",
    "District",
  );
  const postalCode = str(row, "PostalCode", "ZipCode");
  const province = str(row, "StateOrProvince", "Province") ?? "ON";
  const unitNumber = str(row, "UnitNumber", "ApartmentNumber");
  const description =
    str(row, "PublicRemarks", "PublicRemarksNew", "Description") ?? "";
  const brokerageName =
    str(
      row,
      "ListOfficeName",
      "ListOfficeMlsId",
      "OriginatingSystemName",
      "BrokerageName",
    ) ?? "MLS® Brokerage";

  const approxNote = coords.approximate
    ? "\n\n[Map pin approximate — coordinates missing from feed.]"
    : "";

  return {
    ok: true,
    data: {
      mlsNumber,
      listingKey: listingKey ?? undefined,
      status,
      segment,
      transactionType,
      dataSource: "mls",
      propertyType,
      listPrice,
      soldPrice: soldPrice ?? undefined,
      beds,
      baths,
      sqft: sqft ?? undefined,
      parkingSpaces: parking,
      yearBuilt: yearBuilt ?? undefined,
      taxes: taxes ?? undefined,
      maintenanceFee: maintenanceFee ?? undefined,
      addressLine: buildAddressLine(row),
      unitNumber: unitNumber ?? undefined,
      city,
      community: community && community !== city ? community : undefined,
      postalCode: postalCode ?? undefined,
      province: province.slice(0, 2).toUpperCase() === "ON" ? "ON" : province,
      lat: coords.lat,
      lng: coords.lng,
      description: `${description}${approxNote}`.trim(),
      brokerageName,
      listedAt,
      soldAt: soldAt ?? undefined,
      updatedAtMls,
      daysOnMarket,
      isMock: false,
    },
  };
}

export function mapPropertyToListingData(
  row: PropTxProperty,
): Prisma.ListingCreateInput | null {
  const result = mapPropertyToListingResult(row);
  return result.ok ? result.data : null;
}

export function mapMediaRow(row: PropTxProperty): {
  listingKey: string;
  url: string;
  sortOrder: number;
  isPrimary: boolean;
} | null {
  const listingKey = str(
    row,
    "ResourceRecordKey",
    "ListingKey",
    "ResourceRecordID",
  );
  const url = str(row, "MediaURL", "MediaUrl", "Url", "LongURL");
  if (!listingKey || !url) return null;
  if (!/^https?:\/\//i.test(url)) return null;

  const order = Math.round(
    num(row, "Order", "MediaOrder", "ShortDescription") ?? 0,
  );
  const preferred = bool(row, "PreferredPhotoYN", "IsPrimary", "PrimaryYN");

  return {
    listingKey,
    url,
    sortOrder: order,
    isPrimary: preferred === true || order === 0,
  };
}

export function mapOpenHouseRow(row: PropTxProperty): {
  listingKey: string;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
} | null {
  const listingKey = str(row, "ListingKey", "ResourceRecordKey");
  const startsAt = date(
    row,
    "OpenHouseStartTime",
    "OpenHouseDate",
    "StartTime",
  );
  const endsAt =
    date(row, "OpenHouseEndTime", "EndTime") ??
    (startsAt ? new Date(startsAt.getTime() + 2 * 60 * 60 * 1000) : null);
  if (!listingKey || !startsAt || !endsAt) return null;
  return {
    listingKey,
    startsAt,
    endsAt,
    notes: str(row, "OpenHouseRemarks", "Remarks"),
  };
}

export function mapHistoryRow(row: PropTxProperty): {
  listingKey: string;
  event: string;
  price: number | null;
  originalPrice: number | null;
  contractDate: Date;
  lastUpdatedAt: Date | null;
  externalMls: string | null;
  visibility: "restricted" | "public";
  note: string | null;
} | null {
  const listingKey = str(row, "ListingKey", "ResourceRecordKey");
  if (!listingKey) return null;

  const event =
    str(
      row,
      "ChangeType",
      "HistoryTransactionalChangeType",
      "Event",
      "StandardStatus",
    ) ?? "Update";

  const price = num(row, "ListPrice", "ClosePrice", "NewValue", "Price");
  const originalPrice = num(
    row,
    "PreviousListPrice",
    "PriorListPrice",
    "OldValue",
    "OriginalListPrice",
  );
  const contractDate =
    date(row, "ListingContractDate", "HistoryTransactionalDate", "CloseDate") ??
    date(row, "ModificationTimestamp");
  if (!contractDate) return null;

  return {
    listingKey,
    event,
    price: price != null ? Math.round(price) : null,
    originalPrice: originalPrice != null ? Math.round(originalPrice) : null,
    contractDate,
    lastUpdatedAt: date(row, "ModificationTimestamp"),
    externalMls: str(row, "ListingId", "MlsNumber"),
    visibility: "restricted",
    note: str(row, "PublicRemarks", "Notes"),
  };
}

/** Format an ISO timestamp for OData $filter comparisons (AMPRE style). */
export function toODataDate(value: Date): string {
  return value.toISOString().replace(/\.\d{3}Z$/, "Z");
}
