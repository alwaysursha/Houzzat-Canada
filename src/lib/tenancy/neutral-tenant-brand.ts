/**
 * Stage 3K.2 — neutral safe default when workspace branding row is missing
 * (workspace scope ON only — never Houzzat identity).
 */
import type { WorkspaceBrandInternal } from "@/lib/tenancy/brand-dto";

export const NEUTRAL_TENANT_COLORS = {
  primary: "#2563EB",
  secondary: "#1E40AF",
  accent: "#0EA5E9",
  surface: "#FFFFFF",
  ink: "#111827",
} as const;

export function buildNeutralTenantBrand(
  workspaceId: string,
  displayName = "Real Estate",
): WorkspaceBrandInternal {
  return {
    workspaceId,
    source: "neutral_default",
    tier: "GENERIC",
    displayName,
    staffDisplayName: displayName,
    tagline: "Search homes and connect with a local agent.",
    logoUrl: null,
    brokerageLogoUrl: null,
    faviconUrl: null,
    ogImageUrl: null,
    colors: { ...NEUTRAL_TENANT_COLORS },
    contact: { email: null, phone: null },
    footerLegalText: null,
    poweredByHouzzatPro: true,
    seoDescription: "Search homes and connect with a local agent.",
    version: 0,
  };
}
