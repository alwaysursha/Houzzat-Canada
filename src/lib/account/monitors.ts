import type {
  ListingStatus,
  OwnerListingStatus,
  Prisma,
} from "@prisma/client";
import { sendNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

function formatPrice(amount: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(amount);
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
  emailAlertsEnabled: boolean;
  monitorEmailAlerts: boolean;
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
    input.emailAlertsEnabled &&
    input.monitorEmailAlerts &&
    input.email
  ) {
    void sendNotification({
      toEmail: input.email,
      subject: input.title,
      text: input.body,
    });
  }
}

export async function runPropertyMonitorChecks(userId?: string) {
  const monitors = await prisma.propertyMonitor.findMany({
    where: userId ? { userId } : undefined,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          emailAlertsEnabled: true,
        },
      },
    },
  });

  let alerts = 0;

  for (const monitor of monitors) {
    const listing = await prisma.listing.findUnique({
      where: { mlsNumber: monitor.mlsNumber },
      select: {
        mlsNumber: true,
        addressLine: true,
        city: true,
        listPrice: true,
        status: true,
        ownerStatus: true,
        dataSource: true,
      },
    });
    if (!listing) continue;

    const changes: string[] = [];
    let kind:
      | "PRICE_CHANGE"
      | "STATUS_CHANGE"
      | "OWNER_STATUS_CHANGE"
      | null = null;

    if (listing.listPrice !== monitor.lastKnownPrice) {
      changes.push(
        `Price ${formatPrice(monitor.lastKnownPrice)} → ${formatPrice(listing.listPrice)}`,
      );
      kind = "PRICE_CHANGE";
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

    await createAlert({
      userId: monitor.userId,
      kind,
      title,
      body,
      mlsNumber: listing.mlsNumber,
      email: monitor.user.email,
      emailAlertsEnabled: monitor.user.emailAlertsEnabled,
      monitorEmailAlerts: monitor.emailAlerts,
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
        select: {
          mlsNumber: true,
          addressLine: true,
          city: true,
          listPrice: true,
          listedAt: true,
        },
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
          emailAlertsEnabled: monitor.user.emailAlertsEnabled,
          monitorEmailAlerts: monitor.emailAlerts,
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
        select: {
          mlsNumber: true,
          addressLine: true,
          city: true,
          status: true,
          soldPrice: true,
          listPrice: true,
          soldAt: true,
        },
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
          emailAlertsEnabled: monitor.user.emailAlertsEnabled,
          monitorEmailAlerts: monitor.emailAlerts,
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
