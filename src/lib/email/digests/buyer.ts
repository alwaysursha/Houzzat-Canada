import type { Prisma } from "@prisma/client";
import { loadBuyerIntent } from "@/lib/agent/buyer-intent";
import {
  buyerIntentSearchName,
  buyerIntentToSavedQuery,
  hasUsableSearchCriteria,
  savedQueryToSearchHref,
} from "@/lib/agent/intent-to-search";
import { SITE_URL } from "@/lib/constants";
import { sendAndLogClientEmail } from "@/lib/email/client-send";
import {
  findNewListingsForSavedQuery,
  type DigestListingCard,
} from "@/lib/email/digests/search";
import { emailPreferencesUrl } from "@/lib/email/log";
import { renderSavedSearchDigestEmail } from "@/lib/email/templates";
import { formatListPrice } from "@/lib/listings/constants";
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
const BUYER_DIGEST_LIMIT = 12;
const PACE_MS = 350;

export type DigestRunStats = {
  checked: number;
  sent: number;
  skipped: number;
  failed: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listingUrl(mlsNumber: string) {
  return `${SITE_URL}/listing/${mlsNumber}`;
}

function toDigestLine(listing: DigestListingCard) {
  return {
    mlsNumber: listing.mlsNumber,
    addressLine: listing.addressLine,
    city: listing.city,
    priceLabel: formatListPrice(listing.listPrice),
    metaLabel: (() => {
      const beds =
        listing.bedsLabel?.trim() ||
        (Number.isInteger(listing.beds)
          ? String(listing.beds)
          : listing.beds.toFixed(1));
      const baths = Number.isInteger(listing.baths)
        ? String(listing.baths)
        : listing.baths.toFixed(1);
      return `${beds} bed · ${baths} bath`;
    })(),
    listingUrl: listingUrl(listing.mlsNumber),
  };
}

/**
 * Upsert primary SavedSearch from Saved + browsing intent so CRM stays aligned.
 * Returns the primary search used for cursors / emailAlerts.
 */
async function syncPrimarySavedSearch(input: {
  userId: string;
  query: Record<string, unknown>;
  name: string;
}) {
  const existing = await prisma.savedSearch.findFirst({
    where: { userId: input.userId, isPrimary: true },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    return prisma.savedSearch.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        query: input.query as Prisma.InputJsonValue,
      },
    });
  }

  await prisma.savedSearch.updateMany({
    where: { userId: input.userId, isPrimary: true },
    data: { isPrimary: false },
  });

  return prisma.savedSearch.create({
    data: {
      userId: input.userId,
      name: input.name,
      query: input.query as Prisma.InputJsonValue,
      emailAlerts: true,
      isPrimary: true,
    },
  });
}

export async function runBuyerSavedSearchDigests(opts?: {
  userId?: string;
  /** Force since window (testing). */
  since?: Date;
  dryRun?: boolean;
}): Promise<DigestRunStats> {
  const stats: DigestRunStats = {
    checked: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  const users = await prisma.user.findMany({
    where: {
      ...(opts?.userId ? { id: opts.userId } : {}),
      isBuyer: true,
      emailAlertsEnabled: true,
      disabledAt: null,
      email: { not: "" },
    },
    select: {
      id: true,
      email: true,
      name: true,
      lastBuyerDigestAt: true,
    },
    take: opts?.userId ? 1 : 2000,
    orderBy: { createdAt: "asc" },
  });

  for (const user of users) {
    stats.checked += 1;
    try {
      const savedSearches = await prisma.savedSearch.findMany({
        where: { userId: user.id },
        select: { name: true, query: true, emailAlerts: true, isPrimary: true },
        take: 20,
        orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
      });

      const intent = await loadBuyerIntent({
        customerId: user.id,
        customerName: user.name,
        savedSearches,
      });

      if (
        intent.source === "thin" ||
        !hasUsableSearchCriteria(intent.criteria)
      ) {
        stats.skipped += 1;
        continue;
      }

      const query = buyerIntentToSavedQuery(intent.criteria);
      const searchName = buyerIntentSearchName(intent.criteria);

      const existingPrimary = await prisma.savedSearch.findFirst({
        where: { userId: user.id, isPrimary: true },
        orderBy: { updatedAt: "desc" },
      });

      if (existingPrimary && !existingPrimary.emailAlerts) {
        stats.skipped += 1;
        continue;
      }

      const primary = opts?.dryRun
        ? existingPrimary
        : await syncPrimarySavedSearch({
            userId: user.id,
            query,
            name: searchName,
          });

      if (primary && !primary.emailAlerts) {
        stats.skipped += 1;
        continue;
      }

      const since =
        opts?.since ??
        primary?.lastAlertedAt ??
        user.lastBuyerDigestAt ??
        new Date(Date.now() - DAY_MS);

      const listings = await findNewListingsForSavedQuery(query, {
        since,
        limit: BUYER_DIGEST_LIMIT,
      });

      if (!listings.length) {
        stats.skipped += 1;
        console.info("[digest:buyer] skip empty", user.email);
        continue;
      }

      const searchHref = savedQueryToSearchHref(query);
      const rendered = renderSavedSearchDigestEmail({
        name: user.name,
        searchName,
        listings: listings.map(toDigestLine),
        searchUrl: `${SITE_URL}${searchHref}`,
        unsubscribeUrl: emailPreferencesUrl(),
      });

      if (opts?.dryRun) {
        console.info(
          "[digest:buyer] dry-run",
          user.email,
          listings.length,
          rendered.subject,
        );
        stats.sent += 1;
        continue;
      }

      const result = await sendAndLogClientEmail({
        to: user.email,
        rendered,
        stream: "alerts",
        customerId: user.id,
      });

      if (!result.ok) {
        stats.failed += 1;
        console.error("[digest:buyer] send failed", user.email, result.error);
        continue;
      }

      const now = new Date();
      // Non-dry-run always synced a primary above.
      if (!primary) {
        stats.failed += 1;
        console.error("[digest:buyer] missing primary after send", user.email);
        continue;
      }
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { lastBuyerDigestAt: now },
        }),
        prisma.savedSearch.update({
          where: { id: primary.id },
          data: { lastAlertedAt: now },
        }),
      ]);

      stats.sent += 1;
      console.info(
        "[digest:buyer] sent",
        user.email,
        listings.length,
        result.status === "sent" ? result.providerId : result.status,
      );
      await sleep(PACE_MS);
    } catch (err) {
      stats.failed += 1;
      console.error("[digest:buyer] error", user.email, err);
    }
  }

  return stats;
}
