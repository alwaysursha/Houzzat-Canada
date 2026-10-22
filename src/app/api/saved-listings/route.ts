import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFullCustomerUser } from "@/lib/account";
import { recordActivityEvent } from "@/lib/analytics/record-activity";
import { scheduleRegistrationEngaged } from "@/lib/funnel/phase2c";
import { listingPath } from "@/lib/listings/listing-path";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import { resolveListingEntitlementContextForRequest } from "@/lib/tenancy/listing-entitlement";
import { withStagingSnapshotBoundary } from "@/lib/tenancy/templates/high-octane-staging-snapshot";
import { stagingSnapshotVisibleFromResolution } from "@/lib/tenancy/templates/high-octane-staging-snapshot-request";

function normalizeMlsNumber(raw: string): string {
  return raw.trim().toUpperCase();
}

const mlsSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .transform(normalizeMlsNumber);

export async function GET(request: Request) {
  const access = await requireFullCustomerUser();
  if (access.denied) return access.denied;
  const user = access.user;

  const mlsRaw = new URL(request.url).searchParams.get("mlsNumber");
  if (mlsRaw) {
    const mlsNumber = normalizeMlsNumber(mlsRaw);
    const item = await prisma.savedListing.findUnique({
      where: {
        userId_mlsNumber: { userId: user.id, mlsNumber },
      },
      select: { id: true },
    });
    return NextResponse.json({ saved: Boolean(item) });
  }

  const saved = await prisma.savedListing.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const enrich = new URL(request.url).searchParams.get("enrich") === "1";
  if (!enrich) {
    return NextResponse.json({ items: saved });
  }

  const context = await resolveListingEntitlementContextForRequest(request);
  const listings = await prisma.listing.findMany({
    where: withStagingSnapshotBoundary(
      { mlsNumber: { in: saved.map((s) => s.mlsNumber) } },
      stagingSnapshotVisibleFromResolution(context.resolution),
    ),
    select: {
      mlsNumber: true,
      addressLine: true,
      unitNumber: true,
      city: true,
      listPrice: true,
      transactionType: true,
    },
  });
  const byMls = new Map(listings.map((l) => [l.mlsNumber, l]));

  return NextResponse.json({
    items: saved.map((row) => {
      const listing = byMls.get(row.mlsNumber);
      return {
        ...row,
        addressLine: listing?.addressLine,
        unitNumber: listing?.unitNumber ?? null,
        city: listing?.city,
        listPrice: listing?.listPrice,
        transactionType: listing?.transactionType,
      };
    }),
  });
}

const postSchema = z.object({
  mlsNumber: mlsSchema,
});

export async function POST(request: Request) {
  const access = await requireFullCustomerUser();
  if (access.denied) return access.denied;
  const user = access.user;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid listing." }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid listing." }, { status: 400 });
  }

  const mlsNumber = parsed.data.mlsNumber;

  const listing = await prisma.listing.findUnique({
    where: { mlsNumber },
    select: {
      mlsNumber: true,
      addressLine: true,
      unitNumber: true,
      city: true,
    },
  });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  // Do not use `update: {}` — PrismaNeonHttp on Workers has failed those no-op
  // upserts while PropertyMonitor (non-empty update) succeeded. Touch mlsNumber
  // so the update clause is non-empty; unique key keeps a single row per user.
  const item = await prisma.savedListing.upsert({
    where: {
      userId_mlsNumber: {
        userId: user.id,
        mlsNumber: listing.mlsNumber,
      },
    },
    update: {
      mlsNumber: listing.mlsNumber,
    },
    create: {
      userId: user.id,
      mlsNumber: listing.mlsNumber,
    },
  });

  scheduleWorkerSideEffect(
    recordActivityEvent({
      type: "SAVE_LISTING",
      userId: user.id,
      mlsNumber: listing.mlsNumber,
      path: listingPath(listing),
      title: `Saved ${listing.mlsNumber}`,
    }),
  );

  scheduleRegistrationEngaged({
    request,
    user,
    engagementType: "SAVE_LISTING",
    mlsNumber: listing.mlsNumber,
  });

  return NextResponse.json({ ok: true, item });
}

const deleteSchema = z.object({
  mlsNumber: mlsSchema,
});

export async function DELETE(request: Request) {
  const access = await requireFullCustomerUser();
  if (access.denied) return access.denied;
  const user = access.user;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid listing." }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid listing." }, { status: 400 });
  }

  const mlsNumber = parsed.data.mlsNumber;

  await prisma.savedListing.deleteMany({
    where: { userId: user.id, mlsNumber },
  });

  scheduleWorkerSideEffect(
    recordActivityEvent({
      type: "UNSAVE_LISTING",
      userId: user.id,
      mlsNumber,
      path: `/listing/${mlsNumber}`,
      title: `Unsaved ${mlsNumber}`,
    }),
  );

  return NextResponse.json({ ok: true });
}
