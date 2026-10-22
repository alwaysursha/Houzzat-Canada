import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFullCustomerUser } from "@/lib/account";
import { prismaPropertyMonitorSettingsStore } from "@/lib/account/prisma-monitor-settings";
import {
  deleteOwnedPropertyMonitor,
  patchPropertyMonitorEmailAlerts,
  propertyMonitorEmailPatchSchema,
  resolvePropertyMonitorEmailAlertsOnUpsert,
} from "@/lib/account/property-monitor-settings";
import { logPropertyWatchRemovedBestEffort } from "@/lib/agent/customer-alert-crm-activity";
import { scheduleAssignedAgentAwareness } from "@/lib/notifications/assigned-agent-awareness";
import { recordActivityEvent } from "@/lib/analytics/record-activity";
import { scheduleRegistrationEngaged } from "@/lib/funnel/phase2c";
import { listingPath } from "@/lib/listings/listing-path";
import { prisma } from "@/lib/prisma";
import { excludeStagingSnapshotWhere } from "@/lib/tenancy/templates/high-octane-staging-snapshot";

export async function GET(request: Request) {
  const access = await requireFullCustomerUser();
  if (access.denied) return access.denied;
  const user = access.user;

  const items = await prisma.propertyMonitor.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const enrich = new URL(request.url).searchParams.get("enrich") === "1";
  if (!enrich) {
    return NextResponse.json({ items });
  }

  const listings = await prisma.listing.findMany({
    where: {
      AND: [
        { mlsNumber: { in: items.map((item) => item.mlsNumber) } },
        excludeStagingSnapshotWhere(),
      ],
    },
    select: {
      mlsNumber: true,
      addressLine: true,
      unitNumber: true,
      city: true,
    },
  });
  const byMls = new Map(listings.map((l) => [l.mlsNumber, l]));

  return NextResponse.json({
    items: items.map((item) => {
      const listing = byMls.get(item.mlsNumber);
      return {
        ...item,
        addressLine: listing?.addressLine,
        unitNumber: listing?.unitNumber ?? null,
        city: listing?.city,
      };
    }),
  });
}

const postSchema = z.object({
  mlsNumber: z.string().trim().min(1),
  emailAlerts: z.boolean().optional(),
});

export async function POST(request: Request) {
  const access = await requireFullCustomerUser();
  if (access.denied) return access.denied;
  const user = access.user;

  const parsed = postSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid listing." }, { status: 400 });
  }

  const listing = await prisma.listing.findFirst({
    where: {
      AND: [
        { mlsNumber: parsed.data.mlsNumber },
        excludeStagingSnapshotWhere(),
      ],
    },
    select: {
      mlsNumber: true,
      addressLine: true,
      unitNumber: true,
      city: true,
      listPrice: true,
      status: true,
      ownerStatus: true,
    },
  });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  const existing = await prisma.propertyMonitor.findUnique({
    where: {
      userId_mlsNumber: {
        userId: user.id,
        mlsNumber: listing.mlsNumber,
      },
    },
    select: { id: true, emailAlerts: true },
  });

  const nextEmailAlerts = resolvePropertyMonitorEmailAlertsOnUpsert({
    existingEmailAlerts: existing?.emailAlerts ?? null,
    supplied: parsed.data.emailAlerts,
  });

  const item = await prisma.propertyMonitor.upsert({
    where: {
      userId_mlsNumber: {
        userId: user.id,
        mlsNumber: listing.mlsNumber,
      },
    },
    create: {
      userId: user.id,
      mlsNumber: listing.mlsNumber,
      emailAlerts: nextEmailAlerts,
      lastKnownPrice: listing.listPrice,
      lastKnownStatus: listing.status,
      lastKnownOwnerStatus: listing.ownerStatus,
    },
    update: {
      emailAlerts: nextEmailAlerts,
      lastKnownPrice: listing.listPrice,
      lastKnownStatus: listing.status,
      lastKnownOwnerStatus: listing.ownerStatus,
    },
  });

  void recordActivityEvent({
    type: "WATCH_PROPERTY",
    userId: user.id,
    mlsNumber: listing.mlsNumber,
    path: listingPath(listing),
    title: `Watching ${listing.mlsNumber}`,
  });

  scheduleRegistrationEngaged({
    request,
    user,
    engagementType: "PROPERTY_WATCH",
    mlsNumber: listing.mlsNumber,
  });

  return NextResponse.json({ ok: true, item });
}

export async function PATCH(request: Request) {
  const access = await requireFullCustomerUser();
  if (access.denied) return access.denied;
  const user = access.user;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid preference." }, { status: 400 });
  }

  const parsed = propertyMonitorEmailPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid preference." }, { status: 400 });
  }

  const result = await patchPropertyMonitorEmailAlerts(
    prismaPropertyMonitorSettingsStore(),
    {
      userId: user.id,
      mlsNumber: parsed.data.mlsNumber,
      emailAlerts: parsed.data.emailAlerts,
    },
  );
  if (!result.ok) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, item: result.item });
}

const deleteSchema = z.object({
  mlsNumber: z.string().trim().min(1),
});

export async function DELETE(request: Request) {
  const access = await requireFullCustomerUser();
  if (access.denied) return access.denied;
  const user = access.user;

  const parsed = deleteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid listing." }, { status: 400 });
  }

  const { deleted } = await deleteOwnedPropertyMonitor(
    prismaPropertyMonitorSettingsStore(),
    { userId: user.id, mlsNumber: parsed.data.mlsNumber },
  );

  if (deleted) {
    await logPropertyWatchRemovedBestEffort({
      customerId: user.id,
      workspaceId: user.workspaceId,
      mlsNumber: parsed.data.mlsNumber,
      source: "account_property_monitors",
      actorUserId: user.id,
    });
    if (user.workspaceId) {
      scheduleAssignedAgentAwareness({
        customerId: user.id,
        workspaceId: user.workspaceId,
        event: "property_watch_removed",
      });
    }
  }

  return NextResponse.json({ ok: true });
}
