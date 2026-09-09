import type { PropertyType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { propertyTypeLabel } from "@/lib/listings/constants";

const PROPERTY_TYPES = new Set<string>([
  "DETACHED",
  "SEMI_DETACHED",
  "TOWNHOUSE",
  "CONDO_APT",
  "CONDO_TOWNHOUSE",
  "MULTIPLEX",
  "VACANT_LAND",
  "OFFICE",
  "RETAIL",
  "INDUSTRIAL",
  "MIXED_USE",
  "OTHER",
]);

function typeLabel(type: string): string {
  if (PROPERTY_TYPES.has(type)) {
    return propertyTypeLabel(type as PropertyType);
  }
  return type.replaceAll("_", " ");
}

export type BuyerIntentCriteria = {
  cities: string[];
  communities: string[];
  propertyTypes: string[];
  minBeds: number | null;
  maxBeds: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  transactionType: "SALE" | "LEASE" | null;
  searchCount: number;
  listingViewCount: number;
  sampleMls: string[];
};

export type BuyerIntentSnapshot = {
  /** Agent-facing paragraph */
  summary: string;
  /** Short chips for scannable UI */
  chips: string[];
  /** Where the signal came from */
  source: "saved" | "inferred" | "mixed" | "thin";
  sourceLabel: string;
  criteria: BuyerIntentCriteria;
  /** One-line place + budget headline */
  headline: string | null;
};

function modeStrings(values: string[], limit = 3): string[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([k]) => k);
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * p)),
  );
  return sorted[idx] ?? null;
}

function parseMoney(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function parseSearchPath(path: string | null | undefined): {
  cities: string[];
  communities: string[];
  propertyTypes: string[];
  minBeds: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  transactionType: "SALE" | "LEASE" | null;
  q: string | null;
} | null {
  if (!path || !path.startsWith("/search")) return null;
  try {
    const url = new URL(path, "https://houzzat.local");
    const p = url.searchParams;
    const cities = [
      ...(p.get("cities")?.split(",") ?? []),
      ...(p.get("city") ? [p.get("city")!] : []),
    ]
      .map((c) => c.trim())
      .filter(Boolean);
    const communities = [
      ...(p.get("communities")?.split(",") ?? []),
      ...(p.get("community") ? [p.get("community")!] : []),
    ]
      .map((c) => c.trim())
      .filter(Boolean);
    const propertyTypes = (p.get("propertyTypes") ?? p.get("propertyType") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const minBedsRaw = p.get("minBeds");
    const minBeds = minBedsRaw ? Number(minBedsRaw) : null;
    const txn = p.get("transactionType");
    return {
      cities,
      communities,
      propertyTypes,
      minBeds: Number.isFinite(minBeds) && minBeds! > 0 ? minBeds : null,
      minPrice: parseMoney(p.get("minPrice")),
      maxPrice: parseMoney(p.get("maxPrice")),
      transactionType:
        txn === "LEASE" ? "LEASE" : txn === "SALE" ? "SALE" : null,
      q: p.get("q")?.trim() || null,
    };
  } catch {
    return null;
  }
}

function queryFromSaved(query: unknown): {
  cities: string[];
  communities: string[];
  propertyTypes: string[];
  minBeds: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  transactionType: "SALE" | "LEASE" | null;
} {
  const q = (query ?? {}) as Record<string, unknown>;

  const splitList = (raw: unknown): string[] => {
    if (Array.isArray(raw)) {
      return raw
        .filter((v): v is string => typeof v === "string")
        .flatMap((v) => v.split(/[,|]/))
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (typeof raw === "string" && raw.trim()) {
      return raw
        .split(/[,|]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  };

  const cities = [...splitList(q.cities), ...splitList(q.city)];
  const communities = [
    ...splitList(q.communities),
    ...splitList(q.community),
  ];
  const propertyTypes = [
    ...splitList(q.propertyTypes),
    ...splitList(q.propertyType),
  ];
  const minBeds =
    typeof q.minBeds === "number"
      ? q.minBeds
      : typeof q.minBeds === "string"
        ? Number(q.minBeds)
        : typeof q.bedsMin === "number"
          ? q.bedsMin
          : null;
  const minPrice =
    typeof q.minPrice === "number"
      ? q.minPrice
      : typeof q.minPrice === "string"
        ? parseMoney(q.minPrice)
        : null;
  const maxPrice =
    typeof q.maxPrice === "number"
      ? q.maxPrice
      : typeof q.maxPrice === "string"
        ? parseMoney(q.maxPrice)
        : typeof q.priceMax === "number"
          ? q.priceMax
          : null;
  const txn =
    typeof q.transactionType === "string" ? q.transactionType : null;
  return {
    cities: [...new Set(cities)],
    communities: [...new Set(communities)],
    propertyTypes: [...new Set(propertyTypes)],
    minBeds:
      Number.isFinite(minBeds) && (minBeds as number) > 0
        ? Number(minBeds)
        : null,
    minPrice,
    maxPrice,
    transactionType:
      txn === "LEASE" ? "LEASE" : txn === "SALE" ? "SALE" : null,
  };
}

function formatPrice(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  return `$${Math.round(n / 1000)}k`;
}

function formatPriceRange(min: number | null, max: number | null): string | null {
  if (min != null && max != null) return `${formatPrice(min)}–${formatPrice(max)}`;
  if (max != null) return `up to ${formatPrice(max)}`;
  if (min != null) return `from ${formatPrice(min)}`;
  return null;
}

function buildChips(c: BuyerIntentCriteria): string[] {
  const chips: string[] = [];
  const places = [...c.communities, ...c.cities].slice(0, 3);
  for (const p of places) chips.push(p);
  const price = formatPriceRange(c.minPrice, c.maxPrice);
  if (price) chips.push(price);
  if (c.minBeds != null) chips.push(`${c.minBeds}+ beds`);
  for (const t of c.propertyTypes.slice(0, 2)) {
    chips.push(typeLabel(t));
  }
  if (c.transactionType === "LEASE") chips.push("For lease");
  return chips.slice(0, 6);
}

function buildHeadline(c: BuyerIntentCriteria): string | null {
  const place =
    c.communities[0] ??
    (c.cities.length === 1
      ? c.cities[0]
      : c.cities.length > 1
        ? c.cities.slice(0, 2).join(" / ")
        : null);
  const price = formatPriceRange(c.minPrice, c.maxPrice);
  const beds = c.minBeds != null ? `${c.minBeds}+ bed` : null;
  const type =
    c.propertyTypes[0] != null
      ? typeLabel(c.propertyTypes[0])
      : c.transactionType === "LEASE"
        ? "rentals"
        : "homes";
  const bits = [place, beds, type, price].filter(Boolean);
  return bits.length >= 2 ? bits.join(" · ") : bits[0] ?? null;
}

function buildSummary(input: {
  name: string | null;
  criteria: BuyerIntentCriteria;
  source: BuyerIntentSnapshot["source"];
  hasSaved: boolean;
}): string {
  const { name, criteria: c, source, hasSaved } = input;
  const who = name?.split(" ")[0] || "This client";
  const place =
    c.communities.length > 0
      ? c.communities.slice(0, 2).join(" and ")
      : c.cities.length > 0
        ? c.cities.slice(0, 2).join(" and ")
        : null;
  const price = formatPriceRange(c.minPrice, c.maxPrice);
  const beds =
    c.minBeds != null
      ? c.maxBeds != null && c.maxBeds !== c.minBeds
        ? `${c.minBeds}–${c.maxBeds} bedrooms`
        : `${c.minBeds}+ bedrooms`
      : null;
  const types = c.propertyTypes
    .slice(0, 2)
    .map((t) => typeLabel(t).toLowerCase())
    .join(" / ");
  const txn =
    c.transactionType === "LEASE" ? "lease" : "purchase";

  const focusBits = [
    place ? `focused on ${place}` : null,
    types ? `looking at ${types}` : null,
    beds ? `needing ${beds}` : null,
    price ? `in the ${price} range` : null,
  ].filter(Boolean);

  if (focusBits.length === 0) {
    if (c.listingViewCount > 0) {
      return `${who} has viewed ${c.listingViewCount} home${c.listingViewCount === 1 ? "" : "s"} recently, but hasn’t narrowed a clear market or budget yet. Ask what area and price range matter most.`;
    }
    return `${who} hasn’t left a clear search trail yet. When they browse or filter on Houzzat, their preferred areas and budget will show up here automatically.`;
  }

  const leadIn =
    source === "saved" || (hasSaved && source === "mixed")
      ? `${who} is set up for a ${txn}`
      : `${who} appears to be shopping for a ${txn}`;

  const evidence =
    c.searchCount > 0 && c.listingViewCount > 0
      ? ` Based on ${c.searchCount} search${c.searchCount === 1 ? "" : "es"} and ${c.listingViewCount} listing view${c.listingViewCount === 1 ? "" : "s"}.`
      : c.searchCount > 0
        ? ` Based on ${c.searchCount} search${c.searchCount === 1 ? "" : "es"} on the site.`
        : c.listingViewCount > 0
          ? ` Based on ${c.listingViewCount} homes they’ve opened.`
          : hasSaved
            ? " From their saved search criteria."
            : "";

  return `${leadIn}, ${focusBits.join(", ")}.${evidence}`;
}

function emptyBuyerIntentCriteria(): BuyerIntentCriteria {
  return {
    cities: [],
    communities: [],
    propertyTypes: [],
    minBeds: null,
    maxBeds: null,
    minPrice: null,
    maxPrice: null,
    transactionType: null,
    searchCount: 0,
    listingViewCount: 0,
    sampleMls: [],
  };
}

/**
 * First-paint Looking for: saved search only. No 45-day browse scan.
 */
export function buyerIntentFromSavedSearches(input: {
  customerName: string | null;
  savedSearches: Array<{ name: string; query: unknown }>;
}): BuyerIntentSnapshot {
  const savedCities: string[] = [];
  const savedCommunities: string[] = [];
  const savedPropertyTypes: string[] = [];
  const savedBeds: number[] = [];
  const savedFilterMins: number[] = [];
  const savedFilterMaxes: number[] = [];
  let savedTxn: "SALE" | "LEASE" | null = null;
  let fromSaved = false;

  for (const s of input.savedSearches) {
    const parsed = queryFromSaved(s.query);
    const usable =
      parsed.cities.length > 0 ||
      parsed.communities.length > 0 ||
      parsed.minPrice != null ||
      parsed.maxPrice != null ||
      parsed.minBeds != null ||
      parsed.propertyTypes.length > 0;
    if (!usable) continue;
    fromSaved = true;
    savedCities.push(...parsed.cities);
    savedCommunities.push(...parsed.communities);
    savedPropertyTypes.push(...parsed.propertyTypes);
    if (parsed.minBeds != null) savedBeds.push(parsed.minBeds);
    if (parsed.minPrice != null) savedFilterMins.push(parsed.minPrice);
    if (parsed.maxPrice != null) savedFilterMaxes.push(parsed.maxPrice);
    if (parsed.transactionType) savedTxn = parsed.transactionType;
    break;
  }

  if (!fromSaved) {
    const criteria = emptyBuyerIntentCriteria();
    return {
      summary: buildSummary({
        name: input.customerName,
        criteria,
        source: "thin",
        hasSaved: false,
      }),
      chips: [],
      source: "thin",
      sourceLabel: "No clear criteria yet",
      criteria,
      headline: null,
    };
  }

  const criteria: BuyerIntentCriteria = {
    cities: modeStrings(savedCities, 3),
    communities: modeStrings(savedCommunities, 3),
    propertyTypes: modeStrings(savedPropertyTypes, 3),
    minBeds: savedBeds.length ? Math.min(...savedBeds) : null,
    maxBeds: null,
    minPrice: savedFilterMins.length ? Math.min(...savedFilterMins) : null,
    maxPrice: savedFilterMaxes.length ? Math.max(...savedFilterMaxes) : null,
    transactionType: savedTxn,
    searchCount: 0,
    listingViewCount: 0,
    sampleMls: [],
  };

  return {
    summary: buildSummary({
      name: input.customerName,
      criteria,
      source: "saved",
      hasSaved: true,
    }),
    chips: buildChips(criteria),
    source: "saved",
    sourceLabel: "Saved search",
    criteria,
    headline: buildHeadline(criteria),
  };
}

/**
 * Infer what a customer is looking for from saved searches + browsing
 * (SEARCH beacons + listing views), even when they never clicked Save Search.
 */
export async function loadBuyerIntent(input: {
  customerId: string | null;
  customerName?: string | null;
  savedSearches?: Array<{ name: string; query: unknown }>;
}): Promise<BuyerIntentSnapshot> {
  const emptyCriteria = emptyBuyerIntentCriteria();

  if (!input.customerId) {
    return {
      summary:
        "No customer account linked yet — search behaviour will appear once they browse while signed in or their visitor is linked.",
      chips: [],
      source: "thin",
      sourceLabel: "No activity yet",
      criteria: emptyCriteria,
      headline: null,
    };
  }

  const customerId = input.customerId;
  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);

  const visitors = await prisma.siteVisitor.findMany({
    where: { userId: customerId },
    select: { id: true },
    take: 20,
  });
  const visitorIds = visitors.map((v) => v.id);

  const [searchEvents, listingViews, listingViewEvents] = await Promise.all([
    prisma.activityEvent.findMany({
      where: {
        type: "SEARCH",
        createdAt: { gte: since },
        OR: [
          { userId: customerId },
          ...(visitorIds.length ? [{ visitorId: { in: visitorIds } }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { path: true, createdAt: true },
    }),
    prisma.listingView.findMany({
      where: { userId: customerId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { mlsNumber: true },
    }),
    prisma.activityEvent.findMany({
      where: {
        type: "LISTING_VIEW",
        createdAt: { gte: since },
        mlsNumber: { not: null },
        OR: [
          { userId: customerId },
          ...(visitorIds.length ? [{ visitorId: { in: visitorIds } }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { mlsNumber: true },
    }),
  ]);

  const saved = input.savedSearches ?? [];
  const savedCities: string[] = [];
  const savedCommunities: string[] = [];
  const savedPropertyTypes: string[] = [];
  const savedBeds: number[] = [];
  const savedFilterMins: number[] = [];
  const savedFilterMaxes: number[] = [];
  let savedTxn: "SALE" | "LEASE" | null = null;
  let fromSaved = false;

  // Prefer the newest usable saved search (callers pass updatedAt desc).
  // Mixing every historical search with browse is what made Looking for lag behind agent edits.
  for (const s of saved) {
    const parsed = queryFromSaved(s.query);
    const usable =
      parsed.cities.length > 0 ||
      parsed.communities.length > 0 ||
      parsed.minPrice != null ||
      parsed.maxPrice != null ||
      parsed.minBeds != null ||
      parsed.propertyTypes.length > 0;
    if (!usable) continue;
    fromSaved = true;
    savedCities.push(...parsed.cities);
    savedCommunities.push(...parsed.communities);
    savedPropertyTypes.push(...parsed.propertyTypes);
    if (parsed.minBeds != null) savedBeds.push(parsed.minBeds);
    if (parsed.minPrice != null) savedFilterMins.push(parsed.minPrice);
    if (parsed.maxPrice != null) savedFilterMaxes.push(parsed.maxPrice);
    if (parsed.transactionType) savedTxn = parsed.transactionType;
    break;
  }

  const browseCities: string[] = [];
  const browseCommunities: string[] = [];
  const browsePropertyTypes: string[] = [];
  const browseBeds: number[] = [];
  const browseFilterMins: number[] = [];
  const browseFilterMaxes: number[] = [];
  const browseViewPrices: number[] = [];
  let browseTxn: "SALE" | "LEASE" | null = null;
  let fromBrowse = false;

  for (const ev of searchEvents) {
    const parsed = parseSearchPath(ev.path);
    if (!parsed) continue;
    const meaningful =
      parsed.cities.length > 0 ||
      parsed.communities.length > 0 ||
      parsed.minPrice != null ||
      parsed.maxPrice != null ||
      parsed.minBeds != null ||
      parsed.propertyTypes.length > 0 ||
      Boolean(parsed.q);
    if (!meaningful) continue;
    fromBrowse = true;
    browseCities.push(...parsed.cities);
    browseCommunities.push(...parsed.communities);
    browsePropertyTypes.push(...parsed.propertyTypes);
    if (parsed.minBeds != null) browseBeds.push(parsed.minBeds);
    if (parsed.minPrice != null) browseFilterMins.push(parsed.minPrice);
    if (parsed.maxPrice != null) browseFilterMaxes.push(parsed.maxPrice);
    if (parsed.q) {
      if (
        !browseCities.includes(parsed.q) &&
        !browseCommunities.includes(parsed.q)
      ) {
        browseCities.push(parsed.q);
      }
    }
    if (parsed.transactionType) browseTxn = parsed.transactionType;
  }

  const mlsSet = [
    ...listingViews.map((v) => v.mlsNumber),
    ...listingViewEvents
      .map((e) => e.mlsNumber)
      .filter((m): m is string => Boolean(m)),
  ];
  const sampleMls = [...new Set(mlsSet)].slice(0, 12);

  if (sampleMls.length > 0) {
    const listings = await prisma.listing.findMany({
      where: { mlsNumber: { in: sampleMls } },
      select: {
        mlsNumber: true,
        city: true,
        community: true,
        listPrice: true,
        beds: true,
        propertyType: true,
        transactionType: true,
      },
    });
    if (listings.length > 0) fromBrowse = true;
    for (const row of listings) {
      if (row.city) browseCities.push(row.city);
      if (row.community) browseCommunities.push(row.community);
      browsePropertyTypes.push(row.propertyType);
      if (row.beds > 0) browseBeds.push(row.beds);
      if (row.listPrice > 0) browseViewPrices.push(row.listPrice);
      if (!browseTxn) {
        browseTxn = row.transactionType === "LEASE" ? "LEASE" : "SALE";
      }
    }
  }

  // Agent/customer saved search is source of truth when present.
  // Browse only fills gaps so Looking for matches what agents edit.
  const useSavedPlaces =
    savedCities.length > 0 || savedCommunities.length > 0;
  const useSavedTypes = savedPropertyTypes.length > 0;
  const useSavedBeds = savedBeds.length > 0;
  const useSavedPrice =
    savedFilterMins.length > 0 || savedFilterMaxes.length > 0;

  const sortedViewPrices = [...browseViewPrices].sort((a, b) => a - b);

  const criteria: BuyerIntentCriteria = {
    cities: modeStrings(
      useSavedPlaces ? savedCities : browseCities,
      3,
    ),
    communities: modeStrings(
      useSavedPlaces ? savedCommunities : browseCommunities,
      3,
    ),
    propertyTypes: modeStrings(
      useSavedTypes ? savedPropertyTypes : browsePropertyTypes,
      3,
    ),
    minBeds: useSavedBeds
      ? Math.min(...savedBeds)
      : browseBeds.length
        ? Math.min(...browseBeds.filter((b) => b > 0))
        : null,
    // Don't invent a max bed range from listing views when a saved search exists
    maxBeds: useSavedBeds
      ? null
      : browseBeds.length
        ? Math.max(...browseBeds)
        : null,
    minPrice: useSavedPrice
      ? savedFilterMins.length
        ? Math.min(...savedFilterMins)
        : null
      : browseFilterMins.length > 0
        ? Math.min(...browseFilterMins)
        : percentile(sortedViewPrices, 0.2),
    maxPrice: useSavedPrice
      ? savedFilterMaxes.length
        ? Math.max(...savedFilterMaxes)
        : null
      : browseFilterMaxes.length > 0
        ? Math.max(...browseFilterMaxes)
        : percentile(sortedViewPrices, 0.8),
    transactionType: savedTxn ?? browseTxn,
    searchCount: searchEvents.filter((e) => parseSearchPath(e.path)).length,
    listingViewCount: sampleMls.length,
    sampleMls: sampleMls.slice(0, 5),
  };

  if (!fromSaved && !useSavedBeds && browseBeds.length >= 3) {
    const bedModes = modeStrings(browseBeds.map(String), 1);
    const modeBed = bedModes[0] ? Number(bedModes[0]) : null;
    if (modeBed && modeBed > 0) {
      criteria.minBeds = modeBed;
      criteria.maxBeds = modeBed;
    }
  }

  const source: BuyerIntentSnapshot["source"] =
    fromSaved && fromBrowse
      ? "mixed"
      : fromSaved
        ? "saved"
        : fromBrowse
          ? "inferred"
          : "thin";

  const sourceLabel =
    source === "saved"
      ? "Saved search"
      : source === "mixed"
        ? "Saved + browsing"
        : source === "inferred"
          ? "From browsing"
          : "No clear criteria yet";

  return {
    summary: buildSummary({
      name: input.customerName ?? null,
      criteria,
      source,
      hasSaved: fromSaved,
    }),
    chips: buildChips(criteria),
    source,
    sourceLabel,
    criteria,
    headline: buildHeadline(criteria),
  };
}
