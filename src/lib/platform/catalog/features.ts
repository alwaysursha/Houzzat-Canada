/**
 * Stage 6.2A — software entitlement feature codes (code catalog).
 * Runtime authority = materialized WorkspaceEntitlement rows.
 *
 * Paid Google PPC / Meta are AddOnGrant fulfillment only — not modeled here.
 */

export const FEATURE_LIVE_CHAT = "LIVE_CHAT" as const;
export const FEATURE_SEO_FOUNDATION = "SEO_FOUNDATION" as const;
export const FEATURE_AGENT_APP = "AGENT_APP" as const;
export const FEATURE_TEAM_MANAGEMENT = "TEAM_MANAGEMENT" as const;
export const FEATURE_CUSTOM_CONSUMER_APP = "CUSTOM_CONSUMER_APP" as const;

export const PLATFORM_FEATURE_CODES = [
  FEATURE_LIVE_CHAT,
  FEATURE_SEO_FOUNDATION,
  FEATURE_AGENT_APP,
  FEATURE_TEAM_MANAGEMENT,
  FEATURE_CUSTOM_CONSUMER_APP,
] as const;

export type PlatformFeatureCode = (typeof PLATFORM_FEATURE_CODES)[number];

export function isPlatformFeatureCode(value: string): value is PlatformFeatureCode {
  return (PLATFORM_FEATURE_CODES as readonly string[]).includes(value);
}
