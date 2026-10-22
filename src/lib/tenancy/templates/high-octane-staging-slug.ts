/**
 * Browser-safe identity for the HIGH OCTANE staging workspace.
 * Presentation code may compare this slug. Hostname normalization, slug
 * derivation, and the staging database gate stay in server modules.
 */
export const HIGH_OCTANE_STAGING_WORKSPACE_SLUG = "high-octane-real-estate" as const;

/** Internal login. Never a public agent address. */
export const HIGH_OCTANE_STAGING_OWNER_EMAIL =
  "staging-owner@high-octane-staging.invalid" as const;

/** Used only when this workspace has no persisted market list. */
export const HIGH_OCTANE_STAGING_MARKET_LABEL = "Niagara Region" as const;

export const HIGH_OCTANE_STAGING_FEATURED_CITIES = [
  "Niagara Falls",
  "St. Catharines",
  "Niagara-on-the-Lake",
  "Welland",
  "Thorold",
  "Grimsby",
] as const;

export const HIGH_OCTANE_STAGING_SEO_TITLE_SUFFIX =
  "Niagara Homes for Sale & Open Houses" as const;

export const HIGH_OCTANE_STAGING_AREA_SERVED = "Niagara Region" as const;
