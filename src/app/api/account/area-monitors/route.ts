import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFullCustomerUser } from "@/lib/account";
import { createOrReuseAreaMonitor } from "@/lib/account/area-monitor-create";
import {
  areaMonitorSettingsPatchData,
  areaMonitorSettingsPatchSchema,
  deleteOwnedAreaMonitor,
  patchAreaMonitorSettings,
} from "@/lib/account/area-monitor-settings";
import { prismaAreaMonitorSettingsStore } from "@/lib/account/prisma-monitor-settings";
import { logAreaWatchRemovedBestEffort } from "@/lib/agent/customer-alert-crm-activity";
import {
  areaWatchAwarenessLabel,
  scheduleAssignedAgentAwareness,
} from "@/lib/notifications/assigned-agent-awareness";
import { recordActivityEvent } from "@/lib/analytics/record-activity";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const access = await requireFullCustomerUser();
  if (access.denied) return access.denied;
  const user = access.user;

  const items = await prisma.areaMonitor.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ items });
}

const postSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().min(1).max(80),
  community: z.string().trim().max(80).optional().nullable(),
  transactionType: z.enum(["SALE", "LEASE", "ALL"]).optional(),
  segment: z
    .enum(["RESIDENTIAL", "COMMERCIAL", "PRE_CONSTRUCTION"])
    .optional()
    .nullable(),
  notifyNew: z.boolean().optional(),
  notifySold: z.boolean().optional(),
  emailAlerts: z.boolean().optional(),
});

export async function POST(request: Request) {
  const access = await requireFullCustomerUser();
  if (access.denied) return access.denied;
  const user = access.user;

  const parsed = postSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid area." }, { status: 400 });
  }

  const data = parsed.data;
  const city = data.city;
  const community = data.community || null;
  const transactionType = data.transactionType ?? "SALE";
  const segment = data.segment ?? "RESIDENTIAL";
  const name =
    data.name || [community, city].filter(Boolean).join(", ") || city;

  const criteria = {
    userId: user.id,
    city,
    community,
    transactionType,
    segment,
  };
  // Defaults apply only when creating a new monitor. Reuse preserves the
  // existing row's emailAlerts / notifyNew / notifySold (dedicated PATCH).
  const { item, alreadyWatching } = await createOrReuseAreaMonitor(
    {
      findEquivalent: (match) =>
        prisma.areaMonitor.findFirst({ where: match }),
      create: (row) =>
        prisma.areaMonitor.create({
          data: { ...row, name },
        }),
    },
    {
      ...criteria,
      notifyNew: data.notifyNew ?? true,
      notifySold: data.notifySold ?? true,
      emailAlerts: data.emailAlerts ?? true,
      lastSeenListingAt: new Date(),
    },
  );

  if (!alreadyWatching) {
    void recordActivityEvent({
      type: "WATCH_AREA",
      userId: user.id,
      path: "/account/watchlist",
      title: `Area watch: ${name}`,
      meta: { areaMonitorId: item.id, city, community },
    });
  }

  return NextResponse.json(
    alreadyWatching ? { ok: true, item, alreadyWatching: true } : { ok: true, item },
  );
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

  const parsed = areaMonitorSettingsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid preference." }, { status: 400 });
  }

  const result = await patchAreaMonitorSettings(
    prismaAreaMonitorSettingsStore(),
    {
      userId: user.id,
      id: parsed.data.id,
      ...areaMonitorSettingsPatchData(parsed.data),
    },
  );
  if (!result.ok) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, item: result.item });
}

const deleteSchema = z.union([
  z.object({ id: z.string().min(1) }),
  z.object({
    city: z.string().trim().min(1).max(80),
    community: z.string().trim().max(80).optional().nullable(),
    transactionType: z.enum(["SALE", "LEASE", "ALL"]).optional(),
    segment: z
      .enum(["RESIDENTIAL", "COMMERCIAL", "PRE_CONSTRUCTION"])
      .optional()
      .nullable(),
  }),
]);

export async function DELETE(request: Request) {
  const access = await requireFullCustomerUser();
  if (access.denied) return access.denied;
  const user = access.user;

  const parsed = deleteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid area." }, { status: 400 });
  }

  const lookup =
    "id" in parsed.data
      ? { userId: user.id, id: parsed.data.id }
      : {
          userId: user.id,
          city: parsed.data.city,
          community: parsed.data.community || null,
          transactionType: parsed.data.transactionType,
          segment: parsed.data.segment,
        };

  const result = await deleteOwnedAreaMonitor(
    prismaAreaMonitorSettingsStore(),
    lookup,
  );

  if (result.deleted) {
    await logAreaWatchRemovedBestEffort({
      customerId: user.id,
      workspaceId: user.workspaceId,
      areaMonitorId: result.snapshot.id,
      city: result.snapshot.city,
      community: result.snapshot.community,
      transactionType: result.snapshot.transactionType,
      segment: result.snapshot.segment,
      name: result.snapshot.name,
      source: "account_area_monitors",
      actorUserId: user.id,
    });
    if (user.workspaceId) {
      scheduleAssignedAgentAwareness({
        customerId: user.id,
        workspaceId: user.workspaceId,
        event: "area_watch_removed",
        areaLabel: areaWatchAwarenessLabel({
          city: result.snapshot.city,
          community: result.snapshot.community,
        }),
      });
    }
  }

  return NextResponse.json({ ok: true });
}
