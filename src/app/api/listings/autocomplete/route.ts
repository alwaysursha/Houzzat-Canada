import { NextResponse } from "next/server";
import type { ListingTransactionType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { getListingProvider } from "@/lib/listings/provider";
import type { AutocompleteSuggestionGroup } from "@/lib/listings/types";
import { prisma } from "@/lib/prisma";
import { mlsClientGate } from "@/lib/proptx/mls-gate";
import { hasClientAccess } from "@/lib/vow";

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
        select: { id: true },
      })
    : null;
  const isClient = hasClientAccess(user);

  const provider = getListingProvider();
  let suggestions = await provider.autocomplete(q, {
    transactionType,
    empty,
  });

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
  });
}
