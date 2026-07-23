import { NextResponse } from "next/server";
import { getListingProvider } from "@/lib/listings/provider";

export async function GET() {
  const provider = getListingProvider();
  const status = await provider.syncStatus();
  return NextResponse.json(status);
}
