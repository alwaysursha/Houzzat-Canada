import type { Prisma } from "@prisma/client";
import { isOnMarketListingStatus } from "@/lib/listings/constants";

/** Street / direction abbreviations ↔ full forms. */
const TOKEN_ALIASES: Record<string, string[]> = {
  st: ["st", "street"],
  street: ["st", "street"],
  ave: ["ave", "avenue"],
  avenue: ["ave", "avenue"],
  rd: ["rd", "road"],
  road: ["rd", "road"],
  dr: ["dr", "drive"],
  drive: ["dr", "drive"],
  blvd: ["blvd", "boulevard"],
  boulevard: ["blvd", "boulevard"],
  cres: ["cres", "crescent"],
  crescent: ["cres", "crescent"],
  crt: ["crt", "court", "ct"],
  court: ["crt", "court", "ct"],
  ct: ["ct", "court", "crt"],
  ln: ["ln", "lane"],
  lane: ["ln", "lane"],
  pl: ["pl", "place"],
  place: ["pl", "place"],
  ter: ["ter", "terr", "terrace"],
  terr: ["ter", "terr", "terrace"],
  terrace: ["ter", "terr", "terrace"],
  pkwy: ["pkwy", "parkway"],
  parkway: ["pkwy", "parkway"],
  cir: ["cir", "circle"],
  circle: ["cir", "circle"],
  trail: ["trail", "tr"],
  tr: ["tr", "trail"],
  way: ["way"],
  e: ["e", "east"],
  east: ["e", "east"],
  w: ["w", "west"],
  west: ["w", "west"],
  n: ["n", "north"],
  north: ["n", "north"],
  s: ["s", "south"],
  south: ["s", "south"],
};

export function tokenizeSearchQuery(q: string): string[] {
  return q
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function tokenVariants(token: string): string[] {
  const t = token.toLowerCase();
  const aliases = TOKEN_ALIASES[t];
  const out = new Set<string>(aliases ?? [t]);
  // Mild typo tolerance only — never emit ultra-short prefixes like "riv"
  // from "rivertrail" (those flood autocomplete with unrelated streets).
  if (t.length >= 6) {
    out.add(t.slice(0, -1));
  }
  if (t.length >= 8) {
    out.add(t.slice(0, Math.max(5, t.length - 2)));
  }
  return [...out];
}

/** True when `hay` contains `needle` as a whole word/token. */
function includesWholeToken(hay: string, needle: string): boolean {
  if (!needle) return false;
  if (hay === needle) return true;
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escapeRegExp(needle)}(?:[^\\p{L}\\p{N}]|$)`,
    "iu",
  ).test(hay);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Street # match: "153" matches "153 River…" but not "1539 Bayshire". */
function streetNumberMatches(addressLine: string, numberToken: string): boolean {
  const addr = addressLine.toLowerCase();
  const n = numberToken.toLowerCase();
  if (addr.startsWith(`${n} `) || addr.startsWith(`${n},`)) return true;
  return includesWholeToken(addr, n);
}

/**
 * Street-suffix aliases are whole words ("trail"), never 1–2 letter
 * substrings ("tr") that match unrelated text such as "Centre".
 */
function sqlMatchVariants(token: string): string[] {
  return [
    ...new Set(tokenVariants(token).filter((variant) => variant.length >= 3)),
  ];
}

/**
 * Civic numbers and multi-word street phrases must keep every token.
 * Typesense otherwise drops words when the strict query has few hits.
 */
export function addressQueryKeepsAllTokens(q: string): boolean {
  const tokens = q
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[.,]/g, ""))
    .filter(Boolean);
  if (tokens.length < 2) return false;
  if (/^\d/.test(tokens[0] ?? "")) return true;
  if (tokens.some((token) => TOKEN_ALIASES[token])) return true;
  return tokens.every((token) => /^[a-z][a-z'-]{2,}$/i.test(token));
}

/**
 * Street and civic queries must stay exact as the last word is completed.
 * A common finished suffix such as "trail" is a one-typo candidate for
 * thousands of other streets, and Typesense then drops or misses the
 * exact match. Prefix search still completes "trai" → "trail".
 */
export function typesenseTextMatchSettings(q: string): {
  num_typos: number;
  drop_tokens_threshold?: number;
  typo_tokens_threshold?: number;
} {
  if (q === "*" || !addressQueryKeepsAllTokens(q)) {
    return { num_typos: q === "*" ? 0 : 1 };
  }
  return {
    num_typos: 0,
    drop_tokens_threshold: 0,
    typo_tokens_threshold: 0,
  };
}

function listedAtMillis(value: string | Date | null | undefined): number {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

/** Exact street page: current inventory, then newer history. */
export function compareStreetHistory<
  T extends { status?: string | null; listedAt?: string | Date | null },
>(a: T, b: T): number {
  const bucket = (status?: string | null) =>
    isOnMarketListingStatus(status ?? "") ? 0 : 1;
  const byStatus = bucket(a.status) - bucket(b.status);
  if (byStatus !== 0) return byStatus;
  return listedAtMillis(b.listedAt) - listedAtMillis(a.listedAt);
}

function fieldContainsAny(
  variants: string[],
): Prisma.ListingWhereInput[] {
  const clauses: Prisma.ListingWhereInput[] = [];
  for (const v of variants) {
    if (!v) continue;
    clauses.push(
      { mlsNumber: { contains: v, mode: "insensitive" } },
      { addressLine: { contains: v, mode: "insensitive" } },
      { city: { contains: v, mode: "insensitive" } },
      { community: { contains: v, mode: "insensitive" } },
      { postalCode: { contains: v, mode: "insensitive" } },
      { unitNumber: { contains: v, mode: "insensitive" } },
    );
  }
  return clauses;
}

/**
 * Broad Prisma filter to pull candidates. Prefers the full strong token so
 * progressive typing ("Rivertrail") isn't drowned out by "riv…" noise.
 */
export function listingQueryCandidateWhere(
  q: string,
): Prisma.ListingWhereInput {
  const tokens = tokenizeSearchQuery(q);
  if (tokens.length === 0) return {};

  if (tokens.length === 1) {
    const t = tokens[0]!;
    // Single long street token: require the typed prefix itself (not 3-letter
    // stubs) so "Rivertrail" can surface before random "Drive" listings.
    if (t.length >= 4 && !/^\d+[a-z]?$/i.test(t)) {
      return {
        OR: [
          { addressLine: { contains: t, mode: "insensitive" } },
          { city: { contains: t, mode: "insensitive" } },
          { community: { contains: t, mode: "insensitive" } },
          { mlsNumber: { contains: t, mode: "insensitive" } },
          // One-char typo only for longer tokens.
          ...(t.length >= 6
            ? [
                {
                  addressLine: {
                    contains: t.slice(0, -1),
                    mode: "insensitive" as const,
                  },
                },
              ]
            : []),
        ],
      };
    }
    return { OR: fieldContainsAny(sqlMatchVariants(t)) };
  }

  const numberToken = tokens.find((t) => /^\d+[a-z]?$/i.test(t));
  const alphaTokens = tokens.filter(
    (t) => !/^\d+[a-z]?$/i.test(t) && t.length >= 2,
  );
  const strong = [...alphaTokens].sort((a, b) => b.length - a.length)[0];

  const and: Prisma.ListingWhereInput[] = [];

  if (numberToken) {
    // Prefer "153 " so we don't pull every 1539 / 2153 address into the pool.
    and.push({
      OR: [
        { addressLine: { startsWith: `${numberToken} `, mode: "insensitive" } },
        { addressLine: { startsWith: `${numberToken},`, mode: "insensitive" } },
        // Fall back to contains for unit-prefixed lines, scored later.
        { addressLine: { contains: `${numberToken} `, mode: "insensitive" } },
      ],
    });
  }

  if (strong) {
    // Prefer the typed token itself (incl. 2–3 letter progressive prefixes).
    // Only expand aliases for known street types / directions.
    const variants =
      strong.length >= 2 && !TOKEN_ALIASES[strong]
        ? [strong, ...(strong.length >= 6 ? [strong.slice(0, -1)] : [])]
        : sqlMatchVariants(strong);
    and.push({ OR: fieldContainsAny(variants) });
  }

  // Direction tokens only (e/w/n/s) — keep pool tight.
  for (const token of alphaTokens) {
    if (token === strong) continue;
    if (token.length > 2) continue;
    if (!TOKEN_ALIASES[token]) continue;
    and.push({ OR: fieldContainsAny(sqlMatchVariants(token)) });
  }

  return and.length > 0 ? { AND: and } : {};
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) row[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(
        row[j]! + 1,
        row[j - 1]! + 1,
        prev + cost,
      );
      prev = cur;
    }
  }
  return row[b.length]!;
}

function haystackWords(listing: {
  addressLine: string;
  city: string;
  community?: string | null;
  postalCode?: string | null;
  unitNumber?: string | null;
  mlsNumber?: string;
}): string[] {
  const raw = [
    listing.addressLine,
    listing.city,
    listing.community,
    listing.postalCode,
    listing.unitNumber,
    listing.mlsNumber,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ");

  const words = raw.split(/\s+/).filter(Boolean);
  // Expand abbreviations in the haystack so "street" matches stored "St".
  const expanded = new Set(words);
  for (const w of words) {
    for (const alias of TOKEN_ALIASES[w] ?? []) {
      expanded.add(alias);
    }
  }
  return [...expanded];
}

export type ListingMatchFields = {
  addressLine: string;
  city: string;
  community?: string | null;
  postalCode?: string | null;
  unitNumber?: string | null;
  mlsNumber?: string;
};

/** True when every query token fuzzy-matches the listing; higher score is better. */
export function scoreListingAgainstQuery(
  listing: ListingMatchFields,
  q: string,
): number {
  const tokens = tokenizeSearchQuery(q);
  if (tokens.length === 0) return 0;

  const words = haystackWords(listing);
  const hay = words.join(" ");
  const addressLower = listing.addressLine.toLowerCase();
  let score = 0;

  for (const token of tokens) {
    const isNumber = /^\d+[a-z]?$/i.test(token);

    if (isNumber) {
      if (streetNumberMatches(listing.addressLine, token)) {
        // Exact leading civic number is the strongest signal.
        score += addressLower.startsWith(`${token.toLowerCase()} `) ? 40 : 24;
        continue;
      }
      // "153" inside "1539" is not a match.
      return -1;
    }

    const variants = tokenVariants(token);
    // Prefer whole-word / real prefix matches over tiny substring noise.
    if (variants.some((v) => v.length >= 3 && includesWholeToken(hay, v))) {
      score += token.length <= 2 ? 6 : 18;
      continue;
    }

    let matched = false;
    let best = Infinity;
    for (const w of words) {
      for (const v of variants) {
        // Progressive street typing from 2+ letters: "ri" → "rivertrail".
        // Stored word must start with the typed token (not reverse stub matches).
        if (w.startsWith(v) && v.length >= 2 && w.length >= v.length) {
          matched = true;
          score += w.startsWith(token) ? 16 : 12;
          break;
        }
        if (v.length >= 4 && w.length >= 4 && v.startsWith(w)) {
          matched = true;
          score += 10;
          break;
        }
        if (v.length >= 4 && w.length >= 4) {
          best = Math.min(best, levenshtein(v, w));
        }
      }
      if (matched) break;
    }

    if (!matched) {
      const maxDist =
        token.length >= 7 ? 2 : token.length >= 5 ? 1 : 0;
      if (best <= maxDist && maxDist > 0) {
        matched = true;
        score += 8 - best;
      }
    }

    // Progressive typing: "ri" / "riv" / "river" → "rivertrail".
    if (!matched && token.length >= 2) {
      const prefixHit = words.some(
        (w) => w.startsWith(token) && w.length > token.length,
      );
      if (prefixHit) {
        matched = true;
        score += 14;
      }
    }

    if (!matched) return -1;
  }

  // Bonus when the typed phrase is a prefix of the address line.
  const typedStreet = tokens.join(" ");
  if (addressLower.startsWith(typedStreet)) {
    score += 20;
  } else if (addressLower.includes(typedStreet)) {
    score += 10;
  }

  return score;
}

export function filterAndRankListingsByQuery<T extends ListingMatchFields>(
  listings: T[],
  q: string,
): T[] {
  const scored = listings
    .map((listing) => ({
      listing,
      score: scoreListingAgainstQuery(listing, q),
    }))
    .filter((row) => row.score >= 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((row) => row.listing);
}

/** True when query looks like an MLS® # (e.g. X13591780, C1234567). */
export function looksLikeMlsQuery(q: string): boolean {
  const t = q.trim();
  if (t.length < 4 || t.length > 20) return false;
  if (/\s/.test(t)) return false;
  return /^[A-Za-z]?\d[\w-]{2,}$/.test(t) || /^[A-Za-z]\d{5,}/i.test(t);
}

const STREET_TYPE_TOKENS = new Set([
  "st",
  "street",
  "ave",
  "avenue",
  "rd",
  "road",
  "dr",
  "drive",
  "blvd",
  "boulevard",
  "cres",
  "crescent",
  "crt",
  "court",
  "ct",
  "ln",
  "lane",
  "pl",
  "place",
  "ter",
  "terr",
  "terrace",
  "pkwy",
  "parkway",
  "cir",
  "circle",
  "way",
  "trail",
  "tr",
  "hwy",
  "highway",
  "sq",
  "square",
  "gate",
  "gdns",
  "gardens",
]);

const DIRECTION_TOKENS = new Set([
  "e",
  "east",
  "w",
  "west",
  "n",
  "north",
  "s",
  "south",
  "ne",
  "nw",
  "se",
  "sw",
]);

const PROVINCE_TOKENS = new Set([
  "on",
  "ontario",
  "bc",
  "ab",
  "qc",
  "mb",
  "sk",
  "ns",
  "nb",
  "nl",
  "pe",
  "yt",
  "nt",
  "nu",
]);

export type ParsedExactAddress = {
  streetNumber: string;
  streetName: string;
  streetType: string | null;
  unit: string | null;
  city: string | null;
};

export type ParsedStreetOnly = {
  streetName: string;
  streetType: string | null;
  city: string | null;
};

function splitAddressParts(q: string): string[] {
  return q
    .trim()
    .replace(/,/g, " ")
    .replace(/#/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((p) => p.trim())
    .filter(Boolean);
}

function isPostalToken(token: string): boolean {
  return /^[A-Za-z]\d[A-Za-z]?\d?[A-Za-z]?\d?$/.test(token.replace(/\s/g, ""));
}

function isUnitMarker(token: string): boolean {
  const t = token.toLowerCase();
  return t === "unit" || t === "apt" || t === "suite" || t === "ste";
}

const FILTER_WORD_TOKENS = new Set([
  "bed",
  "beds",
  "bedroom",
  "bedrooms",
  "bath",
  "baths",
  "bathroom",
  "bathrooms",
  "br",
  "ba",
  "sqft",
  "sf",
  "condo",
  "house",
  "townhouse",
  "detached",
  "semi",
  "lease",
  "sale",
  "rent",
  "for",
]);

/**
 * Parse "532 Wismer Street, Waterloo" style queries.
 * Requires a leading street number.
 */
export function parseExactAddressQuery(q: string): ParsedExactAddress | null {
  const parts = splitAddressParts(q);
  if (parts.length < 2) return null;

  const first = parts[0]!;
  if (!/^\d+[A-Za-z]?$/.test(first)) return null;

  // "3 bed Ajax" style filter queries — not an address
  if (parts.some((p) => FILTER_WORD_TOKENS.has(p.toLowerCase()))) {
    return null;
  }

  let i = 1;
  let unit: string | null = null;
  if (isUnitMarker(parts[i] ?? "") && parts[i + 1]) {
    unit = parts[i + 1]!;
    i += 2;
  } else if (/^unit/i.test(first)) {
    return null;
  }

  const streetBits: string[] = [];
  let streetType: string | null = null;
  let city: string | null = null;

  while (i < parts.length) {
    const token = parts[i]!;
    const lower = token.toLowerCase();
    if (PROVINCE_TOKENS.has(lower) || isPostalToken(token)) {
      i += 1;
      continue;
    }
    if (STREET_TYPE_TOKENS.has(lower) && streetBits.length > 0 && !streetType) {
      streetType = token;
      i += 1;
      // Remaining alpha tokens are city (until province/postal).
      const cityParts: string[] = [];
      while (i < parts.length) {
        const c = parts[i]!;
        const cl = c.toLowerCase();
        if (PROVINCE_TOKENS.has(cl) || isPostalToken(c)) break;
        if (DIRECTION_TOKENS.has(cl) && cityParts.length === 0) {
          // Direction after street type → street dir suffix, skip for city
          i += 1;
          continue;
        }
        cityParts.push(c);
        i += 1;
      }
      if (cityParts.length) city = cityParts.join(" ");
      break;
    }
    if (DIRECTION_TOKENS.has(lower) && streetBits.length > 0) {
      streetBits.push(token);
      i += 1;
      continue;
    }
    streetBits.push(token);
    i += 1;
  }

  // No street type found — last token(s) may be city if 3+ parts after number.
  if (!streetType && streetBits.length >= 2) {
    const maybeCity = streetBits[streetBits.length - 1]!;
    if (
      maybeCity.length >= 3 &&
      !DIRECTION_TOKENS.has(maybeCity.toLowerCase())
    ) {
      city = maybeCity;
      streetBits.pop();
    }
  }

  const streetName = streetBits.join(" ").trim();
  if (!streetName || streetName.length < 2) return null;
  if (FILTER_WORD_TOKENS.has(streetName.toLowerCase())) return null;

  // Prefer real addresses: street type, or longer street name + city
  if (!streetType && !(city && streetName.length >= 3)) return null;

  return {
    streetNumber: first,
    streetName,
    streetType,
    unit,
    city,
  };
}

/**
 * Parse street-only queries like "Wismer Street, Waterloo" (no house number).
 * Rejects bare city names and MLS-shaped tokens.
 */
export function parseStreetOnlyQuery(
  q: string,
  knownCities: string[] = [],
): ParsedStreetOnly | null {
  const trimmed = q.trim();
  if (!trimmed || looksLikeMlsQuery(trimmed)) return null;
  if (/^\d+[A-Za-z]?(\s|$)/.test(trimmed)) return null; // has house #

  const parts = splitAddressParts(trimmed);
  if (parts.length < 1) return null;

  const known = new Set(
    knownCities.map((c) => c.trim().toLowerCase()).filter(Boolean),
  );
  const fullLower = parts.join(" ").toLowerCase();
  if (known.has(fullLower)) return null;
  if (parts.length === 1 && known.has(parts[0]!.toLowerCase())) return null;

  const streetBits: string[] = [];
  let streetType: string | null = null;
  let city: string | null = null;
  let i = 0;

  while (i < parts.length) {
    const token = parts[i]!;
    const lower = token.toLowerCase();
    if (PROVINCE_TOKENS.has(lower) || isPostalToken(token)) {
      i += 1;
      continue;
    }
    if (STREET_TYPE_TOKENS.has(lower) && streetBits.length > 0 && !streetType) {
      streetType = token;
      i += 1;
      const cityParts: string[] = [];
      while (i < parts.length) {
        const c = parts[i]!;
        const cl = c.toLowerCase();
        if (PROVINCE_TOKENS.has(cl) || isPostalToken(c)) break;
        cityParts.push(c);
        i += 1;
      }
      if (cityParts.length) city = cityParts.join(" ");
      break;
    }
    streetBits.push(token);
    i += 1;
  }

  // "Wismer Waterloo" — peel known city off the end
  if (!city && streetBits.length >= 2) {
    const last = streetBits[streetBits.length - 1]!;
    if (known.has(last.toLowerCase())) {
      city = last;
      streetBits.pop();
    }
  }

  const streetName = streetBits.join(" ").trim();
  if (!streetName || streetName.length < 3) return null;
  if (known.has(streetName.toLowerCase()) && !streetType) return null;

  // Need street type, city, or multi-token street name
  if (!streetType && !city && streetBits.length < 2) return null;

  return { streetName, streetType, city };
}

/** True when query should trigger on-demand PropTx lookup on Neon miss. */
export function isOnDemandLookupQuery(
  q: string,
  knownCities: string[] = [],
): boolean {
  const t = q.trim();
  if (t.length < 3) return false;
  if (looksLikeMlsQuery(t)) return true;
  if (parseExactAddressQuery(t)) return true;
  if (parseStreetOnlyQuery(t, knownCities)) return true;
  return false;
}
