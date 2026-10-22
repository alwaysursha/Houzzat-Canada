import { NextResponse } from "next/server";
import type { ListingStatus, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { toCard } from "@/lib/listings/provider";
import { prisma } from "@/lib/prisma";
import { mlsClientGate } from "@/lib/proptx/mls-gate";
import {
  buildPrismaEntitledInventoryWhere,
  evaluateWebListingDetailInventoryAccess,
  resolveListingEntitlementContextForRequest,
} from "@/lib/tenancy/listing-entitlement";
import {
  excludeStagingSnapshotWhere,
  stagingSnapshotInventoryWhere,
} from "@/lib/tenancy/templates/high-octane-staging-snapshot";
import { stagingSnapshotVisibleFromResolution } from "@/lib/tenancy/templates/high-octane-staging-snapshot-request";
import { hasClientAccess } from "@/lib/vow";

/**
 * Related listing cards for a subject MLS.
 *
 * G.10C3: Host → G.7C/G.10A once → subject board entitlement →
 * capability-scoped Prisma filter on every related row.
 * Unauthorized subject → 404. Unauthorized related rows never serialized.
 * Neon-only (no PropTx). VOW gate remains after board entitlement.
 */
export async function GET(request: Request) {
  const gated = await mlsClientGate();
  if (gated) return gated;

  const { searchParams } = new URL(request.url);
  const mlsNumber = searchParams.get("mlsNumber")?.trim();
  const modeParam = searchParams.get("mode");
  const tabParam = searchParams.get("tab");
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") ?? 8), 1),
    24,
  );

  const mode =
    modeParam === "same-features" ? "same-features" : "same-area";
  const tab = tabParam === "sold" ? "sold" : "for-sale";

  if (!mlsNumber) {
    return NextResponse.json(
      { error: "mlsNumber is required." },
      { status: 400 },
    );
  }

  // Never trust client workspaceId / org / provider / SAK.
  const context = await resolveListingEntitlementContextForRequest(request);
  const { entitlement } = context;
  const stagingSnapshotVisible = stagingSnapshotVisibleFromResolution(
    context.resolution,
  );

  const subject = await prisma.listing.findUnique({
    where: { mlsNumber },
    select: {
      mlsNumber: true,
      city: true,
      community: true,
      propertyType: true,
      beds: true,
      baths: true,
      segment: true,
      transactionType: true,
      status: true,
      dataSource: true,
      organizationId: true,
      providerKey: true,
    },
  });

  if (!subject) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  const subjectGate = evaluateWebListingDetailInventoryAccess({
    entitlement,
    entitlementFilteringEnabled: true,
    organizationId: subject.organizationId,
    providerKey: subject.providerKey,
    dataSource: subject.dataSource,
    status: subject.status,
    stagingSnapshotVisible,
  });
  if (!subjectGate.allowed) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  const relatedStatuses: ListingStatus[] =
    tab === "sold" ? ["SOLD"] : ["ACTIVE"];

  const inventory = buildPrismaEntitledInventoryWhere({
    entitlement,
    statuses: relatedStatuses,
  });
  const includeSnapshot = stagingSnapshotVisible && tab !== "sold";
  if (inventory.kind === "empty" && !includeSnapshot) {
    return NextResponse.json({
      mode,
      tab,
      subject: {
        mlsNumber: subject.mlsNumber,
        city: subject.city,
        community: subject.community,
        propertyType: subject.propertyType,
        beds: subject.beds,
      },
      items: [],
      total: 0,
    });
  }

  const geo: Prisma.ListingWhereInput = {
    mlsNumber: { not: mlsNumber },
    segment: subject.segment,
    city: { equals: subject.city, mode: "insensitive" },
    transactionType: subject.transactionType,
  };

  if (subject.community) {
    geo.community = { equals: subject.community, mode: "insensitive" };
  }

  if (mode === "same-features") {
    geo.propertyType = subject.propertyType;
    // Match whole beds (3.0 and 3 stay together).
    geo.beds = {
      gte: Math.floor(subject.beds),
      lt: Math.floor(subject.beds) + 1,
    };
  }

  const inventoryWhere: Prisma.ListingWhereInput =
    inventory.kind === "empty"
      ? stagingSnapshotInventoryWhere()
      : includeSnapshot
        ? { OR: [inventory.where, stagingSnapshotInventoryWhere()] }
        : { AND: [inventory.where, excludeStagingSnapshotWhere()] };
  const where: Prisma.ListingWhereInput = {
    AND: [inventoryWhere, geo],
  };

  const session = await auth();
  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, emailVerified: true, createdAt: true },
      })
    : null;
  const isClient = hasClientAccess(user);

  const rows = await prisma.listing.findMany({
    where,
    include: {
      media: true,
      openHouses: true,
    },
    orderBy:
      tab === "sold"
        ? [
            { soldAt: { sort: "desc", nulls: "last" } },
            { updatedAtMls: "desc" },
            { mlsNumber: "desc" },
          ]
        : [
            { listedAt: "desc" },
            { daysOnMarket: "asc" },
            { updatedAtMls: "desc" },
            { mlsNumber: "desc" },
          ],
    take: limit,
  });

  let items = rows.map(toCard);
  if (!isClient) {
    items = items.map((item) => ({ ...item, soldPrice: null }));
  }

  return NextResponse.json({
    mode,
    tab,
    subject: {
      mlsNumber: subject.mlsNumber,
      city: subject.city,
      community: subject.community,
      propertyType: subject.propertyType,
      beds: subject.beds,
    },
    items,
    total: items.length,
  });
}
