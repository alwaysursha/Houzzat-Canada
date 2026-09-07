/**
 * Stage 6.11C.1 / 6.11E.8 — category-aware branding completion.
 */

import type { TemplateCategory } from "@/lib/tenancy/templates";

export type BrandingAssetSnapshot = {
  agentProfilePhotoUrl: string | null;
  logoUrl: string | null;
  brokerageLogoUrl: string | null;
  faviconUrl: string | null;
};

export type BrandingRequirement =
  | { asset: "agent-profile"; required: boolean }
  | { asset: "logo"; required: boolean }
  | { asset: "brokerage-logo"; required: boolean }
  | { asset: "favicon"; required: boolean };

/**
 * Required brand assets for a template category.
 * AGENT: profile photo required. Logos/favicon optional.
 * DEFAULT: no required assets (do not block onboarding).
 * TEAM: Team/primary logo required (Agent photo / favicon optional).
 * BROKERAGE: reserved — no requirements yet.
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
      return [
        { asset: "logo", required: true },
        { asset: "agent-profile", required: false },
        { asset: "brokerage-logo", required: false },
        { asset: "favicon", required: false },
      ];
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
    if (req.asset === "logo") {
      if (!input.assets.logoUrl?.trim()) {
        return "NOT_STARTED";
      }
    }
    if (req.asset === "brokerage-logo") {
      if (!input.assets.brokerageLogoUrl?.trim()) {
        return "NOT_STARTED";
      }
    }
    if (req.asset === "favicon") {
      if (!input.assets.faviconUrl?.trim()) {
        return "NOT_STARTED";
      }
    }
  }
  return "COMPLETE";
}
