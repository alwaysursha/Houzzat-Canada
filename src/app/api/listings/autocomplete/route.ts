import { NextResponse } from "next/server";
import type { ListingTransactionType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { getListingProvider } from "@/lib/listings/provider";
import type { AutocompleteSuggestionGroup } from "@/lib/listings/types";
import { prisma } from "@/lib/prisma";
import {
  clientIpFromRequest,
  lookupAndUpsertOnDemand,
} from "@/lib/proptx/on-demand-lookup";
import { mlsClientGate } from "@/lib/proptx/mls-gate";
import { resolveClientAccess } from "@/lib/account-access";

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
        where: { email: session.user.email },
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
  let suggestions = await provider.autocomplete(q, {
    transactionType,
    empty,
    city: cityBias,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  });

  // Neon miss: kick off PropTx pull in the background so typing stays snappy.
  // Blocking on-demand lookup made the dropdown lag / never open while typing.
  const listingHits = suggestions.filter(
    (s) => s.type === "listing" || s.type === "mls",
  );
  if (!empty && q.trim() && listingHits.length === 0) {
    const clientIp = clientIpFromRequest(request);
    void lookupAndUpsertOnDemand(q, { clientIp }).catch(() => {
      // Best-effort warm of Neon — autocomplete already returned.
    });
  }

  if (!isClient) {
    suggestions = suggestions.map((s) => {
      if (s.type !== "listing" && s.type !== "mls") return s;
      if (s.status && s.status !== "ACTIVE") {
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
