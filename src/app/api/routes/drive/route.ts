import { NextResponse } from "next/server";
import { requireCustomerUser } from "@/lib/account";
import { isGoogleRoutesEnabled } from "@/lib/google/billing-guard";
import { computeDriveRoute } from "@/lib/google/routes";

function parseCoord(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function POST(request: Request) {
  if (!isGoogleRoutesEnabled()) {
    return NextResponse.json(
      { error: "Drive time is using the local estimate." },
      { status: 503 },
    );
  }

  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const originLat = parseCoord(payload.originLat);
  const originLng = parseCoord(payload.originLng);
  const destLat = parseCoord(payload.destLat);
  const destLng = parseCoord(payload.destLng);

  if (
    originLat == null ||
    originLng == null ||
    destLat == null ||
    destLng == null
  ) {
    return NextResponse.json(
      {
        error:
          "originLat, originLng, destLat, and destLng are required numbers.",
      },
      { status: 400 },
    );
  }

  if (
    Math.abs(originLat) > 90 ||
    Math.abs(destLat) > 90 ||
    Math.abs(originLng) > 180 ||
    Math.abs(destLng) > 180
  ) {
    return NextResponse.json(
      { error: "Coordinates are out of range." },
      { status: 400 },
    );
  }

  try {
    const route = await computeDriveRoute({
      originLat,
      originLng,
      destLat,
      destLng,
    });
    return NextResponse.json(route);
  } catch (error) {
    console.error("[routes/drive]", error);
    const raw =
      error instanceof Error
        ? error.message
        : "Could not calculate drive time.";
    const capped = raw.includes("free cap reached");
    const keyBlocked = /are blocked|PERMISSION_DENIED|API_KEY_SERVICE_BLOCKED/i.test(
      raw,
    );
    return NextResponse.json(
      {
        error: capped
          ? "Drive time is using the local estimate."
          : keyBlocked
            ? "This Google Maps API key blocks Routes. In Google Cloud → Credentials → your key → API restrictions, add “Routes API” (not only Places), save, then wait a minute and try again."
            : raw,
      },
      { status: capped ? 429 : 502 },
    );
  }
}
