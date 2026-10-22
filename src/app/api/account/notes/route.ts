import { NextResponse } from "next/server";
import { requireFullCustomerUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { withStagingSnapshotBoundary } from "@/lib/tenancy/templates/high-octane-staging-snapshot";
import { stagingSnapshotVisibleForServerPage } from "@/lib/tenancy/templates/high-octane-staging-snapshot-request";

export async function GET() {
  const access = await requireFullCustomerUser();
  if (access.denied) return access.denied;
  const user = access.user;

  const notes = await prisma.listingNote.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });

  const listings = await prisma.listing.findMany({
    where: withStagingSnapshotBoundary(
      { mlsNumber: { in: notes.map((n) => n.mlsNumber) } },
      await stagingSnapshotVisibleForServerPage(),
    ),
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
