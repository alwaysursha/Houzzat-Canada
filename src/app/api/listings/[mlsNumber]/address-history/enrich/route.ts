import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasFullClientAccess } from "@/lib/account-access";
import { authorizeHistoryRowsForClient } from "@/lib/listings/build-listing-panel";
import {
  loadListingForAddressHistory,
  previewAddressListingHistory,
} from "@/lib/proptx/address-history-enrich";
import { prisma } from "@/lib/prisma";
import {
  buildAddressListingHistoryRows,
  findSiblingListingsAtAddress,
} from "@/lib/listings/address-history";
import { loadListingDetailApiAccess } from "@/lib/listings/listing-detail-api-access";
import { mayInvokePropTxOnDemandForDetail } from "@/lib/listings/load-listing-for-detail";
import type { HistoryRow } from "@/lib/listings/history-rows";
import { classifyListingInventoryChannel } from "@/lib/tenancy/listing-entitlement";

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
export async function GET(request: Request, { params }: Params) {
  const { mlsNumber: raw } = await params;
  const gated = await loadListingDetailApiAccess(raw, request, {
    additionalCapabilities: ["HISTORY"],
    entitlementFilteringEnabled: true,
  });
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
 * Read PropTx sibling cycles for the customer panel.
 * Does not upsert listings, write history, update Typesense, or stamp
 * addressHistoryEnrichedAt. The Sync Mac nightly job persists that state.
 */
export async function POST(request: Request, { params }: Params) {
  const { mlsNumber: raw } = await params;
  const gated = await loadListingDetailApiAccess(raw, request, {
    additionalCapabilities: ["HISTORY"],
    entitlementFilteringEnabled: true,
  });
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

  const channel = classifyListingInventoryChannel(gated.listing.dataSource);
  const orgId = gated.listing.organizationId?.trim() ?? "";
  const mayPropTx =
    channel !== "mls" ||
    (Boolean(orgId) &&
      mayInvokePropTxOnDemandForDetail({
        entitlementFilteringEnabled: true,
        entitlement: gated.entitlement,
        requiredCapability: "HISTORY",
        propTxOrganizationId: orgId,
      }));

  if (!mayPropTx) {
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
    return NextResponse.json({
      ok: false,
      skipped: true,
      upsertedMls: [] as string[],
      historyRows,
    });
  }

  const result = await previewAddressListingHistory(listing, { force });
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
