/**
 * Customer-facing Home Valuation presentation copy.
 * Does not affect valuation math — labels and disclaimers only.
 */

import type {
  ValuationConfidence,
  ValuationEvidenceStage,
} from "@/lib/market/home-value-estimate";

/** Concise customer-facing disclaimer (API + UI). */
export const HOME_VALUE_DISCLAIMER =
  "Automated estimate based on available sold properties. Not a professional appraisal.";

/** Clarifies what confidence means — evidence quality, not verified prediction accuracy. */
export const HOME_VALUE_CONFIDENCE_EVIDENCE_NOTE =
  "Confidence describes comparable evidence quality, not a verified prediction accuracy rate.";

const CONFIDENCE_COPY: Record<
  ValuationConfidence,
  { label: string; description: string }
> = {
  low: {
    label: "Low",
    description: "Limited or wider-area comparable data",
  },
  medium: {
    label: "Medium",
    description: "Moderate city comparable support",
  },
  high: {
    label: "High",
    description: "Stronger local comparable support",
  },
};

const STAGE_CONFIDENCE_HINT: Record<ValuationEvidenceStage, string> = {
  neighbourhood: "Based on nearby neighbourhood sales",
  city: "Based on recent city sales",
  region: "Based on a wider regional comparable set",
};

/** Optional stage hint for consumer UI (does not replace confidence label). */
export function valuationEvidenceStageHint(
  stage: ValuationEvidenceStage | null | undefined,
): string | null {
  if (!stage) return null;
  return STAGE_CONFIDENCE_HINT[stage];
}

export function valuationConfidenceLabel(
  confidence: ValuationConfidence,
): string {
  return CONFIDENCE_COPY[confidence].label;
}

export function valuationConfidenceDescription(
  confidence: ValuationConfidence,
): string {
  return CONFIDENCE_COPY[confidence].description;
}

/** "Medium · Moderate comparable support" */
export function formatValuationConfidence(
  confidence: ValuationConfidence,
): string {
  const row = CONFIDENCE_COPY[confidence];
  return `${row.label} · ${row.description}`;
}

export function isValuationConfidence(
  value: unknown,
): value is ValuationConfidence {
  return value === "low" || value === "medium" || value === "high";
}

/** OK-path disclaimer used when an estimate is shown. */
export function homeValueOkDisclaimer(): string {
  return HOME_VALUE_DISCLAIMER;
}

/** Insufficient-data path (no dollar estimate). */
export function homeValueInsufficientDisclaimer(): string {
  return "Insufficient reliable sold comparables for an indicative estimate.";
}
