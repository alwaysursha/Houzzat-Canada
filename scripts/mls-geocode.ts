/**
 * Geocode MLS listings that still use city-centroid / approximate map pins.
 * Prefers street address → neighbourhood/area → city.
 *
 * Usage: pnpm mls:geocode [limit=500]
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { geocodeListing } = await import("../src/lib/geo/geocode");
  const { stripApproxPinNote } = await import("../src/lib/proptx/map-listing");

  const limit = Math.max(1, Number(process.argv[2] ?? 500));

  const approxWhere = {
    dataSource: "mls" as const,
    isMock: false,
    OR: [
      { description: { contains: "Map pin approximate" } },
      { description: { contains: "coordinates missing from feed" } },
    ],
  };

  // ACTIVE newest first — what visitors see on the map.
  const active = await prisma.listing.findMany({
    where: { ...approxWhere, status: "ACTIVE" },
    select: {
      id: true,
      mlsNumber: true,
      addressLine: true,
      unitNumber: true,
      city: true,
      community: true,
      province: true,
      postalCode: true,
      description: true,
    },
    take: limit,
    orderBy: [{ listedAt: "desc" }, { updatedAt: "desc" }],
  });

  let listings = active;
  if (active.length < limit) {
    const rest = await prisma.listing.findMany({
      where: {
        ...approxWhere,
        status: { not: "ACTIVE" },
        id: { notIn: active.map((l) => l.id) },
      },
      select: {
        id: true,
        mlsNumber: true,
        addressLine: true,
        unitNumber: true,
        city: true,
        community: true,
        province: true,
        postalCode: true,
        description: true,
      },
      take: limit - active.length,
      orderBy: [{ listedAt: "desc" }, { updatedAt: "desc" }],
    });
    listings = [...active, ...rest];
  }

  console.log(
    `Geocoding ${listings.length} approximate MLS pins (ACTIVE first, Google→Nominatim)…`,
  );
  let ok = 0;
  let fail = 0;
  const concurrency = 6;
  let index = 0;

  async function worker() {
    while (index < listings.length) {
      const listing = listings[index]!;
      index += 1;
      try {
        const geo = await geocodeListing({
          addressLine: listing.addressLine,
          unitNumber: listing.unitNumber,
          city: listing.city,
          community: listing.community,
          province: listing.province,
          postalCode: listing.postalCode,
        });
        if (!geo) {
          fail += 1;
          if (fail <= 12 || fail % 50 === 0) {
            console.log(
              "miss",
              listing.mlsNumber,
              listing.addressLine.slice(0, 60),
            );
          }
          continue;
        }
        await prisma.listing.update({
          where: { id: listing.id },
          data: {
            lat: geo.lat,
            lng: geo.lng,
            description: stripApproxPinNote(listing.description),
          },
        });
        ok += 1;
        if (ok <= 8 || ok % 25 === 0) {
          console.log(
            "ok",
            listing.mlsNumber,
            geo.source,
            geo.lat.toFixed(5),
            geo.lng.toFixed(5),
          );
        }
      } catch (err) {
        fail += 1;
        console.log(
          "err",
          listing.mlsNumber,
          err instanceof Error ? err.message : "failed",
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, listings.length || 1) }, () =>
      worker(),
    ),
  );

  const remaining = await prisma.listing.count({ where: approxWhere });
  const remainingActive = await prisma.listing.count({
    where: { ...approxWhere, status: "ACTIVE" },
  });

  console.log(
    JSON.stringify(
      { ok, fail, remaining, remainingActive, processed: listings.length },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
