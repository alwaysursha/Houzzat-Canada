/**
 * Stage 5.4 — Canonical SavedListing helpers for Mobile v2.
 * Reuses SavedListing model (user-scoped) — UI may say "Shortlist".
 */

import { recordActivityEvent } from "@/lib/analytics/record-activity";
import { listingPath } from "@/lib/listings/listing-path";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";

function normalizeMls(raw: string): string {
  return raw.trim().toUpperCase();
}

export async function listSavedMlsForUser(userId: string): Promise<string[]> {
  const rows = await prisma.savedListing.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { mlsNumber: true },
  });
  return rows.map((r) => r.mlsNumber);
}

export async function isListingSavedByUser(
  userId: string,
  mlsNumber: string,
): Promise<boolean> {
  const row = await prisma.savedListing.findUnique({
    where: {
      userId_mlsNumber: { userId, mlsNumber: normalizeMls(mlsNumber) },
    },
    select: { id: true },
  });
  return Boolean(row);
}

export async function saveListingForUser(
  userId: string,
  mlsNumberRaw: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const mlsNumber = normalizeMls(mlsNumberRaw);
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
    return { ok: false, status: 404, message: "Listing not found" };
  }

  await prisma.savedListing.upsert({
    where: {
      userId_mlsNumber: { userId, mlsNumber: listing.mlsNumber },
    },
    update: { mlsNumber: listing.mlsNumber },
    create: { userId, mlsNumber: listing.mlsNumber },
  });

  scheduleWorkerSideEffect(
    recordActivityEvent({
      type: "SAVE_LISTING",
      userId,
      mlsNumber: listing.mlsNumber,
      path: listingPath(listing),
      title: `Saved ${listing.mlsNumber}`,
    }),
  );

  return { ok: true };
}

export async function unsaveListingForUser(
  userId: string,
  mlsNumberRaw: string,
): Promise<void> {
  const mlsNumber = normalizeMls(mlsNumberRaw);
  await prisma.savedListing.deleteMany({
    where: { userId, mlsNumber },
  });

  scheduleWorkerSideEffect(
    recordActivityEvent({
      type: "UNSAVE_LISTING",
      userId,
      mlsNumber,
      path: `/listing/${mlsNumber}`,
      title: `Unsaved ${mlsNumber}`,
    }),
  );
}
