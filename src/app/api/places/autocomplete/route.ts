import { NextResponse } from "next/server";
import { googlePlacesAutocomplete } from "@/lib/google/places";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const sessionToken = searchParams.get("sessionToken") ?? undefined;

  if (!process.env.GOOGLE_MAPS_API_KEY?.trim()) {
    return NextResponse.json(
      {
        error: "Google Places is not configured. Set GOOGLE_MAPS_API_KEY.",
        suggestions: [],
      },
      { status: 503 },
    );
  }

  try {
    const suggestions = await googlePlacesAutocomplete(q, { sessionToken });
    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("[places/autocomplete]", error);
    return NextResponse.json(
      {
        error: "Could not fetch address suggestions.",
        suggestions: [],
      },
      { status: 502 },
    );
  }
}
