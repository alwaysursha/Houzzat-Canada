/**
 * Shared property search classification for Properties and the Viewing Planner.
 * The API is told the mode. Results are still checked against the current query
 * so a fuzzy or stale payload cannot render unrelated listings.
 */

/** Suggestions start only after this many typed characters. */
export const MIN_PROPERTY_SEARCH_LENGTH = 3;

export const SHORT_SEARCH_HINT = "Type at least 3 characters to search.";

/**
 * Empty and 1–2 typed characters are different states.
 * Empty loads the personalized feed. A short prefix does not search.
 */
export function propertiesBrowsePhase(query: string): "feed" | "short" | "search" {
  const trimmed = query.trim();
  if (!trimmed) return "feed";
  if (trimmed.length < MIN_PROPERTY_SEARCH_LENGTH) return "short";
  return "search";
}

/** A finished board number, such as X13815246 or W1234567. */
const MLS_COMPLETE = /^[A-Z]{1,3}\d{7,8}$/;

/** A leading fragment of a board number, such as X13 or X1381. */
const MLS_PREFIX = /^[A-Z]{1,3}\d{1,10}$/;

export type ViewingPropertyQuery =
  | { kind: "empty" }
  | { kind: "short" }
  | { kind: "address"; q: string }
  | { kind: "mls-prefix"; prefix: string }
  | { kind: "mls"; mlsNumbers: string[]; rejected: string[] };

/** Split pasted MLS lists on commas, spaces, and new lines. */
const MLS_SEPARATOR = /[\s,;]+/;

export function parseViewingPropertyQuery(raw: string): ViewingPropertyQuery {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "empty" };
  if (trimmed.length < MIN_PROPERTY_SEARCH_LENGTH) return { kind: "short" };

  const tokens = trimmed.split(MLS_SEPARATOR).map((token) => token.trim()).filter(Boolean);
  const mlsNumbers: string[] = [];
  const prefixes: string[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const cleaned = token.replace(/^#/, "").toUpperCase();
    if (MLS_COMPLETE.test(cleaned)) {
      if (seen.has(cleaned)) continue;
      seen.add(cleaned);
      mlsNumbers.push(cleaned);
      continue;
    }
    if (MLS_PREFIX.test(cleaned)) {
      prefixes.push(cleaned);
      continue;
    }
    rejected.push(cleaned);
  }

  const onlyCompleteMls = mlsNumbers.length > 0 && prefixes.length === 0 && rejected.length === 0;
  const batchWithExtras = mlsNumbers.length >= 2 && prefixes.length === 0;
  if (onlyCompleteMls || batchWithExtras) {
    return {
      kind: "mls",
      mlsNumbers,
      rejected: onlyCompleteMls ? [] : rejected,
    };
  }

  if (tokens.length === 1 && prefixes.length === 1 && mlsNumbers.length === 0) {
    return { kind: "mls-prefix", prefix: prefixes[0]! };
  }

  return { kind: "address", q: trimmed };
}

/** A late response may be applied only when it is still the newest request. */
export function acceptSearchResponse(requestGen: number, latestGen: number): boolean {
  return requestGen === latestGen;
}

export function mlsBatchSearchPath(mlsNumbers: string[]): string {
  const mls = mlsNumbers.join(",");
  return `/properties/search?mode=exact&mls=${encodeURIComponent(mls)}&q=${encodeURIComponent(mls)}`;
}

export function mlsPrefixSearchPath(prefix: string): string {
  return `/properties/search?mode=prefix&mls=${encodeURIComponent(prefix)}&q=${encodeURIComponent(prefix)}`;
}

type SearchListing = {
  mlsNumber: string;
  addressLine?: string | null;
  city?: string | null;
  community?: string | null;
};

function matchesPreciseAddress(listing: SearchListing, query: string): boolean {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  const line = (listing.addressLine ?? "").toLowerCase();
  const city = (listing.city ?? "").toLowerCase();
  const community = (listing.community ?? "").toLowerCase();
  const number = tokens.find((token) => /^\d+[a-z]?$/i.test(token));
  const words = tokens.filter(
    (token) => /[a-z]/i.test(token) && !/^\d+[a-z]?$/i.test(token),
  );
  if (number) {
    const streetNumber = number.toLowerCase();
    const numberMatches =
      line.startsWith(`${streetNumber} `) ||
      line.startsWith(`${streetNumber},`) ||
      line.includes(` ${streetNumber} `);
    return numberMatches && words.every((word) => line.includes(word.toLowerCase()));
  }
  return tokens.every((token) => {
    const word = token.toLowerCase();
    if (word.length < 2) return true;
    return line.includes(word) || city.includes(word) || community.includes(word);
  });
}

/**
 * Keep only listings that belong to the query that is on screen.
 * Exact MLS never keeps nearby, recommended, or popular rows.
 */
export function listingsForQuery<T extends SearchListing>(
  query: ViewingPropertyQuery,
  listings: T[],
): T[] {
  if (query.kind === "empty" || query.kind === "short") return [];
  const cards = listingSearchCards(listings);
  if (query.kind === "mls-prefix") {
    return cards.filter((card) =>
      card.mlsNumber.trim().toUpperCase().startsWith(query.prefix),
    );
  }
  if (query.kind === "mls") {
    const byMls = new Map(cards.map((card) => [card.mlsNumber.trim().toUpperCase(), card]));
    return query.mlsNumbers.flatMap((mls) => {
      const card = byMls.get(mls);
      return card ? [card] : [];
    });
  }
  return cards.filter((card) => matchesPreciseAddress(card, query.q));
}

export function missingMlsNumbers(
  query: ViewingPropertyQuery,
  listings: Array<{ mlsNumber: string }>,
): string[] {
  if (query.kind !== "mls") return [];
  const found = new Set(listings.map((item) => item.mlsNumber.trim().toUpperCase()));
  return [...query.rejected, ...query.mlsNumbers.filter((mls) => !found.has(mls))];
}

/** One card per MLS, in lookup order. Duplicate rows collapse. */
export function listingSearchCards<T extends { mlsNumber: string }>(
  listings: T[],
): T[] {
  const seen = new Set<string>();
  const cards: T[] = [];
  for (const item of listings) {
    const key = item.mlsNumber.trim().toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cards.push(item);
  }
  return cards;
}
