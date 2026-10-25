/**
 * Reversible HIGH OCTANE development listings.
 *
 * TRREB use is not authorized for this workspace. The data-connection contract
 * forbids falling back to Houzzat credentials, and this module does not read
 * or copy MLS rows. Authorized testers receive in-memory fixtures through the
 * existing search, detail, and featured-listing responses.
 *
 * Disable development mode by unsetting HIGH_OCTANE_DEVELOPMENT_LISTINGS.
 * Vercel production stays off. A Preview deployment runs with NODE_ENV=production,
 * so that value alone must not turn the staging switch off. When Niagara is connected, leave the switch
 * unset and give this workspace its own listing entitlement. The existing
 * screens already follow that hostname entitlement.
 */
import type { ListingDetail, ListingCard, ListingSearchParams } from "@/lib/listings/types";
import { mapResoListingPackage } from "@/lib/listings/itso/map-reso-listing";
import {
  niagaraDemoActiveListings,
  niagaraDemoByListingId,
} from "@/lib/listings/itso/niagara-demo-listings";
import {
  selectItsoListingSource,
  type ItsoLiveSourceInput,
  type ItsoSourceRequest,
} from "@/lib/listings/itso/itso-sources";
import { HIGH_OCTANE_PREVIEW_FIXTURE } from "@/lib/tenancy/templates/high-octane-preview-fixture";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";

export const HIGH_OCTANE_DEVELOPMENT_LISTINGS_SWITCH =
  "HIGH_OCTANE_DEVELOPMENT_LISTINGS" as const;

export const HIGH_OCTANE_DEVELOPMENT_LISTINGS_ENABLED_VALUE = "on" as const;

export const HIGH_OCTANE_DEVELOPMENT_LISTING_SOURCE =
  "high-octane-development" as const;

export const HIGH_OCTANE_DEVELOPMENT_LISTINGS_DISABLE =
  "unset HIGH_OCTANE_DEVELOPMENT_LISTINGS" as const;

export const HIGH_OCTANE_NIAGARA_LISTING_SOURCE_SWITCH =
  "Create this workspace's own ACTIVE listing connection, then unset HIGH_OCTANE_DEVELOPMENT_LISTINGS. Search, property details, and featured listings already use the hostname entitlement." as const;

const SAAD_EMAIL = HIGH_OCTANE_PREVIEW_FIXTURE.email.trim().toLowerCase();

export type HighOctaneDevelopmentListingActor = {
  email: string | null;
  masterAdminActive: boolean;
  highOctaneMembershipActive: boolean;
};

export type HighOctaneDevelopmentListingDecision = {
  modeEnabled: boolean;
  host: boolean;
  tester: boolean;
  serveFixtures: boolean;
  trrebBorrowAuthorized: false;
  source: "development-fixture" | "none";
  disableSwitch: typeof HIGH_OCTANE_DEVELOPMENT_LISTINGS_DISABLE;
  niagaraSwitch: typeof HIGH_OCTANE_NIAGARA_LISTING_SOURCE_SWITCH;
};

export function highOctaneDevelopmentListingsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.VERCEL_ENV === "production") return false;
  if (env.NODE_ENV === "production" && env.VERCEL_ENV !== "preview") return false;
  return (
    env[HIGH_OCTANE_DEVELOPMENT_LISTINGS_SWITCH]?.trim().toLowerCase() ===
    HIGH_OCTANE_DEVELOPMENT_LISTINGS_ENABLED_VALUE
  );
}

export function highOctaneDevelopmentListingBadge(
  dataSource: string | null | undefined,
): "DEMO PROPERTY" | null {
  return dataSource === HIGH_OCTANE_DEVELOPMENT_LISTING_SOURCE ? "DEMO PROPERTY" : null;
}

export function decideHighOctaneDevelopmentListingAccess(input: {
  env?: NodeJS.ProcessEnv;
  workspaceSlug: string | null;
  actor: HighOctaneDevelopmentListingActor | null;
  live?: ItsoLiveSourceInput;
  requested?: ItsoSourceRequest | null;
}): HighOctaneDevelopmentListingDecision {
  const modeEnabled = highOctaneDevelopmentListingsEnabled(input.env);
  const selected = selectItsoListingSource({
    demoEnabled: modeEnabled,
    live: input.live,
    requested: input.requested,
  });
  const host = input.workspaceSlug === HIGH_OCTANE_STAGING_WORKSPACE_SLUG;
  const email = input.actor?.email?.trim().toLowerCase() ?? "";
  const saad =
    email === SAAD_EMAIL && input.actor?.highOctaneMembershipActive === true;
  const tester = Boolean(input.actor && (input.actor.masterAdminActive || saad));
  const serveFixtures = selected === "demo" && host && tester;
  return {
    modeEnabled,
    host,
    tester,
    serveFixtures,
    trrebBorrowAuthorized: false,
    source: serveFixtures ? "development-fixture" : "none",
    disableSwitch: HIGH_OCTANE_DEVELOPMENT_LISTINGS_DISABLE,
    niagaraSwitch: HIGH_OCTANE_NIAGARA_LISTING_SOURCE_SWITCH,
  };
}

const ACTIVE_DEMO_IDS = new Set(
  niagaraDemoActiveListings().map((record) => record.property.ListingId),
);

export function isHighOctaneDevelopmentListingMls(mlsNumber: string): boolean {
  return ACTIVE_DEMO_IDS.has(mlsNumber.trim().toUpperCase());
}

export function highOctaneDevelopmentListingCards(): ListingCard[] {
  return niagaraDemoActiveListings().map(
    (record) => mapResoListingPackage(record, "idx").card,
  );
}

export function searchHighOctaneDevelopmentListings(
  params: Pick<
    ListingSearchParams,
    | "q"
    | "status"
    | "statuses"
    | "cities"
    | "city"
    | "minPrice"
    | "maxPrice"
    | "minBeds"
    | "minBaths"
    | "propertyType"
    | "propertyTypes"
    | "transactionType"
    | "openHouseOnly"
    | "west"
    | "south"
    | "east"
    | "north"
    | "limit"
    | "sort"
  >,
): ListingCard[] {
  const wantsSold =
    params.status === "SOLD" ||
    params.statuses?.some((status) => status === "SOLD" || status === "LEASED");
  if (wantsSold || params.transactionType === "LEASE") return [];

  const query = params.q?.trim().toLowerCase() ?? "";
  const cities = new Set(
    [...(params.cities ?? []), params.city ?? ""]
      .map((city) => city.trim().toLowerCase())
      .filter(Boolean),
  );
  const types = new Set(
    [...(params.propertyTypes ?? []), params.propertyType ?? ""].filter(Boolean),
  );

  let items = highOctaneDevelopmentListingCards().filter((item) => {
    if (cities.size > 0 && !cities.has(item.city.toLowerCase())) return false;
    if (types.size > 0 && !types.has(item.propertyType)) return false;
    if (params.minPrice != null && item.listPrice < params.minPrice) return false;
    if (params.maxPrice != null && item.listPrice > params.maxPrice) return false;
    if (params.minBeds != null && item.beds < params.minBeds) return false;
    if (params.minBaths != null && item.baths < params.minBaths) return false;
    if (params.openHouseOnly && item.openHouses.length === 0) return false;
    if (params.west != null && item.lng < params.west) return false;
    if (params.east != null && item.lng > params.east) return false;
    if (params.south != null && item.lat < params.south) return false;
    if (params.north != null && item.lat > params.north) return false;
    if (!query) return true;
    const haystack = `${item.mlsNumber} ${item.addressLine} ${item.city} ${item.community ?? ""}`.toLowerCase();
    return haystack.includes(query);
  });

  if (params.sort === "price_asc" || params.sort === "price") {
    items = [...items].sort((a, b) => a.listPrice - b.listPrice);
  } else if (params.sort === "price_desc") {
    items = [...items].sort((a, b) => b.listPrice - a.listPrice);
  } else {
    items = [...items].sort((a, b) => b.listedAt.localeCompare(a.listedAt));
  }

  const limit = params.limit != null && params.limit > 0 ? params.limit : items.length;
  return items.slice(0, limit);
}

export function highOctaneDevelopmentListingDetail(
  mlsNumber: string,
): ListingDetail | null {
  const record = niagaraDemoByListingId(mlsNumber);
  if (!record || record.property.StandardStatus !== "Active") return null;
  return mapResoListingPackage(record, "idx").detail;
}

export type HighOctaneDevelopmentSaveDecision =
  | "use-database"
  | "registration-required"
  | "not-found"
  | "save-fixture";

export function decideHighOctaneDevelopmentListingSave(input: {
  fullCustomer: boolean;
  serveFixtures: boolean;
  mlsNumber: string;
}): HighOctaneDevelopmentSaveDecision {
  if (!isHighOctaneDevelopmentListingMls(input.mlsNumber)) return "use-database";
  if (!input.fullCustomer) return "registration-required";
  if (!input.serveFixtures) return "not-found";
  return "save-fixture";
}
