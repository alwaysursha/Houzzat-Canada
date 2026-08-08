import "dotenv/config";
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { slugifyPlace } from "../src/lib/geo/distance";
import { SEED_POIS, toPoiCreateInput } from "../src/lib/poi/seed-data";
import { MOCK_LISTINGS, toListingCreateInput } from "./mock-listings";

config({ path: ".env.local", override: true });

const connectionString =
  process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL or DIRECT_URL is required to seed");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function seedUsers() {
  const password = await bcrypt.hash("password123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@houzzat.ca" },
    update: {
      role: "ADMIN",
      isBuyer: false,
      isSeller: false,
      password,
      name: "Houzzat Admin",
      vowAcceptedAt: new Date(),
      vowVersion: "2026-07-1",
    },
    create: {
      email: "admin@houzzat.ca",
      name: "Houzzat Admin",
      role: "ADMIN",
      isBuyer: false,
      isSeller: false,
      password,
      vowAcceptedAt: new Date(),
      vowVersion: "2026-07-1",
    },
  });

  const agent = await prisma.user.upsert({
    where: { email: "agent@houzzat.ca" },
    update: {
      role: "AGENT",
      isBuyer: false,
      isSeller: false,
      password,
      name: "Demo Agent",
      vowAcceptedAt: new Date(),
      vowVersion: "2026-07-1",
    },
    create: {
      email: "agent@houzzat.ca",
      name: "Demo Agent",
      role: "AGENT",
      isBuyer: false,
      isSeller: false,
      password,
      phone: "+1 416 555 0100",
      vowAcceptedAt: new Date(),
      vowVersion: "2026-07-1",
    },
  });

  await prisma.agentProfile.upsert({
    where: { userId: agent.id },
    update: {
      active: true,
      markets: ["Toronto", "Mississauga", "Brampton"],
      phone: "+1 416 555 0100",
      bio: "GTA listing specialist.",
    },
    create: {
      userId: agent.id,
      active: true,
      markets: ["Toronto", "Mississauga", "Brampton"],
      phone: "+1 416 555 0100",
      bio: "GTA listing specialist.",
    },
  });

  await prisma.user.upsert({
    where: { email: "customer@houzzat.ca" },
    update: {
      role: "BUYER",
      isBuyer: true,
      isSeller: true,
      activeMode: "BUYER",
      password,
      name: "Demo Buyer",
      phone: "+1 519 555 0140",
      vowAcceptedAt: new Date(),
      vowVersion: "2026-07-1",
      termsAcceptedAt: new Date(),
      termsVersion: "terms-2026-07",
    },
    create: {
      email: "customer@houzzat.ca",
      name: "Demo Buyer",
      role: "BUYER",
      isBuyer: true,
      isSeller: true,
      activeMode: "BUYER",
      password,
      phone: "+1 519 555 0140",
      vowAcceptedAt: new Date(),
      vowVersion: "2026-07-1",
      termsAcceptedAt: new Date(),
      termsVersion: "terms-2026-07",
    },
  });

  console.log("Seeded users (password: password123)");
  console.log(`  Admin:    admin@houzzat.ca (${admin.id})`);
  console.log(`  Agent:    agent@houzzat.ca (${agent.id})`);
  console.log("  Customer: customer@houzzat.ca");
}

async function seedListings() {
  const customer = await prisma.user.findUniqueOrThrow({
    where: { email: "customer@houzzat.ca" },
  });

  // Replace mock inventory cleanly so re-seeds stay deterministic.
  await prisma.listingHistory.deleteMany({
    where: { listing: { isMock: true } },
  });
  await prisma.openHouse.deleteMany({
    where: { listing: { isMock: true } },
  });
  await prisma.listingMedia.deleteMany({
    where: { listing: { isMock: true } },
  });
  await prisma.listing.deleteMany({ where: { isMock: true } });

  let fsboCount = 0;
  for (const listing of MOCK_LISTINGS) {
    const created = await prisma.listing.create({
      data: toListingCreateInput(listing, {
        ownerUserId: listing.assignDemoOwner ? customer.id : undefined,
      }),
    });
    if (listing.dataSource === "fsbo") {
      fsboCount += 1;
      await prisma.ownerTitleParty.create({
        data: {
          listingId: created.id,
          fullName: customer.name ?? "Demo Customer",
          licenseImageUrl: "/uploads/owner/licenses/demo-placeholder.jpg",
          sortOrder: 0,
        },
      });
      const baseAmount = listing.transactionType === "LEASE" ? 499 : 1499;
      await prisma.ownerListingOrder.create({
        data: {
          userId: customer.id,
          listingId: created.id,
          baseAmount,
          addOns: [],
          discountAmount: 0,
          totalAmount: baseAmount,
          paymentStatus: "WAIVED",
        },
      });
    }
  }

  await prisma.mlsSyncRun.create({
    data: {
      resource: "mock-listings",
      status: "success",
      finishedAt: new Date(),
      message: `Seeded ${MOCK_LISTINGS.length} mock listings (${fsboCount} FSBO/FLBO)`,
      stats: {
        count: MOCK_LISTINGS.length,
        fsbo: fsboCount,
        provider: "mock",
      },
    },
  });

  console.log(
    `Seeded ${MOCK_LISTINGS.length} mock listings (${fsboCount} FSBO/FLBO, owner: customer@houzzat.ca)`,
  );
}

const PRECON_PROJECTS = [
  {
    mlsNumber: "PC-QUAYSIDE-01",
    addressLine: "Quayside Residences",
    city: "Toronto",
    community: "East Bayfront",
    listPrice: 689000,
    beds: 1,
    baths: 1,
    lat: 43.6462,
    lng: -79.3608,
    description:
      "Waterfront pre-construction tower with lake views and transit-oriented amenities. Starting from 1-bed suites (demo project).",
    imageUrl:
      "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=80",
  },
  {
    mlsNumber: "PC-MISS-SKY-02",
    addressLine: "Skyline Square",
    city: "Mississauga",
    community: "City Centre",
    listPrice: 549000,
    beds: 1,
    baths: 1,
    lat: 43.589,
    lng: -79.6441,
    description:
      "Mississauga City Centre pre-construction with plaza retail and Square One access. Studio and 1-bed releases (demo project).",
    imageUrl:
      "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1600&q=80",
  },
] as const;

async function seedPreConstruction() {
  for (const project of PRECON_PROJECTS) {
    const existing = await prisma.listing.findUnique({
      where: { mlsNumber: project.mlsNumber },
    });
    if (existing) {
      await prisma.listingMedia.deleteMany({ where: { listingId: existing.id } });
      await prisma.listing.update({
        where: { id: existing.id },
        data: {
          segment: "PRE_CONSTRUCTION",
          dataSource: "manual",
          isMock: false,
          status: "ACTIVE",
          propertyType: "CONDO_APT",
          listPrice: project.listPrice,
          beds: project.beds,
          baths: project.baths,
          addressLine: project.addressLine,
          city: project.city,
          community: project.community,
          lat: project.lat,
          lng: project.lng,
          description: project.description,
          brokerageName: "Houzzat Pre-Construction Desk",
          updatedAtMls: new Date(),
          media: {
            create: [
              { url: project.imageUrl, sortOrder: 0, isPrimary: true },
            ],
          },
        },
      });
    } else {
      await prisma.listing.create({
        data: {
          mlsNumber: project.mlsNumber,
          segment: "PRE_CONSTRUCTION",
          dataSource: "manual",
          isMock: false,
          status: "ACTIVE",
          propertyType: "CONDO_APT",
          listPrice: project.listPrice,
          beds: project.beds,
          baths: project.baths,
          addressLine: project.addressLine,
          city: project.city,
          community: project.community,
          postalCode: "",
          lat: project.lat,
          lng: project.lng,
          description: project.description,
          brokerageName: "Houzzat Pre-Construction Desk",
          listedAt: new Date(),
          updatedAtMls: new Date(),
          daysOnMarket: 0,
          media: {
            create: [
              { url: project.imageUrl, sortOrder: 0, isPrimary: true },
            ],
          },
        },
      });
    }
  }
  console.log(`Seeded ${PRECON_PROJECTS.length} pre-construction projects`);
}

async function seedLandings(adminId: string) {
  await prisma.landingPage.upsert({
    where: { slug: "sell-leslieville" },
    update: {
      title: "Sell in Leslieville",
      headline: "What is your Leslieville home worth?",
      subtitle:
        "Get a free market snapshot and a consult with a local Houzzat advisor.",
      ctaLabel: "Get my valuation",
      ctaHref: "/home-valuation",
      areaFocus: "Leslieville · Toronto",
      utmCampaign: "leslieville-sellers-2026",
      heroImageUrl:
        "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=2000&q=80",
      published: true,
      ownerAgentId: adminId,
    },
    create: {
      slug: "sell-leslieville",
      title: "Sell in Leslieville",
      headline: "What is your Leslieville home worth?",
      subtitle:
        "Get a free market snapshot and a consult with a local Houzzat advisor.",
      ctaLabel: "Get my valuation",
      ctaHref: "/home-valuation",
      areaFocus: "Leslieville · Toronto",
      utmCampaign: "leslieville-sellers-2026",
      heroImageUrl:
        "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=2000&q=80",
      published: true,
      ownerAgentId: adminId,
    },
  });
  console.log("Seeded landing page /lp/sell-leslieville");
}

async function seedPois() {
  for (const poi of SEED_POIS) {
    await prisma.poi.upsert({
      where: {
        source_sourceId: { source: "seed", sourceId: poi.sourceId },
      },
      create: toPoiCreateInput(poi),
      update: {
        type: poi.type,
        name: poi.name,
        address: poi.address,
        city: poi.city,
        lat: poi.lat,
        lng: poi.lng,
        meta: poi.meta,
      },
    });
  }
  console.log(`Seeded ${SEED_POIS.length} POIs`);
}

async function seedGeoPlaces() {
  const byKey = new Map<
    string,
    { city: string; community: string; lat: number; lng: number; n: number }
  >();

  for (const listing of MOCK_LISTINGS) {
    if (!listing.community) continue;
    const key = `${listing.city}::${listing.community}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.lat += listing.lat;
      existing.lng += listing.lng;
      existing.n += 1;
    } else {
      byKey.set(key, {
        city: listing.city,
        community: listing.community,
        lat: listing.lat,
        lng: listing.lng,
        n: 1,
      });
    }
  }

  for (const place of byKey.values()) {
    const slug = slugifyPlace(place.city, place.community);
    const lat = place.lat / place.n;
    const lng = place.lng / place.n;
    await prisma.geoPlace.upsert({
      where: { slug },
      update: {
        city: place.city,
        community: place.community,
        displayName: place.community,
        lat,
        lng,
        published: true,
        summary: `${place.community} in ${place.city} — homes, amenities, and market context on Houzzat.`,
      },
      create: {
        slug,
        city: place.city,
        community: place.community,
        displayName: place.community,
        lat,
        lng,
        published: true,
        summary: `${place.community} in ${place.city} — homes, amenities, and market context on Houzzat.`,
      },
    });
  }

  const byCity = new Map<
    string,
    { city: string; lat: number; lng: number; n: number }
  >();
  for (const listing of MOCK_LISTINGS) {
    const key = listing.city;
    const existing = byCity.get(key);
    if (existing) {
      existing.lat += listing.lat;
      existing.lng += listing.lng;
      existing.n += 1;
    } else {
      byCity.set(key, {
        city: listing.city,
        lat: listing.lat,
        lng: listing.lng,
        n: 1,
      });
    }
  }
  for (const place of byCity.values()) {
    const slug = slugifyPlace(place.city);
    const lat = place.lat / place.n;
    const lng = place.lng / place.n;
    await prisma.geoPlace.upsert({
      where: { slug },
      update: {
        city: place.city,
        community: null,
        displayName: place.city,
        lat,
        lng,
        published: true,
        summary: `Homes for sale in ${place.city} — live inventory, neighbourhood guides, and market context on Houzzat.`,
      },
      create: {
        slug,
        city: place.city,
        community: null,
        displayName: place.city,
        lat,
        lng,
        published: true,
        summary: `Homes for sale in ${place.city} — live inventory, neighbourhood guides, and market context on Houzzat.`,
      },
    });
  }

  console.log(
    `Seeded ${byKey.size} community geo places + ${byCity.size} city hubs`,
  );
}

async function seedAdAccounts() {
  for (const provider of ["meta", "google"] as const) {
    await prisma.adAccountConnection.upsert({
      where: { provider },
      update: {},
      create: {
        provider,
        accountLabel: provider === "meta" ? "Meta Business" : "Google Ads",
        status: "disconnected",
        meta: { note: "OAuth connect ships with live Marketing/Ads API keys" },
      },
    });
  }
  console.log("Seeded ad account connection stubs (disconnected)");
}

async function seedExtraSolds() {
  // Extra solds so market pulse / CMA have denser samples per city.
  const extras = [
    {
      mlsNumber: "C9SOLD001",
      city: "Toronto",
      community: "The Beaches",
      addressLine: "88 Wineva Ave",
      listPrice: 1499000,
      soldPrice: 1550000,
      beds: 3,
      baths: 3,
      lat: 43.6685,
      lng: -79.2975,
    },
    {
      mlsNumber: "C9SOLD002",
      city: "Toronto",
      community: "The Beaches",
      addressLine: "12 Scarborough Rd",
      listPrice: 1325000,
      soldPrice: 1299000,
      beds: 3,
      baths: 2,
      lat: 43.6712,
      lng: -79.3012,
    },
    {
      mlsNumber: "C9SOLD003",
      city: "Toronto",
      community: "Waterfront Communities C1",
      addressLine: "12 York St Unit 2201",
      listPrice: 899000,
      soldPrice: 910000,
      beds: 2,
      baths: 2,
      lat: 43.6418,
      lng: -79.3815,
    },
    {
      mlsNumber: "C9SOLD004",
      city: "Mississauga",
      community: "City Centre",
      addressLine: "388 Prince of Wales Dr",
      listPrice: 689000,
      soldPrice: 675000,
      beds: 2,
      baths: 2,
      lat: 43.5912,
      lng: -79.6455,
    },
    {
      mlsNumber: "C9SOLD005",
      city: "Mississauga",
      community: "City Centre",
      addressLine: "330 Burnhamthorpe Rd W",
      listPrice: 749000,
      soldPrice: 760000,
      beds: 2,
      baths: 2,
      lat: 43.5885,
      lng: -79.6412,
    },
    {
      mlsNumber: "C9SOLD006",
      city: "Toronto",
      community: "Palmerston-Little Italy",
      addressLine: "512 Markham St",
      listPrice: 1149000,
      soldPrice: 1210000,
      beds: 3,
      baths: 3,
      lat: 43.6598,
      lng: -79.4142,
    },
  ] as const;

  for (const s of extras) {
    await prisma.listing.upsert({
      where: { mlsNumber: s.mlsNumber },
      update: {
        status: "SOLD",
        listPrice: s.listPrice,
        soldPrice: s.soldPrice,
        soldAt: new Date("2026-05-15T12:00:00.000Z"),
      },
      create: {
        mlsNumber: s.mlsNumber,
        status: "SOLD",
        segment: "RESIDENTIAL",
        dataSource: "mock",
        isMock: true,
        propertyType: "CONDO_APT",
        listPrice: s.listPrice,
        soldPrice: s.soldPrice,
        beds: s.beds,
        baths: s.baths,
        addressLine: s.addressLine,
        city: s.city,
        community: s.community,
        postalCode: "",
        lat: s.lat,
        lng: s.lng,
        description: "Demo sold comparable for market pulse / CMA.",
        brokerageName: "Houzzat Realty Demo Brokerage",
        listedAt: new Date("2026-03-01T12:00:00.000Z"),
        soldAt: new Date("2026-05-15T12:00:00.000Z"),
        updatedAtMls: new Date(),
        daysOnMarket: 28,
        media: {
          create: [
            {
              url: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1600&q=80",
              sortOrder: 0,
              isPrimary: true,
            },
          ],
        },
      },
    });
  }
  console.log(`Seeded ${extras.length} extra sold comps`);
}

async function seedPartners() {
  const partners = [
    {
      type: "MORTGAGE" as const,
      name: "Aisha Rahman",
      company: "Northstar Mortgages",
      email: "aisha@northstar-demo.ca",
      phone: "+1 416 555 0201",
      city: "Toronto",
      bio: "GTA purchase and refinance specialist.",
    },
    {
      type: "LAWYER" as const,
      name: "Daniel Cho",
      company: "Cho Real Estate Law",
      email: "daniel@cho-law-demo.ca",
      phone: "+1 416 555 0202",
      city: "Toronto",
      bio: "Residential closings across the GTA.",
    },
    {
      type: "INSPECTOR" as const,
      name: "Priya Nair",
      company: "ClearView Home Inspections",
      email: "priya@clearview-demo.ca",
      phone: "+1 416 555 0203",
      city: "Mississauga",
      bio: "Buyer and pre-list inspections.",
    },
  ];

  for (const p of partners) {
    const existing = await prisma.referralPartner.findFirst({
      where: { email: p.email },
    });
    if (existing) {
      await prisma.referralPartner.update({
        where: { id: existing.id },
        data: { ...p, active: true },
      });
    } else {
      await prisma.referralPartner.create({ data: { ...p, active: true } });
    }
  }
  console.log(`Seeded ${partners.length} referral partners`);
}

async function main() {
  await seedUsers();
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@houzzat.ca" },
  });
  await seedListings();
  await seedExtraSolds();
  await seedPreConstruction();
  await seedLandings(admin.id);
  await seedPois();
  await seedGeoPlaces();
  await seedAdAccounts();
  await seedPartners();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
