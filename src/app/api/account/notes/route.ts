import { NextResponse } from "next/server";
import { requireCustomerUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const notes = await prisma.listingNote.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });

  const listings = await prisma.listing.findMany({
    where: { mlsNumber: { in: notes.map((n) => n.mlsNumber) } },
    select: {
      mlsNumber: true,
      addressLine: true,
      unitNumber: true,
      city: true,
    },
  });
  const byMls = new Map(listings.map((l) => [l.mlsNumber, l]));

  const items = notes.map((note) => {
    const listing = byMls.get(note.mlsNumber);
    return {
      id: note.id,
      mlsNumber: note.mlsNumber,
      body: note.body,
      updatedAt: note.updatedAt,
      addressLine: listing?.addressLine,
      unitNumber: listing?.unitNumber ?? null,
      city: listing?.city,
    };
  });

  return NextResponse.json({ items });
}
