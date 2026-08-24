import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { isAgentRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import {
  catalogForAudience,
  isPushTypeEnabled,
  mergePushPrefs,
  type PushAudience,
} from "@/lib/notifications/catalog";
import {
  isStaffNotificationCategory,
  mergeStaffCategoryPrefs,
  staffCategoriesForUi,
  type StaffCategoryChannel,
} from "@/lib/notifications/staff-categories";

function audienceForRole(role: string | undefined): PushAudience {
  if (isAgentRole(role)) return "staff";
  return "consumer";
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { pushNotificationPrefs: true, role: true, disabledAt: true },
  });
  if (!user || user.disabledAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const audience = audienceForRole(user.role);
  if (audience === "staff") {
    return NextResponse.json({
      audience,
      categories: staffCategoriesForUi(user.pushNotificationPrefs),
    });
  }

  const items = catalogForAudience(audience).map((item) => ({
    ...item,
    enabled: isPushTypeEnabled(user.pushNotificationPrefs, item.id),
  }));

  return NextResponse.json({ audience, items });
}

const consumerPatchSchema = z.object({
  prefs: z.record(z.string(), z.boolean()),
});

const staffPatchSchema = z.object({
  category: z.string(),
  channel: z.enum(["push", "email"]),
  enabled: z.boolean(),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, pushNotificationPrefs: true, disabledAt: true },
  });
  if (!user || user.disabledAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const audience = audienceForRole(user.role);

  if (audience === "staff") {
    const parsed = staffPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid preferences." }, { status: 400 });
    }
    if (!isStaffNotificationCategory(parsed.data.category)) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }
    const channel = parsed.data.channel as StaffCategoryChannel;
    const next = mergeStaffCategoryPrefs(user.pushNotificationPrefs, {
      category: parsed.data.category,
      channel,
      enabled: parsed.data.enabled,
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        pushNotificationPrefs: next as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      ok: true,
      audience,
      categories: staffCategoriesForUi(next),
    });
  }

  const parsed = consumerPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid preferences." }, { status: 400 });
  }

  const next = mergePushPrefs(
    user.pushNotificationPrefs,
    parsed.data.prefs,
    audience,
  );

  await prisma.user.update({
    where: { id: user.id },
    data: { pushNotificationPrefs: next },
  });

  const items = catalogForAudience(audience).map((item) => ({
    ...item,
    enabled: isPushTypeEnabled(next, item.id),
  }));

  return NextResponse.json({ ok: true, audience, items });
}
