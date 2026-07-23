import { NextResponse } from "next/server";
import { getListingProvider } from "@/lib/listings/provider";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const provider = getListingProvider();
  const items = await provider.openHouses({
    city: searchParams.get("city") ?? undefined,
    community: searchParams.get("community") ?? undefined,
  });
  return NextResponse.json({ items, provider: provider.name });
}
