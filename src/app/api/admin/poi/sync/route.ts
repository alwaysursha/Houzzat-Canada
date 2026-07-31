import { NextResponse } from "next/server";
import { requireAgentUser } from "@/lib/agent";
import { isAdminRole } from "@/lib/constants";
import { runPoiOpenDataSync } from "@/lib/poi/sync/run-sync";
import { SEED_POIS, toPoiCreateInput } from "@/lib/poi/seed-data";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/poi/sync
 * Body (optional): { sources?: ["toronto"|"gtfs"|"osm"], mode?: "opendata"|"seed" }
 *
 * Default: free Canadian open-data sync (Toronto schools/parks, GTFS, OSM grocery).
 * mode=seed still available for the curated demo catalogue.
 */
export async function POST(request: Request) {
  const user = await requireAgentUser();
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let mode: "opendata" | "seed" = "opendata";
  let sources: Array<"toronto" | "gtfs" | "osm"> | undefined;
  try {
    const body = (await request.json()) as {
      mode?: string;
      sources?: string[];
    };
    if (body.mode === "seed") mode = "seed";
    if (Array.isArray(body.sources)) {
      sources = body.sources.filter(
        (s): s is "toronto" | "gtfs" | "osm" =>
          s === "toronto" || s === "gtfs" || s === "osm",
      );
    }
  } catch {
    // empty body is fine
  }

  if (mode === "seed") {
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
      mode: "seed",
      upserted,
      message: "Seed POI sync complete.",
    });
  }

  try {
    const result = await runPoiOpenDataSync({ sources });
    return NextResponse.json({
      ...result,
      mode: "opendata",
      message:
        "Open-data POI sync complete (Toronto schools/parks, GTFS transit, OSM grocery + 905 fill).",
    });
  } catch (error) {
    console.error("[admin/poi/sync]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "POI open-data sync failed.",
      },
      { status: 500 },
    );
  }
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
  const bySource = await prisma.poi.groupBy({
    by: ["source"],
    _count: { _all: true },
  });
  return NextResponse.json({
    total: counts.reduce((n, c) => n + c._count._all, 0),
    byType: Object.fromEntries(counts.map((c) => [c.type, c._count._all])),
    bySource: Object.fromEntries(
      bySource.map((c) => [c.source, c._count._all]),
    ),
  });
}
