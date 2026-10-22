import { NextResponse } from "next/server";
import type { ListingTransactionType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { isOnMarketListingStatus } from "@/lib/listings/constants";
import { getListingProvider } from "@/lib/listings/provider";
import type { AutocompleteSuggestionGroup } from "@/lib/listings/types";
import { prisma } from "@/lib/prisma";
import { mlsClientGate } from "@/lib/proptx/mls-gate";
import { resolveClientAccess } from "@/lib/account-access";
import { resolveListingEntitlementContextForRequest } from "@/lib/tenancy/listing-entitlement";
import { stagingSnapshotVisibleFromResolution } from "@/lib/tenancy/templates/high-octane-staging-snapshot-request";

export async function GET(request: Request) {
  const gated = await mlsClientGate();
  if (gated) return gated;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const empty = searchParams.get("empty") === "1";
  const transactionParam = searchParams.get("transactionType");
  const transactionType =
    transactionParam === "SALE" || transactionParam === "LEASE"
      ? (transactionParam as ListingTransactionType)
      : undefined;

  const session = await auth();
  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, emailVerified: true, createdAt: true },
      })
    : null;
  const access = resolveClientAccess(user);
  const isClient = access.hasClientAccess;

  const cityBias = searchParams.get("city");
  const latRaw = searchParams.get("lat");
  const lngRaw = searchParams.get("lng");
  const lat = latRaw != null ? Number(latRaw) : null;
  const lng = lngRaw != null ? Number(lngRaw) : null;

  const provider = getListingProvider();
  const context = await resolveListingEntitlementContextForRequest(request);
  const { entitlement } = context;
  // G.10B3B: web-only force-enable for listing autocomplete (Places/geo unaffected).
  let suggestions = await provider.autocomplete(q, {
    transactionType,
    empty,
    city: cityBias,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    entitlement,
    entitlementFilteringEnabled: true,
    stagingSnapshotVisible: stagingSnapshotVisibleFromResolution(
      context.resolution,
    ),
  });

  if (!isClient) {
    suggestions = suggestions.map((s) => {
      if (s.type !== "listing" && s.type !== "mls") return s;
      // On-market (Active + Sold/Leased Conditional) keep public list price.
      // Off-market / firm sold still redact for IDX visitors.
      if (s.status && !isOnMarketListingStatus(s.status)) {
        return {
          ...s,
          listPrice: undefined,
          beds: undefined,
          baths: undefined,
        };
      }
      return s;
    });
  }

  const groups: Partial<
    Record<AutocompleteSuggestionGroup, typeof suggestions>
  > = {};
  for (const suggestion of suggestions) {
    const key = suggestion.group ?? "listings";
    if (!groups[key]) groups[key] = [];
    groups[key]!.push(suggestion);
  }

  return NextResponse.json({
    suggestions,
    groups,
    provider: provider.name,
    hasClientAccess: access.hasClientAccess,
    needsEmailVerification: access.needsEmailVerification,
  });
}
