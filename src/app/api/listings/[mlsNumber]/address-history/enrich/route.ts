import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasFullClientAccess } from "@/lib/account-access";
import { authorizeHistoryRowsForClient } from "@/lib/listings/build-listing-panel";
import {
  enrichAddressListingHistory,
  loadListingForAddressHistory,
} from "@/lib/proptx/address-history-enrich";
import { prisma } from "@/lib/prisma";
import {
  buildAddressListingHistoryRows,
  findSiblingListingsAtAddress,
} from "@/lib/listings/address-history";
import { loadListingDetailApiAccess } from "@/lib/listings/listing-detail-api-access";
import type { HistoryRow } from "@/lib/listings/history-rows";

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

function authorizeRows(
  rows: HistoryRow[],
  listing: {
    listPrice: number;
    status: string;
    soldPrice: number | null;
  },
  canSeeRestricted: boolean,
): HistoryRow[] {
  return authorizeHistoryRowsForClient(rows, {
    canSeeRestricted,
    listPrice: listing.listPrice,
    status: listing.status,
  });
}

/** Current Neon address history (no PropTx). Authorized + redacted. */
export async function GET(_request: Request, { params }: Params) {
  const { mlsNumber: raw } = await params;
  const gated = await loadListingDetailApiAccess(raw);
  if (!gated.ok) return gated.response;

  const listing = await loadListingForAddressHistory(gated.listing.mlsNumber);
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
  const siblings = await findSiblingListingsAtAddress(listing);
  const soldPrice = gated.access.canSeeRestricted ? listing.soldPrice : null;
  const historyRows = authorizeRows(
    buildAddressListingHistoryRows({
      mlsNumber: listing.mlsNumber,
      listPrice: listing.listPrice,
      listedAt: listing.listedAt,
      updatedAtMls: listing.updatedAtMls,
      soldAt: listing.soldAt,
      soldPrice,
      status: listing.status,
      transactionType: listing.transactionType,
      history: listing.history,
      siblings,
    }),
    listing,
    gated.access.canSeeRestricted,
  );
  return NextResponse.json(
    {
      historyRows,
      enrichedAt: listing.addressHistoryEnrichedAt?.toISOString() ?? null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/**
 * Pull PropTx sibling cycles at this address into Neon.
 * VOW-gated; response history rows are redacted for non-clients.
 * Listing page / panel call this after paint — never blocks SSR.
 */
export async function POST(request: Request, { params }: Params) {
  const { mlsNumber: raw } = await params;
  const gated = await loadListingDetailApiAccess(raw);
  if (!gated.ok) return gated.response;

  const listing = await loadListingForAddressHistory(gated.listing.mlsNumber);
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
  const historyRows = authorizeRows(
    result.historyRows,
    listing,
    gated.access.canSeeRestricted,
  );

  return NextResponse.json({
    ok: result.ok,
    skipped: result.skipped,
    upsertedMls: result.upsertedMls,
    historyRows,
  });
}
