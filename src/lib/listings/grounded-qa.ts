import type { Listing } from "@prisma/client";
import { findNearbyPois } from "@/lib/poi/nearby";
import { prisma } from "@/lib/prisma";
import { propertyTypeLabel, formatListPrice, formatPrice } from "@/lib/listings/constants";
import { formatBedsPlusLabel, parseListingFacts } from "@/lib/listings/facts";

export type GroundedAnswer = {
  answer: string;
  citations: string[];
  refused: boolean;
};

const REFUSAL =
  "I can only answer from this listing’s stored facts, nearby amenities, and cached area notes — I won’t invent prices, school ratings, or sold comps.";

function normalize(q: string) {
  return q.toLowerCase().trim();
}

export async function answerListingQuestion(
  listing: Listing,
  question: string,
): Promise<GroundedAnswer> {
  const q = normalize(question);
  if (q.length < 3) {
    return {
      answer: "Ask a short question about this home or the nearby area.",
      citations: [],
      refused: false,
    };
  }

  // Hard refuse speculative / invented pricing
  if (
    /\b(exact|guaranteed|will (it )?appraise|future value|predict)\b/.test(q) ||
    /\b(best school|ranking|eqao)\b/.test(q)
  ) {
    return { answer: REFUSAL, citations: [], refused: true };
  }

  const [pois, cache] = await Promise.all([
    findNearbyPois({
      lat: listing.lat,
      lng: listing.lng,
      radiusKm: 2,
      limitPerType: 5,
    }),
    prisma.aiContentCache.findUnique({
      where: {
        entityType_entityId: {
          entityType: "listing",
          entityId: listing.mlsNumber,
        },
      },
    }),
  ]);

  const citations: string[] = [];
  const facts: string[] = [];

  if (/\b(price|cost|list|asking)\b/.test(q)) {
    facts.push(
      `List price on file: ${formatListPrice(listing.listPrice, listing.transactionType)}.`,
    );
    citations.push("listing.listPrice");
    if (listing.soldPrice != null) {
      facts.push(
        "A sold price exists on this record but may be VOW-restricted in the UI.",
      );
      citations.push("listing.soldPrice");
    }
  }

  if (/\b(bed|bath|size|sqft|square|room)\b/.test(q)) {
    const bedsText =
      formatBedsPlusLabel(listing.beds, parseListingFacts(listing.facts)) ??
      String(listing.beds);
    facts.push(
      `${bedsText} bed · ${listing.baths} bath${listing.sqft ? ` · ${listing.sqft.toLocaleString()} sqft` : ""}.`,
    );
    citations.push("listing.beds/baths/sqft");
  }

  if (/\b(tax|maintenance|condo fee|parking|year)\b/.test(q)) {
    facts.push(
      [
        listing.taxes != null ? `Taxes: ${formatPrice(listing.taxes)}` : null,
        listing.maintenanceFee != null
          ? `Maintenance: ${formatPrice(listing.maintenanceFee)}/mo`
          : null,
        `Parking: ${listing.parkingSpaces}`,
        listing.yearBuilt != null ? `Year built: ${listing.yearBuilt}` : null,
      ]
        .filter(Boolean)
        .join(" · ") + ".",
    );
    citations.push("listing.facts");
  }

  if (/\b(type|detached|condo|townhouse|property)\b/.test(q)) {
    facts.push(`Property type: ${propertyTypeLabel(listing.propertyType)}.`);
    citations.push("listing.propertyType");
  }

  if (/\b(where|address|location|neighbourhood|neighborhood|community|city)\b/.test(q)) {
    facts.push(
      `Address: ${listing.addressLine}, ${listing.city}${listing.community ? ` (${listing.community})` : ""}.`,
    );
    citations.push("listing.address");
  }

  if (/\b(school|park|transit|grocery|nearby|amenit|walk)\b/.test(q)) {
    if (pois.length === 0) {
      facts.push("No nearby amenities are stored for this pin yet.");
    } else {
      const top = pois.slice(0, 5).map(
        (p) =>
          `${p.name} (${p.type.toLowerCase()}, ${p.distanceKm < 1 ? `${Math.round(p.distanceKm * 1000)} m` : `${p.distanceKm.toFixed(1)} km`})`,
      );
      facts.push(`Nearby from the catalogue: ${top.join("; ")}.`);
    }
    citations.push("poi.nearby");
  }

  if (/\b(describe|about|summary|overview|tell me)\b/.test(q) || facts.length === 0) {
    if (cache?.body) {
      facts.push(cache.body);
      citations.push("aiContentCache.listing");
    } else {
      facts.push(listing.description.slice(0, 400));
      citations.push("listing.description");
    }
  }

  if (/\b(broker|agent|mls)\b/.test(q)) {
    facts.push(
      `MLS® ${listing.mlsNumber}. Listing brokerage on file: ${listing.brokerageName}.`,
    );
    citations.push("listing.brokerage");
  }

  // Never invent a number that isn't in facts
  if (/\b(how much|what('s| is) it worth|estimate)\b/.test(q) && !citations.includes("listing.listPrice")) {
    facts.push(
      `Listed at ${formatListPrice(listing.listPrice, listing.transactionType)}. For a valuation-style range, use the home valuation tool — I won’t invent an AVM here.`,
    );
    citations.push("listing.listPrice");
  }

  const uniqueCitations = [...new Set(citations)];
  return {
    answer: facts.join(" "),
    citations: uniqueCitations,
    refused: false,
  };
}
