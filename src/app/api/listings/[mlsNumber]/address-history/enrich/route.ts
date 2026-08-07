import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasFullClientAccess } from "@/lib/account-access";
import {
  enrichAddressListingHistory,
  loadListingForAddressHistory,
} from "@/lib/proptx/address-history-enrich";
import { prisma } from "@/lib/prisma";
import {
  buildAddressListingHistoryRows,
  findSiblingListingsAtAddress,
} from "@/lib/listings/address-history";

type Params = { params: Promise<{ mlsNumber: string }> };

async function canForceEnrich(): Promise<boolean> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return false;
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true, createdAt: true },
  });
  return Boolean(user && hasFullClientAccess(user));
}

/** Current Neon address history (no PropTx). */
export async function GET(_request: Request, { params }: Params) {
  const { mlsNumber: raw } = await params;
  const mlsNumber = decodeURIComponent(raw).trim().toUpperCase();
  const listing = await loadListingForAddressHistory(mlsNumber);
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
  const siblings = await findSiblingListingsAtAddress(listing);
  const historyRows = buildAddressListingHistoryRows({
    mlsNumber: listing.mlsNumber,
    listPrice: listing.listPrice,
    listedAt: listing.listedAt,
    updatedAtMls: listing.updatedAtMls,
    soldAt: listing.soldAt,
    soldPrice: listing.soldPrice,
    status: listing.status,
    transactionType: listing.transactionType,
    history: listing.history,
    siblings,
  });
  return NextResponse.json({
    historyRows,
    enrichedAt: listing.addressHistoryEnrichedAt?.toISOString() ?? null,
  });
}

/**
 * Pull PropTx sibling cycles at this address into Neon.
 * Public — any listing visitor can trigger (24h TTL). Restricted
 * prices/MLS#s stay gated in the UI via HistoryRow.public + canSeeRestricted.
 * Listing page calls this after paint — never blocks SSR.
 */
export async function POST(request: Request, { params }: Params) {
  const { mlsNumber: raw } = await params;
  const mlsNumber = decodeURIComponent(raw).trim().toUpperCase();
  const listing = await loadListingForAddressHistory(mlsNumber);
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  let forceRequested = false;
  try {
    const body = (await request.json()) as { force?: boolean };
    forceRequested = body.force === true;
  } catch {
    forceRequested = false;
  }
  const force = forceRequested ? await canForceEnrich() : false;

  const result = await enrichAddressListingHistory(listing, { force });
  return NextResponse.json({
    ok: result.ok,
    skipped: result.skipped,
    upsertedMls: result.upsertedMls,
    historyRows: result.historyRows,
  });
}
