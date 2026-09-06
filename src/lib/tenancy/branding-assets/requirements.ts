/**
 * Stage 6.11C.1 — category-aware branding completion (extensible, not a rules engine).
 */

import type { TemplateCategory } from "@/lib/tenancy/templates";

export type BrandingAssetSnapshot = {
  agentProfilePhotoUrl: string | null;
  logoUrl: string | null;
  brokerageLogoUrl: string | null;
  faviconUrl: string | null;
};

export type BrandingRequirement =
  | { asset: "agent-profile"; required: true }
  | { asset: "logo"; required: false }
  | { asset: "brokerage-logo"; required: false }
  | { asset: "favicon"; required: false };

/**
 * Required brand assets for a template category.
 * AGENT: profile photo required. Logos/favicon optional.
 * DEFAULT: no required assets (do not block onboarding).
 * TEAM/BROKERAGE: reserved — no requirements yet.
 */
export function brandingRequirementsForCategory(
  category: TemplateCategory,
): readonly BrandingRequirement[] {
  switch (category) {
    case "AGENT":
      return [
        { asset: "agent-profile", required: true },
        { asset: "logo", required: false },
        { asset: "brokerage-logo", required: false },
        { asset: "favicon", required: false },
      ];
    case "DEFAULT":
      return [
        { asset: "logo", required: false },
        { asset: "brokerage-logo", required: false },
        { asset: "favicon", required: false },
      ];
    case "TEAM":
    case "BROKERAGE":
      return [];
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

export function evaluateBrandingStatus(input: {
  category: TemplateCategory;
  assets: BrandingAssetSnapshot;
}): "COMPLETE" | "NOT_STARTED" {
  const requirements = brandingRequirementsForCategory(input.category);
  const required = requirements.filter((r) => r.required);
  if (required.length === 0) {
    return "COMPLETE";
  }
  for (const req of required) {
    if (req.asset === "agent-profile") {
      if (!input.assets.agentProfilePhotoUrl?.trim()) {
        return "NOT_STARTED";
      }
    }
  }
  return "COMPLETE";
}
