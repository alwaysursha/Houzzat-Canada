/**
 * Probe PropTx for AboveGradeFinishedArea on a listing.
 * Usage: pnpm exec tsx scripts/probe-sqft-fields.ts [mlsNumber]
 */
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

const AREA_KEYS = [
  "LivingArea",
  "BuildingAreaTotal",
  "AboveGradeFinishedArea",
  "BelowGradeFinishedArea",
  "FinishedSqFt",
  "SquareFootage",
  "LivingAreaRange",
  "BuildingAreaRange",
  "ApproximateSquareFootage",
  "SqftRange",
  "LivingAreaUnits",
  "AboveGradeFinishedAreaUnits",
  "BuildingAreaUnits",
];

async function main() {
  const endpoint = (process.env.PROPTX_ENDPOINT_URL || "").replace(/\/+$/, "");
  const token = process.env.PROPTX_BEARER_TOKEN;
  const tokenId = process.env.PROPTX_TOKEN_ID;
  if (!endpoint || !token || !tokenId) {
    throw new Error("Missing PropTx env (ENDPOINT / BEARER / TOKEN_ID)");
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    TokenId: tokenId,
    Accept: "application/json",
  };

  async function fetchRaw(path: string) {
    const res = await fetch(`${endpoint}/${path}`, { headers });
    const text = await res.text();
    return { status: res.status, text };
  }

  async function fetchProperty(mlsOrKey: string) {
    // Prefer filter by ListingId (no $select — discover which area fields exist).
    const lit = `'${mlsOrKey.replace(/'/g, "''")}'`;
    const byId = await fetchRaw(
      `Property?$filter=${encodeURIComponent(`ListingId eq ${lit}`)}&$top=1`,
    );
    if (byId.status === 200) {
      const json = JSON.parse(byId.text) as { value?: Record<string, unknown>[] };
      if (json.value?.[0]) return json.value[0];
    } else {
      console.log("ListingId filter", byId.status, byId.text.slice(0, 200));
    }

    const byKey = await fetchRaw(`Property('${mlsOrKey.replace(/'/g, "''")}')`);
    if (byKey.status === 200) {
      return JSON.parse(byKey.text) as Record<string, unknown>;
    }
    console.log("ListingKey get", byKey.status, byKey.text.slice(0, 200));
    return null;
  }

  const argMls = process.argv[2]?.trim();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL missing");

  const pool = new pg.Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const candidates = argMls
      ? await prisma.listing.findMany({
          where: { mlsNumber: argMls },
          take: 1,
          select: {
            mlsNumber: true,
            listingKey: true,
            sqft: true,
            addressLine: true,
            city: true,
            unitNumber: true,
          },
        })
      : await prisma.listing.findMany({
          where: {
            dataSource: "mls",
            isMock: false,
            OR: [
              {
                AND: [
                  { addressLine: { contains: "Erb", mode: "insensitive" } },
                  { city: { contains: "Waterloo", mode: "insensitive" } },
                ],
              },
              { sqft: 1750 },
            ],
          },
          take: 6,
          orderBy: { updatedAt: "desc" },
          select: {
            mlsNumber: true,
            listingKey: true,
            sqft: true,
            addressLine: true,
            city: true,
            unitNumber: true,
          },
        });

    console.log("DB candidates:", candidates.length);

    for (const c of candidates) {
      const row =
        (await fetchProperty(c.mlsNumber)) ??
        (c.listingKey ? await fetchProperty(c.listingKey) : null);

      console.log(
        `\n=== ${c.mlsNumber} | ${c.unitNumber ? `${c.unitNumber}-` : ""}${c.addressLine}, ${c.city} | DB sqft=${c.sqft}`,
      );
      if (!row) {
        console.log("PropTx: no row");
        continue;
      }

      const pick: Record<string, unknown> = {
        ListingId: row.ListingId ?? null,
        ListingKey: row.ListingKey ?? null,
      };
      for (const k of AREA_KEYS) {
        if (k in row) pick[k] = row[k] ?? null;
      }

      // Also list any other keys that look sqft/area related.
      const extra = Object.keys(row)
        .filter((k) => /area|sqft|square|finished/i.test(k) && !(k in pick))
        .sort();
      for (const k of extra) pick[k] = row[k] ?? null;

      console.log(JSON.stringify(pick, null, 2));
      console.log(
        "AboveGradeFinishedArea present?",
        Object.prototype.hasOwnProperty.call(row, "AboveGradeFinishedArea"),
        "value=",
        row.AboveGradeFinishedArea ?? null,
      );
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
