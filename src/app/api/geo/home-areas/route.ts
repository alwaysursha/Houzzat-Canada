import { NextResponse } from "next/server";
import { loadHomeAreaStats } from "@/lib/geo/home-area-stats";

/**
 * Homepage Explore Areas stats — public, short CDN TTL.
 * Kept off the homepage RSC critical path.
 */
export async function GET() {
  try {
    const places = await loadHomeAreaStats();
    return NextResponse.json(
      { places },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=90, stale-while-revalidate=300",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { places: [], error: "Failed to load area stats" },
      { status: 500 },
    );
  }
}
