import type {
  Listing,
  ListingHistory,
  ListingMedia,
  OpenHouse,
  ListingStatus,
  ListingTransactionType,
  PropertyType,
} from "@prisma/client";

export type ListingCard = {
  mlsNumber: string;
  status: ListingStatus;
  segment?: string;
  transactionType: ListingTransactionType;
  propertyType: PropertyType;
  listPrice: number;
  soldPrice: number | null;
  beds: number;
  baths: number;
  sqft: number | null;
  parkingSpaces: number;
  addressLine: string;
  unitNumber: string | null;
  city: string;
  community: string | null;
  postalCode: string | null;
  province: string;
  brokerageName: string;
  lat: number;
  lng: number;
  primaryImageUrl: string | null;
  /** Upcoming open houses from MLS (usually 0–2 in a week). */
  openHouses: { startsAt: string; endsAt: string }[];
  daysOnMarket: number;
  isMock: boolean;
  dataSource?: string;
  /** Present for owner listings — FSBO (sale) or FLBO (lease). */
  ownerTag?: "FSBO" | "FLBO" | null;
};

export type ListingDetail = Listing & {
  media: ListingMedia[];
  openHouses: OpenHouse[];
  history: ListingHistory[];
};

export type ListingSearchParams = {
  q?: string;
  status?: ListingStatus | "ALL";
  segment?: "RESIDENTIAL" | "COMMERCIAL" | "PRE_CONSTRUCTION" | "ALL";
  transactionType?: ListingTransactionType | "ALL";
  dataSource?: "fsbo" | "mls" | "ALL";
  city?: string;
  community?: string;
  /** Multi-community OR filter (preferred over single community when set). */
  communities?: string[];
  propertyType?: PropertyType;
  /** Multi property-type IN filter (preferred over single propertyType when set). */
  propertyTypes?: PropertyType[];
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  openHouseOnly?: boolean;
  west?: number;
  south?: number;
  east?: number;
  north?: number;
  cursor?: string;
  limit?: number;
  /** Default: price ascending. Use newest for “New Listings” rails. */
  sort?: "price" | "newest";
};

export type ListingSearchResult = {
  items: ListingCard[];
  nextCursor: string | null;
  total: number;
  provider: "mock" | "proptx";
};

export type AutocompleteSuggestion = {
  type: "listing" | "place";
  label: string;
  subtitle?: string;
  mlsNumber?: string;
  /** Google Places place id (sell / valuation address entry). */
  placeId?: string;
  city?: string;
  community?: string | null;
  province?: string;
  postalCode?: string | null;
  unitNumber?: string | null;
  lat?: number;
  lng?: number;
  href?: string;
};

export type AutocompleteOptions = {
  /** When set, listing suggestions are limited to that transaction type. */
  transactionType?: ListingTransactionType;
};

export interface ListingProvider {
  readonly name: "mock" | "proptx";
  search(params: ListingSearchParams): Promise<ListingSearchResult>;
  getByMls(mlsNumber: string): Promise<ListingDetail | null>;
  autocomplete(
    query: string,
    options?: AutocompleteOptions,
  ): Promise<AutocompleteSuggestion[]>;
  openHouses(params: {
    city?: string;
    community?: string;
    communities?: string[];
    propertyTypes?: PropertyType[];
    minPrice?: number;
    maxPrice?: number;
    from?: Date;
    to?: Date;
  }): Promise<ListingCard[]>;
  syncStatus(): Promise<{
    provider: "mock" | "proptx";
    healthy: boolean;
    message: string;
    listingCount: number;
    lastSyncedAt: string | null;
  }>;
}
