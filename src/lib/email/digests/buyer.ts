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
import { loadCategoryEmailEnabled } from "@/lib/communications/category-email-gate";
import {
  buildCustomerPreferenceEmailChrome,
  preferenceFooterFields,
} from "@/lib/communications/preference-email-chrome";
import { sendPushToUserFirstEnabled } from "@/lib/notifications/push";
import {
  findNewListingsForSavedQuery,
  type DigestListingCard,
} from "@/lib/email/digests/search";
import {
  planBuyerDigest,
  savedSearchDigestCursorUpdate,
} from "@/lib/email/digests/buyer-digest-plan";
import { renderSavedSearchDigestEmail } from "@/lib/email/templates";
import {
  resolveTenantEmailBrand,
  toEmailBrandChrome,
} from "@/lib/email/tenant-email-brand";
import { loadPublishedSavedSearchDigestOverride } from "@/lib/email/workspace-templates/digest-templates";
import type { EmailTemplateContentFields } from "@/lib/email/workspace-templates/types";
import { formatListPrice } from "@/lib/listings/constants";
import { withPropertyAlertUtm } from "@/lib/email/property-alert-links";
import { listingPath } from "@/lib/listings/listing-path";
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

function toDigestLine(listing: DigestListingCard) {
  const beds =
    listing.bedsLabel?.trim() ||
    (Number.isInteger(listing.beds)
      ? String(listing.beds)
      : listing.beds.toFixed(1));
  const baths = Number.isInteger(listing.baths)
    ? String(listing.baths)
    : listing.baths.toFixed(1);
  return {
    mlsNumber: listing.mlsNumber,
    addressLine: listing.addressLine,
    city: listing.city,
    priceLabel: formatListPrice(listing.listPrice),
    metaLabel: `${beds} bed · ${baths} bath`,
    bedsLabel: beds,
    bathsLabel: baths,
    sqftLabel: listing.sqft ? `${listing.sqft.toLocaleString("en-CA")} sqft` : null,
    imageUrl: listing.imageUrl,
    isNew: true,
    listingUrl: withPropertyAlertUtm(
      `${SITE_URL}${listingPath(listing)}`,
      listing.mlsNumber,
    ),
  };
}

/**
 * Materialize a browse-derived primary only when the customer has none.
 * Never called for an existing primary.
 */
async function createBrowsePrimarySavedSearch(input: {
  userId: string;
  query: Record<string, unknown>;
  name: string;
}) {
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
      workspaceId: true,
      lastBuyerDigestAt: true,
    },
    take: opts?.userId ? 1 : 2000,
    orderBy: { createdAt: "asc" },
  });

  for (const user of users) {
    stats.checked += 1;
    try {
      const existingPrimary = await prisma.savedSearch.findFirst({
        where: { userId: user.id, isPrimary: true },
        orderBy: { updatedAt: "desc" },
      });

      let browseQuery: Record<string, unknown> | null = null;
      let browseName: string | null = null;
      let browseUsable = false;
      if (!existingPrimary) {
        const savedSearches = await prisma.savedSearch.findMany({
          where: { userId: user.id },
          select: { name: true, query: true },
          take: 20,
          orderBy: { updatedAt: "desc" },
        });
        const intent = await loadBuyerIntent({
          customerId: user.id,
          customerName: user.name,
          savedSearches,
        });
        browseUsable =
          intent.source !== "thin" &&
          hasUsableSearchCriteria(intent.criteria);
        if (browseUsable) {
          browseQuery = buyerIntentToSavedQuery(intent.criteria);
          browseName = buyerIntentSearchName(intent.criteria);
        }
      }

      const plan = planBuyerDigest({
        primary: existingPrimary
          ? {
              id: existingPrimary.id,
              query: existingPrimary.query,
              emailAlerts: existingPrimary.emailAlerts,
              lastAlertedAt: existingPrimary.lastAlertedAt,
            }
          : null,
        browseQuery,
        browseName,
        browseUsable,
      });

      if (plan.action === "skip") {
        stats.skipped += 1;
        continue;
      }

      const primary =
        plan.action === "create_from_browse" && !opts?.dryRun
          ? await createBrowsePrimarySavedSearch({
              userId: user.id,
              query: plan.query,
              name: plan.name,
            })
          : existingPrimary;

      if (primary && !primary.emailAlerts) {
        stats.skipped += 1;
        continue;
      }

      if (!(await loadCategoryEmailEnabled(user.id, "buyer_digest"))) {
        stats.skipped += 1;
        continue;
      }

      const since =
        opts?.since ??
        primary?.lastAlertedAt ??
        user.lastBuyerDigestAt ??
        new Date(Date.now() - DAY_MS);

      const listings = await findNewListingsForSavedQuery(plan.query, {
        since,
        limit: BUYER_DIGEST_LIMIT,
      });

      if (!listings.length) {
        stats.skipped += 1;
        console.info("[digest:buyer] skip empty", user.email);
        continue;
      }

      const searchHref = savedQueryToSearchHref(plan.query);
      const searchName =
        plan.action === "create_from_browse"
          ? plan.name
          : (primary?.name ?? "Saved search");
      const chrome = user.workspaceId
        ? await buildCustomerPreferenceEmailChrome({
            userId: user.id,
            workspaceId: user.workspaceId,
            email: user.email,
          })
        : null;
      const tenantBrand = user.workspaceId
        ? await resolveTenantEmailBrand({
            workspaceId: user.workspaceId,
            customerId: user.id,
          })
        : null;
      // Phase 2C-3 — published SAVED_SEARCH_DIGEST only (drafts ignored).
      // Seller digest templates never load here.
      let publishedSavedSearchDigest: EmailTemplateContentFields | null = null;
      if (user.workspaceId) {
        publishedSavedSearchDigest =
          await loadPublishedSavedSearchDigestOverride({
            workspaceId: user.workspaceId,
          });
      }
      const rendered = renderSavedSearchDigestEmail({
        name: user.name,
        searchName,
        listings: listings.map(toDigestLine),
        searchUrl: withPropertyAlertUtm(
          `${SITE_URL}${searchHref}`,
          "saved_search",
        ),
        ...preferenceFooterFields(chrome),
        ...(tenantBrand ? toEmailBrandChrome(tenantBrand) : {}),
        publishedSavedSearchDigestTemplate: publishedSavedSearchDigest,
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
        replyTo: tenantBrand?.replyTo,
      });

      if (!result.ok) {
        stats.failed += 1;
        console.error("[digest:buyer] send failed", user.email, result.error);
        continue;
      }

      void sendPushToUserFirstEnabled(
        user.id,
        ["morning_digest", "saved_search_match"],
        {
          title: "New homes for you",
          body:
            listings.length === 1
              ? "1 new match from your saved search"
              : `${listings.length} new matches from your saved search`,
          href: searchHref,
        },
      );

      const now = new Date();
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
          data: savedSearchDigestCursorUpdate(now),
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
