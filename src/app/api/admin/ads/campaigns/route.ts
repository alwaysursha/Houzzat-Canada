import { NextResponse } from "next/server";
import { z } from "zod";
import {
  creativesToCsv,
  generateCreativePack,
} from "@/lib/ads/generate";
import { requireAgentUser } from "@/lib/agent";
import { isAdminRole } from "@/lib/constants";
import { listingPath } from "@/lib/listings/listing-path";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await requireAgentUser();
  if (!user || !isAdminRole(user.role)) return null;
  return user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await prisma.adCampaign.findMany({
    include: {
      creatives: true,
      _count: { select: { leads: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ items });
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(160),
  goal: z.enum(["BUYER", "SELLER", "OPEN_HOUSE", "VALUATION", "BRAND"]),
  platform: z.enum(["META", "GOOGLE", "BOTH"]).default("BOTH"),
  sourceType: z.enum([
    "LISTING",
    "LANDING",
    "OPEN_HOUSE",
    "AREA",
    "VALUATION",
  ]),
  sourceId: z.string().trim().min(1).max(120),
});

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid campaign." }, { status: 400 });
  }

  const data = parsed.data;
  let destinationPath = "/search";
  let city: string | null = null;
  let community: string | null = null;
  let addressLine: string | null = null;
  let listPrice: number | null = null;
  let beds: number | null = null;
  let baths: number | null = null;
  let propertyType: string | null = null;
  let headlineHint: string | null = null;
  let imageUrls: string[] = [];
  let brokerageName: string | null = null;
  let mlsNumber: string | null = null;
  let openHouseWhen: string | null = null;

  if (data.sourceType === "LISTING" || data.sourceType === "OPEN_HOUSE") {
    const listing = await prisma.listing.findUnique({
      where: { mlsNumber: data.sourceId },
      include: {
        media: { orderBy: { sortOrder: "asc" }, take: 4 },
        openHouses: { orderBy: { startsAt: "asc" }, take: 1 },
      },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    destinationPath = listingPath(listing);
    city = listing.city;
    community = listing.community;
    addressLine = listing.addressLine;
    listPrice = listing.listPrice;
    beds = listing.beds;
    baths = listing.baths;
    propertyType = listing.propertyType;
    imageUrls = listing.media.map((m) => m.url);
    brokerageName = listing.brokerageName;
    mlsNumber = listing.mlsNumber;
    const oh = listing.openHouses[0];
    if (oh) {
      openHouseWhen = oh.startsAt.toLocaleString("en-CA", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }
  } else if (data.sourceType === "LANDING") {
    const landing = await prisma.landingPage.findUnique({
      where: { slug: data.sourceId },
    });
    if (!landing) {
      return NextResponse.json({ error: "Landing not found" }, { status: 404 });
    }
    destinationPath = `/lp/${landing.slug}`;
    headlineHint = landing.headline ?? landing.title;
    city = landing.areaFocus;
    if (landing.heroImageUrl) imageUrls = [landing.heroImageUrl];
  } else if (data.sourceType === "AREA") {
    const place = await prisma.geoPlace.findUnique({
      where: { slug: data.sourceId },
    });
    if (!place) {
      return NextResponse.json({ error: "Area not found" }, { status: 404 });
    }
    destinationPath = `/areas/${place.slug}`;
    city = place.city;
    community = place.community;
    headlineHint = place.displayName;
  } else if (data.sourceType === "VALUATION") {
    destinationPath = "/home-valuation";
    headlineHint = "Home valuation";
    city = data.sourceId === "gta" ? "GTA" : data.sourceId;
  }

  const pack = generateCreativePack({
    name: data.name,
    goal: data.goal,
    platform: data.platform,
    sourceType: data.sourceType,
    sourceId: data.sourceId,
    destinationPath,
    city,
    community,
    addressLine,
    listPrice,
    beds,
    baths,
    propertyType,
    headlineHint,
    imageUrls,
    brokerageName,
    mlsNumber,
    openHouseWhen,
  });

  const campaign = await prisma.adCampaign.create({
    data: {
      name: data.name,
      goal: data.goal,
      platform: data.platform,
      status: "READY",
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      destinationUrl: pack.destinationUrl,
      utmSource: pack.utm.utm_source,
      utmMedium: pack.utm.utm_medium,
      utmCampaign: pack.utm.utm_campaign,
      utmContent: pack.utm.utm_content,
      audienceHints: {
        city,
        community,
      },
      complianceNotes: pack.complianceNotes,
      assignedAgentId: admin.id,
      creatives: {
        create: [
          ...(data.platform === "META" || data.platform === "BOTH"
            ? [
                {
                  platform: "META" as const,
                  headlines: pack.meta.headlines,
                  primaryTexts: pack.meta.primaryTexts,
                  descriptions: pack.meta.descriptions,
                  imageUrls,
                  imagePresets: pack.imagePresets,
                  exportBundle: {
                    destinationUrl: pack.destinationUrl,
                    utm: pack.utm,
                  },
                },
              ]
            : []),
          ...(data.platform === "GOOGLE" || data.platform === "BOTH"
            ? [
                {
                  platform: "GOOGLE" as const,
                  headlines: pack.google.headlines,
                  primaryTexts: [],
                  descriptions: pack.google.descriptions,
                  imageUrls,
                  imagePresets: pack.imagePresets,
                  exportBundle: {
                    destinationUrl: pack.destinationUrl.replace(
                      "utm_source=meta",
                      "utm_source=google",
                    ),
                    utm: { ...pack.utm, utm_source: "google" },
                  },
                },
              ]
            : []),
        ],
      },
    },
    include: { creatives: true },
  });

  return NextResponse.json({
    ok: true,
    item: campaign,
    csv: creativesToCsv(pack),
  });
}
