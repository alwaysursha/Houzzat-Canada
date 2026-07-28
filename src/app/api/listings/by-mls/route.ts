import { NextResponse } from "next/server";
import { toCard } from "@/lib/listings/provider";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { mlsClientGate } from "@/lib/proptx/mls-gate";
import { hasClientAccess } from "@/lib/vow";

export async function GET(request: Request) {
  const gated = await mlsClientGate();
  if (gated) return gated;

  const ids = new URL(request.url).searchParams.get("ids");
  if (!ids?.trim()) {
    return NextResponse.json({ items: [] });
  }

  const mlsNumbers = [
    ...new Set(
      ids
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 40),
    ),
  ];

  if (mlsNumbers.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const session = await auth();
  const canSeeSold = hasClientAccess(
    session?.user?.id ? { id: session.user.id } : null,
  );

  const listings = await prisma.listing.findMany({
    where: { mlsNumber: { in: mlsNumbers } },
    include: { media: true, openHouses: true },
  });
  const byMls = new Map(listings.map((listing) => [listing.mlsNumber, listing]));

  const items = mlsNumbers
    .map((mls) => byMls.get(mls))
    .filter(Boolean)
    .map((listing) => {
      const card = toCard(listing!);
      if (!canSeeSold) {
        return { ...card, soldPrice: null };
      }
      return card;
    });

  return NextResponse.json({ items });
}
