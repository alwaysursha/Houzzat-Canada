import { NextResponse } from "next/server";
import { z } from "zod";
import {
  generateOwnerMlsNumber,
  requireAdminUser,
} from "@/lib/owner/auth";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  transactionType: z.enum(["SALE", "LEASE"]),
  segment: z.enum(["RESIDENTIAL", "COMMERCIAL"]).default("RESIDENTIAL"),
  propertyType: z.string().default("DETACHED"),
  listPrice: z.number().int().positive(),
  beds: z.number().default(0),
  baths: z.number().default(0),
  sqft: z.number().int().optional().nullable(),
  addressLine: z.string().trim().min(3),
  city: z.string().trim().min(2),
  community: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  lat: z.number().default(43.65),
  lng: z.number().default(-79.38),
  description: z.string().trim().min(10),
  publish: z.boolean().default(true),
  ownerEmail: z.string().email().optional(),
});

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await prisma.listing.findMany({
    where: { dataSource: "fsbo" },
    orderBy: { updatedAt: "desc" },
    include: {
      owner: { select: { id: true, email: true, name: true, phone: true } },
      ownerOrders: { orderBy: { createdAt: "desc" }, take: 1 },
      titleParties: true,
    },
  });

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data." }, { status: 400 });
  }

  const data = parsed.data;
  let ownerUserId: string | null = null;
  if (data.ownerEmail) {
    const owner = await prisma.user.findUnique({
      where: { email: data.ownerEmail.toLowerCase() },
    });
    ownerUserId = owner?.id ?? null;
  }

  const now = new Date();
  const mlsNumber = generateOwnerMlsNumber(data.transactionType);

  const listing = await prisma.listing.create({
    data: {
      mlsNumber,
      status: "ACTIVE",
      segment: data.segment,
      transactionType: data.transactionType,
      dataSource: "fsbo",
      propertyType: data.propertyType as never,
      listPrice: data.listPrice,
      beds: data.beds,
      baths: data.baths,
      sqft: data.sqft ?? null,
      addressLine: data.addressLine,
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
      isMock: false,
      ownerUserId,
      ownerStatus: data.publish ? "ACTIVE" : "DRAFT",
      ownerReviewedAt: data.publish ? now : null,
      ownerReviewedById: data.publish ? admin.id : null,
      ownerOrders: ownerUserId
        ? {
            create: {
              userId: ownerUserId,
              baseAmount: 0,
              addOns: [],
              discountAmount: 0,
              totalAmount: 0,
              paymentStatus: "WAIVED",
              createdByAdminId: admin.id,
            },
          }
        : undefined,
    },
  });

  return NextResponse.json({ listing });
}
