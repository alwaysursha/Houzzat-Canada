import { NextResponse } from "next/server";
import { toCard } from "@/lib/listings/provider";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { mlsClientGate } from "@/lib/proptx/mls-gate";
import {
  buildPrismaEntitledInventoryWhere,
  resolveListingEntitlementContextForRequest,
} from "@/lib/tenancy/listing-entitlement";
import { hasClientAccess } from "@/lib/vow";

/**
 * Batch listing cards by MLS number.
 *
 * G.10C3: Host → G.7C/G.10A once → capability-scoped Prisma inventory filter.
 * Input MLS IDs never grant authority. Unauthorized / missing-provenance MLS
 * rows are omitted (no per-ID existence oracle). Order preserved for survivors.
 * Neon-only (no PropTx). VOW redaction after board filter.
 */
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

  // Never trust client workspaceId / org / provider / SAK.
  const { entitlement } =
    await resolveListingEntitlementContextForRequest(request);

  // Mixed-status batch: ACTIVE_LISTINGS vs SOLD branches (no capability union).
  // Empty authorities → FSBO-only branch (zero MLS).
  const inventory = buildPrismaEntitledInventoryWhere({
    entitlement,
    statuses: null,
  });
  if (inventory.kind === "empty") {
    return NextResponse.json({ items: [] });
  }

  const session = await auth();
  const accessUser = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, emailVerified: true, createdAt: true },
      })
    : null;
  const canSeeSold = hasClientAccess(accessUser);

  const listings = await prisma.listing.findMany({
    where: {
      AND: [{ mlsNumber: { in: mlsNumbers } }, inventory.where],
    },
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
