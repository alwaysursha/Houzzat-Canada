/**
 * Geocode MLS listings that still use city-centroid / approximate map pins.
 * Usage: pnpm mls:geocode [limit=100]
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const pg = await import("pg");
  const {
    buildListingGeocodeQuery,
    geocodeAddress,
  } = await import("../src/lib/geo/geocode");
  const { stripApproxPinNote } = await import("../src/lib/proptx/map-listing");

  const limit = Number(process.argv[2] ?? 150);
  const pool = new pg.default.Pool({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const listings = await prisma.listing.findMany({
    where: {
      dataSource: "mls",
      isMock: false,
      OR: [
        { description: { contains: "Map pin approximate" } },
        { description: { contains: "coordinates missing from feed" } },
      ],
    },
    select: {
      id: true,
      mlsNumber: true,
      addressLine: true,
      unitNumber: true,
      city: true,
      province: true,
      postalCode: true,
      description: true,
      lat: true,
      lng: true,
    },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });

  console.log(`Geocoding ${listings.length} approximate MLS pins…`);
  let ok = 0;
  let fail = 0;

  // Modest concurrency — Google/Nominatim rate limits.
  const concurrency = 4;
  let index = 0;

  async function worker() {
    while (index < listings.length) {
      const listing = listings[index]!;
      index += 1;
      const query = buildListingGeocodeQuery(listing);
      try {
        const geo = await geocodeAddress(query);
        if (!geo) {
          fail += 1;
          console.log("miss", listing.mlsNumber, query.slice(0, 80));
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
        console.log(
          "ok",
          listing.mlsNumber,
          geo.source,
          geo.lat.toFixed(5),
          geo.lng.toFixed(5),
        );
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

  const remaining = await prisma.listing.count({
    where: {
      dataSource: "mls",
      isMock: false,
      OR: [
        { description: { contains: "Map pin approximate" } },
        { description: { contains: "coordinates missing from feed" } },
      ],
    },
  });

  console.log(JSON.stringify({ ok, fail, remaining }, null, 2));
  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
