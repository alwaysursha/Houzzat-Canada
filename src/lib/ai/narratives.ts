import { createHash } from "crypto";
import type { Listing } from "@prisma/client";
import {
  findNearbyPois,
  summarizePoiCounts,
  type NearbyPoi,
} from "@/lib/poi/nearby";
import { prisma } from "@/lib/prisma";
import { propertyTypeLabel } from "@/lib/listings/constants";

function hashPayload(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function templateListingNarrative(
  listing: Pick<
    Listing,
    | "addressLine"
    | "city"
    | "community"
    | "beds"
    | "baths"
    | "sqft"
    | "propertyType"
    | "yearBuilt"
    | "listPrice"
  >,
  pois: NearbyPoi[],
): string {
  const counts = summarizePoiCounts(pois);
  const nearestSchool = pois.find((p) => p.type === "SCHOOL");
  const nearestPark = pois.find((p) => p.type === "PARK");
  const nearestTransit = pois.find((p) => p.type === "TRANSIT");

  const area = listing.community
    ? `${listing.community} in ${listing.city}`
    : listing.city;

  const facts = [
    `${propertyTypeLabel(listing.propertyType)} with ${listing.beds} bed${listing.beds === 1 ? "" : "s"} and ${listing.baths} bath${listing.baths === 1 ? "" : "s"}`,
    listing.sqft ? `${listing.sqft.toLocaleString()} sqft` : null,
    listing.yearBuilt ? `built around ${listing.yearBuilt}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const amenityBits: string[] = [];
  if (counts.SCHOOL) {
    amenityBits.push(
      `${counts.SCHOOL} school${counts.SCHOOL === 1 ? "" : "s"} within about 2 km` +
        (nearestSchool
          ? ` (closest: ${nearestSchool.name}, ${formatDistance(nearestSchool.distanceKm)})`
          : ""),
    );
  }
  if (counts.PARK) {
    amenityBits.push(
      `${counts.PARK} park${counts.PARK === 1 ? "" : "s"} nearby` +
        (nearestPark
          ? ` including ${nearestPark.name} (${formatDistance(nearestPark.distanceKm)})`
          : ""),
    );
  }
  if (counts.TRANSIT) {
    amenityBits.push(
      nearestTransit
        ? `transit access near ${nearestTransit.name} (${formatDistance(nearestTransit.distanceKm)})`
        : "nearby transit options",
    );
  }
  if (counts.GROCERY) {
    amenityBits.push(`${counts.GROCERY} grocery option${counts.GROCERY === 1 ? "" : "s"} in the radius`);
  }

  return [
    `${listing.addressLine} sits in ${area}. This ${facts}.`,
    amenityBits.length
      ? `Around the home you’ll find ${amenityBits.join("; ")}.`
      : "Area amenity data for this pin is still being imported.",
    "This summary is grounded only in listing fields and nearby points of interest stored in Houzzat — not a formal appraisal or school ranking.",
  ].join(" ");
}

function templateCommunityNarrative(
  displayName: string,
  city: string,
  counts: Record<string, number>,
  listingCount: number,
  samplePois: { name: string; type: string }[],
): string {
  const amenityLine = [
    counts.SCHOOL ? `${counts.SCHOOL} schools` : null,
    counts.PARK ? `${counts.PARK} parks` : null,
    counts.TRANSIT ? `${counts.TRANSIT} transit stops` : null,
    counts.GROCERY ? `${counts.GROCERY} grocery spots` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const samples = samplePois
    .slice(0, 4)
    .map((p) => p.name)
    .join(", ");

  return [
    `${displayName} is a ${city} neighbourhood tracked on Houzzat with ${listingCount} active listing${listingCount === 1 ? "" : "s"} in our current inventory.`,
    amenityLine
      ? `Mapped amenities nearby include ${amenityLine}.`
      : "Amenity import for this area is still warming up.",
    samples ? `Notable places in the catalogue: ${samples}.` : "",
    "Narratives summarize stored data only — we do not invent school ratings, sold comps, or pricing guidance.",
  ]
    .filter(Boolean)
    .join(" ");
}

async function maybeOpenAiNarrative(
  system: string,
  user: string,
): Promise<{ body: string; model: string } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const body = data.choices?.[0]?.message?.content?.trim();
    if (!body) return null;
    return { body, model: process.env.OPENAI_MODEL ?? "gpt-4o-mini" };
  } catch {
    return null;
  }
}

export async function getListingNarrative(
  listing: Listing,
): Promise<{ body: string; model: string; cached: boolean }> {
  const pois = await findNearbyPois({
    lat: listing.lat,
    lng: listing.lng,
    radiusKm: 2,
    limitPerType: 6,
  });

  const contentHash = hashPayload([
    listing.mlsNumber,
    listing.addressLine,
    listing.city,
    listing.community,
    listing.beds,
    listing.baths,
    listing.sqft,
    listing.propertyType,
    listing.yearBuilt,
    listing.listPrice,
    pois.map((p) => [p.id, p.type, p.name, p.distanceKm.toFixed(2)]),
  ]);

  const existing = await prisma.aiContentCache.findUnique({
    where: {
      entityType_entityId: {
        entityType: "listing",
        entityId: listing.mlsNumber,
      },
    },
  });
  if (existing && existing.contentHash === contentHash) {
    return { body: existing.body, model: existing.model, cached: true };
  }

  const template = templateListingNarrative(listing, pois);
  const ai = await maybeOpenAiNarrative(
    "You write short, factual Canadian real-estate neighbourhood blurbs. Use ONLY the facts provided. Never invent school ratings, prices, or amenities. 2-3 sentences. No markdown.",
    template,
  );

  const body = ai?.body ?? template;
  const model = ai?.model ?? "template";

  await prisma.aiContentCache.upsert({
    where: {
      entityType_entityId: {
        entityType: "listing",
        entityId: listing.mlsNumber,
      },
    },
    create: {
      entityType: "listing",
      entityId: listing.mlsNumber,
      contentHash,
      body,
      model,
    },
    update: { contentHash, body, model },
  });

  return { body, model, cached: false };
}

export async function getCommunityNarrative(opts: {
  slug: string;
  displayName: string;
  city: string;
  lat: number;
  lng: number;
  listingCount: number;
}): Promise<{ body: string; model: string; cached: boolean }> {
  const pois = await findNearbyPois({
    lat: opts.lat,
    lng: opts.lng,
    radiusKm: 3,
    limitPerType: 10,
  });
  const counts = summarizePoiCounts(pois);
  const contentHash = hashPayload([
    opts.slug,
    opts.listingCount,
    counts,
    pois.map((p) => [p.type, p.name]),
  ]);

  const existing = await prisma.aiContentCache.findUnique({
    where: {
      entityType_entityId: {
        entityType: "community",
        entityId: opts.slug,
      },
    },
  });
  if (existing && existing.contentHash === contentHash) {
    return { body: existing.body, model: existing.model, cached: true };
  }

  const template = templateCommunityNarrative(
    opts.displayName,
    opts.city,
    counts,
    opts.listingCount,
    pois.map((p) => ({ name: p.name, type: p.type })),
  );
  const ai = await maybeOpenAiNarrative(
    "You write short SEO neighbourhood intros for a GTA marketplace. Use ONLY provided facts. Never invent ratings or comps. 2-3 sentences. No markdown.",
    template,
  );

  const body = ai?.body ?? template;
  const model = ai?.model ?? "template";

  await prisma.aiContentCache.upsert({
    where: {
      entityType_entityId: {
        entityType: "community",
        entityId: opts.slug,
      },
    },
    create: {
      entityType: "community",
      entityId: opts.slug,
      contentHash,
      body,
      model,
    },
    update: { contentHash, body, model },
  });

  return { body, model, cached: false };
}
