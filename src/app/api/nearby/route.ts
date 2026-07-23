import { NextResponse } from "next/server";
import type { PoiType } from "@prisma/client";
import { findNearbyPois } from "@/lib/poi/nearby";

const VALID: PoiType[] = ["SCHOOL", "PARK", "TRANSIT", "GROCERY", "OTHER"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "lat and lng are required" },
      { status: 400 },
    );
  }

  const radiusKm = searchParams.get("radius")
    ? Number(searchParams.get("radius"))
    : 2;
  const typesParam = searchParams.get("types");
  const types = typesParam
    ? (typesParam
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter((t): t is PoiType => VALID.includes(t as PoiType)) as PoiType[])
    : undefined;

  const items = await findNearbyPois({
    lat,
    lng,
    radiusKm: Number.isFinite(radiusKm) ? Math.min(radiusKm, 10) : 2,
    types,
    limitPerType: 12,
  });

  return NextResponse.json({
    items,
    meta: { lat, lng, radiusKm, count: items.length },
  });
}
