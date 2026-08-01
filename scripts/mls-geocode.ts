/**
 * Geocode MLS listings that still use city-centroid / approximate map pins.
 * Street-accurate only — city/neighbourhood hits are rejected so pins stay
 * marked approximate until a real civic address resolves.
 *
 * Usage: pnpm mls:geocode [limit=500]
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { geocodeListing } = await import("../src/lib/geo/geocode");
  const {
    CITY_CENTROIDS,
    DEFAULT_GTA_CENTROID,
    isKnownCityCentroid,
  } = await import("../src/lib/geo/city-centroids");
  const { APPROX_PIN_NOTE, stripApproxPinNote } = await import(
    "../src/lib/proptx/map-listing"
  );

  const limit = Math.max(1, Number(process.argv[2] ?? 500));

  const approxNoteWhere = {
    dataSource: "mls" as const,
    isMock: false,
    OR: [
      { description: { contains: "Map pin approximate" } },
      { description: { contains: "coordinates missing from feed" } },
    ],
  };

  // Prefer oldest-updated approximate pins so hard misses (touched on fail)
  // rotate to the back instead of blocking every batch.
  const active = await prisma.listing.findMany({
    where: { ...approxNoteWhere, status: "ACTIVE" },
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
      lat: true,
      lng: true,
    },
    take: limit,
    orderBy: [{ updatedAt: "asc" }, { listedAt: "desc" }],
  });

  let listings = active;
  if (active.length < limit) {
    const rest = await prisma.listing.findMany({
      where: {
        ...approxNoteWhere,
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
        lat: true,
        lng: true,
      },
      take: limit - active.length,
      orderBy: [{ updatedAt: "asc" }, { listedAt: "desc" }],
    });
    listings = [...active, ...rest];
  }

  // Also repair ACTIVE pins stuck on known centroids but missing the approx note
  // (older syncs / city-level geocode that incorrectly cleared the flag).
  if (listings.length < limit) {
    const centroidOr = [
      {
        lat: DEFAULT_GTA_CENTROID.lat,
        lng: DEFAULT_GTA_CENTROID.lng,
      },
      ...Object.values(CITY_CENTROIDS).map((c) => ({
        lat: c.lat,
        lng: c.lng,
      })),
    ];
    const seen = new Set(listings.map((l) => l.id));
    const stuck = await prisma.listing.findMany({
      where: {
        dataSource: "mls",
        isMock: false,
        status: "ACTIVE",
        id: { notIn: [...seen] },
        OR: centroidOr,
        NOT: {
          OR: [
            { description: { contains: "Map pin approximate" } },
            { description: { contains: "coordinates missing from feed" } },
          ],
        },
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
        lat: true,
        lng: true,
      },
      take: limit - listings.length,
      orderBy: [{ listedAt: "desc" }, { updatedAt: "desc" }],
    });
    listings = [...listings, ...stuck.filter((l) => isKnownCityCentroid(l.lat, l.lng))];
  }

  console.log(
    `Geocoding ${listings.length} approximate MLS pins (ACTIVE first, street-only Photon→Google→Nominatim)…`,
  );
  let ok = 0;
  let fail = 0;
  let done = 0;
  // Keep moderate concurrency: Nominatim is globally rate-limited to ~1/s;
  // Google/Photon can run ahead of that queue.
  const concurrency = Math.max(
    1,
    Math.min(8, Number(process.env.GEOCODE_CONCURRENCY ?? 6)),
  );
  let index = 0;
  const started = Date.now();

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
        if (!geo || geo.precision !== "street") {
          fail += 1;
          // Touch updatedAt so this miss rotates behind untried pins.
          const baseDescription =
            isKnownCityCentroid(listing.lat, listing.lng) &&
            !/Map pin approximate|coordinates missing from feed/i.test(
              listing.description,
            )
              ? `${stripApproxPinNote(listing.description)}\n\n${APPROX_PIN_NOTE}`.trim()
              : listing.description;
          await prisma.listing.update({
            where: { id: listing.id },
            data: {
              description: baseDescription,
              // Force updatedAt bump even when description unchanged.
              updatedAt: new Date(),
            },
          });
          if (fail <= 8 || fail % 100 === 0) {
            console.log(
              "miss",
              listing.mlsNumber,
              listing.addressLine.slice(0, 60),
            );
          }
        } else {
          await prisma.listing.update({
            where: { id: listing.id },
            data: {
              lat: geo.lat,
              lng: geo.lng,
              description: stripApproxPinNote(listing.description),
            },
          });
          ok += 1;
          if (ok <= 8 || ok % 50 === 0) {
            console.log(
              "ok",
              listing.mlsNumber,
              geo.source,
              geo.lat.toFixed(5),
              geo.lng.toFixed(5),
            );
          }
        }
      } catch (err) {
        fail += 1;
        console.log(
          "err",
          listing.mlsNumber,
          err instanceof Error ? err.message : "failed",
        );
      } finally {
        done += 1;
        if (done % 100 === 0 || done === listings.length) {
          const elapsedSec = Math.max(1, Math.round((Date.now() - started) / 1000));
          const rate = (done / elapsedSec).toFixed(1);
          console.log(
            `progress ${done}/${listings.length} ok=${ok} fail=${fail} (${rate}/s)`,
          );
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, listings.length || 1) }, () =>
      worker(),
    ),
  );

  const remaining = await prisma.listing.count({ where: approxNoteWhere });
  const remainingActive = await prisma.listing.count({
    where: { ...approxNoteWhere, status: "ACTIVE" },
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
