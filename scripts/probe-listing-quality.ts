import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL missing");

  const pool = new pg.Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const listings = await prisma.listing.findMany({
      where: { dataSource: "mls", isMock: false },
      take: 3,
      orderBy: { updatedAt: "desc" },
      include: {
        media: { orderBy: { sortOrder: "asc" }, take: 5 },
      },
    });

    console.log("sample", listings.length);
    for (const l of listings) {
      console.log(
        JSON.stringify(
          {
            mlsNumber: l.mlsNumber,
            listingKey: l.listingKey,
            status: l.status,
            city: l.city,
            addressLine: l.addressLine,
            listPrice: l.listPrice,
            beds: l.beds,
            baths: l.baths,
            sqft: l.sqft,
            lat: l.lat,
            lng: l.lng,
            brokerageName: l.brokerageName,
            descLen: l.description?.length ?? 0,
            descPreview: (l.description || "").slice(0, 160),
            mediaCount: l.media.length,
            mediaUrls: l.media.map((m) => ({
              url: m.url.slice(0, 160),
              primary: m.isPrimary,
              order: m.sortOrder,
            })),
            approxPin: (l.description || "").includes("Map pin approximate"),
          },
          null,
          2,
        ),
      );
    }

    const endpoint = process.env.PROPTX_ENDPOINT_URL?.replace(/\/+$/, "");
    const token = process.env.PROPTX_BEARER_TOKEN;
    const tokenId = process.env.PROPTX_TOKEN_ID;
    const key = listings[0]?.listingKey;
    if (endpoint && token && tokenId && key) {
      const res = await fetch(
        `${endpoint}/Property('${encodeURIComponent(key)}')`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            TokenId: tokenId,
            Accept: "application/json",
          },
        },
      );
      console.log("\nAMPRE property status", res.status);
      const text = await res.text();
      if (!res.ok) {
        console.log(text.slice(0, 500));
      } else {
        const row = JSON.parse(text) as Record<string, unknown>;
        const keep = [
          "ListingKey",
          "ListingId",
          "Latitude",
          "Longitude",
          "City",
          "UnparsedAddress",
          "StreetNumber",
          "StreetName",
          "ListPrice",
          "PublicRemarks",
          "BedroomsTotal",
          "BathroomsTotalInteger",
          "LivingArea",
          "ListOfficeName",
          "StandardStatus",
          "ContractStatus",
          "PropertySubType",
          "PropertyType",
          "TransactionType",
          "PostalCode",
          "UnitNumber",
          "ParkingTotal",
          "TaxAnnualAmount",
          "AssociationFee",
          "YearBuilt",
        ];
        const sample: Record<string, unknown> = {};
        for (const k of keep) sample[k] = row[k] ?? null;

        const mediaRes = await fetch(
          `${endpoint}/Media?$filter=${encodeURIComponent(`ResourceRecordKey eq '${key}'`)}&$top=3&$orderby=Order`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              TokenId: tokenId,
              Accept: "application/json",
            },
          },
        );
        const mediaJson = (await mediaRes.json()) as {
          value?: Record<string, unknown>[];
        };
        sample._mediaStatus = mediaRes.status;
        sample._mediaSample = (mediaJson.value ?? []).map((m) => {
          const urlKeys = Object.keys(m).filter((x) =>
            /url|media|image|http|preferred|order/i.test(x),
          );
          const picked: Record<string, unknown> = {};
          for (const uk of urlKeys) picked[uk] = m[uk];
          return picked;
        });
        console.log("AMPRE sample", JSON.stringify(sample, null, 2));
      }
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
