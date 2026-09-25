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
  listedAt: string;
  soldAt: string | null;
  updatedAtMls?: string | null;
  timingLabel?: string;
}

export interface PropertiesSearchData {
  listings: MobileListingCard[];
  total: number;
  nextCursor: string | null;
  limit: number;
  notFound?: string[];
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

export interface MobilePropertyFactRow {
  label: string;
  value: string;
}

export interface MobilePropertyFactSection {
  id: string;
  title: string;
  rows: MobilePropertyFactRow[];
}

export interface MobilePropertyDetail {
  mlsNumber: string;
  listingId: string;
  status: string;
  transactionType: string;
  segment: string | null;
  propertyType: string;
  propertyTypeLabel: string;
  statusLabel: string;
  listPrice: number;
  soldPrice: number | null;
  priceLabel: string;
  addressLine: string;
  unitNumber: string | null;
  city: string;
  community: string | null;
  province: string | null;
  postalCode: string | null;
  beds: number;
  baths: number;
  bedsLabel: string | null;
  sqftLabel: string | null;
  parkingSpaces: number;
  daysOnMarket: number;
  timingLabel: string;
  listedAt: string;
  soldAt: string | null;
  description: string;
  brokerageName: string | null;
  brokeragePhone: string | null;
  agentName: string | null;
  agentCellPhone: string | null;
  taxes: number | null;
  maintenanceFee: number | null;
  yearBuilt: number | null;
  lat: number;
  lng: number;
  imageUrls: string[];
  primaryImageUrl: string | null;
  openHouses: { startsAt: string; endsAt: string }[];
  featureSections: MobilePropertyFactSection[];
  mlsDisclaimer: string;
  /** Absolute consumer listing URL for sharing. */
  shareUrl?: string | null;
  /** Workspace consumer origin, e.g. https://houzzat.com */
  publicOrigin?: string | null;
}
