import { prisma } from "@/lib/prisma";
import {
  audienceForPushType,
  isPushTypeEnabled,
  shellForAudience,
  type PushType,
} from "@/lib/notifications/catalog";

export type PushPayload = {
  type: PushType;
  title: string;
  body: string;
  href?: string;
};

function fcmServerKey() {
  return (
    process.env.FCM_SERVER_KEY?.trim() ||
    process.env.FIREBASE_CLOUD_MESSAGING_KEY?.trim() ||
    ""
  );
}

async function deliverFcm(token: string, payload: PushPayload) {
  const key = fcmServerKey();
  if (!key) {
    console.info("[push:stub]", payload.type, payload.title);
    return "skipped" as const;
  }

  try {
    const res = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        Authorization: `key=${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          type: payload.type,
          href: payload.href ?? "",
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[push:fcm]", res.status, text);
      if (res.status === 400 || text.includes("NotRegistered")) {
        await prisma.pushDevice.deleteMany({ where: { token } }).catch(() => null);
      }
      return "failed" as const;
    }
    return "sent" as const;
  } catch (error) {
    console.error("[push:fcm]", error);
    return "failed" as const;
  }
}

export async function sendPushToUser(
  userId: string | null | undefined,
  payload: PushPayload,
) {
  if (!userId) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, disabledAt: true, pushNotificationPrefs: true },
  });
  if (!user || user.disabledAt) return;
  if (!isPushTypeEnabled(user.pushNotificationPrefs, payload.type)) return;

  const shell = shellForAudience(audienceForPushType(payload.type));
  const devices = await prisma.pushDevice.findMany({
    where: { userId, shell },
    select: { token: true },
  });

  if (devices.length === 0) {
    console.info("[push:no-device]", userId, payload.type);
    return;
  }

  await Promise.all(devices.map((d) => deliverFcm(d.token, payload)));
}

export async function sendPushToUsers(
  userIds: Array<string | null | undefined>,
  payload: PushPayload,
) {
  const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  await Promise.all(unique.map((id) => sendPushToUser(id, payload)));
}

/** One lock-screen alert for the first enabled type (digest = morning or matches). */
export async function sendPushToUserFirstEnabled(
  userId: string | null | undefined,
  types: PushType[],
  payload: Omit<PushPayload, "type">,
) {
  if (!userId || types.length === 0) return;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { disabledAt: true, pushNotificationPrefs: true },
  });
  if (!user || user.disabledAt) return;
  const type = types.find((item) =>
    isPushTypeEnabled(user.pushNotificationPrefs, item),
  );
  if (!type) return;
  await sendPushToUser(userId, { ...payload, type });
}
