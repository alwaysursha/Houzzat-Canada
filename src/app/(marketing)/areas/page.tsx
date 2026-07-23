import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "GTA areas" };

export default async function AreasIndexPage() {
  const places = await prisma.geoPlace.findMany({
    where: { published: true },
    orderBy: [{ city: "asc" }, { displayName: "asc" }],
  });

  const byCity = places.reduce<Record<string, typeof places>>((acc, place) => {
    acc[place.city] ??= [];
    acc[place.city].push(place);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-12 sm:px-6">
      <div>
        <h1 className="font-display text-4xl text-ink">Areas</h1>
        <p className="mt-2 max-w-2xl text-ink/70">
          Neighbourhood guides with amenity counts, grounded summaries, and
          homes for sale from Houzzat inventory.
        </p>
      </div>

      <div className="space-y-8">
        {Object.entries(byCity).map(([city, list]) => (
          <section key={city} className="space-y-3">
            <h2 className="font-display text-2xl text-ink">{city}</h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((place) => (
                <li key={place.id}>
                  <Link
                    href={`/areas/${place.slug}`}
                    className="block rounded-xl border border-line bg-surface px-4 py-3 text-sm font-medium text-ink transition hover:border-canopy/40 hover:text-canopy"
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
