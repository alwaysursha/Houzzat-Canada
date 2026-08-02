import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { recordActivityEvent } from "@/lib/analytics/record-activity";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const mlsNumber = new URL(request.url).searchParams.get("mlsNumber");
  if (mlsNumber) {
    const item = await prisma.savedListing.findUnique({
      where: {
        userId_mlsNumber: { userId: user.id, mlsNumber },
      },
      select: { id: true },
    });
    return NextResponse.json({ saved: Boolean(item) });
  }

  const saved = await prisma.savedListing.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const enrich = new URL(request.url).searchParams.get("enrich") === "1";
  if (!enrich) {
    return NextResponse.json({ items: saved });
  }

  const listings = await prisma.listing.findMany({
    where: { mlsNumber: { in: saved.map((s) => s.mlsNumber) } },
    select: {
      mlsNumber: true,
      addressLine: true,
      unitNumber: true,
      city: true,
      listPrice: true,
      transactionType: true,
    },
  });
  const byMls = new Map(listings.map((l) => [l.mlsNumber, l]));

  return NextResponse.json({
    items: saved.map((row) => {
      const listing = byMls.get(row.mlsNumber);
      return {
        ...row,
        addressLine: listing?.addressLine,
        unitNumber: listing?.unitNumber ?? null,
        city: listing?.city,
        listPrice: listing?.listPrice,
        transactionType: listing?.transactionType,
      };
    }),
  });
}

const postSchema = z.object({
  mlsNumber: z.string().min(3).max(32),
});

export async function POST(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = await request.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid listing." }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({
    where: { mlsNumber: parsed.data.mlsNumber },
    select: { mlsNumber: true },
  });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  const item = await prisma.savedListing.upsert({
    where: {
      userId_mlsNumber: {
        userId: user.id,
        mlsNumber: listing.mlsNumber,
      },
    },
    update: {},
    create: {
      userId: user.id,
      mlsNumber: listing.mlsNumber,
    },
  });

  void recordActivityEvent({
    type: "SAVE_LISTING",
    userId: user.id,
    mlsNumber: listing.mlsNumber,
    path: `/listing/${listing.mlsNumber}`,
    title: `Saved ${listing.mlsNumber}`,
  });

  return NextResponse.json({ ok: true, item });
}

const deleteSchema = z.object({
  mlsNumber: z.string().min(3).max(32),
});

export async function DELETE(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = await request.json();
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid listing." }, { status: 400 });
  }

  await prisma.savedListing.deleteMany({
    where: { userId: user.id, mlsNumber: parsed.data.mlsNumber },
  });

  void recordActivityEvent({
    type: "UNSAVE_LISTING",
    userId: user.id,
    mlsNumber: parsed.data.mlsNumber,
    path: `/listing/${parsed.data.mlsNumber}`,
    title: `Unsaved ${parsed.data.mlsNumber}`,
  });

  return NextResponse.json({ ok: true });
}
