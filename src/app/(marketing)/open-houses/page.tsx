import type { Metadata } from "next";
import Link from "next/link";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { OpenHousePlanner } from "@/components/listings/OpenHousePlanner";
import { getListingProvider } from "@/lib/listings/provider";
import { publicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = publicPageMetadata({
  title: "Open Houses in the GTA",
  description:
    "Find this weekend’s open houses across Toronto and the GTA — filter by city and build a viewing itinerary.",
  path: "/open-houses",
});

export default async function OpenHousesPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; community?: string }>;
}) {
  const params = await searchParams;
  const provider = getListingProvider();
  const items = await provider.openHouses({
    city: params.city,
    community: params.community,
  });

  const cities = [
    "Toronto",
    "Mississauga",
    "Brampton",
    "Markham",
    "Vaughan",
    "Oakville",
    "Richmond Hill",
    "Burlington",
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-12 sm:px-6">
      <div>
        <h1 className="font-display text-4xl text-ink">Open houses</h1>
        <p className="mt-2 max-w-2xl text-ink/70">
          Plan a weekend route — add homes to your itinerary, sorted by open
          time.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/open-houses"
          className={`rounded-lg px-3 py-1.5 text-sm ${
            !params.city
              ? "bg-canopy text-white"
              : "border border-line bg-surface text-ink/70"
          }`}
        >
          All
        </Link>
        {cities.map((city) => (
          <Link
            key={city}
            href={`/open-houses?city=${encodeURIComponent(city)}`}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              params.city === city
                ? "bg-canopy text-white"
                : "border border-line bg-surface text-ink/70"
            }`}
          >
            {city}
          </Link>
        ))}
      </div>

      <OpenHousePlanner items={items} />
      <MlsDisclaimer />
    </div>
  );
}
