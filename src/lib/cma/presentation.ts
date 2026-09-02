/**
 * Stage 5.12B — shared CMA presentation DTO from saved report state.
 * Used by public HTML CMA and print/PDF — never re-runs find-comps.
 */

import { MLS_DISCLAIMER_TEXT } from "@/components/compliance/MlsDisclaimer";
import {
  parseCmaAnalysis,
  parseSelectedComps,
  parseSubjectSnapshot,
  type CmaAnalysis,
  type CmaSelectedComp,
  type CmaSubjectSnapshot,
} from "@/lib/cma/schema";
import { SITE_URL } from "@/lib/constants";
import { formatPrice } from "@/lib/listings/constants";
import { listingPhotoSrc } from "@/lib/listings/photo-src";
import {
  POWERED_BY_HOUZZATPRO_LABEL,
  buildTenantFooterModel,
} from "@/lib/tenancy/platform-footer";
import type { WorkspaceBrandInternal } from "@/lib/tenancy/brand-dto";

export const CMA_MARKET_DISCLAIMER =
  "Market analysis for discussion only — not a formal appraisal.";

export type CmaPresentationComp = {
  mlsNumber: string;
  role: "SOLD" | "ACTIVE" | "CONDITIONAL";
  source: "AUTO" | "AGENT";
  score: number;
  distanceKm: number;
  reasons: string[];
  negativeReasons: string[];
  outlier: boolean;
  outlierReason: string | null;
  photoUrl: string | null;
  addressLine: string;
  unitNumber: string | null;
  city: string;
  community: string | null;
  beds: number;
  baths: number;
  sqft: number | null;
  lotSizeArea: string | null;
  garageType: string | null;
  parkingSpaces: number | null;
  maintenanceFee: number | null;
  listPrice: number;
  soldPrice: number | null;
  soldAt: string | null;
  daysOnMarket: number;
  pricePerSqft: number | null;
  matchExplanation: string;
};

export type CmaPresentationField = {
  label: string;
  value: string;
};

export type CmaPresentationDto = {
  reportId: string;
  preparedAt: string;
  preparedForName: string | null;
  subject: {
    addressLine: string;
    unitNumber: string | null;
    city: string;
    community: string | null;
    postalCode: string | null;
    propertyType: string;
    photoUrl: string | null;
    fields: CmaPresentationField[];
    beds: number;
    baths: number;
    sqft: number | null;
    listPrice: number | null;
  };
  analysis: {
    soldCompCount: number;
    activeCompCount: number;
    medianSoldPrice: number | null;
    medianPricePerSqft: number | null;
    observedSoldLow: number | null;
    observedSoldHigh: number | null;
    indicatedLow: number | null;
    indicatedMid: number | null;
    indicatedHigh: number | null;
    confidence: string;
    confidenceReasons: string[];
    marketContext: string;
    limitedInventory: boolean;
  } | null;
  soldComps: CmaPresentationComp[];
  competitionComps: CmaPresentationComp[];
  comparisonRows: Array<{
    label: string;
    subject: string;
    comps: string[];
  }>;
  recommendation: {
    listPrice: number | null;
    note: string | null;
    narrative: string | null;
    summary: string;
  };
  brand: {
    displayName: string;
    logoUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
  };
  agent: {
    name: string;
    email: string | null;
    phone: string | null;
  };
  disclaimer: string;
  mlsDisclaimer: string;
  platformCredit: string;
};

function absUrl(url: string | null | undefined, origin: string): string | null {
  const src = listingPhotoSrc(url) ?? (url?.trim() || null);
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith("/")) {
    return `${origin.replace(/\/$/, "")}${src}`;
  }
  return null;
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return formatPrice(n);
}

function isCondoLike(propertyType: string): boolean {
  return (
    propertyType === "CONDO_APT" ||
    propertyType === "CONDO_TOWNHOUSE" ||
    propertyType.toLowerCase().includes("condo")
  );
}

function pricePerSqft(
  price: number | null | undefined,
  sqft: number | null | undefined,
): number | null {
  if (price == null || sqft == null || sqft <= 0) return null;
  return Math.round(price / sqft);
}

function subjectFields(subject: CmaSubjectSnapshot): CmaPresentationField[] {
  const condo = isCondoLike(subject.propertyType);
  const fields: CmaPresentationField[] = [
    { label: "Beds", value: String(subject.beds) },
    { label: "Baths", value: String(subject.baths) },
  ];
  if (subject.sqft != null) {
    fields.push({ label: "Sqft", value: subject.sqft.toLocaleString("en-CA") });
  } else if (subject.livingAreaRange) {
    fields.push({ label: "Living area", value: subject.livingAreaRange });
  }
  if (!condo && subject.lotSizeArea) {
    fields.push({
      label: "Lot",
      value: subject.lotSizeUnits
        ? `${subject.lotSizeArea} ${subject.lotSizeUnits}`
        : subject.lotSizeArea,
    });
  }
  if (subject.garageType) {
    fields.push({ label: "Garage", value: subject.garageType });
  }
  if (subject.parkingSpaces != null) {
    fields.push({
      label: condo ? "Parking" : "Parking spaces",
      value: String(subject.parkingSpaces),
    });
  }
  fields.push({ label: "Property type", value: subject.propertyType });
  if (subject.taxes != null) {
    fields.push({ label: "Taxes", value: money(subject.taxes) });
  }
  if (condo && subject.maintenanceFee != null) {
    fields.push({
      label: "Condo / maintenance fee",
      value: money(subject.maintenanceFee),
    });
  }
  if (subject.yearBuilt != null) {
    fields.push({ label: "Year built", value: String(subject.yearBuilt) });
  }
  return fields;
}

function mapComp(
  c: CmaSelectedComp,
  origin: string,
): CmaPresentationComp {
  const soldOrList = c.property.soldPrice ?? c.property.listPrice;
  const pps = pricePerSqft(soldOrList, c.property.sqft);
  const matchParts = [...c.reasons.slice(0, 4)];
  if (c.negativeReasons.length) {
    matchParts.push(`Differs: ${c.negativeReasons.slice(0, 2).join("; ")}`);
  }
  return {
    mlsNumber: c.mlsNumber,
    role: c.role,
    source: c.source,
    score: c.score,
    distanceKm: c.distanceKm,
    reasons: c.reasons,
    negativeReasons: c.negativeReasons,
    outlier: c.outlier,
    outlierReason: c.outlierReason ?? null,
    photoUrl: absUrl(c.property.coverImageUrl, origin),
    addressLine: c.property.addressLine,
    unitNumber: c.property.unitNumber,
    city: c.property.city,
    community: c.property.community,
    beds: c.property.beds,
    baths: c.property.baths,
    sqft: c.property.sqft,
    lotSizeArea: c.property.lotSizeArea ?? null,
    garageType: c.property.garageType ?? null,
    parkingSpaces: c.property.parkingSpaces,
    maintenanceFee: c.property.maintenanceFee,
    listPrice: c.property.listPrice,
    soldPrice: c.property.soldPrice,
    soldAt: c.property.soldAt,
    daysOnMarket: c.property.daysOnMarket,
    pricePerSqft: pps,
    matchExplanation: matchParts.join(" · ") || "Selected comparable",
  };
}

function comparisonRows(
  subject: CmaSubjectSnapshot,
  sold: CmaPresentationComp[],
): CmaPresentationDto["comparisonRows"] {
  const condo = isCondoLike(subject.propertyType);
  const labels: Array<{
    label: string;
    subject: string;
    pick: (c: CmaPresentationComp) => string;
  }> = [
    {
      label: "Beds",
      subject: String(subject.beds),
      pick: (c) => String(c.beds),
    },
    {
      label: "Baths",
      subject: String(subject.baths),
      pick: (c) => String(c.baths),
    },
    {
      label: "Sqft",
      subject:
        subject.sqft != null
          ? subject.sqft.toLocaleString("en-CA")
          : subject.livingAreaRange ?? "—",
      pick: (c) =>
        c.sqft != null ? c.sqft.toLocaleString("en-CA") : "—",
    },
  ];
  if (!condo) {
    labels.push({
      label: "Lot",
      subject: subject.lotSizeArea ?? "—",
      pick: (c) => c.lotSizeArea ?? "—",
    });
  } else {
    labels.push({
      label: "Maint. fee",
      subject:
        subject.maintenanceFee != null ? money(subject.maintenanceFee) : "—",
      pick: (c) =>
        c.maintenanceFee != null ? money(c.maintenanceFee) : "—",
    });
  }
  labels.push({
    label: "Sold / list",
    subject: subject.listPrice != null ? money(subject.listPrice) : "—",
    pick: (c) =>
      c.soldPrice != null ? money(c.soldPrice) : money(c.listPrice),
  });
  return labels.map((row) => ({
    label: row.label,
    subject: row.subject,
    comps: sold.slice(0, 5).map(row.pick),
  }));
}

export type BuildCmaPresentationInput = {
  report: {
    id: string;
    createdAt: Date;
    subjectAddress: string | null;
    city: string;
    community: string | null;
    summary: string;
    recommendedListPrice: number | null;
    recommendationNote: string | null;
    narrative: string | null;
    subjectSnapshot: unknown;
    selectedComps: unknown;
    analysis: unknown;
  };
  brand: WorkspaceBrandInternal;
  agent: {
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  preparedForName?: string | null;
  /** Optional subject photo (canonical listing URL); never invents comps. */
  subjectPhotoUrl?: string | null;
  siteOrigin?: string;
};

export function buildCmaPresentationDto(
  input: BuildCmaPresentationInput,
): CmaPresentationDto {
  const origin = input.siteOrigin ?? SITE_URL;
  const subjectSnap = parseSubjectSnapshot(input.report.subjectSnapshot);
  const compsDoc = parseSelectedComps(input.report.selectedComps);
  const analysis = parseCmaAnalysis(input.report.analysis);

  const fallbackSubject: CmaSubjectSnapshot = subjectSnap ?? {
    version: 1,
    mlsNumber: null,
    addressLine: input.report.subjectAddress ?? input.report.city,
    unitNumber: null,
    city: input.report.city,
    community: input.report.community,
    postalCode: null,
    propertyType: "UNKNOWN",
    beds: 0,
    baths: 0,
    sqft: null,
    livingAreaRange: null,
    parkingSpaces: null,
    yearBuilt: null,
    taxes: null,
    maintenanceFee: null,
    listPrice: null,
    lat: 0,
    lng: 0,
  };

  const soldRaw =
    compsDoc?.items.filter((c) => c.role === "SOLD") ?? [];
  const competitionRaw =
    compsDoc?.items.filter(
      (c) => c.role === "ACTIVE" || c.role === "CONDITIONAL",
    ) ?? [];

  const soldComps = soldRaw.map((c) => mapComp(c, origin));
  const competitionComps = competitionRaw.map((c) => mapComp(c, origin));

  const footer = buildTenantFooterModel(input.brand);

  return {
    reportId: input.report.id,
    preparedAt: input.report.createdAt.toLocaleDateString("en-CA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    preparedForName: input.preparedForName?.trim() || null,
    subject: {
      addressLine: fallbackSubject.addressLine,
      unitNumber: fallbackSubject.unitNumber,
      city: fallbackSubject.city,
      community: fallbackSubject.community,
      postalCode: fallbackSubject.postalCode,
      propertyType: fallbackSubject.propertyType,
      photoUrl: absUrl(input.subjectPhotoUrl, origin),
      fields: subjectFields(fallbackSubject),
      beds: fallbackSubject.beds,
      baths: fallbackSubject.baths,
      sqft: fallbackSubject.sqft,
      listPrice: fallbackSubject.listPrice,
    },
    analysis: analysis
      ? {
          soldCompCount: analysis.soldCompCount,
          activeCompCount: analysis.activeCompCount,
          medianSoldPrice: analysis.medianSoldPrice,
          medianPricePerSqft: analysis.medianPricePerSqft,
          observedSoldLow: analysis.observedSoldLow,
          observedSoldHigh: analysis.observedSoldHigh,
          indicatedLow: analysis.weightedIndicatedLow,
          indicatedMid: analysis.weightedIndicatedMid,
          indicatedHigh: analysis.weightedIndicatedHigh,
          confidence: analysis.confidence,
          confidenceReasons: analysis.confidenceReasons,
          marketContext: analysis.marketContext,
          limitedInventory: analysis.limitedInventory,
        }
      : null,
    soldComps,
    competitionComps,
    comparisonRows: comparisonRows(fallbackSubject, soldComps),
    recommendation: {
      listPrice: input.report.recommendedListPrice,
      note: input.report.recommendationNote,
      narrative: input.report.narrative,
      summary: input.report.summary,
    },
    brand: {
      displayName: input.brand.displayName,
      logoUrl: absUrl(input.brand.logoUrl, origin),
      primaryColor: input.brand.colors.primary,
      secondaryColor: input.brand.colors.secondary,
    },
    agent: {
      name: input.agent.name?.trim() || input.agent.email || "Agent",
      email: input.agent.email,
      phone: input.agent.phone,
    },
    disclaimer: CMA_MARKET_DISCLAIMER,
    mlsDisclaimer: MLS_DISCLAIMER_TEXT,
    platformCredit: footer.platformCredit.label || POWERED_BY_HOUZZATPRO_LABEL,
  };
}

/** True when saved snapshots are complete enough for PDF/print. */
export function hasSavedCmaPresentationEvidence(report: {
  subjectSnapshot: unknown;
  selectedComps: unknown;
  analysis: unknown;
}): boolean {
  return Boolean(
    parseSubjectSnapshot(report.subjectSnapshot) &&
      parseSelectedComps(report.selectedComps) &&
      parseCmaAnalysis(report.analysis),
  );
}

export function assertAnalysisFromSaved(
  analysis: CmaAnalysis | null,
): asserts analysis is CmaAnalysis {
  if (!analysis) {
    throw new Error("CMA analysis snapshot missing");
  }
}
