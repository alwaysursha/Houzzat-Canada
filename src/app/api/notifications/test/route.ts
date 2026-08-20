import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/notifications/push";

/** Per-isolate rate limit (Workers: best-effort; not global). */
const lastSentAt = new Map<string, number>();
const MIN_INTERVAL_MS = 60_000;

/**
 * Send a single test FCM to the signed-in user's Houzzat consumer devices.
 * Same deliver path as production. Never accepts client title/body/href/userId.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const now = Date.now();
  const prev = lastSentAt.get(userId) ?? 0;
  if (now - prev < MIN_INTERVAL_MS) {
    return NextResponse.json(
      { error: "Wait a minute before sending another test." },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, disabledAt: true },
  });
  if (!user || user.disabledAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const devices = await prisma.pushDevice.count({
    where: { userId, shell: "houzzat" },
  });
  if (devices === 0) {
    return NextResponse.json(
      {
        error:
          "No Houzzat phone registered yet. Enable notifications on this device first.",
      },
      { status: 400 },
    );
  }

  lastSentAt.set(userId, now);

  sendPushToUser(userId, {
    type: "property_update",
    title: "Houzzat test notification",
    body: "Push is working. Tap to open notification settings.",
    href: "/account/notifications",
  });

  return NextResponse.json({ ok: true });
}
