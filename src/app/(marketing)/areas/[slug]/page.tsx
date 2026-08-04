import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { NearbyAmenities } from "@/components/listings/NearbyAmenities";
import { MarketPulseCard } from "@/components/market/MarketPulseCard";
import { getCommunityNarrative } from "@/lib/ai/narratives";
import { auth } from "@/lib/auth";
import { formatPrice } from "@/lib/listings/constants";
import { getMarketPulse } from "@/lib/market/pulse";
import { findNearbyPois, summarizePoiCounts } from "@/lib/poi/nearby";
import { prisma } from "@/lib/prisma";
import { resolveClientAccess } from "@/lib/account-access";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const place = await prisma.geoPlace.findUnique({ where: { slug } });
  return {
    title: place ? `${place.displayName} real estate` : "Area",
    description: place?.summary?.slice(0, 150),
  };
}

export default async function AreaPage({ params }: Params) {
  const { slug } = await params;
  const place = await prisma.geoPlace.findUnique({ where: { slug } });
  if (!place || !place.published) notFound();

  const lat = place.lat ?? 43.65;
  const lng = place.lng ?? -79.38;

  const listings = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      segment: { in: ["RESIDENTIAL", "COMMERCIAL"] },
      city: { equals: place.city, mode: "insensitive" },
      ...(place.community
        ? { community: { equals: place.community, mode: "insensitive" } }
        : {}),
    },
    include: { media: { orderBy: { sortOrder: "asc" }, take: 1 } },
    orderBy: { listPrice: "asc" },
    take: 12,
  });

  const session = await auth();
  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, emailVerified: true, createdAt: true },
      })
    : null;
  const access = resolveClientAccess(user);
  const vowOk = access.hasClientAccess;

  const [nearby, narrative, pulse] = await Promise.all([
    findNearbyPois({ lat, lng, radiusKm: 3, limitPerType: 10 }),
    getCommunityNarrative({
      slug: place.slug,
      displayName: place.displayName,
      city: place.city,
      lat,
      lng,
      listingCount: listings.length,
    }),
    getMarketPulse({
      city: place.city,
      community: place.community,
      includeSold: vowOk,
    }),
  ]);

  const counts = summarizePoiCounts(nearby);

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-12 sm:px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/45">
          Area guide
        </p>
        <h1 className="mt-2 font-display text-4xl text-ink sm:text-5xl">
          {place.displayName}
        </h1>
        <p className="mt-3 max-w-2xl text-ink/70">
          {place.summary ?? narrative.body}
        </p>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-display text-2xl text-ink">Neighbourhood snapshot</h2>
        <p className="mt-3 leading-relaxed text-ink/75">{narrative.body}</p>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-ink/45">Active listings</dt>
            <dd className="font-display text-2xl text-canopy">{listings.length}</dd>
          </div>
          <div>
            <dt className="text-ink/45">Schools</dt>
            <dd className="font-display text-2xl text-canopy">
              {counts.SCHOOL ?? 0}
            </dd>
          </div>
          <div>
            <dt className="text-ink/45">Parks</dt>
            <dd className="font-display text-2xl text-canopy">
              {counts.PARK ?? 0}
            </dd>
          </div>
          <div>
            <dt className="text-ink/45">Transit</dt>
            <dd className="font-display text-2xl text-canopy">
              {counts.TRANSIT ?? 0}
            </dd>
          </div>
        </dl>
      </section>

      <MarketPulseCard
        pulse={pulse}
        vowCallbackPath={`/areas/${place.slug}`}
        needsEmailVerification={access.needsEmailVerification}
      />

      <NearbyAmenities lat={lat} lng={lng} pois={nearby} />

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-2xl text-ink">Homes for sale</h2>
          <Link
            href={`/search?city=${encodeURIComponent(place.city)}${
              place.community
                ? `&community=${encodeURIComponent(place.community)}`
                : ""
            }`}
            className="text-sm font-medium text-canopy"
          >
            Open in search →
          </Link>
        </div>
        {listings.length === 0 ? (
          <p className="text-sm text-ink/55">No active listings in this area right now.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => {
              const image = listing.media[0]?.url;
              return (
                <Link
                  key={listing.id}
                  href={`/listing/${listing.mlsNumber}`}
                  className="overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-canopy/40"
                >
                  <div className="relative aspect-[16/10] bg-mist">
                    {image ? (
                      <Image
                        src={image}
                        alt={listing.addressLine}
                        fill
                        className="object-cover"
                        sizes="(max-width: 1024px) 50vw, 33vw"
                      />
                    ) : null}
                  </div>
                  <div className="space-y-1 p-4">
                    <p className="font-semibold text-ink">
                      {formatPrice(listing.listPrice)}
                    </p>
                    <p className="text-sm text-ink/80">{listing.addressLine}</p>
                    <p className="text-xs text-ink/50">
                      {listing.beds} bd · {listing.baths} ba
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <MlsDisclaimer />
    </div>
  );
}
