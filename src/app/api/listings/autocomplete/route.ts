import { NextResponse } from "next/server";
import type { ListingTransactionType } from "@prisma/client";
import { getListingProvider } from "@/lib/listings/provider";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const transactionParam = searchParams.get("transactionType");
  const transactionType =
    transactionParam === "SALE" || transactionParam === "LEASE"
      ? (transactionParam as ListingTransactionType)
      : undefined;

  const provider = getListingProvider();
  const suggestions = await provider.autocomplete(q, { transactionType });
  return NextResponse.json({ suggestions, provider: provider.name });
}
