import { NextResponse } from "next/server";
import { photonAddressAutocomplete } from "@/lib/geo/photon-autocomplete";
import { googlePlacesAutocomplete } from "@/lib/google/places";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const sessionToken = searchParams.get("sessionToken") ?? undefined;

  if (q.trim().length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  // Prefer Google Places when the key works; fall back to Photon so Sell a Home
  // still shows address hints if billing / Places API permission is missing.
  if (process.env.GOOGLE_MAPS_API_KEY?.trim()) {
    try {
      const suggestions = await googlePlacesAutocomplete(q, { sessionToken });
      if (suggestions.length > 0) {
        return NextResponse.json({ suggestions, provider: "google" });
      }
    } catch (error) {
      console.error("[places/autocomplete] google", error);
    }
  }

  try {
    const suggestions = await photonAddressAutocomplete(q);
    return NextResponse.json({ suggestions, provider: "photon" });
  } catch (error) {
    console.error("[places/autocomplete] photon", error);
    return NextResponse.json(
      {
        error: "Could not fetch address suggestions.",
        suggestions: [],
      },
      { status: 502 },
    );
  }
}
