import { NextResponse } from "next/server";
import { loadListingAccountChrome } from "@/lib/listings/load-listing-account-chrome";

type Params = { params: Promise<{ mlsNumber: string }> };

/** Signed-in listing chrome — private, after paint. */
export async function GET(_request: Request, { params }: Params) {
  const { mlsNumber: raw } = await params;
  const mlsNumber = decodeURIComponent(raw).trim().toUpperCase();
  if (!mlsNumber) {
    return NextResponse.json({ error: "Missing MLS number" }, { status: 400 });
  }

  try {
    const chrome = await loadListingAccountChrome(mlsNumber);
    return NextResponse.json(chrome, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to load listing account chrome" },
      { status: 500 },
    );
  }
}
