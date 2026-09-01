/**
 * Stage 5.3 — Mobile listing card DTO (mirrors web ListingCard subset).
 */

export type MobileListingTransactionType = "SALE" | "LEASE";

export type MobileListingSort = "newest" | "price_asc" | "price_desc";

export interface MobileListingCard {
  mlsNumber: string;
  status: string;
  transactionType: MobileListingTransactionType;
  propertyType: string;
  listPrice: number;
  soldPrice: number | null;
  beds: number;
  bedsLabel?: string | null;
  baths: number;
  sqft: number | null;
  addressLine: string;
  unitNumber: string | null;
  city: string;
  community: string | null;
  primaryImageUrl: string | null;
  daysOnMarket: number;
  openHouses: { startsAt: string; endsAt: string }[];
}

export interface PropertiesSearchData {
  listings: MobileListingCard[];
  total: number;
  nextCursor: string | null;
  limit: number;
}

export interface ShortlistEmailData {
  shareUrl: string;
  count: number;
  stubbed?: boolean;
  leadId: string;
}

export type PropertySearchFilters = {
  transactionType: MobileListingTransactionType;
  sort: MobileListingSort;
  minPrice: string;
  maxPrice: string;
  minBeds: string;
  minBaths: string;
  openHouseOnly: boolean;
  propertyTypes: string[];
};

export const DEFAULT_PROPERTY_FILTERS: PropertySearchFilters = {
  transactionType: "SALE",
  sort: "newest",
  minPrice: "",
  maxPrice: "",
  minBeds: "",
  minBaths: "",
  openHouseOnly: false,
  propertyTypes: [],
};

export const PROPERTY_TYPE_OPTIONS = [
  { key: "DETACHED", label: "Detached" },
  { key: "SEMI_DETACHED", label: "Semi" },
  { key: "TOWNHOUSE", label: "Townhouse" },
  { key: "CONDO_APT", label: "Condo Apt" },
  { key: "CONDO_TOWNHOUSE", label: "Condo TH" },
  { key: "MULTIPLEX", label: "Multiplex" },
  { key: "VACANT_LAND", label: "Land" },
] as const;

export const MAX_SHORTLIST_SIZE = 24;
