import { SITE_URL } from "@/lib/constants";
import { withPropertyAlertUtm } from "@/lib/email/property-alert-links";
import { sendAndLogClientEmail } from "@/lib/email/client-send";
import type { DigestRunStats } from "@/lib/email/digests/buyer";
import {
  findNeighborhoodActivity,
  type DigestListingCard,
} from "@/lib/email/digests/search";
import { emailPreferencesUrl } from "@/lib/email/log";
import { renderNeighborhoodWeeklyEmail } from "@/lib/email/templates";
import { formatListPrice, formatPrice } from "@/lib/listings/constants";
import { prisma } from "@/lib/prisma";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PACE_MS = 350;
const RADIUS_KM = 2;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listingUrl(mlsNumber: string) {
  return withPropertyAlertUtm(
    `${SITE_URL}/listing/${mlsNumber}`,
    mlsNumber,
  );
}

function homeLabel(address: string | null | undefined) {
  const trimmed = address?.trim();
  if (trimmed) {
    const short = trimmed.split(",")[0]?.trim();
    return short || trimmed;
  }
  return "your home";
}

function toLine(listing: DigestListingCard, opts?: { sold?: boolean }) {
  const price = opts?.sold
    ? (listing.soldPrice ?? listing.listPrice)
    : listing.listPrice;
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
    priceLabel: opts?.sold
      ? `${listing.status === "LEASED" ? "Leased" : "Sold"} ${formatListPrice(price)}`
      : formatListPrice(price),
    metaLabel: listing.community,
    bedsLabel: beds,
    bathsLabel: baths,
    sqftLabel: listing.sqft
      ? `${listing.sqft.toLocaleString("en-CA")} sqft`
      : null,
    imageUrl: listing.imageUrl,
    badgeLabel: opts?.sold
      ? listing.status === "LEASED"
        ? "Leased"
        : "Sold"
      : "New listing",
    listingUrl: listingUrl(listing.mlsNumber),
  };
}

export async function runSellerNeighborhoodReports(opts?: {
  userId?: string;
  since?: Date;
  dryRun?: boolean;
  /** When true, skip unless today is Monday in America/Toronto. */
  requireMonday?: boolean;
}): Promise<DigestRunStats> {
  const stats: DigestRunStats = {
    checked: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  if (opts?.requireMonday) {
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Toronto",
      weekday: "short",
    }).format(new Date());
    if (weekday !== "Mon") {
      console.info("[digest:seller] skip — not Monday in America/Toronto");
      return stats;
    }
  }

  const users = await prisma.user.findMany({
    where: {
      ...(opts?.userId ? { id: opts.userId } : {}),
      isSeller: true,
      emailAlertsEnabled: true,
      disabledAt: null,
      email: { not: "" },
      OR: [{ homeLat: { not: null } }, { homeAddress: { not: null } }],
    },
    select: {
      id: true,
      email: true,
      name: true,
      homeAddress: true,
      homeLat: true,
      homeLng: true,
      lastSellerReportAt: true,
    },
    take: opts?.userId ? 1 : 2000,
    orderBy: { createdAt: "asc" },
  });

  for (const user of users) {
    stats.checked += 1;
    try {
      const lat = user.homeLat;
      const lng = user.homeLng;
      if (lat == null || lng == null) {
        stats.skipped += 1;
        console.info(
          "[digest:seller] skip missing coords",
          user.email,
          user.homeAddress,
        );
        continue;
      }

      if (
        !opts?.since &&
        user.lastSellerReportAt &&
        Date.now() - user.lastSellerReportAt.getTime() < 6 * DAY_MS
      ) {
        stats.skipped += 1;
        continue;
      }

      const since =
        opts?.since ??
        user.lastSellerReportAt ??
        new Date(Date.now() - WEEK_MS);

      const activity = await findNeighborhoodActivity({
        lat,
        lng,
        since,
        radiusKm: RADIUS_KM,
        limit: 8,
      });

      if (activity.newCount === 0 && activity.soldCount === 0) {
        stats.skipped += 1;
        console.info("[digest:seller] skip empty", user.email);
        continue;
      }

      const label = homeLabel(user.homeAddress);
      const rendered = renderNeighborhoodWeeklyEmail({
        name: user.name,
        homeLabel: label,
        radiusKm: activity.radiusKm,
        newCount: activity.newCount,
        soldCount: activity.soldCount,
        medianSoldLabel: activity.medianSoldPrice
          ? formatPrice(activity.medianSoldPrice)
          : null,
        newListings: activity.newListings.map((l) => toLine(l)),
        soldListings: activity.soldListings.map((l) =>
          toLine(l, { sold: true }),
        ),
        ctaUrl: `${SITE_URL}/owner`,
        unsubscribeUrl: emailPreferencesUrl(),
      });

      if (opts?.dryRun) {
        console.info(
          "[digest:seller] dry-run",
          user.email,
          activity.newCount,
          activity.soldCount,
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
        console.error("[digest:seller] send failed", user.email, result.error);
        continue;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { lastSellerReportAt: new Date() },
      });

      stats.sent += 1;
      console.info(
        "[digest:seller] sent",
        user.email,
        activity.newCount,
        activity.soldCount,
        result.status === "sent" ? result.providerId : result.status,
      );
      await sleep(PACE_MS);
    } catch (err) {
      stats.failed += 1;
      console.error("[digest:seller] error", user.email, err);
    }
  }

  return stats;
}
