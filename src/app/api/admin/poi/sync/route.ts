import { NextResponse } from "next/server";
import { SEED_POIS, toPoiCreateInput } from "@/lib/poi/seed-data";
import { requireAgentUser } from "@/lib/agent";
import { isAdminRole } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

/** Re-import curated seed POIs (stand-in for weekly open-data sync). */
export async function POST() {
  const user = await requireAgentUser();
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let upserted = 0;
  for (const poi of SEED_POIS) {
    await prisma.poi.upsert({
      where: {
        source_sourceId: { source: "seed", sourceId: poi.sourceId },
      },
      create: toPoiCreateInput(poi),
      update: {
        type: poi.type,
        name: poi.name,
        address: poi.address,
        city: poi.city,
        lat: poi.lat,
        lng: poi.lng,
        meta: poi.meta,
      },
    });
    upserted += 1;
  }

  return NextResponse.json({
    ok: true,
    upserted,
    message: "Seed POI sync complete. Open-data cron will replace this later.",
  });
}

export async function GET() {
  const user = await requireAgentUser();
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const counts = await prisma.poi.groupBy({
    by: ["type"],
    _count: { _all: true },
  });
  return NextResponse.json({
    total: counts.reduce((n, c) => n + c._count._all, 0),
    byType: Object.fromEntries(counts.map((c) => [c.type, c._count._all])),
  });
}
