import { NextResponse } from "next/server";
import { getListingProvider } from "@/lib/listings/provider";
import { resolveListingGalleryPhotos } from "@/lib/listings/resolve-gallery";

type Params = { params: Promise<{ mlsNumber: string }> };

/** Live PropTx gallery — separate from listing HTML so SSR cannot 1102. */
export async function GET(_request: Request, { params }: Params) {
  const { mlsNumber } = await params;
  const listing = await getListingProvider().getByMls(mlsNumber);
  if (!listing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const photos = await resolveListingGalleryPhotos(listing, {
    preferLive: true,
    timeoutMs: 8_000,
    max: 60,
  });

  return NextResponse.json(
    { photos },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
