import type {
  ListingSegment,
  ListingStatus,
  ListingTransactionType,
  PropertyType,
} from "@prisma/client";
import type { ListingSearchParams } from "@/lib/listings/types";

function validStatusToken(
  s: string,
): s is ListingStatus | "UNLISTED" | "ALL" {
  return (
    s === "ACTIVE" ||
    s === "SOLD_CONDITIONAL" ||
    s === "SOLD" ||
    s === "LEASED" ||
    s === "UNLISTED" ||
    s === "ALL" ||
    s === "SUSPENDED" ||
    s === "TERMINATED" ||
    s === "EXPIRED"
  );
}

/** Parse listing search params from URL searchParams (web + mobile v2). */
export function parseListingSearchQueryParams(
  searchParams: URLSearchParams,
  options?: { defaultLimit?: number; includeMapBounds?: boolean },
): ListingSearchParams {
  const segmentParam = searchParams.get("segment");
  const transactionParam = searchParams.get("transactionType");

  const propertyTypesParam = searchParams.get("propertyTypes");
  const communitiesParam = searchParams.get("communities");
  const propertyTypes = propertyTypesParam
    ? (propertyTypesParam
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean) as PropertyType[])
    : undefined;
  const communities = communitiesParam
    ? communitiesParam
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean)
    : undefined;

  const statusParam = searchParams.get("status");
  const statusParts = statusParam
    ? statusParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (s === "CANCELLED" ? "TERMINATED" : s))
    : [];
  const tokens = statusParts.filter(validStatusToken);
  const useAll = tokens.length === 1 && tokens[0] === "ALL";
  const statuses =
    !useAll && tokens.length > 0
      ? (tokens.filter((t) => t !== "ALL") as Array<ListingStatus | "UNLISTED">)
      : undefined;

  const defaultLimit = options?.defaultLimit ?? 40;

  const body: ListingSearchParams = {
    q: searchParams.get("q") ?? undefined,
    status: useAll ? ("ALL" as const) : statuses ? undefined : ("ACTIVE" as const),
    statuses,
    segment: (segmentParam as ListingSegment | "ALL" | null) ?? undefined,
    transactionType:
      (transactionParam as ListingTransactionType | "ALL" | null) ?? undefined,
    dataSource:
      (searchParams.get("dataSource") as "fsbo" | "mls" | "ALL" | null) ??
      undefined,
    city: searchParams.get("city") ?? undefined,
    cities: (() => {
      const raw = searchParams.get("cities");
      if (!raw?.trim()) return undefined;
      const list = raw
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      return list.length ? list : undefined;
    })(),
    community: searchParams.get("community") ?? undefined,
    communities,
    propertyType:
      (searchParams.get("propertyType") as PropertyType | null) ?? undefined,
    propertyTypes: propertyTypes?.length ? propertyTypes : undefined,
    minPrice: searchParams.get("minPrice")
      ? Number(searchParams.get("minPrice"))
      : undefined,
    maxPrice: searchParams.get("maxPrice")
      ? Number(searchParams.get("maxPrice"))
      : undefined,
    minBeds: searchParams.get("minBeds")
      ? Number(searchParams.get("minBeds"))
      : undefined,
    minBaths: searchParams.get("minBaths")
      ? Number(searchParams.get("minBaths"))
      : undefined,
    openHouseOnly: searchParams.get("openHouseOnly") === "1",
    cursor: searchParams.get("cursor") ?? undefined,
    limit: searchParams.get("limit")
      ? Number(searchParams.get("limit"))
      : defaultLimit,
    sort: (() => {
      const s = searchParams.get("sort");
      if (s === "newest" || s === "price_asc" || s === "price_desc") return s;
      if (s === "price") return "price_asc" as const;
      return undefined;
    })(),
  };

  if (options?.includeMapBounds) {
    body.west = searchParams.get("west")
      ? Number(searchParams.get("west"))
      : undefined;
    body.south = searchParams.get("south")
      ? Number(searchParams.get("south"))
      : undefined;
    body.east = searchParams.get("east")
      ? Number(searchParams.get("east"))
      : undefined;
    body.north = searchParams.get("north")
      ? Number(searchParams.get("north"))
      : undefined;
  }

  return body;
}
