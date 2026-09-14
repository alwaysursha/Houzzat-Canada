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
  /** PropTx / RESO listing contacts (IDX-permitted when present). */
  listAgentFullName?: string | null;
  listOfficePhone?: string | null;
  listAgentDirectPhone?: string | null;
  /** Amenity flags commonly shown on MLS detail sheets. */
  fireplacesTotal?: number | null;
  furnished?: boolean | null;
  fixerUpper?: boolean | null;
  golf?: boolean | null;
  horses?: boolean | null;
  greenFeature?: boolean | null;
  garageYn?: boolean | null;
  airConditioningYn?: boolean | null;
  heatingYn?: boolean | null;
  elevator?: boolean | null;
  spa?: boolean | null;
  propertyAttachedYn?: boolean | null;
  newConstructionYn?: boolean | null;
  seniorCommunityYn?: boolean | null;
  facingDirection?: string | null;
  foundationDetails?: string[] | null;
  propertySubType?: string | null;
  roomsTotal?: number | null;
  bathsTotal?: number | null;
  occupancyType?: string | null;
  standardStatus?: string | null;
  legalDescription?: string | null;
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

/** Format a PropTx living-area range for UI, e.g. "1500-2000" → "1,500–2,000". */
export function formatLivingAreaRangeLabel(
  raw: string | null | undefined,
): string | null {
  const text = raw?.trim();
  if (!text) return null;
  const match = text.match(
    /(\d+(?:,\d{3})*(?:\.\d+)?)\s*[-–—]\s*(\d+(?:,\d{3})*(?:\.\d+)?)/,
  );
  if (match) {
    const a = Number(match[1]!.replace(/,/g, ""));
    const b = Number(match[2]!.replace(/,/g, ""));
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return `${Math.round(a).toLocaleString("en-CA")}–${Math.round(b).toLocaleString("en-CA")}`;
    }
  }
  return text;
}

/**
 * Sqft chip / card label.
 * Prefer MLS living-area range when present (do not show a midpoint as exact).
 * Fall back to an exact numeric sqft only when no range was provided.
 */
export function formatListingSqftLabel(input: {
  sqft?: number | null;
  livingAreaRange?: string | null;
  /** When true, append " sqft" / " SqFt". */
  unit?: "sqft" | "SqFt" | false;
}): string | null {
  const unit = input.unit === false ? "" : ` ${input.unit ?? "sqft"}`;
  const range = formatLivingAreaRangeLabel(input.livingAreaRange);
  if (range) return `${range}${unit}`;
  if (input.sqft != null && input.sqft > 0) {
    return `${input.sqft.toLocaleString("en-CA")}${unit}`;
  }
  return null;
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
  pushRow(
    overview,
    "Living area",
    formatListingSqftLabel({
      sqft: null,
      livingAreaRange: f.livingAreaRange,
      unit: "sqft",
    }) ?? input.sqftLabel,
  );
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

/**
 * Mobile / agent detail sheet sections matching common MLS layout:
 * Amenities → General Features → Interior Features → Exterior Features.
 * Empty rows are omitted; empty sections are dropped.
 */
export function buildMobilePropertyFeatureSections(input: {
  facts?: ListingFacts | null;
  propertyTypeLabel?: string | null;
  city?: string | null;
  parkingSpaces?: number | null;
  beds?: number | null;
  baths?: number | null;
  taxes?: number | null;
  statusLabel?: string | null;
}): ListingFactSection[] {
  const f = input.facts ?? {};
  const sections: ListingFactSection[] = [];

  const amenities: ListingFactRow[] = [];
  pushRow(
    amenities,
    "Fire Places",
    f.fireplacesTotal != null
      ? String(f.fireplacesTotal)
      : yn(f.fireplace),
  );
  pushRow(amenities, "Fixer Upper", yn(f.fixerUpper));
  pushRow(amenities, "Furnished", yn(f.furnished));
  pushRow(
    amenities,
    "Garage",
    yn(f.garageYn) ?? (f.garageType?.trim() ? "Yes" : null),
  );
  pushRow(amenities, "Golf", yn(f.golf));
  pushRow(amenities, "Green", yn(f.greenFeature));
  pushRow(amenities, "Horses", yn(f.horses));
  pushRow(amenities, "Allow Pets", joinList(f.petsAllowed));
  pushRow(amenities, "Building amenities", joinList(f.associationAmenities));
  if (amenities.length) {
    sections.push({ id: "amenities", title: "Amenities", rows: amenities });
  }

  const general: ListingFactRow[] = [];
  pushRow(general, "Sewer", joinList(f.sewer));
  pushRow(general, "Cooling", joinList(f.cooling));
  pushRow(general, "Roof", joinList(f.roof));
  pushRow(general, "Architectural Style", joinList(f.architecturalStyle));
  pushRow(general, "Pool Features", joinList(f.poolFeatures));
  pushRow(general, "Construction Materials", joinList(f.constructionMaterials));
  pushRow(general, "Heater Type", f.heatType);
  pushRow(
    general,
    "Parking Spaces",
    input.parkingSpaces != null ? String(input.parkingSpaces) : null,
  );
  pushRow(general, "Property Subtype", f.propertySubType);
  pushRow(
    general,
    "Tax Year",
    f.taxYear != null ? String(f.taxYear) : null,
  );
  pushRow(general, "Lot Depth", numLabel(f.lotDepth));
  pushRow(general, "New Construction", yn(f.newConstructionYn));
  pushRow(general, "Property Type", input.propertyTypeLabel);
  pushRow(general, "Attached Garage", yn(f.garageYn));
  pushRow(general, "Facing Direction", f.facingDirection);
  pushRow(general, "Garage Y/N", yn(f.garageYn));
  pushRow(general, "Total Rooms", numLabel(f.roomsTotal));
  pushRow(general, "Status", input.statusLabel);
  pushRow(general, "City", input.city);
  pushRow(general, "Senior Community Y/N", yn(f.seniorCommunityYn));
  pushRow(general, "Lot Size Units", f.lotSizeUnits);
  pushRow(general, "Property Attached Y/N", yn(f.propertyAttachedYn));
  pushRow(
    general,
    "Tax Annual Amount",
    input.taxes != null
      ? input.taxes.toLocaleString("en-CA", {
          maximumFractionDigits: 2,
        })
      : null,
  );
  pushRow(general, "Virtual Tour", f.virtualTourUrl);
  pushRow(general, "Standard Status", f.standardStatus);
  pushRow(general, "Occupancy Type", f.occupancyType);
  pushRow(general, "Legal Description", f.legalDescription);
  if (general.length) {
    sections.push({
      id: "general",
      title: "General Features",
      rows: general,
    });
  }

  const interior: ListingFactRow[] = [];
  pushRow(interior, "Interior Amenities", joinList(f.interiorFeatures));
  pushRow(interior, "Basement", joinList(f.basement));
  pushRow(interior, "Heat Source", f.heatSource);
  pushRow(
    interior,
    "Basement (Y/N)",
    f.basement?.length ? "Yes" : null,
  );
  pushRow(interior, "Air Conditioning Y/N", yn(f.airConditioningYn));
  pushRow(interior, "Heating Y/N", yn(f.heatingYn) ?? (f.heatType ? "Yes" : null));
  pushRow(interior, "Fireplace Y/N", yn(f.fireplace));
  pushRow(
    interior,
    "Total Bedrooms",
    formatBedsPlusLabel(input.beds, f) ??
      (input.beds != null ? String(input.beds) : null),
  );
  pushRow(interior, "Elevator?", yn(f.elevator));
  pushRow(
    interior,
    "Total Baths",
    f.bathsTotal != null
      ? String(f.bathsTotal)
      : input.baths != null
        ? String(input.baths)
        : null,
  );
  pushRow(
    interior,
    "Bedrooms",
    formatBedsPlusLabel(input.beds, f) ??
      (input.beds != null ? String(input.beds) : null),
  );
  pushRow(
    interior,
    "Living Area Range",
    formatLivingAreaRangeLabel(f.livingAreaRange),
  );
  if (interior.length) {
    sections.push({
      id: "interior",
      title: "Interior Features",
      rows: interior,
    });
  }

  const exterior: ListingFactRow[] = [];
  pushRow(exterior, "Parking Features", joinList(f.parkingFeatures));
  pushRow(
    exterior,
    "Total Parking",
    input.parkingSpaces != null ? String(input.parkingSpaces) : null,
  );
  pushRow(exterior, "Garage Type", f.garageType);
  pushRow(exterior, "Foundation Details", joinList(f.foundationDetails));
  pushRow(exterior, "Spa", yn(f.spa));
  pushRow(exterior, "Waterfront Y/N", yn(f.waterfront));
  pushRow(exterior, "Covered Spaces", numLabel(f.coveredSpaces));
  pushRow(exterior, "LotDimensionsSource", f.lotSizeSource);
  pushRow(exterior, "Exterior Features", joinList(f.exteriorFeatures));
  if (exterior.length) {
    sections.push({
      id: "exterior",
      title: "Exterior Features",
      rows: exterior,
    });
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
