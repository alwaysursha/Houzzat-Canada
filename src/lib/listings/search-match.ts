import type { Prisma } from "@prisma/client";

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
  // Drop last character for common end typos (webr → web, kitchene → kitchen…).
  if (t.length >= 4) {
    out.add(t.slice(0, -1));
  }
  if (t.length >= 5) {
    out.add(t.slice(0, 4));
  }
  if (t.length >= 4) {
    out.add(t.slice(0, 3));
  }
  return [...out];
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
 * Broad Prisma filter to pull candidates. Uses street # + strongest token
 * (prefix-tolerant) so typos still return a pool we can score in memory.
 */
export function listingQueryCandidateWhere(
  q: string,
): Prisma.ListingWhereInput {
  const tokens = tokenizeSearchQuery(q);
  if (tokens.length === 0) return {};

  if (tokens.length === 1) {
    const t = tokens[0]!;
    return { OR: fieldContainsAny(tokenVariants(t)) };
  }

  const numberToken = tokens.find((t) => /^\d+[a-z]?$/i.test(t));
  const alphaTokens = tokens.filter(
    (t) => !/^\d+[a-z]?$/i.test(t) && t.length >= 2,
  );
  const strong = [...alphaTokens].sort((a, b) => b.length - a.length)[0];

  const and: Prisma.ListingWhereInput[] = [];

  if (numberToken) {
    and.push({
      addressLine: { contains: numberToken, mode: "insensitive" },
    });
  }

  if (strong) {
    and.push({ OR: fieldContainsAny(tokenVariants(strong)) });
  }

  // Also require remaining short tokens loosely when we have 3+ parts
  // (e.g. direction "e") so the pool stays relevant.
  for (const token of alphaTokens) {
    if (token === strong) continue;
    if (token.length > 2) continue;
    and.push({ OR: fieldContainsAny(tokenVariants(token)) });
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
  let score = 0;

  for (const token of tokens) {
    const variants = tokenVariants(token);
    if (variants.some((v) => hay.includes(v))) {
      score += token.length <= 2 ? 6 : 12;
      continue;
    }

    let matched = false;
    let best = Infinity;
    for (const w of words) {
      for (const v of variants) {
        if (w.startsWith(v) || v.startsWith(w)) {
          matched = true;
          score += 8;
          break;
        }
        best = Math.min(best, levenshtein(v, w));
      }
      if (matched) break;
    }

    if (!matched) {
      const maxDist =
        token.length >= 6 ? 2 : token.length >= 4 ? 1 : 0;
      if (best <= maxDist && maxDist > 0) {
        matched = true;
        score += 7 - best;
      }
    }

    if (!matched) return -1;
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
