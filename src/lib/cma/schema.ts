/**
 * Stage 5.12A — Advanced CMA JSON contracts (versioned + Zod).
 */

import { z } from "zod";

export const CMA_JSON_VERSION = 1 as const;

export const cmaCompSourceSchema = z.enum(["AUTO", "AGENT"]);
export const cmaCompRoleSchema = z.enum(["SOLD", "ACTIVE", "CONDITIONAL"]);
export const cmaConfidenceSchema = z.enum([
  "HIGH",
  "GOOD",
  "LIMITED",
]);

export const cmaSubjectSnapshotSchema = z.object({
  version: z.literal(CMA_JSON_VERSION),
  mlsNumber: z.string().nullable(),
  addressLine: z.string(),
  unitNumber: z.string().nullable(),
  city: z.string(),
  community: z.string().nullable(),
  postalCode: z.string().nullable(),
  propertyType: z.string(),
  beds: z.number(),
  baths: z.number(),
  sqft: z.number().nullable(),
  livingAreaRange: z.string().nullable(),
  parkingSpaces: z.number().nullable(),
  yearBuilt: z.number().nullable(),
  taxes: z.number().nullable(),
  maintenanceFee: z.number().nullable(),
  listPrice: z.number().nullable(),
  lat: z.number(),
  lng: z.number(),
  lotSizeArea: z.string().nullable().optional(),
  lotSizeUnits: z.string().nullable().optional(),
  garageType: z.string().nullable().optional(),
  architecturalStyle: z.array(z.string()).optional(),
});

export type CmaSubjectSnapshot = z.infer<typeof cmaSubjectSnapshotSchema>;

export const cmaCompPropertySnapshotSchema = z.object({
  addressLine: z.string(),
  unitNumber: z.string().nullable(),
  city: z.string(),
  community: z.string().nullable(),
  postalCode: z.string().nullable(),
  propertyType: z.string(),
  beds: z.number(),
  baths: z.number(),
  sqft: z.number().nullable(),
  livingAreaRange: z.string().nullable(),
  parkingSpaces: z.number().nullable(),
  yearBuilt: z.number().nullable(),
  maintenanceFee: z.number().nullable(),
  listPrice: z.number(),
  soldPrice: z.number().nullable(),
  soldAt: z.string().nullable(),
  listedAt: z.string().nullable(),
  daysOnMarket: z.number(),
  status: z.string(),
  lat: z.number(),
  lng: z.number(),
  coverImageUrl: z.string().nullable().optional(),
  lotSizeArea: z.string().nullable().optional(),
  garageType: z.string().nullable().optional(),
});

export const cmaSelectedCompSchema = z.object({
  mlsNumber: z.string().min(1),
  source: cmaCompSourceSchema,
  role: cmaCompRoleSchema,
  score: z.number().min(0).max(100),
  reasons: z.array(z.string()),
  negativeReasons: z.array(z.string()).default([]),
  outlier: z.boolean().default(false),
  outlierReason: z.string().nullable().optional(),
  distanceKm: z.number(),
  property: cmaCompPropertySnapshotSchema,
});

export type CmaSelectedComp = z.infer<typeof cmaSelectedCompSchema>;

export const cmaSelectedCompsSchema = z.object({
  version: z.literal(CMA_JSON_VERSION),
  items: z.array(cmaSelectedCompSchema),
});

export type CmaSelectedCompsDoc = z.infer<typeof cmaSelectedCompsSchema>;

export const cmaAnalysisSchema = z.object({
  version: z.literal(CMA_JSON_VERSION),
  soldCompCount: z.number().int().nonnegative(),
  activeCompCount: z.number().int().nonnegative(),
  conditionalCompCount: z.number().int().nonnegative(),
  medianSoldPrice: z.number().nullable(),
  medianPricePerSqft: z.number().nullable(),
  observedSoldLow: z.number().nullable(),
  observedSoldHigh: z.number().nullable(),
  weightedIndicatedLow: z.number().nullable(),
  weightedIndicatedMid: z.number().nullable(),
  weightedIndicatedHigh: z.number().nullable(),
  confidence: cmaConfidenceSchema,
  confidenceReasons: z.array(z.string()),
  widenStage: z.number().int().min(0).max(3),
  marketContext: z.string(),
  limitedInventory: z.boolean(),
});

export type CmaAnalysis = z.infer<typeof cmaAnalysisSchema>;

export function parseSubjectSnapshot(raw: unknown): CmaSubjectSnapshot | null {
  const parsed = cmaSubjectSnapshotSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseSelectedComps(raw: unknown): CmaSelectedCompsDoc | null {
  const parsed = cmaSelectedCompsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseCmaAnalysis(raw: unknown): CmaAnalysis | null {
  const parsed = cmaAnalysisSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
