import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { resolveListingEntitlementContextForRequest } from "@/lib/tenancy/listing-entitlement";
import { withStagingSnapshotBoundary } from "@/lib/tenancy/templates/high-octane-staging-snapshot";
import { stagingSnapshotVisibleFromResolution } from "@/lib/tenancy/templates/high-octane-staging-snapshot-request";

const schema = z.object({
  mlsNumbers: z.array(z.string().trim().min(3).max(32)).max(40),
});

/** Merge guest localStorage recent views into the signed-in account. */
export async function POST(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const unique: string[] = [];
  for (const mls of parsed.data.mlsNumbers) {
    if (!unique.includes(mls)) unique.push(mls);
  }

  // Insert oldest → newest so createdAt order matches browse order.
  const chronological = [...unique].reverse();
  const context = await resolveListingEntitlementContextForRequest(request);
  const existing = await prisma.listing.findMany({
    where: withStagingSnapshotBoundary(
      { mlsNumber: { in: chronological } },
      stagingSnapshotVisibleFromResolution(context.resolution),
    ),
    select: { mlsNumber: true },
  });
  const valid = new Set(existing.map((row) => row.mlsNumber));

  for (const mlsNumber of chronological) {
    if (!valid.has(mlsNumber)) continue;
    try {
      await prisma.listingView.create({
        data: { userId: user.id, mlsNumber },
      });
    } catch {
      // Ignore per-row failures so sync still completes.
    }
  }

  return NextResponse.json({ ok: true, synced: chronological.length });
}
