import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFullCustomerUser } from "@/lib/account";
import { createOrReuseAreaMonitor } from "@/lib/account/area-monitor-create";
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

  if ("id" in parsed.data) {
    await prisma.areaMonitor.deleteMany({
      where: { id: parsed.data.id, userId: user.id },
    });
  } else {
    const data = parsed.data;
    await prisma.areaMonitor.deleteMany({
      where: {
        userId: user.id,
        city: data.city,
        community: data.community || null,
        ...(data.transactionType
          ? { transactionType: data.transactionType }
          : {}),
        ...(data.segment ? { segment: data.segment } : {}),
      },
    });
  }

  return NextResponse.json({ ok: true });
}
