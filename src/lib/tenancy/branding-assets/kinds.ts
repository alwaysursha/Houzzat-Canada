/**
 * Stage 6.11C.1 — workspace branding asset kinds (template-agnostic).
 */

export const BRANDING_ASSET_KINDS = [
  "agent-profile",
  "logo",
  "brokerage-logo",
  "favicon",
] as const;

export type BrandingAssetKind = (typeof BRANDING_ASSET_KINDS)[number];

export function isBrandingAssetKind(value: unknown): value is BrandingAssetKind {
  return (
    typeof value === "string" &&
    (BRANDING_ASSET_KINDS as readonly string[]).includes(value)
  );
}

/** Prisma WorkspaceBranding column for each asset kind. */
export function brandingAssetColumn(
  kind: BrandingAssetKind,
):
  | "agentProfilePhotoUrl"
  | "logoUrl"
  | "brokerageLogoUrl"
  | "faviconUrl" {
  switch (kind) {
    case "agent-profile":
      return "agentProfilePhotoUrl";
    case "logo":
      return "logoUrl";
    case "brokerage-logo":
      return "brokerageLogoUrl";
    case "favicon":
      return "faviconUrl";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function brandingAssetFolder(kind: BrandingAssetKind): string {
  switch (kind) {
    case "agent-profile":
      return "agent-profile";
    case "logo":
      return "logo";
    case "brokerage-logo":
      return "brokerage-logo";
    case "favicon":
      return "favicon";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
