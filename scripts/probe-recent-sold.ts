import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const newest = await prisma.listing.findMany({
    where: {
      dataSource: "mls",
      isMock: false,
      status: "SOLD",
      transactionType: "SALE",
    },
    select: {
      mlsNumber: true,
      city: true,
      addressLine: true,
      soldAt: true,
      listedAt: true,
      soldPrice: true,
      updatedAt: true,
      updatedAtMls: true,
    },
    orderBy: [{ soldAt: "desc" }, { listedAt: "desc" }],
    take: 15,
  });

  console.log(
    "newest by soldAt:",
    newest.map((r) => ({
      mls: r.mlsNumber,
      city: r.city,
      soldAt: r.soldAt?.toISOString()?.slice(0, 10) ?? null,
      listedAt: r.listedAt.toISOString().slice(0, 10),
      updatedAtMls: r.updatedAtMls?.toISOString()?.slice(0, 10) ?? null,
      price: r.soldPrice,
    })),
  );

  const nullSoldAt = await prisma.listing.count({
    where: {
      dataSource: "mls",
      isMock: false,
      status: "SOLD",
      soldAt: null,
    },
  });

  const since21 = await prisma.listing.count({
    where: {
      dataSource: "mls",
      isMock: false,
      status: "SOLD",
      soldAt: { gt: new Date("2026-07-21T23:59:59.000Z") },
    },
  });

  const soldStatusRecentMod = await prisma.listing.findMany({
    where: {
      dataSource: "mls",
      isMock: false,
      status: "SOLD",
      updatedAtMls: { gte: new Date("2026-07-21T00:00:00.000Z") },
    },
    select: {
      mlsNumber: true,
      city: true,
      soldAt: true,
      updatedAtMls: true,
    },
    orderBy: { updatedAtMls: "desc" },
    take: 15,
  });

  console.log({ nullSoldAt, soldAfterJul21: since21 });
  console.log(
    "SOLD with MLS update since Jul 21:",
    soldStatusRecentMod.map((r) => ({
      mls: r.mlsNumber,
      city: r.city,
      soldAt: r.soldAt?.toISOString()?.slice(0, 10) ?? null,
      updatedAtMls: r.updatedAtMls?.toISOString()?.slice(0, 10) ?? null,
    })),
  );

  // Cities used on homepage default region
  const { DEFAULT_HOMEPAGE_CITIES } = await import("../src/lib/geo/regions");
  const regional = await prisma.listing.findMany({
    where: {
      dataSource: "mls",
      isMock: false,
      status: "SOLD",
      transactionType: "SALE",
      OR: DEFAULT_HOMEPAGE_CITIES.map((city) => ({
        city: { equals: city, mode: "insensitive" as const },
      })),
    },
    select: { mlsNumber: true, city: true, soldAt: true },
    orderBy: [{ soldAt: "desc" }],
    take: 10,
  });
  console.log(
    "newest in default homepage cities:",
    regional.map((r) => ({
      mls: r.mlsNumber,
      city: r.city,
      soldAt: r.soldAt?.toISOString()?.slice(0, 10) ?? null,
    })),
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
