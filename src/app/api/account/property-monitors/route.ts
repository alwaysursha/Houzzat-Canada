import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFullCustomerUser } from "@/lib/account";
import { recordActivityEvent } from "@/lib/analytics/record-activity";
import { listingPath } from "@/lib/listings/listing-path";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const access = await requireFullCustomerUser();
  if (access.denied) return access.denied;
  const user = access.user;

  const items = await prisma.propertyMonitor.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const enrich = new URL(request.url).searchParams.get("enrich") === "1";
  if (!enrich) {
    return NextResponse.json({ items });
  }

  const listings = await prisma.listing.findMany({
    where: { mlsNumber: { in: items.map((item) => item.mlsNumber) } },
    select: {
      mlsNumber: true,
      addressLine: true,
      unitNumber: true,
      city: true,
    },
  });
  const byMls = new Map(listings.map((l) => [l.mlsNumber, l]));

  return NextResponse.json({
    items: items.map((item) => {
      const listing = byMls.get(item.mlsNumber);
      return {
        ...item,
        addressLine: listing?.addressLine,
        unitNumber: listing?.unitNumber ?? null,
        city: listing?.city,
      };
    }),
  });
}

const postSchema = z.object({
  mlsNumber: z.string().trim().min(1),
  emailAlerts: z.boolean().optional(),
});

export async function POST(request: Request) {
  const access = await requireFullCustomerUser();
  if (access.denied) return access.denied;
  const user = access.user;

  const parsed = postSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid listing." }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({
    where: { mlsNumber: parsed.data.mlsNumber },
    select: {
      mlsNumber: true,
      addressLine: true,
      unitNumber: true,
      city: true,
      listPrice: true,
      status: true,
      ownerStatus: true,
    },
  });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  const item = await prisma.propertyMonitor.upsert({
    where: {
      userId_mlsNumber: {
        userId: user.id,
        mlsNumber: listing.mlsNumber,
      },
    },
    create: {
      userId: user.id,
      mlsNumber: listing.mlsNumber,
      emailAlerts: parsed.data.emailAlerts ?? true,
      lastKnownPrice: listing.listPrice,
      lastKnownStatus: listing.status,
      lastKnownOwnerStatus: listing.ownerStatus,
    },
    update: {
      emailAlerts: parsed.data.emailAlerts ?? true,
      lastKnownPrice: listing.listPrice,
      lastKnownStatus: listing.status,
      lastKnownOwnerStatus: listing.ownerStatus,
    },
  });

  void recordActivityEvent({
    type: "WATCH_PROPERTY",
    userId: user.id,
    mlsNumber: listing.mlsNumber,
    path: listingPath(listing),
    title: `Watching ${listing.mlsNumber}`,
  });

  return NextResponse.json({ ok: true, item });
}

const deleteSchema = z.object({
  mlsNumber: z.string().trim().min(1),
});

export async function DELETE(request: Request) {
  const access = await requireFullCustomerUser();
  if (access.denied) return access.denied;
  const user = access.user;

  const parsed = deleteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid listing." }, { status: 400 });
  }

  await prisma.propertyMonitor.deleteMany({
    where: { userId: user.id, mlsNumber: parsed.data.mlsNumber },
  });

  return NextResponse.json({ ok: true });
}
