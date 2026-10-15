import type { PropertyType } from "@prisma/client";
import {
  canonicalMarketCity,
  staticOntarioHubCities,
} from "@/lib/geo/regions";
import { looksLikeStreetAddress } from "@/lib/listings/address-suggest";
import { isNlSearchParserV2Enabled } from "@/lib/listings/nl-search-parser-flag";
import { parseExactAddressQuery } from "@/lib/listings/search-match";

export type ParsedSearchQuery = {
  minBeds?: number;
  minBaths?: number;
  minPrice?: number;
  maxPrice?: number;
  propertyTypes?: PropertyType[];
  /** Single city (legacy + V2 when exactly one). */
  city?: string;
  /** Multi-city (V2). Prefer this when length >= 2; URL uses cities=A|B. */
  cities?: string[];
  transactionType?: "SALE" | "LEASE";
  openHouseOnly?: boolean;
  /** Leftover free-text after structured tokens are removed. */
  q?: string;
  /** True when at least one structured filter was extracted. */
  hasFilters: boolean;
};

/** Legacy aliases — includes homes/houses → DETACHED (pre-V2 behavior). */
const PROPERTY_ALIASES_LEGACY: Array<{
  pattern: RegExp;
  types: PropertyType[];
}> = [
  { pattern: /\bcondos?\b|\bcondo\s*apt(?:artment)?s?\b/i, types: ["CONDO_APT"] },
  {
    pattern: /\bcondo\s*town(?:house|home)?s?\b/i,
    types: ["CONDO_TOWNHOUSE"],
  },
  {
    pattern: /\btown(?:house|home)s?\b|\btowns?\b/i,
    types: ["TOWNHOUSE", "CONDO_TOWNHOUSE"],
  },
  {
    pattern: /\bsemi[-\s]?detached\b|\bsemis?\b/i,
    types: ["SEMI_DETACHED"],
  },
  { pattern: /\bdetached\b|\bhouses?\b|\bhomes?\b/i, types: ["DETACHED"] },
  { pattern: /\bmultiplex\b|\bduplex\b|\btriplex\b/i, types: ["MULTIPLEX"] },
  { pattern: /\bland\b|\bvlot\b/i, types: ["VACANT_LAND"] },
  { pattern: /\boffice\b/i, types: ["OFFICE"] },
  { pattern: /\bretail\b|\bstorefront\b/i, types: ["RETAIL"] },
  { pattern: /\bindustrial\b|\bwarehouse\b/i, types: ["INDUSTRIAL"] },
];

const CITY_HINTS_LEGACY = [
  "Toronto",
  "Mississauga",
  "Brampton",
  "Markham",
  "Vaughan",
  "Oakville",
  "Richmond Hill",
  "Burlington",
  "Milton",
  "Pickering",
  "Ajax",
  "Whitby",
  "Oshawa",
  "Newmarket",
  "Aurora",
  "King City",
  "Caledon",
  "Halton Hills",
  "Hamilton",
  "Etobicoke",
  "North York",
  "Scarborough",
].sort((a, b) => b.length - a.length);

/** Filler removed in V2 after structured extraction — must not remain in `q`. */
const V2_FILLER =
  /\b(?:homes?|houses?|propert(?:y|ies)|residential|listings?|looking(?:\s+for)?|want(?:ing)?|need|show\s+me|find|search|for|the|a|an|in|near|around|area|ontario|on)\b/gi;

/** Display aliases → canonical market city (catalog uses "King", not "King City"). */
const CITY_ALIASES: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /\bking\s+city\b/gi, canonical: "King" },
  { pattern: /\bst\.?\s*catharines\b/gi, canonical: "St. Catharines" },
  { pattern: /\bst\.?\s*thomas\b/gi, canonical: "St. Thomas" },
  {
    pattern: /\bniagara[-\s]?on[-\s]?the[-\s]?lake\b/gi,
    canonical: "Niagara-on-the-Lake",
  },
  // Toronto districts often typed as cities — map to Toronto inventory.
  { pattern: /\betobicoke\b/gi, canonical: "Toronto" },
  { pattern: /\bnorth\s+york\b/gi, canonical: "Toronto" },
  { pattern: /\bscarborough\b/gi, canonical: "Toronto" },
];

/** Hub catalog + municipalities commonly searched but not in every region list. */
const NL_EXTRA_MUNICIPALITIES = ["Guelph"] as const;

function parseMoneyToken(
  raw: string,
  opts?: { lease?: boolean },
): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "").toLowerCase();
  if (!cleaned) return null;
  // Reject incomplete / junk: "1.", "k", "under"
  if (!/^\d+(\.\d+)?[km]?$/i.test(cleaned)) return null;
  const match = cleaned.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (match[2] === "m") return Math.round(n * 1_000_000);
  if (match[2] === "k") return Math.round(n * 1_000);
  // Sale shorthand: bare "800" → $800k. Lease keeps monthly CAD as-is.
  if (n < 1000 && !opts?.lease) return Math.round(n * 1_000);
  return Math.round(n);
}

function ontarioCitiesLongestFirst(): string[] {
  const names = new Set<string>(staticOntarioHubCities());
  for (const extra of NL_EXTRA_MUNICIPALITIES) names.add(extra);
  return [...names].sort((a, b) => b.length - a.length);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cityPattern(name: string): RegExp {
  const parts = name.trim().split(/\s+/).map(escapeRegExp);
  return new RegExp(`\\b${parts.join("\\s+")}\\b`, "i");
}

/**
 * Legacy parser — frozen behavior for flag OFF / regression.
 * Example: "3 bed condo under 900k in Oakville"
 */
export function parseSearchQueryLegacy(input: string): ParsedSearchQuery {
  let text = input.trim();
  if (!text) return { hasFilters: false };

  const result: ParsedSearchQuery = { hasFilters: false };

  if (/\b(for\s+)?(lease|rent|rental)s?\b/i.test(text)) {
    result.transactionType = "LEASE";
    result.hasFilters = true;
    text = text.replace(/\b(for\s+)?(lease|rent|rental)s?\b/gi, " ");
  } else if (/\b(for\s+)?sale\b/i.test(text)) {
    result.transactionType = "SALE";
    result.hasFilters = true;
    text = text.replace(/\b(for\s+)?sale\b/gi, " ");
  }

  if (/\bopen\s*houses?\b/i.test(text)) {
    result.openHouseOnly = true;
    result.hasFilters = true;
    text = text.replace(/\bopen\s*houses?\b/gi, " ");
  }

  const bedsMatch = text.match(
    /\b(\d+(?:\.\d+)?)\s*(?:bed(?:room)?s?|br)\b/i,
  );
  if (bedsMatch) {
    const beds = Number(bedsMatch[1]);
    if (Number.isFinite(beds) && beds > 0) {
      result.minBeds = beds;
      result.hasFilters = true;
      text = text.replace(bedsMatch[0], " ");
    }
  }

  const underMatch = text.match(
    /\b(?:under|below|max(?:imum)?|up\s+to)\s*\$?\s*([\d.,]+\s*[kKmM]?)\b/i,
  );
  if (underMatch) {
    const amount = parseMoneyToken(underMatch[1]!);
    if (amount != null) {
      result.maxPrice = amount;
      result.hasFilters = true;
      text = text.replace(underMatch[0], " ");
    }
  }

  const overMatch = text.match(
    /\b(?:over|above|min(?:imum)?|from)\s*\$?\s*([\d.,]+\s*[kKmM]?)\b/i,
  );
  if (overMatch) {
    const amount = parseMoneyToken(overMatch[1]!);
    if (amount != null) {
      result.minPrice = amount;
      result.hasFilters = true;
      text = text.replace(overMatch[0], " ");
    }
  }

  const betweenMatch = text.match(
    /\b(?:between|from)\s*\$?\s*([\d.,]+\s*[kKmM]?)\s*(?:and|to|-)\s*\$?\s*([\d.,]+\s*[kKmM]?)\b/i,
  );
  if (betweenMatch) {
    const low = parseMoneyToken(betweenMatch[1]!);
    const high = parseMoneyToken(betweenMatch[2]!);
    if (low != null && high != null) {
      result.minPrice = Math.min(low, high);
      result.maxPrice = Math.max(low, high);
      result.hasFilters = true;
      text = text.replace(betweenMatch[0], " ");
    }
  }

  const types: PropertyType[] = [];
  for (const alias of PROPERTY_ALIASES_LEGACY) {
    if (alias.pattern.test(text)) {
      for (const t of alias.types) {
        if (!types.includes(t)) types.push(t);
      }
      text = text.replace(alias.pattern, " ");
      result.hasFilters = true;
    }
  }
  if (types.length) result.propertyTypes = types;

  const inCity = text.match(/\bin\s+([A-Za-z][A-Za-z\s'-]{1,40})$/i);
  if (inCity) {
    const candidate = inCity[1]!.trim().replace(/\s+/g, " ");
    const known = CITY_HINTS_LEGACY.find(
      (c) => c.toLowerCase() === candidate.toLowerCase(),
    );
    if (known || candidate.length >= 3) {
      result.city = known ?? candidate;
      result.hasFilters = true;
      text = text.replace(inCity[0], " ");
    }
  } else {
    for (const city of CITY_HINTS_LEGACY) {
      const re = new RegExp(`\\b${city.replace(/\s+/g, "\\s+")}\\b`, "i");
      if (re.test(text)) {
        result.city = city;
        result.hasFilters = true;
        text = text.replace(re, " ");
        break;
      }
    }
  }

  const leftover = text.replace(/\s+/g, " ").trim();
  if (leftover) result.q = leftover;

  return result;
}

function extractCitiesFromSegment(segment: string): string[] {
  let working = segment.trim();
  if (!working) return [];

  // Normalize aliases first so "King City" becomes catalog "King".
  for (const alias of CITY_ALIASES) {
    working = working.replace(alias.pattern, ` ${alias.canonical} `);
  }
  working = working.replace(/\s+/g, " ").trim();

  const found: string[] = [];
  const catalog = ontarioCitiesLongestFirst();

  for (const name of catalog) {
    const re = cityPattern(name);
    if (!re.test(working)) continue;
    const canonical = canonicalMarketCity(name) ?? name;
    if (!found.some((c) => c.toLowerCase() === canonical.toLowerCase())) {
      found.push(canonical);
    }
    working = working.replace(re, " | ");
  }

  // Also accept comma/or/and-split tokens that are whole catalog cities.
  for (const part of working.split(/\s*(?:,|\bor\b|\band\b|\|)\s*/i)) {
    const canonical = canonicalMarketCity(part.trim());
    if (
      canonical &&
      !found.some((c) => c.toLowerCase() === canonical.toLowerCase())
    ) {
      found.push(canonical);
    }
  }

  return found;
}

/**
 * V2 deterministic parser — flag ON only.
 * Generic homes/houses/properties do not imply DETACHED.
 */
export function parseSearchQueryV2(input: string): ParsedSearchQuery {
  let text = input.trim();
  if (!text) return { hasFilters: false };

  const result: ParsedSearchQuery = { hasFilters: false };

  // Transaction — rent/lease before sale/buy.
  if (
    /\b(?:for\s+)?(?:lease|rentals?|rents?)\b/i.test(text) ||
    /\bfor\s+rent\b/i.test(text)
  ) {
    result.transactionType = "LEASE";
    result.hasFilters = true;
    text = text.replace(/\b(?:for\s+)?(?:lease|rentals?|rents?)\b/gi, " ");
    text = text.replace(/\bfor\s+rent\b/gi, " ");
  } else if (
    /\b(?:for\s+)?sale\b/i.test(text) ||
    /\b(?:buy|purchase|buying)\b/i.test(text)
  ) {
    result.transactionType = "SALE";
    result.hasFilters = true;
    text = text.replace(/\b(?:for\s+)?sale\b/gi, " ");
    text = text.replace(/\b(?:buy|purchase|buying)\b/gi, " ");
  }

  if (/\bopen\s*houses?\b/i.test(text)) {
    result.openHouseOnly = true;
    result.hasFilters = true;
    text = text.replace(/\bopen\s*houses?\b/gi, " ");
  }

  const moneyOpts = { lease: result.transactionType === "LEASE" };

  // Price: between before under/over; do not treat "from" alone as min after between.
  const betweenMatch = text.match(
    /\b(?:between|from)\s*\$?\s*([\d.,]+(?:\s*[kKmM])?)\s*(?:and|to|-)\s*\$?\s*([\d.,]+(?:\s*[kKmM])?)\b/i,
  );
  if (betweenMatch) {
    const low = parseMoneyToken(betweenMatch[1]!, moneyOpts);
    const high = parseMoneyToken(betweenMatch[2]!, moneyOpts);
    if (low != null && high != null) {
      result.minPrice = Math.min(low, high);
      result.maxPrice = Math.max(low, high);
      result.hasFilters = true;
      text = text.replace(betweenMatch[0], " ");
    }
  }

  const underMatch = text.match(
    /\b(?:under|below|max(?:imum)?|up\s+to)\s*\$?\s*([\d.,]+(?:\s*[kKmM])?)\b/i,
  );
  if (underMatch) {
    const amount = parseMoneyToken(underMatch[1]!, moneyOpts);
    if (amount != null) {
      result.maxPrice = amount;
      result.hasFilters = true;
      text = text.replace(underMatch[0], " ");
    }
  }

  const overMatch = text.match(
    /\b(?:over|above|min(?:imum)?)\s*\$?\s*([\d.,]+(?:\s*[kKmM])?)\b/i,
  );
  if (overMatch) {
    const amount = parseMoneyToken(overMatch[1]!, moneyOpts);
    if (amount != null) {
      result.minPrice = amount;
      result.hasFilters = true;
      text = text.replace(overMatch[0], " ");
    }
  }

  // Beds: "3-bedroom", "3 bedrooms", "3 br"
  const bedsMatch = text.match(
    /\b(\d+(?:\.\d+)?)\s*[- ]?\s*(?:bed(?:room)?s?|br)\b/i,
  );
  if (bedsMatch) {
    const beds = Number(bedsMatch[1]);
    if (Number.isFinite(beds) && beds > 0) {
      result.minBeds = beds;
      result.hasFilters = true;
      text = text.replace(bedsMatch[0], " ");
    }
  }

  const bathsMatch = text.match(
    /\b(\d+(?:\.\d+)?)\s*[- ]?\s*(?:bath(?:room)?s?)\b/i,
  );
  if (bathsMatch) {
    const baths = Number(bathsMatch[1]);
    if (Number.isFinite(baths) && baths > 0) {
      result.minBaths = baths;
      result.hasFilters = true;
      text = text.replace(bathsMatch[0], " ");
    }
  }

  // Property types — specific before generic; never map bare homes → DETACHED.
  const types: PropertyType[] = [];
  const typeRules: Array<{ pattern: RegExp; types: PropertyType[] }> = [
    {
      pattern: /\bcondo\s*town(?:house|home)?s?\b/i,
      types: ["CONDO_TOWNHOUSE"],
    },
    {
      pattern: /\b(?:condo\s+)?(?:apartments?|apts?)\b|\bcondos?\b/i,
      types: ["CONDO_APT"],
    },
    {
      pattern: /\btown(?:house|home)s?\b/i,
      types: ["TOWNHOUSE", "CONDO_TOWNHOUSE"],
    },
    {
      pattern: /\bsemi[-\s]?detached\b|\bsemis?\b/i,
      types: ["SEMI_DETACHED"],
    },
    {
      pattern: /\bdetached(?:\s+homes?|\s+houses?)?\b/i,
      types: ["DETACHED"],
    },
    { pattern: /\bmultiplex\b|\bduplex\b|\btriplex\b/i, types: ["MULTIPLEX"] },
    { pattern: /\bv(?:acant\s*)?land\b|\bvlot\b/i, types: ["VACANT_LAND"] },
    { pattern: /\boffice\b/i, types: ["OFFICE"] },
    { pattern: /\bretail\b|\bstorefront\b/i, types: ["RETAIL"] },
    { pattern: /\bindustrial\b|\bwarehouse\b/i, types: ["INDUSTRIAL"] },
  ];
  for (const rule of typeRules) {
    if (rule.pattern.test(text)) {
      for (const t of rule.types) {
        if (!types.includes(t)) types.push(t);
      }
      text = text.replace(rule.pattern, " ");
      result.hasFilters = true;
    }
  }
  if (types.length) result.propertyTypes = types;

  // Strip generic residential nouns (no type filter).
  text = text.replace(/\b(?:homes?|houses?|propert(?:y|ies))\b/gi, " ");

  // Locations: "in A or B" / "in A and B" / "in A, B, C" then remaining catalog hits.
  const inClause = text.match(
    /\bin\s+([A-Za-z][A-Za-z0-9\s'.,|-]{1,80})$/i,
  );
  let cities: string[] = [];
  if (inClause) {
    cities = extractCitiesFromSegment(inClause[1]!);
    if (cities.length > 0) {
      text = text.replace(inClause[0], " ");
      result.hasFilters = true;
    }
  }

  if (cities.length === 0) {
    cities = extractCitiesFromSegment(text);
    if (cities.length > 0) {
      result.hasFilters = true;
      for (const city of ontarioCitiesLongestFirst()) {
        text = text.replace(cityPattern(city), " ");
      }
      for (const alias of CITY_ALIASES) {
        text = text.replace(alias.pattern, " ");
      }
    }
  } else {
    for (const city of ontarioCitiesLongestFirst()) {
      text = text.replace(cityPattern(city), " ");
    }
    for (const alias of CITY_ALIASES) {
      text = text.replace(alias.pattern, " ");
    }
  }

  if (cities.length === 1) {
    result.city = cities[0];
    result.cities = cities;
  } else if (cities.length > 1) {
    result.cities = cities;
    result.city = undefined;
  }

  // Remove connectors left from multi-city phrases.
  text = text.replace(/\b(?:or|and)\b/gi, " ");
  text = text.replace(/[,|]/g, " ");
  text = text.replace(V2_FILLER, " ");

  const leftover = text.replace(/\s+/g, " ").trim();
  // Drop punctuation-only leftovers.
  if (leftover && /[A-Za-z0-9]/.test(leftover)) {
    result.q = leftover;
  }

  return result;
}

/**
 * Parse a natural search phrase into `/search` URL filter fields.
 * Flag OFF → legacy; Flag ON (`NEXT_PUBLIC_NL_SEARCH_PARSER_V2=1`) → V2.
 */
export function parseSearchQuery(input: string): ParsedSearchQuery {
  if (isNlSearchParserV2Enabled()) {
    return parseSearchQueryV2(input);
  }
  return parseSearchQueryLegacy(input);
}

/**
 * A Photon place replaces the typed query only after the customer picks it.
 * An automatic address resolution does not.
 */
export function shouldUseExplicitPlace(explicitPlace: boolean): boolean {
  return explicitPlace;
}

/** Tokens that must not remain as `q` once structured filters were extracted. */
const LEFTOVER_Q_CRUMB =
  /^(?:for|the|a|an|in|near|around|area|ontario|on|listings?|homes?|houses?|propert(?:y|ies)|residential|looking|want(?:ing)?|need|show|find|search|and|or)$/i;

/**
 * Preserve meaningful free-text (streets, builders). Drop filler crumbs when
 * structured filters exist — leftover `q` otherwise broadens API status to ALL.
 */
export function leftoverQueryForSearchHref(
  parsed: ParsedSearchQuery,
): string | undefined {
  const q = parsed.q?.trim();
  if (!q) return undefined;
  const hasStructuredFilters =
    Boolean(parsed.city) ||
    (parsed.cities?.length ?? 0) > 0 ||
    (parsed.propertyTypes?.length ?? 0) > 0 ||
    parsed.minBeds != null ||
    parsed.minBaths != null ||
    parsed.minPrice != null ||
    parsed.maxPrice != null ||
    Boolean(parsed.openHouseOnly);
  if (!hasStructuredFilters) return q;
  if (parseExactAddressQuery(q) || looksLikeStreetAddress(q)) return q;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 0 && tokens.every((t) => LEFTOVER_Q_CRUMB.test(t))) {
    return undefined;
  }
  return q;
}

/** Build `/search?...` (or a staff base path) from a parsed phrase + defaults. */
export function searchHrefFromParsed(
  parsed: ParsedSearchQuery,
  defaults?: { transactionType?: "SALE" | "LEASE"; basePath?: string },
): string {
  const params = new URLSearchParams();
  const txn = parsed.transactionType ?? defaults?.transactionType;
  if (txn) params.set("transactionType", txn);

  const cities =
    parsed.cities && parsed.cities.length > 0
      ? parsed.cities
      : parsed.city
        ? [parsed.city]
        : [];
  if (cities.length > 1) {
    params.set("cities", cities.join("|"));
  } else if (cities.length === 1) {
    params.set("city", cities[0]!);
  }

  if (parsed.minBeds != null) params.set("minBeds", String(parsed.minBeds));
  if (parsed.minBaths != null) params.set("minBaths", String(parsed.minBaths));
  if (parsed.minPrice != null) params.set("minPrice", String(parsed.minPrice));
  if (parsed.maxPrice != null) params.set("maxPrice", String(parsed.maxPrice));
  if (parsed.propertyTypes?.length) {
    params.set("propertyTypes", parsed.propertyTypes.join(","));
  }
  if (parsed.openHouseOnly) params.set("openHouseOnly", "1");
  const leftoverQ = leftoverQueryForSearchHref(parsed);
  if (leftoverQ) params.set("q", leftoverQ);
  const base = defaults?.basePath?.replace(/\/$/, "") || "/search";
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
