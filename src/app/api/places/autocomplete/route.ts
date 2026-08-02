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

  // Photon first (free). Google requires BOTH billing kill-switch + Places opt-in.
  const googleEnabled =
    process.env.GOOGLE_MAPS_BILLING_ENABLED === "1" &&
    process.env.GOOGLE_PLACES_AUTOCOMPLETE === "1" &&
    Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());

  try {
    const suggestions = await photonAddressAutocomplete(q);
    if (suggestions.length > 0 || !googleEnabled) {
      return NextResponse.json({ suggestions, provider: "photon" });
    }
  } catch (error) {
    console.error("[places/autocomplete] photon", error);
    if (!googleEnabled) {
      return NextResponse.json(
        {
          error: "Could not fetch address suggestions.",
          suggestions: [],
        },
        { status: 502 },
      );
    }
  }

  if (googleEnabled) {
    try {
      const suggestions = await googlePlacesAutocomplete(q, { sessionToken });
      return NextResponse.json({ suggestions, provider: "google" });
    } catch (error) {
      console.error("[places/autocomplete] google", error);
      return NextResponse.json(
        {
          error: "Could not fetch address suggestions.",
          suggestions: [],
        },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ suggestions: [], provider: "photon" });
}
