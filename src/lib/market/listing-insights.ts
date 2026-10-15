import type { ListingFacts } from "@/lib/listings/facts";
import { formatBedsPlusLabel, parseListingFacts } from "@/lib/listings/facts";
import {
  buildAuthorizedAddressListingHistoryRows,
} from "@/lib/listings/build-listing-panel";
import {
  historyRowRecencyMs,
  isPriceChangeEvent,
  type HistoryRow,
} from "@/lib/listings/history-rows";
import { daysOnMarketFromListedAt } from "@/lib/listings/constants";
import { boundingBox, haversineKm } from "@/lib/geo/distance";
import { findComps } from "@/lib/market/cma";
import { monthlyMortgagePayment } from "@/lib/market/affordability";
import {
  estimateHomeValue,
  parseBasementFinishFromFacts,
  type BasementFinish,
  type ValuationConfidence,
} from "@/lib/market/home-value-estimate";
import type { MarketPulse } from "@/lib/market/pulse";
import type { NearbyPoi } from "@/lib/poi/nearby";
import { prisma } from "@/lib/prisma";
import type { WorkspaceListingEntitlement } from "@/lib/tenancy/listing-entitlement";

export type InsightTemperature = {
  label: "Buyer-friendly" | "Balanced" | "Competitive";
  score: number;
  summary: string;
  factors: Array<{
    label: string;
    detail: string;
    tone: "pos" | "neu" | "neg";
  }>;
};

export type InsightTimelinePoint = {
  date: string;
  price: number;
  label: string;
  /** When false, guests see the event without the sold/leased price. */
  public: boolean;
};

type InsightsListingHistory = {
  id: string;
  event: string;
  price: number | null;
  originalPrice: number | null;
  contractDate: Date;
  lastUpdatedAt: Date | null;
  externalMls: string | null;
  visibility: string;
  note: string | null;
};

type InsightsListingForTimeline = {
  mlsNumber: string;
  listPrice: number;
  soldPrice: number | null;
  listedAt: Date;
  soldAt: Date | null;
  updatedAtMls: Date | null;
  status: string;
  transactionType: string;
  history: InsightsListingHistory[];
};

/**
 * Timeline + history for Insights — same VOW sold/close redaction as
 * listing panel / raw detail (Ask #45). Null-price rows are omitted so
 * guest JSON cannot carry restricted dollars.
 */
export function buildInsightsTimeline(opts: {
  listing: InsightsListingForTimeline;
  canSeeRestricted: boolean;
}): { historyRows: HistoryRow[]; timeline: InsightTimelinePoint[] } {
  const { listing, canSeeRestricted } = opts;
  const historyRows = buildAuthorizedAddressListingHistoryRows({
    mlsNumber: listing.mlsNumber,
    listPrice: listing.listPrice,
    listedAt: listing.listedAt,
    updatedAtMls: listing.updatedAtMls,
    soldAt: listing.soldAt,
    soldPrice: listing.soldPrice,
    status: listing.status,
    transactionType: listing.transactionType,
    history: listing.history,
    siblings: [],
    canSeeRestricted,
  });

  const timeline = [...historyRows]
    .filter((r): r is HistoryRow & { price: number } => r.price != null)
    .sort((a, b) => historyRowRecencyMs(a) - historyRowRecencyMs(b))
    .slice(-8)
    .map((r) => ({
      date: r.lastUpdate ?? r.contractDate ?? listing.listedAt.toISOString(),
      price: r.price,
      label: r.event,
      public: r.public,
    }));

  return { historyRows, timeline };
}

export type InsightComp = {
  mlsNumber: string;
  addressLine: string;
  city: string;
  unitNumber?: string | null;
  distanceKm: number;
  beds: number;
  bedsLabel?: string | null;
  baths: number;
  soldPrice: number | null;
  listPrice: number;
  daysOnMarket: number;
  status: string;
  pricePerSqft: number | null;
};

export type ListingInsightsPayload = {
  placeLabel: string;
  signedIn: boolean;
  temperature: InsightTemperature;
  pricePosition: {
    listPrice: number;
    medianAsk: number | null;
    medianSold: number | null;
    vsAskPct: number | null;
    vsSoldPct: number | null;
    soldRestricted: boolean;
  };
  timeline: InsightTimelinePoint[];
  comps: {
    restricted: boolean;
    items: InsightComp[];
    rangeLow: number | null;
    rangeMid: number | null;
    rangeHigh: number | null;
  };
  ownership: {
    listPrice: number;
    taxesAnnual: number | null;
    maintenanceMonthly: number | null;
    estimatedMortgageMonthly: number;
    estimatedTotalMonthly: number;
    downPaymentExample: number;
    ratePct: number;
    amortYears: number;
  };
  lifestyle: {
    score: number;
    summary: string;
    categories: Array<{
      key: string;
      label: string;
      count: number;
      nearestKm: number | null;
      strength: number;
    }>;
  };
  space: {
    beds: number;
    bedsLabel: string | null;
    baths: number;
    sqft: number | null;
    bedroomsAboveGrade: number | null;
    bedroomsBelowGrade: number | null;
    kitchensTotal: number | null;
    lotFrontage: number | null;
    livingAreaRange: string | null;
    highlights: string[];
  };
  competition: {
    similarActiveNearby: number;
    radiusKm: number;
    priceBandLow: number;
    priceBandHigh: number;
    avgDomArea: number | null;
    thisDom: number;
    domDelta: number | null;
  };
  valuation: {
    restricted: boolean;
    status: "OK" | "INSUFFICIENT_DATA";
    low: number | null;
    mid: number | null;
    high: number | null;
    sampleSize: number;
    soldCount: number;
    method: string | null;
    confidence: ValuationConfidence | null;
    vsListPct: number | null;
    communityAvgSold: number | null;
    disclaimer: string;
  };
  timing: {
    possessionLabel: string | null;
    nextOpenHouse: string | null;
    listedLabel: string | null;
    daysOnMarket: number;
  };
  pulse: {
    activeCount: number;
    soldCount: number;
    soldOverAskingPct: number | null;
    soldRestricted: boolean;
  };
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

function pctDelta(value: number, baseline: number | null): number | null {
  if (baseline == null || baseline <= 0) return null;
  return Math.round(((value - baseline) / baseline) * 1000) / 10;
}

function buildTemperature(input: {
  vsAskPct: number | null;
  thisDom: number;
  avgDom: number | null;
  priceCuts: number;
  similarNearby: number;
  soldOverAsk: number | null;
  soldRestricted: boolean;
}): InsightTemperature {
  let score = 50;
  const factors: InsightTemperature["factors"] = [];

  if (input.vsAskPct != null) {
    if (input.vsAskPct <= -5) {
      score -= 12;
      factors.push({
        label: "Ask vs area",
        detail: `${Math.abs(input.vsAskPct)}% under median ask`,
        tone: "pos",
      });
    } else if (input.vsAskPct >= 8) {
      score += 14;
      factors.push({
        label: "Ask vs area",
        detail: `${input.vsAskPct}% over median ask`,
        tone: "neg",
      });
    } else {
      factors.push({
        label: "Ask vs area",
        detail: "Near neighbourhood median ask",
        tone: "neu",
      });
    }
  }

  if (input.avgDom != null && input.avgDom > 0) {
    const ratio = input.thisDom / input.avgDom;
    if (ratio >= 1.35) {
      score -= 10;
      factors.push({
        label: "Time on market",
        detail: "Sitting longer than typical nearby",
        tone: "pos",
      });
    } else if (ratio <= 0.65 && input.thisDom <= 14) {
      score += 12;
      factors.push({
        label: "Time on market",
        detail: "Moving faster than the area average",
        tone: "neg",
      });
    } else {
      factors.push({
        label: "Time on market",
        detail: `${input.thisDom} days · area avg ${input.avgDom}`,
        tone: "neu",
      });
    }
  }

  if (input.priceCuts >= 1) {
    score -= 8 * Math.min(input.priceCuts, 2);
    factors.push({
      label: "Price changes",
      detail:
        input.priceCuts === 1
          ? "One list-price reduction on record"
          : `${input.priceCuts} list-price reductions on record`,
      tone: "pos",
    });
  }

  if (input.similarNearby >= 8) {
    score -= 8;
    factors.push({
      label: "Competition",
      detail: `${input.similarNearby} similar actives nearby`,
      tone: "pos",
    });
  } else if (input.similarNearby <= 2) {
    score += 10;
    factors.push({
      label: "Competition",
      detail: "Few similar homes nearby right now",
      tone: "neg",
    });
  }

  if (!input.soldRestricted && input.soldOverAsk != null) {
    if (input.soldOverAsk >= 55) {
      score += 10;
      factors.push({
        label: "Sold pressure",
        detail: `${input.soldOverAsk}% of recent solds at/over ask`,
        tone: "neg",
      });
    } else if (input.soldOverAsk <= 30) {
      score -= 8;
      factors.push({
        label: "Sold pressure",
        detail: `${input.soldOverAsk}% of recent solds at/over ask`,
        tone: "pos",
      });
    }
  }

  score = Math.max(8, Math.min(92, Math.round(score)));

  let label: InsightTemperature["label"] = "Balanced";
  let summary =
    "A fairly even market for this home — negotiate with local comps in mind.";
  if (score <= 38) {
    label = "Buyer-friendly";
    summary =
      "Signals lean your way: more room to negotiate than a hot listing typically allows.";
  } else if (score >= 62) {
    label = "Competitive";
    summary =
      "Demand signals are firm — strong prep and a clear offer strategy matter here.";
  }

  return { label, score, summary, factors: factors.slice(0, 4) };
}

function lifestyleFromPois(pois: NearbyPoi[]) {
  const defs = [
    { key: "SCHOOL", label: "Schools" },
    { key: "PARK", label: "Parks" },
    { key: "TRANSIT", label: "Transit" },
    { key: "GROCERY", label: "Grocery" },
  ] as const;

  const categories = defs.map((def) => {
    const matches = pois.filter((p) => p.type === def.key);
    const nearestKm = matches[0]?.distanceKm ?? null;
    const count = matches.length;
    let strength = 0;
    if (count > 0) strength += Math.min(count, 4) * 12;
    if (nearestKm != null) {
      if (nearestKm <= 0.5) strength += 40;
      else if (nearestKm <= 1) strength += 28;
      else if (nearestKm <= 1.5) strength += 16;
      else strength += 8;
    }
    return {
      key: def.key,
      label: def.label,
      count,
      nearestKm,
      strength: Math.min(100, strength),
    };
  });

  const score = Math.round(
    categories.reduce((n, c) => n + c.strength, 0) / categories.length,
  );

  let summary = "Daily needs are a bit of a drive from this pin.";
  if (score >= 70) {
    summary = "Strong everyday convenience — schools, parks, transit, and grocery close by.";
  } else if (score >= 45) {
    summary = "Solid lifestyle access within a couple of kilometres.";
  }

  return { score, summary, categories };
}

function basementFromFacts(facts: ListingFacts): BasementFinish {
  return parseBasementFinishFromFacts(facts.basement);
}

function spaceHighlights(
  listing: {
    beds: number;
    baths: number;
    sqft: number | null;
    parkingSpaces: number;
  },
  facts: ListingFacts,
): string[] {
  const out: string[] = [];
  if (facts.bedroomsAboveGrade != null && facts.bedroomsBelowGrade != null) {
    out.push(
      `${facts.bedroomsAboveGrade} bed above grade · ${facts.bedroomsBelowGrade} below`,
    );
  }
  if (facts.kitchensTotal != null && facts.kitchensTotal > 1) {
    out.push(`${facts.kitchensTotal} kitchens`);
  }
  if (facts.frontageLength != null) {
    out.push(`${facts.frontageLength} ft frontage`);
  }
  if (listing.sqft) {
    out.push(`${listing.sqft.toLocaleString("en-CA")} sqft`);
  } else if (facts.livingAreaRange) {
    out.push(`${facts.livingAreaRange} living area`);
  }
  if (listing.parkingSpaces > 0) {
    out.push(`${listing.parkingSpaces} parking`);
  }
  if (facts.basement?.length) {
    out.push(`Basement: ${facts.basement.slice(0, 2).join(", ")}`);
  }
  return out.slice(0, 5);
}

export async function buildListingInsights(opts: {
  listing: {
    mlsNumber: string;
    listPrice: number;
    soldPrice: number | null;
    taxes: number | null;
    maintenanceFee: number | null;
    beds: number;
    baths: number;
    sqft: number | null;
    parkingSpaces: number;
    city: string;
    community: string | null;
    propertyType: string;
    transactionType: string;
    status: string;
    lat: number;
    lng: number;
    listedAt: Date;
    soldAt: Date | null;
    updatedAtMls: Date | null;
    facts: unknown;
    history: Array<{
      id: string;
      event: string;
      price: number | null;
      originalPrice: number | null;
      contractDate: Date;
      lastUpdatedAt: Date | null;
      externalMls: string | null;
      visibility: string;
      note: string | null;
    }>;
    openHouses: Array<{ startsAt: Date; endsAt: Date }>;
  };
  pulse: MarketPulse;
  pois: NearbyPoi[];
  signedIn: boolean;
  entitlement?: WorkspaceListingEntitlement;
}): Promise<ListingInsightsPayload> {
  const { listing, pulse, pois, signedIn, entitlement } = opts;
  const facts = parseListingFacts(listing.facts) ?? {};
  const thisDom = daysOnMarketFromListedAt(listing);
  const placeLabel = listing.community
    ? `${listing.community}, ${listing.city}`
    : listing.city;

  const vsAskPct = pctDelta(listing.listPrice, pulse.medianListPrice);
  const vsSoldPct = signedIn
    ? pctDelta(listing.listPrice, pulse.medianSoldPrice)
    : null;

  const { historyRows, timeline } = buildInsightsTimeline({
    listing,
    canSeeRestricted: signedIn,
  });

  const priceCuts = historyRows.filter(
    (r) =>
      isPriceChangeEvent(r.event) &&
      r.price != null &&
      r.originalPrice != null &&
      r.price < r.originalPrice,
  ).length;

  const band = 0.15;
  const priceBandLow = Math.round(listing.listPrice * (1 - band));
  const priceBandHigh = Math.round(listing.listPrice * (1 + band));
  const radiusKm = 2;
  const box = boundingBox(listing.lat, listing.lng, radiusKm);

  const similarRows = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      transactionType: listing.transactionType as "SALE" | "LEASE",
      propertyType: listing.propertyType as never,
      mlsNumber: { not: listing.mlsNumber },
      listPrice: { gte: priceBandLow, lte: priceBandHigh },
      beds: {
        gte: Math.max(listing.beds - 1, 0),
        lte: listing.beds + 1,
      },
      lat: { gte: box.south, lte: box.north },
      lng: { gte: box.west, lte: box.east },
    },
    select: { lat: true, lng: true },
    take: 80,
  });

  const similarActiveNearby = similarRows.filter(
    (r) => haversineKm(listing.lat, listing.lng, r.lat, r.lng) <= radiusKm,
  ).length;

  const temperature = buildTemperature({
    vsAskPct,
    thisDom,
    avgDom: pulse.avgDaysOnMarket,
    priceCuts,
    similarNearby: similarActiveNearby,
    soldOverAsk: pulse.soldOverAskingPct,
    soldRestricted: !signedIn,
  });

  const compsRaw = await findComps({
    lat: listing.lat,
    lng: listing.lng,
    beds: listing.beds,
    propertyType: listing.propertyType,
    city: listing.city,
    limit: 6,
    includeSold: true,
    soldOnly: true,
    maxDistanceKm: null,
    preferRecentSold: true,
  });

  const soldComps = compsRaw.filter(
    (c) => c.status === "SOLD" && c.soldPrice != null && c.mlsNumber !== listing.mlsNumber,
  );
  const soldPrices = soldComps.map((c) => c.soldPrice!);
  const rangeLow = soldPrices.length ? Math.min(...soldPrices) : null;
  const rangeHigh = soldPrices.length ? Math.max(...soldPrices) : null;
  const rangeMid = median(soldPrices);

  const compsItems: InsightComp[] = (signedIn ? soldComps : soldComps.slice(0, 3)).map(
    (c) => ({
      mlsNumber: c.mlsNumber,
      addressLine: c.addressLine,
      city: c.city,
      unitNumber: c.unitNumber,
      distanceKm: Math.round(c.distanceKm * 10) / 10,
      beds: c.beds,
      bedsLabel: c.bedsLabel,
      baths: c.baths,
      soldPrice: signedIn ? c.soldPrice : null,
      listPrice: c.listPrice,
      daysOnMarket: c.daysOnMarket,
      status: c.status,
      pricePerSqft:
        signedIn && c.soldPrice && c.sqft
          ? Math.round(c.soldPrice / c.sqft)
          : null,
    }),
  );

  const ratePct = 4.89;
  const amortYears = 25;
  const downPaymentExample = Math.round(listing.listPrice * 0.2);
  const mortgagePrincipal = Math.max(listing.listPrice - downPaymentExample, 0);
  const estimatedMortgageMonthly = Math.round(
    monthlyMortgagePayment(mortgagePrincipal, ratePct, amortYears),
  );
  const taxMonthly = listing.taxes != null ? listing.taxes / 12 : 0;
  const maint = listing.maintenanceFee ?? 0;
  const estimatedTotalMonthly = Math.round(
    estimatedMortgageMonthly + taxMonthly + maint,
  );

  const lifestyle = lifestyleFromPois(pois);

  const nextOh = listing.openHouses
    .filter((oh) => oh.endsAt.getTime() >= Date.now())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];

  const possessionBits = [
    facts.possessionType,
    facts.possessionDate,
    facts.possessionDetails,
  ]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);

  const homeValue = await estimateHomeValue({
    city: listing.city,
    community: listing.community,
    beds: listing.beds,
    baths: listing.baths,
    sqft: listing.sqft,
    basement: basementFromFacts(facts),
    propertyType: listing.propertyType,
    lat: listing.lat,
    lng: listing.lng,
    entitlement,
  });

  const okEstimate = homeValue.status === "OK" ? homeValue : null;
  const valMid = signedIn && okEstimate ? okEstimate.mid : null;
  const valLow = signedIn && okEstimate ? okEstimate.low : null;
  const valHigh = signedIn && okEstimate ? okEstimate.high : null;
  const vsListPct =
    signedIn && okEstimate && okEstimate.mid > 0
      ? Math.round(
          ((listing.listPrice - okEstimate.mid) / okEstimate.mid) * 1000,
        ) / 10
      : null;

  return {
    placeLabel,
    signedIn,
    temperature,
    pricePosition: {
      listPrice: listing.listPrice,
      medianAsk: pulse.medianListPrice,
      medianSold: signedIn ? pulse.medianSoldPrice : null,
      vsAskPct,
      vsSoldPct,
      soldRestricted: !signedIn,
    },
    timeline,
    comps: {
      restricted: !signedIn,
      items: compsItems,
      rangeLow: signedIn ? rangeLow ?? (soldPrices.length ? Math.min(...soldPrices) : null) : null,
      rangeMid: signedIn ? rangeMid : null,
      rangeHigh: signedIn ? rangeHigh : null,
    },
    ownership: {
      listPrice: listing.listPrice,
      taxesAnnual: listing.taxes,
      maintenanceMonthly: listing.maintenanceFee,
      estimatedMortgageMonthly,
      estimatedTotalMonthly,
      downPaymentExample,
      ratePct,
      amortYears,
    },
    lifestyle,
    space: {
      beds: listing.beds,
      bedsLabel: formatBedsPlusLabel(listing.beds, facts),
      baths: listing.baths,
      sqft: listing.sqft,
      bedroomsAboveGrade: facts.bedroomsAboveGrade ?? null,
      bedroomsBelowGrade: facts.bedroomsBelowGrade ?? null,
      kitchensTotal: facts.kitchensTotal ?? null,
      lotFrontage: facts.frontageLength ?? null,
      livingAreaRange: facts.livingAreaRange ?? null,
      highlights: spaceHighlights(listing, facts),
    },
    competition: {
      similarActiveNearby,
      radiusKm,
      priceBandLow,
      priceBandHigh,
      avgDomArea: pulse.avgDaysOnMarket,
      thisDom,
      domDelta:
        pulse.avgDaysOnMarket != null
          ? thisDom - pulse.avgDaysOnMarket
          : null,
    },
    valuation: {
      restricted: !signedIn,
      status: homeValue.status,
      low: valLow,
      mid: valMid,
      high: valHigh,
      sampleSize: okEstimate?.sampleSize ?? 0,
      soldCount: okEstimate?.soldCount ?? 0,
      method: signedIn && okEstimate ? okEstimate.method : null,
      confidence: signedIn && okEstimate ? okEstimate.confidence : null,
      vsListPct,
      communityAvgSold:
        signedIn && okEstimate ? okEstimate.communityAvgSold : null,
      disclaimer:
        homeValue.status === "INSUFFICIENT_DATA"
          ? "Insufficient reliable sold comparables for an indicative estimate."
          : "Houzzat Estimated Value is an indicative range from recent sold comparables in entitled inventory. Not an appraisal, formal CMA, or lender valuation.",
    },
    timing: {
      possessionLabel: possessionBits.length ? possessionBits.join(" · ") : null,
      nextOpenHouse: nextOh
        ? nextOh.startsAt.toLocaleString("en-CA", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : null,
      listedLabel: listing.listedAt.toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      daysOnMarket: thisDom,
    },
    pulse: {
      activeCount: pulse.activeCount,
      soldCount: pulse.soldCount,
      soldOverAskingPct: signedIn ? pulse.soldOverAskingPct : null,
      soldRestricted: !signedIn,
    },
  };
}
