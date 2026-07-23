import { NextResponse } from "next/server";
import { getListingProvider } from "@/lib/listings/provider";

type Params = { params: Promise<{ mlsNumber: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { mlsNumber } = await params;
  const provider = getListingProvider();
  const listing = await provider.getByMls(mlsNumber);

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  return NextResponse.json({ listing, provider: provider.name });
}
