import type {
  ListingStatus,
  OwnerListingStatus,
  Prisma,
} from "@prisma/client";
import { SITE_URL } from "@/lib/constants";
import { sendAndLogClientEmail } from "@/lib/email/client-send";
import { withPropertyAlertUtm } from "@/lib/email/property-alert-links";
import { emailPreferencesUrl } from "@/lib/email/log";
import {
  renderJustListedEmail,
  renderPriceReductionEmail,
  renderPropertyUpdateEmail,
  renderSoldAlertEmail,
} from "@/lib/email/templates";
import { formatBedsPlusLabel, formatListingSqftLabel, parseListingFacts } from "@/lib/listings/facts";
import { listingPhotoSrc } from "@/lib/listings/photo-src";
import { prisma } from "@/lib/prisma";

type ListingCardExtras = {
  imageUrl?: string | null;
  bedsLabel?: string | null;
  bathsLabel?: string | null;
  sqftLabel?: string | null;
};

function listingCardExtras(listing: {
  beds: number;
  baths: number;
  sqft: number | null;
  facts: unknown;
  media: { url: string }[];
}): ListingCardExtras {
  const facts = parseListingFacts(listing.facts);
  const bedsLabel =
    formatBedsPlusLabel(listing.beds, facts) ??
    (Number.isInteger(listing.beds)
      ? String(listing.beds)
      : listing.beds.toFixed(1));
  const baths = Number.isInteger(listing.baths)
    ? String(listing.baths)
    : listing.baths.toFixed(1);
  const photo = listing.media[0]?.url;
  return {
    bedsLabel,
    bathsLabel: baths,
    sqftLabel: formatListingSqftLabel({
      sqft: listing.sqft,
      livingAreaRange: facts?.livingAreaRange,
      unit: "sqft",
    }),
    imageUrl: photo ? listingPhotoSrc(photo) ?? photo : null,
  };
}

const listingEmailSelect = {
  mlsNumber: true,
  addressLine: true,
  city: true,
  listPrice: true,
  soldPrice: true,
  status: true,
  ownerStatus: true,
  dataSource: true,
  beds: true,
  baths: true,
  sqft: true,
  facts: true,
  listedAt: true,
  soldAt: true,
  media: {
    orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" as const }],
    take: 1,
    select: { url: true },
  },
} satisfies Prisma.ListingSelect;

function formatPrice(amount: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function listingUrl(mlsNumber: string) {
  return withPropertyAlertUtm(`${SITE_URL}/listing/${mlsNumber}`, mlsNumber);
}

async function createAlert(input: {
  userId: string;
  kind:
    | "PRICE_CHANGE"
    | "STATUS_CHANGE"
    | "OWNER_STATUS_CHANGE"
    | "AREA_NEW"
    | "AREA_SOLD"
    | "SYSTEM";
  title: string;
  body: string;
  mlsNumber?: string;
  areaMonitorId?: string;
  email?: string | null;
  name?: string | null;
  emailAlertsEnabled: boolean;
  monitorEmailAlerts: boolean;
  /** Structured fields for HTML templates when available. */
  template?:
    | ({
        type: "price_reduction";
        addressLine: string;
        city: string;
        mlsNumber: string;
        oldPrice: number;
        newPrice: number;
      } & ListingCardExtras)
    | ({
        type: "sold";
        addressLine: string;
        city: string;
        mlsNumber: string;
        statusLabel: string;
        priceLabel: string;
      } & ListingCardExtras)
    | ({
        type: "just_listed";
        areaName: string;
        addressLine: string;
        city: string;
        mlsNumber: string;
        price: number;
      } & ListingCardExtras)
    | ({
        type: "property_update";
        addressLine: string;
        city: string;
        mlsNumber: string;
        changes: string[];
      } & ListingCardExtras);
}) {
  await prisma.customerAlert.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      mlsNumber: input.mlsNumber,
      areaMonitorId: input.areaMonitorId,
    },
  });

  if (
    !input.emailAlertsEnabled ||
    !input.monitorEmailAlerts ||
    !input.email
  ) {
    return;
  }

  const unsub = emailPreferencesUrl();
  const rendered = (() => {
    const t = input.template;
    if (!t) return null;
    if (t.type === "price_reduction") {
      return renderPriceReductionEmail({
        name: input.name,
        addressLine: t.addressLine,
        city: t.city,
        mlsNumber: t.mlsNumber,
        oldPrice: t.oldPrice,
        newPrice: t.newPrice,
        listingUrl: listingUrl(t.mlsNumber),
        unsubscribeUrl: unsub,
        imageUrl: t.imageUrl,
        bedsLabel: t.bedsLabel,
        bathsLabel: t.bathsLabel,
        sqftLabel: t.sqftLabel,
      });
    }
    if (t.type === "sold") {
      return renderSoldAlertEmail({
        name: input.name,
        addressLine: t.addressLine,
        city: t.city,
        mlsNumber: t.mlsNumber,
        statusLabel: t.statusLabel,
        priceLabel: t.priceLabel,
        listingUrl: listingUrl(t.mlsNumber),
        unsubscribeUrl: unsub,
        imageUrl: t.imageUrl,
        bedsLabel: t.bedsLabel,
        bathsLabel: t.bathsLabel,
        sqftLabel: t.sqftLabel,
      });
    }
    if (t.type === "just_listed") {
      return renderJustListedEmail({
        name: input.name,
        areaName: t.areaName,
        addressLine: t.addressLine,
        city: t.city,
        mlsNumber: t.mlsNumber,
        price: t.price,
        listingUrl: listingUrl(t.mlsNumber),
        unsubscribeUrl: unsub,
        imageUrl: t.imageUrl,
        bedsLabel: t.bedsLabel,
        bathsLabel: t.bathsLabel,
        sqftLabel: t.sqftLabel,
      });
    }
    return renderPropertyUpdateEmail({
      name: input.name,
      title: input.title,
      addressLine: t.addressLine,
      city: t.city,
      mlsNumber: t.mlsNumber,
      changes: t.changes,
      listingUrl: listingUrl(t.mlsNumber),
      unsubscribeUrl: unsub,
      imageUrl: t.imageUrl,
      bedsLabel: t.bedsLabel,
      bathsLabel: t.bathsLabel,
      sqftLabel: t.sqftLabel,
    });
  })();

  if (!rendered) {
    await sendAndLogClientEmail({
      to: input.email,
      stream: "alerts",
      customerId: input.userId,
      mlsNumber: input.mlsNumber,
      rendered: renderPropertyUpdateEmail({
        name: input.name,
        title: input.title,
        addressLine: input.mlsNumber ?? "Property",
        city: "",
        mlsNumber: input.mlsNumber ?? "",
        changes: input.body.split("\n").filter(Boolean),
        listingUrl: input.mlsNumber
          ? listingUrl(input.mlsNumber)
          : SITE_URL,
        unsubscribeUrl: unsub,
      }),
    });
    return;
  }

  await sendAndLogClientEmail({
    to: input.email,
    stream: "alerts",
    customerId: input.userId,
    mlsNumber: input.mlsNumber,
    rendered,
  });
}

export async function runPropertyMonitorChecks(userId?: string) {
  const monitors = await prisma.propertyMonitor.findMany({
    where: userId ? { userId } : undefined,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          emailAlertsEnabled: true,
        },
      },
    },
  });

  let alerts = 0;

  for (const monitor of monitors) {
    const listing = await prisma.listing.findUnique({
      where: { mlsNumber: monitor.mlsNumber },
      select: listingEmailSelect,
    });
    if (!listing) continue;
    const cardExtras = listingCardExtras(listing);

    const changes: string[] = [];
    let kind:
      | "PRICE_CHANGE"
      | "STATUS_CHANGE"
      | "OWNER_STATUS_CHANGE"
      | null = null;
    let priceDrop:
      | { oldPrice: number; newPrice: number }
      | null = null;

    if (listing.listPrice !== monitor.lastKnownPrice) {
      changes.push(
        `Price ${formatPrice(monitor.lastKnownPrice)} → ${formatPrice(listing.listPrice)}`,
      );
      kind = "PRICE_CHANGE";
      if (listing.listPrice < monitor.lastKnownPrice) {
        priceDrop = {
          oldPrice: monitor.lastKnownPrice,
          newPrice: listing.listPrice,
        };
      }
    }
    if (listing.status !== monitor.lastKnownStatus) {
      changes.push(`Status ${monitor.lastKnownStatus} → ${listing.status}`);
      kind = kind ?? "STATUS_CHANGE";
    }
    if (
      listing.dataSource === "fsbo" &&
      listing.ownerStatus !== monitor.lastKnownOwnerStatus
    ) {
      changes.push(
        `Owner status ${monitor.lastKnownOwnerStatus ?? "—"} → ${listing.ownerStatus ?? "—"}`,
      );
      kind = kind ?? "OWNER_STATUS_CHANGE";
    }

    if (changes.length === 0 || !kind) {
      continue;
    }

    const title = `Update · ${listing.addressLine}`;
    const body = `${listing.addressLine}, ${listing.city} (${listing.mlsNumber})\n${changes.join("\n")}`;

    const soldLike =
      listing.status !== monitor.lastKnownStatus &&
      (listing.status === "SOLD" || listing.status === "LEASED");

    await createAlert({
      userId: monitor.userId,
      kind,
      title: soldLike
        ? `${listing.status === "LEASED" ? "Leased" : "Sold"} · ${listing.addressLine}`
        : priceDrop
          ? `Price reduced · ${listing.addressLine}`
          : title,
      body,
      mlsNumber: listing.mlsNumber,
      email: monitor.user.email,
      name: monitor.user.name,
      emailAlertsEnabled: monitor.user.emailAlertsEnabled,
      monitorEmailAlerts: monitor.emailAlerts,
      template: soldLike
        ? {
            type: "sold",
            addressLine: listing.addressLine,
            city: listing.city,
            mlsNumber: listing.mlsNumber,
            statusLabel: listing.status === "LEASED" ? "Leased" : "Sold",
            priceLabel: formatPrice(listing.soldPrice ?? listing.listPrice),
            ...cardExtras,
          }
        : priceDrop
          ? {
              type: "price_reduction",
              addressLine: listing.addressLine,
              city: listing.city,
              mlsNumber: listing.mlsNumber,
              oldPrice: priceDrop.oldPrice,
              newPrice: priceDrop.newPrice,
              ...cardExtras,
            }
          : {
              type: "property_update",
              addressLine: listing.addressLine,
              city: listing.city,
              mlsNumber: listing.mlsNumber,
              changes,
              ...cardExtras,
            },
    });

    await prisma.propertyMonitor.update({
      where: { id: monitor.id },
      data: {
        lastKnownPrice: listing.listPrice,
        lastKnownStatus: listing.status,
        lastKnownOwnerStatus: listing.ownerStatus,
        lastAlertedAt: new Date(),
      },
    });
    alerts += 1;
  }

  return { checked: monitors.length, alerts };
}

export async function runAreaMonitorChecks(userId?: string) {
  const monitors = await prisma.areaMonitor.findMany({
    where: userId ? { userId } : undefined,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          emailAlertsEnabled: true,
        },
      },
    },
  });

  let alerts = 0;
  const sinceFallback = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);

  for (const monitor of monitors) {
    const since = monitor.lastSeenListingAt ?? monitor.lastAlertedAt ?? sinceFallback;
    const whereBase: Prisma.ListingWhereInput = {
      city: { equals: monitor.city, mode: "insensitive" },
      ...(monitor.community
        ? {
            community: {
              equals: monitor.community,
              mode: "insensitive" as const,
            },
          }
        : {}),
      ...(monitor.segment ? { segment: monitor.segment } : {}),
      ...(monitor.transactionType !== "ALL"
        ? { transactionType: monitor.transactionType }
        : {}),
      OR: [
        { dataSource: { not: "fsbo" } },
        { dataSource: "fsbo", ownerStatus: "ACTIVE" },
        {
          dataSource: "fsbo",
          status: { in: ["SOLD", "LEASED", "SUSPENDED", "TERMINATED", "EXPIRED"] },
        },
      ],
    };

    if (monitor.notifyNew) {
      const news = await prisma.listing.findMany({
        where: {
          ...whereBase,
          status: "ACTIVE",
          listedAt: { gt: since },
        },
        take: 10,
        orderBy: { listedAt: "desc" },
        select: listingEmailSelect,
      });

      for (const listing of news) {
        await createAlert({
          userId: monitor.userId,
          kind: "AREA_NEW",
          title: `New in ${monitor.name}`,
          body: `${listing.addressLine}, ${listing.city} · ${formatPrice(listing.listPrice)} (${listing.mlsNumber})`,
          mlsNumber: listing.mlsNumber,
          areaMonitorId: monitor.id,
          email: monitor.user.email,
          name: monitor.user.name,
          emailAlertsEnabled: monitor.user.emailAlertsEnabled,
          monitorEmailAlerts: monitor.emailAlerts,
          template: {
            type: "just_listed",
            areaName: monitor.name,
            addressLine: listing.addressLine,
            city: listing.city,
            mlsNumber: listing.mlsNumber,
            price: listing.listPrice,
            ...listingCardExtras(listing),
          },
        });
        alerts += 1;
      }
    }

    if (monitor.notifySold) {
      const solds = await prisma.listing.findMany({
        where: {
          ...whereBase,
          status: { in: ["SOLD", "LEASED"] },
          soldAt: { gt: since },
        },
        take: 10,
        orderBy: { soldAt: "desc" },
        select: listingEmailSelect,
      });

      for (const listing of solds) {
        const price = listing.soldPrice ?? listing.listPrice;
        await createAlert({
          userId: monitor.userId,
          kind: "AREA_SOLD",
          title: `${listing.status === "LEASED" ? "Leased" : "Sold"} in ${monitor.name}`,
          body: `${listing.addressLine}, ${listing.city} · ${formatPrice(price)} (${listing.mlsNumber})`,
          mlsNumber: listing.mlsNumber,
          areaMonitorId: monitor.id,
          email: monitor.user.email,
          name: monitor.user.name,
          emailAlertsEnabled: monitor.user.emailAlertsEnabled,
          monitorEmailAlerts: monitor.emailAlerts,
          template: {
            type: "sold",
            addressLine: listing.addressLine,
            city: listing.city,
            mlsNumber: listing.mlsNumber,
            statusLabel: listing.status === "LEASED" ? "Leased" : "Sold",
            priceLabel: formatPrice(price),
            ...listingCardExtras(listing),
          },
        });
        alerts += 1;
      }
    }

    await prisma.areaMonitor.update({
      where: { id: monitor.id },
      data: {
        lastAlertedAt: new Date(),
        lastSeenListingAt: new Date(),
      },
    });
  }

  return { checked: monitors.length, alerts };
}

export async function runAllMonitorChecks(userId?: string) {
  const property = await runPropertyMonitorChecks(userId);
  const area = await runAreaMonitorChecks(userId);
  return {
    property,
    area,
    alerts: property.alerts + area.alerts,
  };
}

export type PropertySnapshot = {
  listPrice: number;
  status: ListingStatus;
  ownerStatus: OwnerListingStatus | null;
};
