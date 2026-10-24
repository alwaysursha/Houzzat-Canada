/**
 * Reversible HIGH OCTANE development listings.
 *
 * TRREB use is not authorized for this workspace. The data-connection contract
 * forbids falling back to Houzzat credentials, and this module does not read
 * or copy MLS rows. Authorized testers receive in-memory fixtures through the
 * existing search, detail, and featured-listing responses.
 *
 * Disable development mode by unsetting HIGH_OCTANE_DEVELOPMENT_LISTINGS.
 * Production always stays off. When Niagara is connected, leave the switch
 * unset and give this workspace its own listing entitlement. The existing
 * screens already follow that hostname entitlement.
 */
import type { ListingDetail, ListingCard, ListingSearchParams } from "@/lib/listings/types";
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
const LISTED_AT = new Date("2026-09-12T15:00:00.000Z");

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
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production") return false;
  return (
    env[HIGH_OCTANE_DEVELOPMENT_LISTINGS_SWITCH]?.trim().toLowerCase() ===
    HIGH_OCTANE_DEVELOPMENT_LISTINGS_ENABLED_VALUE
  );
}

export function decideHighOctaneDevelopmentListingAccess(input: {
  env?: NodeJS.ProcessEnv;
  workspaceSlug: string | null;
  actor: HighOctaneDevelopmentListingActor | null;
}): HighOctaneDevelopmentListingDecision {
  const modeEnabled = highOctaneDevelopmentListingsEnabled(input.env);
  const host = input.workspaceSlug === HIGH_OCTANE_STAGING_WORKSPACE_SLUG;
  const email = input.actor?.email?.trim().toLowerCase() ?? "";
  const saad =
    email === SAAD_EMAIL && input.actor?.highOctaneMembershipActive === true;
  const tester = Boolean(input.actor && (input.actor.masterAdminActive || saad));
  const serveFixtures = modeEnabled && host && tester;
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

type FixtureSeed = {
  mlsNumber: string;
  city: string;
  community: string;
  addressLine: string;
  postalCode: string;
  listPrice: number;
  beds: number;
  baths: number;
  sqft: number;
  propertyType: ListingCard["propertyType"];
  imageUrl: string;
  listedAt: string;
};

const FIXTURES: readonly FixtureSeed[] = [
  {
    mlsNumber: "HODEV1001",
    city: "Niagara-on-the-Lake",
    community: "Old Town",
    addressLine: "18 Queen Street",
    postalCode: "L0S 1J0",
    listPrice: 1895000,
    beds: 4,
    baths: 3,
    sqft: 3120,
    propertyType: "DETACHED",
    imageUrl: "/media/royal-collection/high-octane/notl-house.webp",
    listedAt: "2026-10-02T15:00:00.000Z",
  },
  {
    mlsNumber: "HODEV1002",
    city: "Niagara Falls",
    community: "Drummondville",
    addressLine: "6400 Fallsview Boulevard",
    postalCode: "L2G 3V6",
    listPrice: 1249000,
    beds: 3,
    baths: 2,
    sqft: 2140,
    propertyType: "DETACHED",
    imageUrl: "/media/royal-collection/high-octane/niagara-falls-community.webp",
    listedAt: "2026-09-21T15:00:00.000Z",
  },
  {
    mlsNumber: "HODEV1003",
    city: "St. Catharines",
    community: "Port Dalhousie",
    addressLine: "9 Lock Street",
    postalCode: "L2N 4G9",
    listPrice: 979000,
    beds: 2,
    baths: 2,
    sqft: 1460,
    propertyType: "CONDO_APT",
    imageUrl: "/media/royal-collection/high-octane/port-dalhousie-lighthouse.webp",
    listedAt: "2026-09-08T15:00:00.000Z",
  },
];

const FIXTURE_MLS = new Set(FIXTURES.map((fixture) => fixture.mlsNumber));

export function isHighOctaneDevelopmentListingMls(mlsNumber: string): boolean {
  return FIXTURE_MLS.has(mlsNumber.trim().toUpperCase());
}

function fixtureCard(seed: FixtureSeed): ListingCard {
  return {
    mlsNumber: seed.mlsNumber,
    status: "ACTIVE",
    segment: "RESIDENTIAL",
    transactionType: "SALE",
    propertyType: seed.propertyType,
    listPrice: seed.listPrice,
    soldPrice: null,
    beds: seed.beds,
    baths: seed.baths,
    sqft: seed.sqft,
    parkingSpaces: 2,
    addressLine: seed.addressLine,
    unitNumber: null,
    city: seed.city,
    community: seed.community,
    postalCode: seed.postalCode,
    province: "ON",
    brokerageName: "Development fixture",
    lat: 43.09,
    lng: -79.07,
    primaryImageUrl: seed.imageUrl,
    imageUrls: [seed.imageUrl],
    openHouses: [],
    daysOnMarket: 18,
    listedAt: seed.listedAt,
    soldAt: null,
    isMock: true,
    dataSource: HIGH_OCTANE_DEVELOPMENT_LISTING_SOURCE,
  };
}

export function highOctaneDevelopmentListingCards(): ListingCard[] {
  return FIXTURES.map(fixtureCard);
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
  const card = highOctaneDevelopmentListingCards().find(
    (item) => item.mlsNumber === mlsNumber.trim().toUpperCase(),
  );
  if (!card) return null;
  const id = `high-octane-dev-${card.mlsNumber}`;
  return {
    id,
    mlsNumber: card.mlsNumber,
    listingKey: null,
    status: "ACTIVE",
    segment: "RESIDENTIAL",
    transactionType: "SALE",
    dataSource: HIGH_OCTANE_DEVELOPMENT_LISTING_SOURCE,
    propertyType: card.propertyType,
    listPrice: card.listPrice,
    soldPrice: null,
    beds: card.beds,
    baths: card.baths,
    sqft: card.sqft,
    parkingSpaces: card.parkingSpaces,
    yearBuilt: 2014,
    taxes: null,
    maintenanceFee: null,
    addressLine: card.addressLine,
    unitNumber: null,
    city: card.city,
    community: card.community,
    postalCode: card.postalCode,
    province: "ON",
    lat: card.lat,
    lng: card.lng,
    description:
      "Development fixture for HIGH OCTANE testing. This is not an MLS listing and it is not for sale.",
    brokerageName: "Development fixture",
    facts: null,
    listedAt: new Date(card.listedAt),
    soldAt: null,
    updatedAtMls: LISTED_AT,
    photosChangeTimestamp: null,
    mediaSourceTimestamp: null,
    mediaSyncedAt: null,
    daysOnMarket: card.daysOnMarket,
    addressHistoryEnrichedAt: null,
    isMock: true,
    organizationId: null,
    providerKey: null,
    ownerUserId: null,
    ownerStatus: null,
    listedUntil: null,
    ownerReviewedAt: null,
    ownerReviewedById: null,
    ownerReviewNote: null,
    createdAt: LISTED_AT,
    updatedAt: LISTED_AT,
    media: [
      {
        id: `${id}-photo`,
        listingId: id,
        url: card.primaryImageUrl ?? "",
        sortOrder: 0,
        isPrimary: true,
      },
    ],
    openHouses: [],
    history: [],
    rooms: [],
  };
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
