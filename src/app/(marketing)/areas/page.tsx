import type { Metadata } from "next";
import Link from "next/link";
import {
  homesForSaleCityPath,
  homesForSaleCommunityPath,
  resolveHomesForSalePlace,
  slugifySegment,
} from "@/lib/geo/area-seo";
import { staticOntarioHubCities } from "@/lib/geo/regions";
import { prisma } from "@/lib/prisma";
import { publicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = publicPageMetadata({
  title: "GTA Homes for Sale by City & Neighbourhood",
  description:
    "Browse Greater Toronto Area city and neighbourhood guides with live MLS inventory, market pulse, and local amenities.",
  path: "/areas",
});

export default async function AreasIndexPage() {
  const hubCities = staticOntarioHubCities();
  const places = await prisma.geoPlace.findMany({
    where: { published: true, community: { not: null } },
    orderBy: [{ city: "asc" }, { displayName: "asc" }],
    select: {
      slug: true,
      city: true,
      community: true,
      displayName: true,
    },
  });

  // Ensure city hub GeoPlace rows exist for static Ontario markets.
  await Promise.all(
    hubCities.map((city) =>
      resolveHomesForSalePlace({ citySlug: slugifySegment(city) }),
    ),
  );

  const cityHubs = hubCities.map((city) => ({
    city,
    displayName: city,
  }));
  const seenCities = new Set(cityHubs.map((h) => h.city.toLowerCase()));
  const extraHubs = await prisma.geoPlace.findMany({
    where: { published: true, community: null },
    orderBy: { displayName: "asc" },
    select: { city: true, displayName: true },
  });
  for (const hub of extraHubs) {
    if (seenCities.has(hub.city.toLowerCase())) continue;
    seenCities.add(hub.city.toLowerCase());
    cityHubs.push(hub);
  }
  cityHubs.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const byCity = places.reduce<Record<string, typeof places>>((acc, place) => {
    acc[place.city] ??= [];
    acc[place.city].push(place);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-12 sm:px-6">
      <div>
        <h1 className="font-display text-4xl text-ink">
          Homes for sale by area
        </h1>
        <p className="mt-2 max-w-2xl text-ink/70">
          City and neighbourhood guides with live inventory, amenities, and
          market context across the GTA.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-2xl text-ink">Cities</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {cityHubs.map((hub) => (
            <li key={hub.city}>
              <Link
                href={homesForSaleCityPath(hub.city)}
                className="block border-b border-line py-3 text-sm transition hover:border-canopy/40 hover:text-canopy"
              >
                <span className="font-medium text-ink">{hub.displayName}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="space-y-8">
        {Object.entries(byCity).map(([city, list]) => (
          <section key={city} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-2xl text-ink">{city}</h2>
              <Link
                href={homesForSaleCityPath(city)}
                className="text-sm font-medium text-canopy hover:underline"
              >
                All {city} homes →
              </Link>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((place) => (
                <li key={place.slug}>
                  <Link
                    href={
                      place.community
                        ? homesForSaleCommunityPath(place.city, place.community)
                        : homesForSaleCityPath(place.city)
                    }
                    className="block border-b border-line py-2.5 text-sm font-medium text-ink transition hover:border-canopy/40 hover:text-canopy"
                  >
                    {place.displayName}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
