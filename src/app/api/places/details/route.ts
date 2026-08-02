import { NextResponse } from "next/server";
import { googlePlaceDetails } from "@/lib/google/places";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get("placeId") ?? "";
  const sessionToken = searchParams.get("sessionToken") ?? undefined;

  if (!placeId) {
    return NextResponse.json({ error: "placeId is required" }, { status: 400 });
  }

  if (
    process.env.GOOGLE_MAPS_BILLING_ENABLED !== "1" ||
    process.env.GOOGLE_PLACES_AUTOCOMPLETE !== "1" ||
    !process.env.GOOGLE_MAPS_API_KEY?.trim()
  ) {
    return NextResponse.json(
      {
        error:
          "Google Places details are disabled (billing kill-switch). Set GOOGLE_MAPS_BILLING_ENABLED=1 and GOOGLE_PLACES_AUTOCOMPLETE=1 only if you accept Google Cloud charges.",
      },
      { status: 503 },
    );
  }

  try {
    const place = await googlePlaceDetails(placeId, { sessionToken });
    if (!place) {
      return NextResponse.json({ error: "Place not found" }, { status: 404 });
    }
    return NextResponse.json({ place });
  } catch (error) {
    console.error("[places/details]", error);
    return NextResponse.json(
      { error: "Could not resolve address details." },
      { status: 502 },
    );
  }
}
