/**
 * Public synthetic showcase for the HIGH OCTANE workspace only.
 *
 * This is independent of HIGH_OCTANE_DEVELOPMENT_LISTINGS. That development
 * switch stays off in production and still requires an authorized tester.
 *
 * The authorization below is a tenant-specific constant. It is not read from
 * the environment, so a shared flag cannot turn the showcase on for Houzzat
 * or any other workspace. Production never serves it. An ACTIVE PropTx
 * connection that can serve this workspace's own active listings replaces it.
 */
import type { WorkspaceListingEntitlement } from "@/lib/tenancy/listing-entitlement/types";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";

export const HIGH_OCTANE_PUBLIC_SHOWCASE_AUTHORIZATION = {
  workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
  mode: "public-showcase",
} as const;

export const HIGH_OCTANE_DEMO_CARD_LABEL = "DEMO PROPERTY — NOT FOR SALE";

export const HIGH_OCTANE_DEMO_PROPERTY_NOTICE =
  "This is a demonstration property. It is not an active real estate listing and is not available for purchase or viewing.";

export const HIGH_OCTANE_PUBLIC_SHOWCASE_FEATURED_COUNT = 6;

export const HIGH_OCTANE_COLLECTION_EMPTY_TITLE = "Discover Exceptional Homes";

export const HIGH_OCTANE_COLLECTION_EMPTY_BODY =
  "Our exclusive property collection is being prepared. Connect with our team to explore real estate opportunities across the Niagara Region.";

export const HIGH_OCTANE_COLLECTION_CONTACT_HREF = "/contact";

export const HIGH_OCTANE_COLLECTION_CONTACT_LABEL = "Contact Agent";

const HIGH_OCTANE_DEVELOPMENT_DATA_SOURCE = "high-octane-development";
const HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE = "staging-snapshot";

export type HighOctanePublicShowcaseDecision = {
  host: boolean;
  authorized: boolean;
  ownActiveListings: boolean;
  serve: boolean;
};

/**
 * Production and Vercel production never serve synthetic HIGH OCTANE cards.
 * Environment flags cannot turn this back on. Other workspaces are unchanged.
 */
export function highOctaneSyntheticListingsAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV !== "production" && env.VERCEL_ENV !== "production";
}

export function isHighOctaneSyntheticListingRecord(input: {
  mlsNumber?: string | null;
  dataSource?: string | null;
  isMock?: boolean | null;
}): boolean {
  if (input.isMock === true) return true;
  if (input.dataSource === HIGH_OCTANE_DEVELOPMENT_DATA_SOURCE) return true;
  if (input.dataSource === HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE) return true;
  const mlsNumber = input.mlsNumber?.trim().toUpperCase() ?? "";
  return mlsNumber.startsWith("ITSODEMO");
}

export function highOctaneMustHideSyntheticListing(input: {
  workspaceSlug: string | null | undefined;
  mlsNumber?: string | null;
  dataSource?: string | null;
  isMock?: boolean | null;
  env?: NodeJS.ProcessEnv;
}): boolean {
  if (input.workspaceSlug !== HIGH_OCTANE_PUBLIC_SHOWCASE_AUTHORIZATION.workspaceSlug) {
    return false;
  }
  if (highOctaneSyntheticListingsAllowed(input.env)) return false;
  return isHighOctaneSyntheticListingRecord(input);
}

export function omitHighOctaneSyntheticListings<
  T extends {
    mlsNumber?: string | null;
    dataSource?: string | null;
    isMock?: boolean | null;
  },
>(
  workspaceSlug: string | null | undefined,
  items: T[],
  env?: NodeJS.ProcessEnv,
): T[] {
  if (workspaceSlug !== HIGH_OCTANE_PUBLIC_SHOWCASE_AUTHORIZATION.workspaceSlug) {
    return items;
  }
  if (highOctaneSyntheticListingsAllowed(env)) return items;
  return items.filter((item) => !isHighOctaneSyntheticListingRecord(item));
}

export function highOctaneWorkspaceHasOwnActiveListings(
  authorities: WorkspaceListingEntitlement["authorities"] | null | undefined,
): boolean {
  return (authorities ?? []).some((authority) =>
    authority.capabilities.includes("ACTIVE_LISTINGS"),
  );
}

export function decideHighOctanePublicShowcase(input: {
  workspaceSlug: string | null | undefined;
  authorities?: WorkspaceListingEntitlement["authorities"] | null;
  env?: NodeJS.ProcessEnv;
}): HighOctanePublicShowcaseDecision {
  const host = input.workspaceSlug === HIGH_OCTANE_PUBLIC_SHOWCASE_AUTHORIZATION.workspaceSlug;
  const authorized =
    host && HIGH_OCTANE_PUBLIC_SHOWCASE_AUTHORIZATION.mode === "public-showcase";
  const ownActiveListings = highOctaneWorkspaceHasOwnActiveListings(input.authorities);
  return {
    host,
    authorized,
    ownActiveListings,
    serve:
      authorized &&
      !ownActiveListings &&
      highOctaneSyntheticListingsAllowed(input.env),
  };
}
