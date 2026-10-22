import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withStagingSnapshotBoundary } from "@/lib/tenancy/templates/high-octane-staging-snapshot";
import { stagingSnapshotVisibleFromResolution } from "@/lib/tenancy/templates/high-octane-staging-snapshot-request";
import { resolveListingEntitlementContextForRequest } from "@/lib/tenancy/listing-entitlement";

/** Distinct community names for typeahead (optional city scope). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const city = (searchParams.get("city") ?? "").trim();
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 12), 1), 30);

  if (q.length < 1) {
    return NextResponse.json({ items: [] as string[] });
  }

  const context = await resolveListingEntitlementContextForRequest(request);
  const rows = await prisma.listing.findMany({
    where: withStagingSnapshotBoundary(
      {
        community: {
          not: null,
          contains: q,
          mode: "insensitive",
        },
        ...(city
          ? { city: { equals: city, mode: "insensitive" as const } }
          : {}),
        segment: { in: ["RESIDENTIAL", "COMMERCIAL"] },
      },
      stagingSnapshotVisibleFromResolution(context.resolution),
    ),
    select: { community: true },
    distinct: ["community"],
    take: limit * 3,
    orderBy: { community: "asc" },
  });

  const items = rows
    .map((row) => row.community?.trim())
    .filter((name): name is string => Boolean(name))
    .slice(0, limit);

  return NextResponse.json({ items });
}
