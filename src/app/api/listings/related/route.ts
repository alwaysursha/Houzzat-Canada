import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { toCard } from "@/lib/listings/provider";
import { prisma } from "@/lib/prisma";
import { mlsClientGate } from "@/lib/proptx/mls-gate";
import { hasClientAccess } from "@/lib/vow";

export async function GET(request: Request) {
  const gated = await mlsClientGate();
  if (gated) return gated;

  const { searchParams } = new URL(request.url);
  const mlsNumber = searchParams.get("mlsNumber")?.trim();
  const modeParam = searchParams.get("mode");
  const tabParam = searchParams.get("tab");
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") ?? 8), 1),
    24,
  );

  const mode =
    modeParam === "same-features" ? "same-features" : "same-area";
  const tab = tabParam === "sold" ? "sold" : "for-sale";

  if (!mlsNumber) {
    return NextResponse.json(
      { error: "mlsNumber is required." },
      { status: 400 },
    );
  }

  const subject = await prisma.listing.findUnique({
    where: { mlsNumber },
    select: {
      mlsNumber: true,
      city: true,
      community: true,
      propertyType: true,
      beds: true,
      baths: true,
      segment: true,
      transactionType: true,
    },
  });

  if (!subject) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  const session = await auth();
  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, emailVerified: true, createdAt: true },
      })
    : null;
  const isClient = hasClientAccess(user);

  const where: Prisma.ListingWhereInput = {
    mlsNumber: { not: mlsNumber },
    status: tab === "sold" ? "SOLD" : "ACTIVE",
    segment: subject.segment,
    city: { equals: subject.city, mode: "insensitive" },
  };

  where.transactionType = subject.transactionType;

  if (subject.community) {
    where.community = { equals: subject.community, mode: "insensitive" };
  }

  if (mode === "same-features") {
    where.propertyType = subject.propertyType;
    // Match whole beds (3.0 and 3 stay together).
    where.beds = { gte: Math.floor(subject.beds), lt: Math.floor(subject.beds) + 1 };
  }

  const rows = await prisma.listing.findMany({
    where,
    include: {
      media: true,
      openHouses: true,
    },
    orderBy:
      tab === "sold"
        ? [
            { soldAt: { sort: "desc", nulls: "last" } },
            { updatedAtMls: "desc" },
            { mlsNumber: "desc" },
          ]
        : [
            { listedAt: "desc" },
            { daysOnMarket: "asc" },
            { updatedAtMls: "desc" },
            { mlsNumber: "desc" },
          ],
    take: limit,
  });

  let items = rows.map(toCard);
  if (!isClient) {
    items = items.map((item) => ({ ...item, soldPrice: null }));
  }

  return NextResponse.json({
    mode,
    tab,
    subject: {
      mlsNumber: subject.mlsNumber,
      city: subject.city,
      community: subject.community,
      propertyType: subject.propertyType,
      beds: subject.beds,
    },
    items,
    total: items.length,
  });
}
