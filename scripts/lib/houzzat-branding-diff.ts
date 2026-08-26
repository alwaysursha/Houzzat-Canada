/**
 * Stage 3K.4.4 — Houzzat WorkspaceBranding field diff vs seed expectations.
 */
import { HOUZZAT_BRANDING_SEED } from "./houzzat-branding-seed";

export type HouzzatBrandingComparableRow = {
  tier: string;
  displayName: string;
  tagline: string | null;
  logoUrl: string | null;
  brokerageLogoUrl: string | null;
  faviconUrl: string | null;
  ogImageUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  footerLegalText: string | null;
  poweredByHouzzatPro: boolean;
  seoDescription: string | null;
  version: number;
};

export type HouzzatBrandingFieldDiff = {
  field: keyof typeof HOUZZAT_BRANDING_SEED;
  dbValue: unknown;
  expectedValue: unknown;
  match: boolean;
};

const HOUZZAT_BRANDING_FIELDS = Object.keys(
  HOUZZAT_BRANDING_SEED,
) as (keyof typeof HOUZZAT_BRANDING_SEED)[];

/** Prisma select shared by plan builder and apply guard. */
export const HOUZZAT_BRANDING_COMPARABLE_SELECT = {
  tier: true,
  displayName: true,
  tagline: true,
  logoUrl: true,
  brokerageLogoUrl: true,
  faviconUrl: true,
  ogImageUrl: true,
  primaryColor: true,
  secondaryColor: true,
  accentColor: true,
  contactEmail: true,
  contactPhone: true,
  footerLegalText: true,
  poweredByHouzzatPro: true,
  seoDescription: true,
  version: true,
} as const satisfies Record<keyof typeof HOUZZAT_BRANDING_SEED, true>;

const NULLABLE_STRING_FIELDS = new Set<keyof typeof HOUZZAT_BRANDING_SEED>([
  "tagline",
  "logoUrl",
  "brokerageLogoUrl",
  "faviconUrl",
  "ogImageUrl",
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "contactEmail",
  "contactPhone",
  "footerLegalText",
  "seoDescription",
]);

function normalizeComparableValue(
  field: keyof typeof HOUZZAT_BRANDING_SEED,
  value: unknown,
): unknown {
  if (NULLABLE_STRING_FIELDS.has(field)) {
    if (value === undefined || value === null) return null;
    return value;
  }
  return value;
}

export function isHouzzatBrandingComparableRow(
  row: Partial<HouzzatBrandingComparableRow> | null,
): row is HouzzatBrandingComparableRow {
  if (!row) return false;
  return HOUZZAT_BRANDING_FIELDS.every((field) => {
    if (!(field in row)) return false;
    const value = row[field];
    if (value === undefined) return false;
    return true;
  });
}

function fieldMatches(
  field: keyof typeof HOUZZAT_BRANDING_SEED,
  row: HouzzatBrandingComparableRow,
): boolean {
  const expected = normalizeComparableValue(field, HOUZZAT_BRANDING_SEED[field]);
  const dbValue = normalizeComparableValue(field, row[field]);
  if (
    field === "primaryColor" ||
    field === "secondaryColor" ||
    field === "accentColor"
  ) {
    return (
      String(dbValue ?? "").toUpperCase() === String(expected ?? "").toUpperCase()
    );
  }
  return dbValue === expected;
}

export function diffHouzzatBrandingFields(
  row: HouzzatBrandingComparableRow | null,
): HouzzatBrandingFieldDiff[] {
  if (!row) {
    return HOUZZAT_BRANDING_FIELDS.map((field) => ({
      field,
      dbValue: null,
      expectedValue: HOUZZAT_BRANDING_SEED[field],
      match: false,
    }));
  }

  return HOUZZAT_BRANDING_FIELDS.map((field) => ({
    field,
    dbValue: row[field],
    expectedValue: HOUZZAT_BRANDING_SEED[field],
    match: fieldMatches(field, row),
  }));
}

export function getHouzzatBrandingDriftFieldNames(
  row: Partial<HouzzatBrandingComparableRow> | null,
): (keyof typeof HOUZZAT_BRANDING_SEED)[] {
  if (!isHouzzatBrandingComparableRow(row)) {
    return HOUZZAT_BRANDING_FIELDS.filter((field) => {
      if (!row) return true;
      if (!(field in row)) return true;
      return row[field] === undefined;
    });
  }
  return diffHouzzatBrandingFields(row)
    .filter((entry) => !entry.match)
    .map((entry) => entry.field);
}

export function brandingMatchesHouzzatSeed(
  row: Partial<HouzzatBrandingComparableRow> | null,
): boolean {
  if (!isHouzzatBrandingComparableRow(row)) return false;
  return diffHouzzatBrandingFields(row).every((entry) => entry.match);
}

export function brandingMatchesHouzzatSeedExceptPoweredBy(
  row: Partial<HouzzatBrandingComparableRow> | null,
): boolean {
  if (!isHouzzatBrandingComparableRow(row)) return false;
  return diffHouzzatBrandingFields(row)
    .filter((entry) => entry.field !== "poweredByHouzzatPro")
    .every((entry) => entry.match);
}

export function isHouzzatPoweredByOnlyDrift(
  row: Partial<HouzzatBrandingComparableRow> | null,
): boolean {
  if (!isHouzzatBrandingComparableRow(row)) return false;
  const mismatches = diffHouzzatBrandingFields(row).filter((entry) => !entry.match);
  return (
    mismatches.length === 1 &&
    mismatches[0]?.field === "poweredByHouzzatPro" &&
    row.poweredByHouzzatPro === false &&
    HOUZZAT_BRANDING_SEED.poweredByHouzzatPro === true
  );
}
