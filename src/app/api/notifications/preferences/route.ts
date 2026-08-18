import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { isAgentRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import {
  catalogForAudience,
  isPushTypeEnabled,
  mergePushPrefs,
  type PushAudience,
} from "@/lib/notifications/catalog";

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
  const items = catalogForAudience(audience).map((item) => ({
    ...item,
    enabled: isPushTypeEnabled(user.pushNotificationPrefs, item.id),
  }));

  return NextResponse.json({ audience, items });
}

const patchSchema = z.object({
  prefs: z.record(z.string(), z.boolean()),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid preferences." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, pushNotificationPrefs: true, disabledAt: true },
  });
  if (!user || user.disabledAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const audience = audienceForRole(user.role);
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
