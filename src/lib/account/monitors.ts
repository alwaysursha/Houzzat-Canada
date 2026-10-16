import type {
  ListingStatus,
  OwnerListingStatus,
  Prisma,
} from "@prisma/client";
import { SITE_URL } from "@/lib/constants";
import { sendAndLogClientEmail } from "@/lib/email/client-send";
import { loadCategoryEmailEnabled } from "@/lib/communications/category-email-gate";
import {
  buildCustomerPreferenceEmailChrome,
  preferenceFooterFields,
} from "@/lib/communications/preference-email-chrome";
import { withPropertyAlertUtm } from "@/lib/email/property-alert-links";
import { sendPushToUser } from "@/lib/notifications/push";
import type { ConsumerPushType } from "@/lib/notifications/catalog";
import {
  renderJustListedEmail,
  renderPriceReductionEmail,
  renderPropertyUpdateEmail,
  renderSoldAlertEmail,
} from "@/lib/email/templates";
import {
  resolveTenantEmailBrand,
  toEmailBrandChrome,
} from "@/lib/email/tenant-email-brand";
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
  watchCategory: "property_watch" | "area_watch";
  workspaceId?: string | null;
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

  const pushType: ConsumerPushType =
    input.template?.type === "price_reduction"
      ? "price_drop"
      : input.template?.type === "sold"
        ? "sold_status"
        : input.template?.type === "just_listed"
          ? "just_listed"
          : input.kind === "PRICE_CHANGE"
            ? "price_drop"
            : input.kind === "STATUS_CHANGE" || input.kind === "AREA_SOLD"
              ? "sold_status"
              : input.kind === "AREA_NEW"
                ? "just_listed"
                : "property_update";

  void sendPushToUser(input.userId, {
    type: pushType,
    title: input.title,
    body: input.body.slice(0, 140),
    href: input.mlsNumber ? `/listing/${input.mlsNumber}` : "/account/watchlist",
  });

  if (
    !input.emailAlertsEnabled ||
    !input.monitorEmailAlerts ||
    !input.email
  ) {
    return;
  }

  if (!(await loadCategoryEmailEnabled(input.userId, input.watchCategory))) {
    return;
  }

  const chrome =
    input.workspaceId && input.email
      ? await buildCustomerPreferenceEmailChrome({
          userId: input.userId,
          workspaceId: input.workspaceId,
          email: input.email,
        })
      : null;
  const footer = preferenceFooterFields(chrome);
  const tenantBrand = input.workspaceId
    ? await resolveTenantEmailBrand({
        workspaceId: input.workspaceId,
        customerId: input.userId,
      })
    : null;
  const brandChrome = tenantBrand ? toEmailBrandChrome(tenantBrand) : {};

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
        ...footer,
        ...brandChrome,
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
        ...footer,
        ...brandChrome,
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
        ...footer,
        ...brandChrome,
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
      ...footer,
      ...brandChrome,
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
      communicationCategory: input.watchCategory,
      replyTo: tenantBrand?.replyTo,
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
        ...footer,
        ...brandChrome,
      }),
    });
    return;
  }

  await sendAndLogClientEmail({
    to: input.email,
    stream: "alerts",
    customerId: input.userId,
    mlsNumber: input.mlsNumber,
    communicationCategory: input.watchCategory,
    replyTo: tenantBrand?.replyTo,
    rendered,
  });
}

export type MonitorCheckStats = {
  checked: number;
  alerts: number;
  failures: number;
  pages: number;
};

const PROPERTY_MONITOR_PAGE = 100;
const PROPERTY_MONITOR_MAX = 5_000;
const AREA_MONITOR_PAGE = 50;
const AREA_EVENT_BATCH = 40;
const AREA_EVENT_MAX_PAGES = 25;
const AREA_MONITOR_MAX = 2_000;

function logMonitors(
  phase: string,
  fields: Record<string, string | number | boolean | undefined>,
) {
  console.info(
    `[monitors:${phase}]`,
    JSON.stringify({
      at: new Date().toISOString(),
      ...fields,
    }),
  );
}

export async function runPropertyMonitorChecks(
  userId?: string,
): Promise<MonitorCheckStats> {
  let checked = 0;
  let alerts = 0;
  let failures = 0;
  let pages = 0;
  let cursorId: string | undefined;

  while (checked < PROPERTY_MONITOR_MAX) {
    const monitors = await prisma.propertyMonitor.findMany({
      where: {
        ...(userId ? { userId } : {}),
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      orderBy: { id: "asc" },
      take: PROPERTY_MONITOR_PAGE,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            emailAlertsEnabled: true,
            workspaceId: true,
          },
        },
      },
    });

    if (monitors.length === 0) break;
    pages += 1;
    cursorId = monitors[monitors.length - 1]!.id;

    for (const monitor of monitors) {
      checked += 1;
      try {
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
        let priceDrop: { oldPrice: number; newPrice: number } | null = null;

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
          changes.push(
            `Status ${monitor.lastKnownStatus} → ${listing.status}`,
          );
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
          workspaceId: monitor.user.workspaceId,
          monitorEmailAlerts: monitor.emailAlerts,
          watchCategory: "property_watch",
          template: soldLike
            ? {
                type: "sold",
                addressLine: listing.addressLine,
                city: listing.city,
                mlsNumber: listing.mlsNumber,
                statusLabel: listing.status === "LEASED" ? "Leased" : "Sold",
                priceLabel: formatPrice(
                  listing.soldPrice ?? listing.listPrice,
                ),
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
      } catch (error) {
        failures += 1;
        logMonitors("property-fail", {
          monitorId: monitor.id,
          error: error instanceof Error ? error.name : "unknown",
        });
      }
    }

    if (monitors.length < PROPERTY_MONITOR_PAGE) break;
  }

  return { checked, alerts, failures, pages };
}

async function existingAreaAlertMls(input: {
  areaMonitorId: string;
  kind: "AREA_NEW" | "AREA_SOLD";
  mlsNumbers: string[];
}): Promise<Set<string>> {
  if (input.mlsNumbers.length === 0) return new Set();
  const rows = await prisma.customerAlert.findMany({
    where: {
      areaMonitorId: input.areaMonitorId,
      kind: input.kind,
      mlsNumber: { in: input.mlsNumbers },
    },
    select: { mlsNumber: true },
  });
  return new Set(
    rows.map((row) => row.mlsNumber).filter((mls): mls is string => Boolean(mls)),
  );
}

/**
 * Page matching listings since the stored cursor.
 * Advances lastSeenListingAt only to the last successfully walked event time
 * (never wall-clock `now`), so remaining matches are not skipped.
 */
async function processAreaEventPages(input: {
  monitor: {
    id: string;
    userId: string;
    name: string;
    emailAlerts: boolean;
    user: {
      email: string | null;
      name: string | null;
      emailAlertsEnabled: boolean;
      workspaceId: string | null;
    };
  };
  /** Shared waterline for this monitor pass (do not reuse mid-pass updates). */
  since: Date;
  whereBase: Prisma.ListingWhereInput;
  kind: "AREA_NEW" | "AREA_SOLD";
  timeField: "listedAt" | "soldAt";
  statusFilter: Prisma.ListingWhereInput;
}): Promise<{ alerts: number; failures: number; advancedTo: Date }> {
  let cursorTime = input.since;
  let cursorMls = "";
  let alerts = 0;
  let failures = 0;
  let advancedTo = input.since;

  for (let page = 0; page < AREA_EVENT_MAX_PAGES; page += 1) {
    const timeClause: Prisma.ListingWhereInput =
      input.timeField === "listedAt"
        ? cursorMls
          ? {
              OR: [
                { listedAt: { gt: cursorTime } },
                {
                  AND: [
                    { listedAt: cursorTime },
                    { mlsNumber: { gt: cursorMls } },
                  ],
                },
              ],
            }
          : { listedAt: { gt: cursorTime } }
        : cursorMls
          ? {
              OR: [
                { soldAt: { gt: cursorTime } },
                {
                  AND: [
                    { soldAt: cursorTime },
                    { mlsNumber: { gt: cursorMls } },
                  ],
                },
              ],
            }
          : { soldAt: { gt: cursorTime } };

    const batch = await prisma.listing.findMany({
      where: {
        ...input.whereBase,
        ...input.statusFilter,
        ...timeClause,
      },
      orderBy:
        input.timeField === "listedAt"
          ? [{ listedAt: "asc" }, { mlsNumber: "asc" }]
          : [{ soldAt: "asc" }, { mlsNumber: "asc" }],
      take: AREA_EVENT_BATCH,
      select: listingEmailSelect,
    });

    if (batch.length === 0) break;

    const mlsNumbers = batch.map((row) => row.mlsNumber);
    const already = await existingAreaAlertMls({
      areaMonitorId: input.monitor.id,
      kind: input.kind,
      mlsNumbers,
    });

    for (const listing of batch) {
      const eventAt =
        input.timeField === "listedAt" ? listing.listedAt : listing.soldAt;
      if (!eventAt) continue;
      cursorTime = eventAt;
      cursorMls = listing.mlsNumber;
      advancedTo = eventAt;

      if (already.has(listing.mlsNumber)) continue;

      try {
        if (input.kind === "AREA_NEW") {
          await createAlert({
            userId: input.monitor.userId,
            kind: "AREA_NEW",
            title: `New in ${input.monitor.name}`,
            body: `${listing.addressLine}, ${listing.city} · ${formatPrice(listing.listPrice)} (${listing.mlsNumber})`,
            mlsNumber: listing.mlsNumber,
            areaMonitorId: input.monitor.id,
            email: input.monitor.user.email,
            name: input.monitor.user.name,
            emailAlertsEnabled: input.monitor.user.emailAlertsEnabled,
            monitorEmailAlerts: input.monitor.emailAlerts,
            watchCategory: "area_watch",
            workspaceId: input.monitor.user.workspaceId,
            template: {
              type: "just_listed",
              areaName: input.monitor.name,
              addressLine: listing.addressLine,
              city: listing.city,
              mlsNumber: listing.mlsNumber,
              price: listing.listPrice,
              ...listingCardExtras(listing),
            },
          });
        } else {
          const price = listing.soldPrice ?? listing.listPrice;
          await createAlert({
            userId: input.monitor.userId,
            kind: "AREA_SOLD",
            title: `${listing.status === "LEASED" ? "Leased" : "Sold"} in ${input.monitor.name}`,
            body: `${listing.addressLine}, ${listing.city} · ${formatPrice(price)} (${listing.mlsNumber})`,
            mlsNumber: listing.mlsNumber,
            areaMonitorId: input.monitor.id,
            email: input.monitor.user.email,
            name: input.monitor.user.name,
            emailAlertsEnabled: input.monitor.user.emailAlertsEnabled,
            monitorEmailAlerts: input.monitor.emailAlerts,
            watchCategory: "area_watch",
            workspaceId: input.monitor.user.workspaceId,
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
        }
        alerts += 1;
      } catch (error) {
        failures += 1;
        logMonitors("area-event-fail", {
          monitorId: input.monitor.id,
          kind: input.kind,
          error: error instanceof Error ? error.name : "unknown",
        });
      }
    }

    // Cursor is persisted by the caller after both new/sold passes (max waterline).
    // Re-walks after a timeout are safe via CustomerAlert dedupe.

    if (batch.length < AREA_EVENT_BATCH) break;
  }

  return { alerts, failures, advancedTo };
}

export async function runAreaMonitorChecks(
  userId?: string,
): Promise<MonitorCheckStats> {
  let checked = 0;
  let alerts = 0;
  let failures = 0;
  let pages = 0;
  let cursorId: string | undefined;

  while (checked < AREA_MONITOR_MAX) {
    const monitors = await prisma.areaMonitor.findMany({
      where: {
        ...(userId ? { userId } : {}),
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      orderBy: { id: "asc" },
      take: AREA_MONITOR_PAGE,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            emailAlertsEnabled: true,
            workspaceId: true,
          },
        },
      },
    });

    if (monitors.length === 0) break;
    pages += 1;
    cursorId = monitors[monitors.length - 1]!.id;

    for (const monitor of monitors) {
      checked += 1;
      try {
        const sinceFallback = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
        const since =
          monitor.lastSeenListingAt ?? monitor.lastAlertedAt ?? sinceFallback;

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
              status: {
                in: ["SOLD", "LEASED", "SUSPENDED", "TERMINATED", "EXPIRED"],
              },
            },
          ],
        };

        let waterline = since;

        if (monitor.notifyNew) {
          const result = await processAreaEventPages({
            monitor,
            since,
            whereBase,
            kind: "AREA_NEW",
            timeField: "listedAt",
            statusFilter: { status: "ACTIVE" },
          });
          alerts += result.alerts;
          failures += result.failures;
          if (result.advancedTo > waterline) waterline = result.advancedTo;
        }

        if (monitor.notifySold) {
          const result = await processAreaEventPages({
            monitor,
            since,
            whereBase,
            kind: "AREA_SOLD",
            timeField: "soldAt",
            statusFilter: { status: { in: ["SOLD", "LEASED"] } },
          });
          alerts += result.alerts;
          failures += result.failures;
          if (result.advancedTo > waterline) waterline = result.advancedTo;
        }

        await prisma.areaMonitor.update({
          where: { id: monitor.id },
          data: {
            lastSeenListingAt: waterline,
            lastAlertedAt: new Date(),
          },
        });
      } catch (error) {
        failures += 1;
        logMonitors("area-fail", {
          monitorId: monitor.id,
          error: error instanceof Error ? error.name : "unknown",
        });
      }
    }

    if (monitors.length < AREA_MONITOR_PAGE) break;
  }

  return { checked, alerts, failures, pages };
}

export async function runAllMonitorChecks(userId?: string) {
  const started = Date.now();
  logMonitors("start", {
    scoped: Boolean(userId),
  });

  const property = await runPropertyMonitorChecks(userId);
  const area = await runAreaMonitorChecks(userId);
  const durationMs = Date.now() - started;

  logMonitors("end", {
    scoped: Boolean(userId),
    propertyChecked: property.checked,
    propertyAlerts: property.alerts,
    propertyFailures: property.failures,
    areaChecked: area.checked,
    areaAlerts: area.alerts,
    areaFailures: area.failures,
    alerts: property.alerts + area.alerts,
    durationMs,
  });

  return {
    property,
    area,
    alerts: property.alerts + area.alerts,
    durationMs,
  };
}

export type PropertySnapshot = {
  listPrice: number;
  status: ListingStatus;
  ownerStatus: OwnerListingStatus | null;
};
