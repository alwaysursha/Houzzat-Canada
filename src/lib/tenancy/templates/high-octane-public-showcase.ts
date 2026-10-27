/**
 * Public synthetic showcase for the HIGH OCTANE workspace only.
 *
 * This is independent of HIGH_OCTANE_DEVELOPMENT_LISTINGS. That development
 * switch stays off in production and still requires an authorized tester.
 *
 * The authorization below is a tenant-specific constant. It is not read from
 * the environment, so a shared flag cannot turn the showcase on for Houzzat
 * or any other workspace. An ACTIVE PropTx connection that can serve this
 * workspace's own active listings replaces the showcase.
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

export type HighOctanePublicShowcaseDecision = {
  host: boolean;
  authorized: boolean;
  ownActiveListings: boolean;
  serve: boolean;
};

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
}): HighOctanePublicShowcaseDecision {
  const host = input.workspaceSlug === HIGH_OCTANE_PUBLIC_SHOWCASE_AUTHORIZATION.workspaceSlug;
  const authorized =
    host && HIGH_OCTANE_PUBLIC_SHOWCASE_AUTHORIZATION.mode === "public-showcase";
  const ownActiveListings = highOctaneWorkspaceHasOwnActiveListings(input.authorities);
  return {
    host,
    authorized,
    ownActiveListings,
    serve: authorized && !ownActiveListings,
  };
}
