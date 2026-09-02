/**
 * Stage 5.6 — POST /api/mobile/v2/places/geocode
 * Geocode a typed address for Viewings Planner start location.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { googlePlaceDetails, googlePlacesAutocomplete } from "@/lib/google/places";
import { authenticateMobileRequest } from "@/lib/mobile/v2/auth-guard";

export const runtime = "nodejs";

const schema = z.object({
  query: z.string().trim().min(3).max(240).optional(),
  placeId: z.string().trim().min(3).max(128).optional(),
}).refine((v) => Boolean(v.query || v.placeId), {
  message: "query or placeId required",
});

export async function POST(request: Request) {
  const auth = authenticateMobileRequest(request, "mobile_workspace_access");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, code: "AUTH_REQUIRED", message: auth.error },
      { status: auth.status },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "VALIDATION_ERROR", message: "Invalid JSON" },
      { status: 400 },
    );
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION_ERROR", message: "Invalid query" },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.placeId) {
      const details = await googlePlaceDetails(parsed.data.placeId);
      if (!details || details.lat == null || details.lng == null) {
        return NextResponse.json(
          { ok: false, code: "NOT_FOUND", message: "Could not resolve coordinates" },
          { status: 404 },
        );
      }
      const address =
        details.subtitle ||
        [details.label, details.city, details.province].filter(Boolean).join(", ");
      return NextResponse.json({
        ok: true,
        result: {
          startAddress: address,
          startLat: details.lat,
          startLng: details.lng,
        },
      });
    }

    const query = parsed.data.query!;
    const suggestions = await googlePlacesAutocomplete(query);
    const first = suggestions[0];
    if (!first?.placeId) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", message: "Address not found" },
        { status: 404 },
      );
    }

    const details = await googlePlaceDetails(first.placeId);
    if (!details || details.lat == null || details.lng == null) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", message: "Could not resolve coordinates" },
        { status: 404 },
      );
    }

    const address =
      details.label ||
      [first.label, first.city, first.province].filter(Boolean).join(", ");

    return NextResponse.json({
      ok: true,
      result: {
        startAddress: address,
        startLat: details.lat,
        startLng: details.lng,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Geocode failed";
    return NextResponse.json(
      { ok: false, code: "GEOCODE_FAILED", message },
      { status: 502 },
    );
  }
}
