import type {
  ListingSegment,
  ListingStatus,
  ListingTransactionType,
  PropertyType,
  Prisma,
} from "@prisma/client";
import {
  DEFAULT_GTA_CENTROID,
  lookupCityCentroid,
} from "@/lib/geo/city-centroids";
import {
  stripApproxPinNote,
  type ListingFacts,
} from "@/lib/listings/facts";

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

/**
 * Date shown as "Sold on …" / used for recently-sold sort.
 * Prefer PurchaseContractDate (TRREB "Sold Date") over CloseDate — CloseDate is
 * often a future closing / possession date and showed up as "Sold on Oct 2026".
 */
function mapSoldAt(row: PropTxProperty): Date | null {
  const purchase = date(
    row,
    "PurchaseContractDate",
    "PendingDate",
    "UnderContractDate",
    "ContractDate",
  );
  const closed = date(
    row,
    "CloseDate",
    "SoldDate",
    "DateSold",
    "ClosingDate",
  );
  const statusChanged = date(
    row,
    "SoldEntryTimestamp",
    "StatusChangeTimestamp",
    "OffMarketDate",
    "ModificationTimestamp",
  );

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  // Firm / offer-accepted date (best "Sold on" for TRREB)
  if (purchase) return purchase;
  // Closing already happened (never use a future CloseDate)
  if (closed && closed.getTime() <= endOfToday.getTime()) {
    return closed;
  }
  // When IDX/partial payloads omit PurchaseContractDate
  if (statusChanged && statusChanged.getTime() <= endOfToday.getTime()) {
    return statusChanged;
  }
  return null;
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
    "MapCenterLatitude",
    "LatitudeY",
  );
  let lng = num(
    row,
    "Longitude",
    "Long",
    "Lng",
    "GeoLng",
    "PropertyLongitude",
    "ListingLongitude",
    "MapCenterLongitude",
    "LongitudeX",
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
        // GeoJSON is [lng, lat]
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
    // Guard against swapped lat/lng from the feed (GTA lat ~43, lng ~-79).
    if (Math.abs(lat) > 60 && Math.abs(lng) < 60) {
      return { lat: lng, lng: lat, approximate: false };
    }
    return { lat, lng, approximate: false };
  }

  const city = str(row, "City", "CityRegion", "Municipality") ?? "";
  const hit = lookupCityCentroid(city);
  if (hit) return { ...hit, approximate: true };

  return { ...DEFAULT_GTA_CENTROID, approximate: true };
}

function strList(row: PropTxProperty, ...keys: string[]): string[] | null {
  for (const key of keys) {
    const v = row[key];
    if (Array.isArray(v)) {
      const items = v
        .filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
        .map((s) => s.trim());
      if (items.length) return items;
    }
    if (typeof v === "string" && v.trim()) return [v.trim()];
  }
  return null;
}

function compactFacts(facts: ListingFacts): ListingFacts | undefined {
  const out: ListingFacts = {};
  let any = false;
  for (const [key, value] of Object.entries(facts) as Array<
    [keyof ListingFacts, ListingFacts[keyof ListingFacts]]
  >) {
    if (value == null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    (out as Record<string, unknown>)[key] = value;
    any = true;
  }
  return any ? out : undefined;
}

/** Map AMPRE Property extras into Listing.facts JSON. */
export function mapListingFacts(row: PropTxProperty): ListingFacts | undefined {
  const possessionDate = date(row, "PossessionDate");
  return compactFacts({
    lotSizeArea: num(row, "LotSizeArea"),
    lotSizeUnits: str(row, "LotSizeUnits", "LotSizeAreaUnits"),
    lotDepth: num(row, "LotDepth"),
    frontageLength: num(row, "FrontageLength", "LotWidth", "LotFrontage"),
    lotSizeSource: str(row, "LotSizeSource"),
    basement: strList(row, "Basement"),
    cooling: strList(row, "Cooling"),
    heatType: str(row, "HeatType"),
    heatSource: str(row, "HeatSource"),
    fireplace: bool(row, "FireplaceYN"),
    garageType: str(row, "GarageType"),
    parkingFeatures: strList(row, "ParkingFeatures"),
    coveredSpaces: num(row, "CoveredSpaces", "GarageParkingSpaces"),
    possessionType: str(row, "PossessionType"),
    possessionDate: possessionDate
      ? possessionDate.toISOString().slice(0, 10)
      : null,
    possessionDetails: str(row, "PossessionDetails"),
    crossStreet: str(row, "CrossStreet"),
    directions: str(row, "Directions"),
    architecturalStyle: strList(row, "ArchitecturalStyle"),
    exteriorFeatures: strList(row, "ExteriorFeatures"),
    interiorFeatures: strList(row, "InteriorFeatures"),
    constructionMaterials: strList(row, "ConstructionMaterials"),
    roof: strList(row, "Roof"),
    sewer: strList(row, "Sewer", "Sewage"),
    poolFeatures: strList(row, "PoolFeatures"),
    waterfront: bool(row, "WaterfrontYN"),
    balconyType: str(row, "BalconyType"),
    kitchensTotal: num(row, "KitchensTotal", "NumberOfKitchens"),
    bedroomsAboveGrade: num(row, "BedroomsAboveGrade"),
    bedroomsBelowGrade: num(row, "BedroomsBelowGrade"),
    taxYear: (() => {
      const y = num(row, "TaxYear", "TaxesYear");
      return y != null && y >= 1900 && y <= 2100 ? Math.round(y) : null;
    })(),
    livingAreaRange: str(row, "LivingAreaRange"),
    approximateAge: str(row, "ApproximateAge"),
    associationFeeIncludes: strList(row, "AssociationFeeIncludes"),
    associationAmenities: strList(row, "AssociationAmenities"),
    petsAllowed: strList(row, "PetsAllowed"),
    inclusions: str(row, "Inclusions"),
    exclusions: str(row, "Exclusions"),
    virtualTourUrl: str(
      row,
      "VirtualTourURLUnbranded",
      "VirtualTourURLBranded",
      "VirtualTourURLUnbranded2",
    ),
  });
}

function parseRangeMidpoint(raw: string | null): number | null {
  if (!raw) return null;
  const range = raw.match(/(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return Math.round((a + b) / 2);
    }
  }
  const single = raw.match(/(\d+(?:\.\d+)?)/);
  if (!single) return null;
  const n = Number(single[1]);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function mapSqft(row: PropTxProperty): number | null {
  const direct = num(
    row,
    "LivingArea",
    "BuildingAreaTotal",
    "AboveGradeFinishedArea",
    "FinishedSqFt",
    "SquareFootage",
  );
  if (direct != null && direct > 0) return Math.round(direct);

  const fromRange = parseRangeMidpoint(
    str(
      row,
      "LivingAreaRange",
      "BuildingAreaRange",
      "ApproximateSquareFootage",
      "SqftRange",
    ),
  );
  return fromRange != null && fromRange > 0 ? fromRange : null;
}

function mapYearBuilt(row: PropTxProperty): number | null {
  const direct = num(row, "YearBuilt", "YearBuiltEffective");
  if (direct != null && direct >= 1800 && direct <= new Date().getFullYear() + 2) {
    return Math.round(direct);
  }

  const ageRaw = str(
    row,
    "ApproximateAge",
    "Age",
    "BuildingAge",
    "PropertyAge",
  );
  if (!ageRaw) return null;
  if (/new|under\s*construct/i.test(ageRaw)) {
    return new Date().getFullYear();
  }
  const mid = parseRangeMidpoint(ageRaw);
  if (mid == null) return null;
  const year = new Date().getFullYear() - mid;
  return year >= 1800 && year <= new Date().getFullYear() + 2 ? year : null;
}

function mapBeds(row: PropTxProperty): number {
  const total = num(row, "BedroomsTotal", "BedsTotal", "Bedrooms");
  if (total != null) return total;
  const above = num(row, "BedroomsAboveGrade") ?? 0;
  const below = num(row, "BedroomsBelowGrade") ?? 0;
  return above + below;
}

function mapBaths(row: PropTxProperty): number {
  const decimal = num(
    row,
    "BathroomsTotalDecimal",
    "BathroomsTotal",
    "BathsTotal",
  );
  if (decimal != null) return decimal;
  const full =
    num(row, "BathroomsTotalInteger", "BathroomsFull") ?? 0;
  const half = num(row, "BathroomsHalfInteger", "BathroomsPartial") ?? 0;
  return full + half * 0.5;
}

export const APPROX_PIN_NOTE =
  "[Map pin approximate — coordinates missing from feed.]";

export { stripApproxPinNote };

export type MapPropertyResult =
  | {
      ok: true;
      data: Prisma.ListingCreateInput;
      approximateCoords: boolean;
    }
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
  const soldAt = mapSoldAt(row);

  const beds = mapBeds(row);
  const baths = mapBaths(row);
  const sqft = mapSqft(row);
  const parking =
    Math.round(
      num(
        row,
        "ParkingTotal",
        "GarageSpaces",
        "CoveredSpaces",
        "ParkingSpaces",
        "TotalParking",
      ) ?? 0,
    ) || 0;
  const yearBuilt = mapYearBuilt(row);
  const taxesRaw = num(row, "TaxAnnualAmount", "Taxes", "AnnualTaxes");
  const taxes = taxesRaw != null ? Math.round(taxesRaw) : null;
  const feeRaw = num(row, "AssociationFee", "MaintenanceFee", "CondoFee");
  const maintenanceFee = feeRaw != null ? Math.round(feeRaw) : null;
  const daysOnMarket = (() => {
    if (listedAt) {
      const end =
        soldAt &&
        (status === "SOLD" ||
          status === "LEASED" ||
          status === "EXPIRED" ||
          status === "TERMINATED")
          ? soldAt
          : new Date();
      return Math.max(
        0,
        Math.floor((end.getTime() - listedAt.getTime()) / 86_400_000),
      );
    }
    return (
      Math.round(num(row, "DaysOnMarket", "CumulativeDaysOnMarket") ?? 0) || 0
    );
  })();

  const city = str(row, "City", "CityRegion", "Municipality") ?? "Ontario";
  const community = str(
    row,
    "CityRegion",
    "SubdivisionName",
    "Community",
    "CommunityName",
    "Neighborhood",
    "Neighbourhood",
    "District",
    "Area",
  );
  const postalCode = str(row, "PostalCode", "ZipCode");
  const province = str(row, "StateOrProvince", "Province") ?? "ON";
  const unitNumber = str(row, "UnitNumber", "ApartmentNumber");
  const description = stripApproxPinNote(
    str(row, "PublicRemarks", "PublicRemarksNew", "Description", "Remarks") ??
      "",
  );
  const brokerageName =
    str(
      row,
      "ListOfficeName",
      "ListOfficeMlsId",
      "OriginatingSystemName",
      "BrokerageName",
    ) ?? "MLS® Brokerage";

  const facts = mapListingFacts(row);

  return {
    ok: true,
    approximateCoords: coords.approximate,
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
      // Never append approximate-pin notes into public remarks.
      description,
      brokerageName,
      facts: facts ?? undefined,
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
  const resourceName = str(row, "ResourceName");
  if (resourceName && resourceName.toLowerCase() !== "property") return null;

  const mediaType = (
    str(row, "MediaType", "MimeType", "MediaCategory") ?? ""
  ).toLowerCase();
  if (
    mediaType &&
    !mediaType.includes("image") &&
    !mediaType.includes("photo") &&
    !mediaType.includes("jpeg") &&
    !mediaType.includes("jpg") &&
    !mediaType.includes("png") &&
    !mediaType.includes("webp")
  ) {
    return null;
  }

  const listingKey = str(
    row,
    "ResourceRecordKey",
    "ListingKey",
    "ResourceRecordID",
  );
  const url = str(
    row,
    "MediaURL",
    "MediaUrl",
    "Url",
    "LongURL",
    "MediaObjectID",
  );
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
    isPrimary: preferred === true || order === 0 || order === 1,
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

export function mapRoomRow(row: PropTxProperty): {
  listingKey: string;
  roomKey: string;
  roomType: string;
  roomLevel: string | null;
  dimensions: string | null;
  length: number | null;
  width: number | null;
  units: string | null;
  features: string | null;
  sortOrder: number;
} | null {
  const listingKey = str(row, "ListingKey", "ResourceRecordKey");
  const roomKey = str(row, "RoomKey");
  const roomType = str(row, "RoomType");
  if (!listingKey || !roomKey || !roomType) return null;

  const status = (str(row, "RoomStatus") ?? "Active").toLowerCase();
  if (status && status !== "active") return null;

  const featureParts = [
    str(row, "RoomFeature1"),
    str(row, "RoomFeature2"),
    str(row, "RoomFeature3"),
  ].filter(Boolean) as string[];
  const featureList = strList(row, "RoomFeatures") ?? [];
  const features = [...new Set([...featureParts, ...featureList])]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");

  const length = num(row, "RoomLength");
  const width = num(row, "RoomWidth");
  const units = str(row, "RoomLengthWidthUnits", "RoomAreaUnits");
  const dimensions =
    str(row, "RoomDimensions") ??
    (length != null && width != null
      ? `${length} x ${width}${units ? ` ${units}` : ""}`
      : null);

  return {
    listingKey,
    roomKey,
    roomType,
    roomLevel: str(row, "RoomLevel"),
    dimensions,
    length,
    width,
    units,
    features: features || null,
    sortOrder: Math.round(num(row, "Order") ?? 0),
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

/** Marker prefix for Property-derived history (vs HistoryTransactional). */
export const SYNTHETIC_HISTORY_NOTE_PREFIX = "synthetic:";

export type SyntheticHistoryEvent = {
  event: string;
  price: number | null;
  originalPrice: number | null;
  contractDate: Date;
  lastUpdatedAt: Date | null;
  visibility: "restricted" | "public";
  note: string;
};

/**
 * Build listing-history rows from Property status/price fields.
 * Used while HistoryTransactional is not entitled on the VOW feed.
 * Does not emit a "Listed" row — the UI already synthesizes the current cycle.
 */
export function mapSyntheticHistoryFromProperty(
  row: PropTxProperty,
): SyntheticHistoryEvent[] {
  const transactionType = mapTransactionType(row);
  const status = mapListingStatus(row, transactionType);
  const listPriceRaw = num(row, "ListPrice", "CurrentPrice");
  const listPrice =
    listPriceRaw != null ? Math.round(listPriceRaw) : null;
  const listedAt =
    date(row, "ListingContractDate", "OriginalEntryTimestamp", "OnMarketDate") ??
    date(row, "ModificationTimestamp");
  const modAt = date(row, "ModificationTimestamp");

  const events: SyntheticHistoryEvent[] = [];

  const previousList = num(row, "PreviousListPrice", "PriorListPrice");
  const originalList = num(row, "OriginalListPrice");
  const priorStatus = (str(row, "PriorMlsStatus") ?? "").toLowerCase();
  const priorPrice =
    previousList != null
      ? Math.round(previousList)
      : priorStatus.includes("price") && originalList != null
        ? Math.round(originalList)
        : originalList != null &&
            listPrice != null &&
            Math.round(originalList) !== listPrice
          ? Math.round(originalList)
          : null;
  const priceChangeAt =
    date(row, "PriceChangeTimestamp") ?? modAt ?? listedAt;

  if (
    priorPrice != null &&
    listPrice != null &&
    priorPrice !== listPrice &&
    priceChangeAt
  ) {
    events.push({
      event: "Price Change",
      price: listPrice,
      originalPrice: priorPrice,
      contractDate: listedAt ?? priceChangeAt,
      lastUpdatedAt: priceChangeAt,
      visibility: "restricted",
      note: `${SYNTHETIC_HISTORY_NOTE_PREFIX}Price Change`,
    });
  }

  const closePriceRaw = num(row, "ClosePrice", "SoldPrice");
  const closePrice =
    closePriceRaw != null ? Math.round(closePriceRaw) : null;

  if (status === "SOLD") {
    const at =
      mapSoldAt(row) ??
      date(row, "SoldEntryTimestamp") ??
      modAt ??
      listedAt;
    if (at) {
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      // Never use a future CloseDate as Last Update in history.
      const lastUpdatedAt =
        at.getTime() <= endOfToday.getTime() ? at : (modAt ?? listedAt ?? at);
      events.push({
        event: "Sold",
        price: closePrice ?? listPrice,
        originalPrice: null,
        contractDate: listedAt ?? at,
        lastUpdatedAt,
        visibility: "restricted",
        note: `${SYNTHETIC_HISTORY_NOTE_PREFIX}Sold`,
      });
    }
  } else if (status === "LEASED") {
    const at =
      mapSoldAt(row) ??
      date(row, "LeasedEntryTimestamp") ??
      modAt ??
      listedAt;
    if (at) {
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      const lastUpdatedAt =
        at.getTime() <= endOfToday.getTime() ? at : (modAt ?? listedAt ?? at);
      events.push({
        event: "Leased",
        price: closePrice ?? listPrice,
        originalPrice: null,
        contractDate: listedAt ?? at,
        lastUpdatedAt,
        visibility: "restricted",
        note: `${SYNTHETIC_HISTORY_NOTE_PREFIX}Leased`,
      });
    }
  } else if (status === "TERMINATED") {
    const at =
      date(row, "TerminatedDate", "UnavailableDate") ??
      date(row, "TerminatedEntryTimestamp") ??
      modAt ??
      listedAt;
    if (at) {
      events.push({
        event: "Terminated",
        price: listPrice,
        originalPrice: null,
        contractDate: listedAt ?? at,
        lastUpdatedAt: at,
        visibility: "public",
        note: `${SYNTHETIC_HISTORY_NOTE_PREFIX}Terminated`,
      });
    }
  } else if (status === "EXPIRED") {
    const at =
      date(row, "UnavailableDate") ??
      date(row, "ExpirationDate") ??
      modAt ??
      listedAt;
    if (at) {
      events.push({
        event: "Expired",
        price: listPrice,
        originalPrice: null,
        contractDate: listedAt ?? at,
        lastUpdatedAt: at,
        visibility: "public",
        note: `${SYNTHETIC_HISTORY_NOTE_PREFIX}Expired`,
      });
    }
  } else if (status === "SUSPENDED") {
    const at =
      date(row, "SuspendedDate") ??
      date(row, "SuspendedEntryTimestamp") ??
      modAt ??
      listedAt;
    if (at) {
      events.push({
        event: "Suspended",
        price: listPrice,
        originalPrice: null,
        contractDate: listedAt ?? at,
        lastUpdatedAt: at,
        visibility: "public",
        note: `${SYNTHETIC_HISTORY_NOTE_PREFIX}Suspended`,
      });
    }
  }

  return events;
}

/** Format an ISO timestamp for OData $filter comparisons (AMPRE style). */
export function toODataDate(value: Date): string {
  return value.toISOString().replace(/\.\d{3}Z$/, "Z");
}
