import type { PropertyType } from "@prisma/client";

export type ParsedSearchQuery = {
  minBeds?: number;
  minPrice?: number;
  maxPrice?: number;
  propertyTypes?: PropertyType[];
  city?: string;
  transactionType?: "SALE" | "LEASE";
  openHouseOnly?: boolean;
  /** Leftover free-text after structured tokens are removed. */
  q?: string;
  /** True when at least one structured filter was extracted. */
  hasFilters: boolean;
};

const PROPERTY_ALIASES: Array<{ pattern: RegExp; types: PropertyType[] }> = [
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

const CITY_HINTS = [
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

function parseMoneyToken(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "").toLowerCase();
  const match = cleaned.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  if (match[2] === "m") return Math.round(n * 1_000_000);
  if (match[2] === "k") return Math.round(n * 1_000);
  // Bare numbers like 900000 or 800
  if (n < 1000) return Math.round(n * 1_000);
  return Math.round(n);
}

/**
 * Parse a natural search phrase into `/search` URL filter fields.
 * Example: "3 bed condo under 900k in Oakville"
 */
export function parseSearchQuery(input: string): ParsedSearchQuery {
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
  for (const alias of PROPERTY_ALIASES) {
    if (alias.pattern.test(text)) {
      for (const t of alias.types) {
        if (!types.includes(t)) types.push(t);
      }
      text = text.replace(alias.pattern, " ");
      result.hasFilters = true;
    }
  }
  if (types.length) result.propertyTypes = types;

  // "in Oakville" / trailing city
  const inCity = text.match(/\bin\s+([A-Za-z][A-Za-z\s'-]{1,40})$/i);
  if (inCity) {
    const candidate = inCity[1]!.trim().replace(/\s+/g, " ");
    const known = CITY_HINTS.find(
      (c) => c.toLowerCase() === candidate.toLowerCase(),
    );
    if (known || candidate.length >= 3) {
      result.city = known ?? candidate;
      result.hasFilters = true;
      text = text.replace(inCity[0], " ");
    }
  } else {
    for (const city of CITY_HINTS) {
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

/** Build `/search?...` from a parsed phrase + optional defaults. */
export function searchHrefFromParsed(
  parsed: ParsedSearchQuery,
  defaults?: { transactionType?: "SALE" | "LEASE" },
): string {
  const params = new URLSearchParams();
  const txn = parsed.transactionType ?? defaults?.transactionType;
  if (txn) params.set("transactionType", txn);
  if (parsed.city) params.set("city", parsed.city);
  if (parsed.minBeds != null) params.set("minBeds", String(parsed.minBeds));
  if (parsed.minPrice != null) params.set("minPrice", String(parsed.minPrice));
  if (parsed.maxPrice != null) params.set("maxPrice", String(parsed.maxPrice));
  if (parsed.propertyTypes?.length) {
    params.set("propertyTypes", parsed.propertyTypes.join(","));
  }
  if (parsed.openHouseOnly) params.set("openHouseOnly", "1");
  if (parsed.q) params.set("q", parsed.q);
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}
