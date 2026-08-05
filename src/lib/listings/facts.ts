/**
 * PropTx / RESO listing fact sheet stored on Listing.facts (Json).
 * Only populated fields are kept — UI hides empty rows.
 */
export type ListingFacts = {
  lotSizeArea?: number | null;
  lotSizeUnits?: string | null;
  lotDepth?: number | null;
  frontageLength?: number | null;
  lotSizeSource?: string | null;
  basement?: string[] | null;
  cooling?: string[] | null;
  heatType?: string | null;
  heatSource?: string | null;
  fireplace?: boolean | null;
  garageType?: string | null;
  parkingFeatures?: string[] | null;
  coveredSpaces?: number | null;
  possessionType?: string | null;
  possessionDate?: string | null;
  possessionDetails?: string | null;
  crossStreet?: string | null;
  directions?: string | null;
  architecturalStyle?: string[] | null;
  exteriorFeatures?: string[] | null;
  interiorFeatures?: string[] | null;
  constructionMaterials?: string[] | null;
  roof?: string[] | null;
  sewer?: string[] | null;
  poolFeatures?: string[] | null;
  waterfront?: boolean | null;
  balconyType?: string | null;
  kitchensTotal?: number | null;
  bedroomsAboveGrade?: number | null;
  bedroomsBelowGrade?: number | null;
  /** PropTx TaxYear — year the annual tax amount applies to. */
  taxYear?: number | null;
  livingAreaRange?: string | null;
  approximateAge?: string | null;
  associationFeeIncludes?: string[] | null;
  associationAmenities?: string[] | null;
  petsAllowed?: string[] | null;
  inclusions?: string | null;
  exclusions?: string | null;
  virtualTourUrl?: string | null;
};

export type ListingFactRow = {
  label: string;
  value: string;
};

export type ListingFactSection = {
  id: string;
  title: string;
  rows: ListingFactRow[];
};

function joinList(value: string[] | null | undefined): string | null {
  if (!value?.length) return null;
  const cleaned = value.map((v) => v.trim()).filter(Boolean);
  return cleaned.length ? cleaned.join(", ") : null;
}

function yn(value: boolean | null | undefined): string | null {
  if (value == null) return null;
  return value ? "Yes" : "No";
}

function numLabel(value: number | null | undefined, suffix = ""): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const text = Number.isInteger(value)
    ? String(value)
    : value.toLocaleString("en-CA", { maximumFractionDigits: 2 });
  return suffix ? `${text} ${suffix}` : text;
}

function pushRow(
  rows: ListingFactRow[],
  label: string,
  value: string | null | undefined,
) {
  const v = value?.trim();
  if (!v) return;
  rows.push({ label, value: v });
}

/**
 * PropTx: BedroomsAboveGrade + BedroomsBelowGrade → "3+3".
 * Falls back to BedsTotal when grade split is missing.
 */
export function formatBedsPlusLabel(
  beds: number | null | undefined,
  facts?: ListingFacts | null,
): string | null {
  if (beds == null && facts?.bedroomsAboveGrade == null) return null;
  const above = facts?.bedroomsAboveGrade;
  const below = facts?.bedroomsBelowGrade;
  if (above != null && below != null && below > 0) {
    return `${formatBedCount(above)}+${formatBedCount(below)}`;
  }
  // Infer +beds when total > above and below-grade wasn't populated.
  if (above != null && beds != null && beds > above) {
    const inferred = beds - above;
    if (inferred > 0) {
      return `${formatBedCount(above)}+${formatBedCount(inferred)}`;
    }
  }
  if (above != null) return formatBedCount(above);
  if (beds != null) return formatBedCount(beds);
  return null;
}

function formatBedCount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Build display sections from Listing.facts (+ a few core columns). */
export function buildListingFactSections(input: {
  facts?: ListingFacts | null;
  propertyTypeLabel?: string | null;
  mlsNumber?: string | null;
  community?: string | null;
  postalCode?: string | null;
  taxesLabel?: string | null;
  maintenanceLabel?: string | null;
  parkingSpaces?: number | null;
  yearBuilt?: number | null;
  sqftLabel?: string | null;
  daysOnMarket?: number | null;
  brokerageName?: string | null;
  beds?: number | null;
  baths?: number | null;
}): ListingFactSection[] {
  const f = input.facts ?? {};
  const sections: ListingFactSection[] = [];

  const possessionValue =
    f.possessionType?.trim() || f.possessionDetails?.trim() || null;

  const overview: ListingFactRow[] = [];
  pushRow(overview, "Property type", input.propertyTypeLabel);
  pushRow(overview, "MLS®", input.mlsNumber);
  pushRow(overview, "Community", input.community);
  pushRow(overview, "Postal code", input.postalCode);
  pushRow(overview, "Style", joinList(f.architecturalStyle));
  pushRow(overview, "Approx. age", f.approximateAge);
  pushRow(
    overview,
    "Year built",
    input.yearBuilt != null ? String(input.yearBuilt) : null,
  );
  pushRow(overview, "Living area", f.livingAreaRange ?? input.sqftLabel);
  pushRow(overview, "Bedrooms", formatBedsPlusLabel(input.beds, f));
  pushRow(
    overview,
    "Bathrooms",
    input.baths != null ? String(input.baths) : null,
  );
  pushRow(overview, "Kitchens", numLabel(f.kitchensTotal));
  pushRow(overview, "Lot front", numLabel(f.frontageLength));
  pushRow(overview, "Lot depth", numLabel(f.lotDepth));
  pushRow(overview, "Cross St.", f.crossStreet);
  pushRow(overview, "Possession", possessionValue);
  pushRow(
    overview,
    "Days on market",
    input.daysOnMarket != null ? String(input.daysOnMarket) : null,
  );
  pushRow(overview, "Brokerage", input.brokerageName);
  if (overview.length) {
    sections.push({ id: "overview", title: "Overview", rows: overview });
  }

  const money: ListingFactRow[] = [];
  pushRow(money, "Taxes", input.taxesLabel);
  pushRow(money, "Maintenance", input.maintenanceLabel);
  pushRow(money, "Fee includes", joinList(f.associationFeeIncludes));
  pushRow(money, "Amenities", joinList(f.associationAmenities));
  pushRow(money, "Pets", joinList(f.petsAllowed));
  if (money.length) {
    sections.push({ id: "fees", title: "Taxes & condo", rows: money });
  }

  const building: ListingFactRow[] = [];
  pushRow(building, "Basement", joinList(f.basement));
  pushRow(building, "Cooling", joinList(f.cooling));
  pushRow(building, "Heating", f.heatType);
  pushRow(building, "Heat source", f.heatSource);
  pushRow(building, "Fireplace", yn(f.fireplace));
  pushRow(building, "Exterior", joinList(f.exteriorFeatures));
  pushRow(building, "Interior", joinList(f.interiorFeatures));
  pushRow(building, "Construction", joinList(f.constructionMaterials));
  pushRow(building, "Roof", joinList(f.roof));
  pushRow(building, "Balcony", f.balconyType);
  pushRow(building, "Pool", joinList(f.poolFeatures));
  pushRow(building, "Waterfront", yn(f.waterfront));
  if (building.length) {
    sections.push({ id: "building", title: "Building", rows: building });
  }

  const lot: ListingFactRow[] = [];
  const lotSize =
    f.lotSizeArea != null
      ? `${numLabel(f.lotSizeArea)}${f.lotSizeUnits ? ` ${f.lotSizeUnits}` : ""}`
      : null;
  pushRow(lot, "Lot size", lotSize);
  pushRow(lot, "Lot source", f.lotSizeSource);
  if (lot.length) {
    sections.push({ id: "lot", title: "Lot", rows: lot });
  }

  const parking: ListingFactRow[] = [];
  pushRow(parking, "Garage", f.garageType);
  pushRow(
    parking,
    "Parking spaces",
    input.parkingSpaces != null ? String(input.parkingSpaces) : null,
  );
  pushRow(parking, "Covered", numLabel(f.coveredSpaces));
  pushRow(parking, "Parking features", joinList(f.parkingFeatures));
  if (parking.length) {
    sections.push({ id: "parking", title: "Parking", rows: parking });
  }

  const extras: ListingFactRow[] = [];
  pushRow(extras, "Inclusions", f.inclusions);
  pushRow(extras, "Exclusions", f.exclusions);
  pushRow(extras, "Virtual tour", f.virtualTourUrl);
  if (extras.length) {
    sections.push({ id: "extras", title: "Inclusions & extras", rows: extras });
  }

  return sections;
}

export function parseListingFacts(raw: unknown): ListingFacts | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as ListingFacts;
}

/** Strip legacy approximate-pin footnotes from public remarks. */
export function stripApproxPinNote(description: string): string {
  return description
    .replace(/\n*\s*\[Map pin approximate[^\]]*\]\s*/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
