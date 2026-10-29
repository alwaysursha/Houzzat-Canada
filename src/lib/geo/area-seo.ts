import { formatPrice } from "@/lib/listings/constants";
import {
  GTA_CITY_CENTROIDS,
  homesForSaleCityPath,
  homesForSaleCommunityPath,
  homesForSalePath,
  slugifySegment,
} from "@/lib/geo/area-paths";
import { slugifyPlace } from "@/lib/geo/distance";
import { prisma } from "@/lib/prisma";
import { excludeStagingSnapshotWhere } from "@/lib/tenancy/templates/high-octane-staging-snapshot";
import { absoluteUrl, breadcrumbJsonLd } from "@/lib/seo";
import type { MarketPulse } from "@/lib/market/pulse";

export {
  GTA_CITY_CENTROIDS,
  homesForSaleCityPath,
  homesForSaleCommunityPath,
  homesForSalePath,
  slugifySegment,
} from "@/lib/geo/area-paths";

export type ResolvedAreaPlace = {
  city: string;
  community: string | null;
  displayName: string;
  /** Flat legacy slug used by GeoPlace / AI cache. */
  slug: string;
  path: string;
  lat: number;
  lng: number;
  summary: string | null;
  isCityPage: boolean;
};

async function resolveCityName(citySlug: string): Promise<string | null> {
  const known = GTA_CITY_CENTROIDS[citySlug];
  if (known) return known.name;

  const place = await prisma.geoPlace.findFirst({
    where: {
      published: true,
      community: null,
      slug: citySlug,
    },
    select: { city: true },
  });
  if (place) return place.city;

  const cities = await prisma.listing.groupBy({
    by: ["city"],
    where: {
      status: "ACTIVE",
      segment: { in: ["RESIDENTIAL", "COMMERCIAL"] },
      ...excludeStagingSnapshotWhere(),
    },
  });
  const match = cities.find((row) => slugifySegment(row.city) === citySlug);
  return match?.city ?? null;
}

async function resolveCommunityName(
  city: string,
  communitySlug: string,
): Promise<string | null> {
  const places = await prisma.geoPlace.findMany({
    where: {
      published: true,
      city: { equals: city, mode: "insensitive" },
      community: { not: null },
    },
    select: { community: true },
  });
  const fromPlace = places.find(
    (p) => p.community && slugifySegment(p.community) === communitySlug,
  );
  if (fromPlace?.community) return fromPlace.community;

  const communities = await prisma.listing.groupBy({
    by: ["community"],
    where: {
      status: "ACTIVE",
      segment: { in: ["RESIDENTIAL", "COMMERCIAL"] },
      city: { equals: city, mode: "insensitive" },
      community: { not: null },
      ...excludeStagingSnapshotWhere(),
    },
  });
  const match = communities.find(
    (row) => row.community && slugifySegment(row.community) === communitySlug,
  );
  return match?.community ?? null;
}

async function resolveCoordinates(input: {
  city: string;
  community: string | null;
  slug: string;
}): Promise<{ lat: number; lng: number; summary: string | null }> {
  const geo = await prisma.geoPlace.findUnique({
    where: { slug: input.slug },
    select: { lat: true, lng: true, summary: true },
  });
  if (
    geo?.lat != null &&
    geo?.lng != null &&
    Number.isFinite(geo.lat) &&
    Number.isFinite(geo.lng)
  ) {
    return { lat: geo.lat, lng: geo.lng, summary: geo.summary };
  }

  const samples = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      ...excludeStagingSnapshotWhere(),
      city: { equals: input.city, mode: "insensitive" },
      ...(input.community
        ? {
            community: {
              equals: input.community,
              mode: "insensitive" as const,
            },
          }
        : {}),
      lat: { not: 0 },
      lng: { not: 0 },
    },
    select: { lat: true, lng: true },
    take: 40,
  });
  if (samples.length > 0) {
    const lat =
      samples.reduce((sum, row) => sum + row.lat, 0) / samples.length;
    const lng =
      samples.reduce((sum, row) => sum + row.lng, 0) / samples.length;
    return { lat, lng, summary: geo?.summary ?? null };
  }

  const centroid = GTA_CITY_CENTROIDS[slugifySegment(input.city)];
  if (centroid) {
    return { lat: centroid.lat, lng: centroid.lng, summary: geo?.summary ?? null };
  }

  return { lat: 43.6532, lng: -79.3832, summary: geo?.summary ?? null };
}

/**
 * Resolve a public homes-for-sale page. Creates a published GeoPlace row when
 * inventory or a known GTA hub exists so sitemaps stay populated over time.
 */
export async function resolveHomesForSalePlace(opts: {
  citySlug: string;
  communitySlug?: string;
}): Promise<ResolvedAreaPlace | null> {
  const city = await resolveCityName(opts.citySlug);
  if (!city) return null;

  let community: string | null = null;
  if (opts.communitySlug) {
    community = await resolveCommunityName(city, opts.communitySlug);
    if (!community) return null;
  }

  const slug = slugifyPlace(city, community);
  const displayName = community ?? city;
  const path = homesForSalePath({ city, community });

  const existing = await prisma.geoPlace.findUnique({
    where: { slug },
    select: {
      summary: true,
      lat: true,
      lng: true,
      published: true,
    },
  });

  if (existing?.published === false) return null;

  const needsCreate = !existing;
  const needsCoords =
    existing?.lat == null ||
    existing?.lng == null ||
    !Number.isFinite(existing.lat) ||
    !Number.isFinite(existing.lng);

  let lat = existing?.lat ?? null;
  let lng = existing?.lng ?? null;
  let summary = existing?.summary ?? null;

  if (needsCreate || needsCoords || !summary) {
    const coords = await resolveCoordinates({ city, community, slug });
    lat = needsCoords || needsCreate ? coords.lat : lat;
    lng = needsCoords || needsCreate ? coords.lng : lng;
    summary = summary ?? coords.summary;
    const defaultSummary = community
      ? `${community} in ${city} — homes for sale, amenities, and market context.`
      : `Homes for sale in ${city} — live MLS inventory, neighbourhood guides, and market context.`;

    await prisma.geoPlace.upsert({
      where: { slug },
      update: {
        city,
        community,
        displayName,
        published: true,
        ...(needsCoords ? { lat: coords.lat, lng: coords.lng } : {}),
        ...(!summary ? { summary: defaultSummary } : {}),
      },
      create: {
        slug,
        city,
        community,
        displayName,
        lat: coords.lat,
        lng: coords.lng,
        published: true,
        summary: summary ?? defaultSummary,
      },
    });
    lat = lat ?? coords.lat;
    lng = lng ?? coords.lng;
    summary = summary ?? defaultSummary;
  }

  return {
    city,
    community,
    displayName,
    slug,
    path,
    lat: lat ?? 43.6532,
    lng: lng ?? -79.3832,
    summary,
    isCityPage: !community,
  };
}

/** Map a legacy `/areas/{flat-slug}` GeoPlace to the canonical homes-for-sale path. */
export function legacyAreaSlugToHomesForSalePath(place: {
  city: string;
  community: string | null;
}): string {
  return homesForSalePath(place);
}

export function buildAreaPageCopy(input: {
  place: ResolvedAreaPlace;
  activeCount: number;
  pulse: MarketPulse;
  amenityCounts: Record<string, number>;
  brandName?: string;
}): {
  h1: string;
  intro: string;
  metaDescription: string;
  faqs: Array<{ question: string; answer: string }>;
} {
  const { place, activeCount, pulse, amenityCounts } = input;
  const site = input.brandName?.trim() || "this site";
  const label = place.displayName;
  const median =
    pulse.medianListPrice != null
      ? formatPrice(pulse.medianListPrice)
      : null;
  const amenityBits = [
    amenityCounts.SCHOOL ? `${amenityCounts.SCHOOL} schools` : null,
    amenityCounts.PARK ? `${amenityCounts.PARK} parks` : null,
    amenityCounts.TRANSIT ? `${amenityCounts.TRANSIT} transit options` : null,
  ].filter(Boolean);

  const h1 = `Homes for Sale in ${label}`;

  const intro = place.isCityPage
    ? [
        `${label} currently has ${activeCount} active home${activeCount === 1 ? "" : "s"} for sale on ${site}`,
        median ? ` with a median list price around ${median}` : "",
        pulse.avgDaysOnMarket != null
          ? `. Listings in this sample are averaging about ${pulse.avgDaysOnMarket} days on market`
          : "",
        amenityBits.length
          ? `. Nearby mapped amenities include ${amenityBits.join(", ")}`
          : "",
        `. Browse live inventory below, open the full map search, or explore neighbourhood guides across ${label}.`,
      ].join("")
    : [
        `${label} in ${place.city} currently has ${activeCount} active listing${activeCount === 1 ? "" : "s"} on ${site}`,
        median ? ` with a median list price around ${median}` : "",
        pulse.avgDaysOnMarket != null
          ? `. Recent actives average about ${pulse.avgDaysOnMarket} days on market`
          : "",
        amenityBits.length
          ? `. Within a few kilometres you’ll find ${amenityBits.join(", ")} in our amenity map`
          : "",
        `. Use this page for a local snapshot, then jump into filtered search for the full ${label} inventory.`,
      ].join("");

  const metaDescription = [
    `${activeCount} home${activeCount === 1 ? "" : "s"} for sale in ${label}`,
    place.isCityPage ? "" : `, ${place.city}`,
    median ? `. Median list price ${median}` : "",
    `. Live MLS inventory, market pulse, and neighbourhood context on ${site}.`,
  ].join("");

  const searchHref = `/search?city=${encodeURIComponent(place.city)}${
    place.community
      ? `&community=${encodeURIComponent(place.community)}`
      : ""
  }`;

  const faqs = [
    {
      question: `Are there homes for sale in ${label}?`,
      answer:
        activeCount > 0
          ? `Yes — ${site} currently shows ${activeCount} active listing${activeCount === 1 ? "" : "s"} in ${label}. Inventory changes throughout the day as MLS updates arrive.`
          : `There are no active listings in ${label} in ${site}'s current inventory. Check back soon or broaden your search across ${place.city}.`,
    },
    {
      question: `What is the median list price in ${label}?`,
      answer: median
        ? `Among active sale listings in this sample, the median list price is about ${median}. This is not an appraisal and does not include sold-price guidance unless you have registered access.`
        : `We do not have enough active sale listings in ${label} right now to publish a reliable median list price.`,
    },
    {
      question: `How do I search all ${label} listings?`,
      answer: `Open the full map and filter experience at ${absoluteUrl(searchHref)} to refine by price, beds, property type, and more.`,
    },
    {
      question: place.isCityPage
        ? `Which neighbourhoods are in ${label}?`
        : `Where is ${label} located?`,
      answer: place.isCityPage
        ? `${label} neighbourhood guides on ${site} group MLS communities with amenity and market context. Use the neighbourhood links on this page when available.`
        : `${label} is a ${place.city} community tracked from MLS location fields. Listing pins and nearby amenities on this page use mapped coordinates for the area.`,
    },
  ];

  return { h1, intro, metaDescription: metaDescription.slice(0, 160), faqs };
}

export function areaPlaceJsonLd(input: {
  place: ResolvedAreaPlace;
  description: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Place",
    name: input.place.displayName,
    description: input.description,
    url: absoluteUrl(input.place.path),
    address: {
      "@type": "PostalAddress",
      addressLocality: input.place.city,
      addressRegion: "ON",
      addressCountry: "CA",
      ...(input.place.community
        ? { addressNeighborhood: input.place.community }
        : {}),
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: input.place.lat,
      longitude: input.place.lng,
    },
  };
}

export function areaFaqJsonLd(
  faqs: Array<{ question: string; answer: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

export function areaItemListJsonLd(input: {
  place: ResolvedAreaPlace;
  items: Array<{ name: string; path: string; position: number }>;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Homes for sale in ${input.place.displayName}`,
    url: absoluteUrl(input.place.path),
    numberOfItems: input.items.length,
    itemListElement: input.items.map((item) => ({
      "@type": "ListItem",
      position: item.position,
      url: absoluteUrl(item.path),
      name: item.name,
    })),
  };
}

export function areaBreadcrumbJsonLd(place: ResolvedAreaPlace) {
  const items = [
    { name: "Home", path: "/" },
    { name: "Areas", path: "/areas" },
    ...(place.community
      ? [
          {
            name: place.city,
            path: homesForSaleCityPath(place.city),
          },
          { name: place.displayName, path: place.path },
        ]
      : [{ name: place.displayName, path: place.path }]),
  ];
  return breadcrumbJsonLd(items);
}

export async function listRelatedCommunities(
  city: string,
  excludeCommunity?: string | null,
  limit = 12,
) {
  const places = await prisma.geoPlace.findMany({
    where: {
      published: true,
      city: { equals: city, mode: "insensitive" },
      community: { not: null },
      ...(excludeCommunity
        ? {
            NOT: {
              community: {
                equals: excludeCommunity,
                mode: "insensitive",
              },
            },
          }
        : {}),
    },
    orderBy: { displayName: "asc" },
    take: limit,
    select: {
      slug: true,
      displayName: true,
      community: true,
      city: true,
    },
  });

  return places
    .filter((p): p is typeof p & { community: string } => Boolean(p.community))
    .map((p) => ({
      displayName: p.displayName,
      path: homesForSaleCommunityPath(p.city, p.community),
    }));
}
