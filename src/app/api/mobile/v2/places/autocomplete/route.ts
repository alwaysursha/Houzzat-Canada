/**
 * Stage 5.6 — GET /api/mobile/v2/places/autocomplete?q=
 */
import { NextResponse } from "next/server";
import { photonAddressAutocomplete } from "@/lib/geo/photon-autocomplete";
import { googlePlacesAutocomplete } from "@/lib/google/places";
import { authenticateMobileRequest } from "@/lib/mobile/v2/auth-guard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = authenticateMobileRequest(request, "mobile_workspace_access");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, code: "AUTH_REQUIRED", message: auth.error },
      { status: auth.status },
    );
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  if (q.trim().length < 2) {
    return NextResponse.json({ ok: true, suggestions: [] });
  }

  const googleEnabled =
    process.env.GOOGLE_MAPS_BILLING_ENABLED === "1" &&
    process.env.GOOGLE_PLACES_AUTOCOMPLETE === "1" &&
    Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());

  try {
    const suggestions = await photonAddressAutocomplete(q);
    if (suggestions.length > 0 || !googleEnabled) {
      return NextResponse.json({
        ok: true,
        suggestions: suggestions.map((s) => ({
          placeId: s.placeId ?? null,
          label: s.label,
          subtitle: s.subtitle ?? null,
          city: s.city ?? null,
          province: s.province ?? null,
          lat: s.lat ?? null,
          lng: s.lng ?? null,
        })),
        provider: "photon",
      });
    }
  } catch (error) {
    console.error("[mobile/places/autocomplete] photon", error);
    if (!googleEnabled) {
      return NextResponse.json(
        { ok: false, code: "AUTOCOMPLETE_FAILED", message: "Could not fetch suggestions" },
        { status: 502 },
      );
    }
  }

  if (googleEnabled) {
    try {
      const suggestions = await googlePlacesAutocomplete(q);
      return NextResponse.json({
        ok: true,
        suggestions: suggestions.map((s) => ({
          placeId: s.placeId,
          label: s.label,
          subtitle: s.subtitle ?? null,
          city: s.city ?? null,
          province: s.province ?? null,
          lat: s.lat ?? null,
          lng: s.lng ?? null,
        })),
        provider: "google",
      });
    } catch (error) {
      console.error("[mobile/places/autocomplete] google", error);
    }
  }

  return NextResponse.json(
    { ok: false, code: "AUTOCOMPLETE_FAILED", message: "Could not fetch suggestions" },
    { status: 502 },
  );
}
