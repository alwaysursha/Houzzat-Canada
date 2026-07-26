import { NextResponse } from "next/server";
import { z } from "zod";
import {
  generateOwnerMlsNumber,
  requireOwnerUser,
} from "@/lib/owner/auth";
import {
  OWNER_COOP_CONSENT_VERSION,
  OWNER_LISTING_TERMS_VERSION,
  calculateOwnerPricing,
  type OwnerAddonId,
} from "@/lib/owner/pricing";
import { prisma } from "@/lib/prisma";

const addonSchema = z.enum([
  "CLEANING",
  "STAGING",
  "PHOTOGRAPHY",
  "VIDEOGRAPHY",
]);

const createSchema = z.object({
  transactionType: z.enum(["SALE", "LEASE"]),
  segment: z.enum(["RESIDENTIAL", "COMMERCIAL"]),
  propertyType: z.enum([
    "DETACHED",
    "SEMI_DETACHED",
    "TOWNHOUSE",
    "CONDO_APT",
    "CONDO_TOWNHOUSE",
    "MULTIPLEX",
    "VACANT_LAND",
    "OFFICE",
    "RETAIL",
    "INDUSTRIAL",
    "MIXED_USE",
    "OTHER",
  ]),
  listPrice: z.number().int().positive(),
  beds: z.number().min(0).max(30),
  baths: z.number().min(0).max(30),
  sqft: z.number().int().positive().optional().nullable(),
  parkingSpaces: z.number().int().min(0).max(50).default(0),
  addressLine: z.string().trim().min(3).max(200),
  unitNumber: z.string().trim().max(40).optional().nullable(),
  city: z.string().trim().min(2).max(80),
  community: z.string().trim().max(120).optional().nullable(),
  postalCode: z.string().trim().max(12).optional().nullable(),
  lat: z.number(),
  lng: z.number(),
  description: z.string().trim().min(20).max(8000),
  phone: z.string().trim().min(7).max(40),
  addOns: z.array(addonSchema).default([]),
  acceptTerms: z.literal(true),
  acceptCoop: z.literal(true),
  titleParties: z
    .array(
      z.object({
        fullName: z.string().trim().min(2).max(120),
        licenseImageUrl: z.string().url().or(z.string().startsWith("/")),
      }),
    )
    .min(1),
  photoUrls: z.array(z.string()).max(20).default([]),
});

export async function GET() {
  const user = await requireOwnerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const listings = await prisma.listing.findMany({
    where: { ownerUserId: user.id, dataSource: "fsbo" },
    orderBy: { updatedAt: "desc" },
    include: {
      media: { orderBy: { sortOrder: "asc" }, take: 1 },
      ownerOrders: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { /* views via ListingView by mls */ } },
    },
  });

  const withViews = await Promise.all(
    listings.map(async (listing) => {
      const views = await prisma.listingView.count({
        where: { mlsNumber: listing.mlsNumber },
      });
      const inquiries = await prisma.lead.count({
        where: { listingMls: listing.mlsNumber },
      });
      return { ...listing, views, inquiries };
    }),
  );

  return NextResponse.json({ items: withViews });
}

export async function POST(request: Request) {
  const user = await requireOwnerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid listing data.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const addOns = data.addOns as OwnerAddonId[];
  if (data.transactionType === "LEASE" && addOns.includes("STAGING")) {
    return NextResponse.json(
      { error: "Staging is only available for sale listings." },
      { status: 400 },
    );
  }

  const pricing = calculateOwnerPricing({
    transactionType: data.transactionType,
    addOns,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { phone: data.phone },
    select: { id: true },
  });

  const mlsNumber = generateOwnerMlsNumber(data.transactionType);
  const now = new Date();

  const listing = await prisma.listing.create({
    data: {
      mlsNumber,
      status: "ACTIVE",
      segment: data.segment,
      transactionType: data.transactionType,
      dataSource: "fsbo",
      propertyType: data.propertyType,
      listPrice: data.listPrice,
      beds: data.beds,
      baths: data.baths,
      sqft: data.sqft ?? null,
      parkingSpaces: data.parkingSpaces,
      addressLine: data.addressLine,
      unitNumber: data.unitNumber || null,
      city: data.city,
      community: data.community || null,
      postalCode: data.postalCode || null,
      province: "ON",
      lat: data.lat,
      lng: data.lng,
      description: data.description,
      brokerageName: "Houzzat — For Sale / Lease By Owner",
      listedAt: now,
      updatedAtMls: now,
      daysOnMarket: 0,
      isMock: false,
      ownerUserId: user.id,
      ownerStatus: "PENDING_PAYMENT",
      titleParties: {
        create: data.titleParties.map((party, index) => ({
          fullName: party.fullName,
          licenseImageUrl: party.licenseImageUrl,
          sortOrder: index,
        })),
      },
      media:
        data.photoUrls.length > 0
          ? {
              create: data.photoUrls.map((url, index) => ({
                url,
                sortOrder: index,
                isPrimary: index === 0,
              })),
            }
          : undefined,
      ownerConsents: {
        create: [
          {
            userId: user.id,
            kind: "LISTING_TERMS",
            version: OWNER_LISTING_TERMS_VERSION,
          },
          {
            userId: user.id,
            kind: "COOP_COMMISSION",
            version: OWNER_COOP_CONSENT_VERSION,
          },
        ],
      },
      ownerOrders: {
        create: {
          userId: user.id,
          baseAmount: pricing.baseAmount,
          addOns: pricing.addOnLines,
          discountAmount: pricing.discountAmount,
          totalAmount: pricing.totalAmount,
          paymentStatus: "PENDING",
        },
      },
    },
    include: {
      ownerOrders: true,
    },
  });

  const order = listing.ownerOrders[0];
  return NextResponse.json({
    listingId: listing.id,
    mlsNumber: listing.mlsNumber,
    orderId: order?.id,
    totalAmount: order?.totalAmount,
    checkoutUrl: order ? `/owner/checkout/${order.id}` : null,
  });
}
