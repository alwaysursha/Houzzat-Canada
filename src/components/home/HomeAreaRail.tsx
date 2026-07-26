import Image from "next/image";
import Link from "next/link";
import { FreeSwipeRail } from "@/components/home/FreeSwipeRail";
import { formatPrice, propertyTypeLabel } from "@/lib/listings/constants";
import type { PropertyType } from "@prisma/client";

export type HomeAreaCardData = {
  slug: string;
  displayName: string;
  city: string;
  summary: string | null;
  imageUrl: string;
  imageSource: "listing" | "city";
  activeCount: number;
  medianListPrice: number | null;
  minListPrice: number | null;
  maxListPrice: number | null;
  avgDaysOnMarket: number | null;
  openHouseCount: number;
  topPropertyType: PropertyType | null;
};

export function HomeAreaRail({ places }: { places: HomeAreaCardData[] }) {
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-2xl text-ink">Explore areas</h2>
        <Link href="/areas" className="text-sm font-semibold text-canopy">
          All areas →
        </Link>
      </div>
      <FreeSwipeRail label="Explore areas">
        {places.map((place) => (
          <Link
            key={place.slug}
            href={`/areas/${place.slug}`}
            className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-canopy/40 hover:shadow-sm"
          >
            <div className="relative aspect-[16/10] bg-mist">
              <Image
                src={place.imageUrl}
                alt={`${place.displayName}, ${place.city}`}
                fill
                className="object-cover transition duration-500 group-hover:scale-[1.03]"
                sizes="(max-width: 640px) 85vw, (max-width: 1280px) 50vw, 25vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/55 via-ink/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="font-display text-2xl text-white">
                  {place.displayName}
                </p>
                <p className="text-sm font-medium text-white/85">{place.city}</p>
              </div>
              {place.imageSource === "listing" ? (
                <span className="absolute right-3 top-3 rounded-md bg-surface/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-ink/70">
                  From local listing
                </span>
              ) : null}
            </div>

            <div className="flex flex-1 flex-col gap-3 px-4 py-4">
              {place.summary ? (
                <p className="line-clamp-2 text-sm leading-snug text-ink/70">
                  {place.summary}
                </p>
              ) : null}

              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink/45">
                    Active
                  </dt>
                  <dd className="mt-0.5 text-base font-bold text-ink">
                    {place.activeCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink/45">
                    Median ask
                  </dt>
                  <dd className="mt-0.5 text-base font-bold text-canopy">
                    {place.medianListPrice != null
                      ? formatPrice(place.medianListPrice)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink/45">
                    Price range
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold text-ink">
                    {place.minListPrice != null && place.maxListPrice != null
                      ? place.minListPrice === place.maxListPrice
                        ? formatPrice(place.minListPrice)
                        : `${formatPrice(place.minListPrice)} – ${formatPrice(place.maxListPrice)}`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink/45">
                    Avg. DOM
                  </dt>
                  <dd className="mt-0.5 text-base font-bold text-ink">
                    {place.avgDaysOnMarket != null
                      ? `${place.avgDaysOnMarket} days`
                      : "—"}
                  </dd>
                </div>
              </dl>

              <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-3 text-xs font-semibold text-ink/65">
                {place.topPropertyType ? (
                  <span className="rounded-md bg-mist px-2 py-1">
                    Mostly {propertyTypeLabel(place.topPropertyType)}
                  </span>
                ) : null}
                {place.openHouseCount > 0 ? (
                  <span className="rounded-md bg-signal/10 px-2 py-1 text-signal">
                    {place.openHouseCount} open house
                    {place.openHouseCount === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span className="rounded-md bg-mist px-2 py-1">
                    No open houses soon
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </FreeSwipeRail>
    </section>
  );
}
