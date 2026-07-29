/**
 * Re-fetch Property rows by ListingKey to refresh detail fields + coords.
 * Usage: pnpm mls:refresh [limit=100]
 *
 * Prefer listings missing sqft/yearBuilt or still marked approximate.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { Prisma, PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const pg = await import("pg");
  const { proptxJson } = await import("../src/lib/proptx/client");
  const {
    buildListingGeocodeQuery,
    geocodeAddress,
  } = await import("../src/lib/geo/geocode");
  const {
    mapPropertyToListingResult,
    stripApproxPinNote,
  } = await import("../src/lib/proptx/map-listing");
  const { upsertSyntheticHistoryFromProperty } = await import(
    "../src/lib/proptx/sync"
  );
  type PropTxProperty = Record<string, unknown>;

  const limit = Number(process.argv[2] ?? 100);
  const pool = new pg.default.Pool({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const listings = await prisma.listing.findMany({
    where: {
      dataSource: "mls",
      isMock: false,
      listingKey: { not: null },
      OR: [
        { facts: { equals: Prisma.DbNull } },
        { facts: { equals: Prisma.JsonNull } },
        { sqft: null },
        { yearBuilt: null },
        { description: { contains: "Map pin approximate" } },
        { taxes: null },
      ],
    },
    select: {
      id: true,
      mlsNumber: true,
      listingKey: true,
      lat: true,
      lng: true,
      description: true,
    },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });

  console.log(`Refreshing ${listings.length} MLS properties from AMPRE…`);
  let upserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const listing of listings) {
    const key = listing.listingKey!;
    try {
      const row = await proptxJson<PropTxProperty>(
        `Property('${encodeURIComponent(key)}')`,
      );
      const mapped = mapPropertyToListingResult(row);
      if (!mapped.ok) {
        skipped += 1;
        continue;
      }
      let data = mapped.data;
      if (mapped.approximateCoords) {
        const geo = await geocodeAddress(
          buildListingGeocodeQuery({
            addressLine: String(data.addressLine),
            unitNumber:
              typeof data.unitNumber === "string" ? data.unitNumber : null,
            city: String(data.city),
            province:
              typeof data.province === "string" ? data.province : "ON",
            postalCode:
              typeof data.postalCode === "string" ? data.postalCode : null,
          }),
        );
        if (geo) {
          data = {
            ...data,
            lat: geo.lat,
            lng: geo.lng,
            description: stripApproxPinNote(String(data.description ?? "")),
          };
        } else {
          // Keep previously geocoded pins — don't re-apply city centroids.
          const hadApproxNote =
            listing.description.includes("Map pin approximate") ||
            listing.description.includes("coordinates missing from feed");
          data = {
            ...data,
            lat: listing.lat,
            lng: listing.lng,
            description: hadApproxNote
              ? String(data.description ?? "")
              : stripApproxPinNote(String(data.description ?? "")),
          };
        }
      }

      await prisma.listing.update({
        where: { id: listing.id },
        data: {
          listingKey: data.listingKey,
          status: data.status,
          segment: data.segment,
          transactionType: data.transactionType,
          propertyType: data.propertyType,
          listPrice: data.listPrice,
          soldPrice: data.soldPrice,
          beds: data.beds,
          baths: data.baths,
          sqft: data.sqft,
          parkingSpaces: data.parkingSpaces,
          yearBuilt: data.yearBuilt,
          taxes: data.taxes,
          maintenanceFee: data.maintenanceFee,
          addressLine: data.addressLine,
          unitNumber: data.unitNumber,
          city: data.city,
          community: data.community,
          postalCode: data.postalCode,
          province: data.province,
          lat: data.lat,
          lng: data.lng,
          description: data.description,
          brokerageName: data.brokerageName,
          facts: data.facts,
          listedAt: data.listedAt,
          soldAt: data.soldAt,
          updatedAtMls: data.updatedAtMls,
          daysOnMarket: data.daysOnMarket,
          isMock: false,
        },
      });
      await upsertSyntheticHistoryFromProperty(listing.id, row);
      upserted += 1;
      console.log("ok", listing.mlsNumber, {
        sqft: data.sqft ?? null,
        yearBuilt: data.yearBuilt ?? null,
        taxes: data.taxes ?? null,
        lat: Number(data.lat).toFixed(4),
        lng: Number(data.lng).toFixed(4),
      });
    } catch (err) {
      errors += 1;
      console.log(
        "err",
        listing.mlsNumber,
        err instanceof Error ? err.message : "failed",
      );
    }
  }

  console.log(JSON.stringify({ upserted, skipped, errors }, null, 2));
  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
