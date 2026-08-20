import { getCloudflareContext } from "@opennextjs/cloudflare";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
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

type FirebaseBindings = {
  FIREBASE_SERVICE_ACCOUNT?: string;
};

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

type CachedAccessToken = {
  value: string;
  exp: number;
};

let cachedAccessToken: CachedAccessToken | null = null;

function readServiceAccountJson(): string {
  try {
    const { env } = getCloudflareContext();
    const fromBinding = (env as typeof env & FirebaseBindings)
      .FIREBASE_SERVICE_ACCOUNT;
    if (typeof fromBinding === "string" && fromBinding.trim()) {
      return fromBinding.trim();
    }
  } catch {
    // Local scripts / Node — fall through to process.env.
  }
  return process.env.FIREBASE_SERVICE_ACCOUNT?.trim() || "";
}

function parseServiceAccount(raw: string): ServiceAccount | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (
      !parsed.project_id ||
      !parsed.client_email ||
      !parsed.private_key
    ) {
      return null;
    }
    return {
      project_id: parsed.project_id,
      client_email: parsed.client_email,
      private_key: parsed.private_key,
    };
  } catch {
    return null;
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const raw = Uint8Array.from(atob(cleaned), (char) => char.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    raw,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function getAccessToken(account: ServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.exp - 60 > now) {
    return cachedAccessToken.value;
  }

  const header = encodeJson({ alg: "RS256", typ: "JWT" });
  const claims = encodeJson({
    iss: account.client_email,
    sub: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const unsigned = `${header}.${claims}`;
  const key = await importPrivateKey(account.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    console.error("[push:fcm] token", res.status, await res.text());
    return null;
  }
  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token) return null;
  cachedAccessToken = {
    value: body.access_token,
    exp: now + (body.expires_in ?? 3600),
  };
  return body.access_token;
}

function isUnregisteredToken(status: number, body: string): boolean {
  if (status === 404) return true;
  const lower = body.toLowerCase();
  return (
    lower.includes("unregistered") ||
    lower.includes("notregistered") ||
    lower.includes("not_found")
  );
}

async function deliverFcm(token: string, payload: PushPayload) {
  const raw = readServiceAccountJson();
  if (!raw) {
    console.info("[push:stub]", payload.type, payload.title);
    return "skipped" as const;
  }

  const account = parseServiceAccount(raw);
  if (!account) {
    console.error("[push:fcm] invalid FIREBASE_SERVICE_ACCOUNT JSON");
    return "failed" as const;
  }

  try {
    const accessToken = await getAccessToken(account);
    if (!accessToken) return "failed" as const;

    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: {
              type: payload.type,
              href: payload.href ?? "",
            },
            android: { priority: "HIGH" },
          },
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      console.error("[push:fcm]", res.status, text);
      if (isUnregisteredToken(res.status, text)) {
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

async function deliverPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
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

/**
 * Enqueue FCM delivery for one user.
 * Lifetime ownership: scheduleWorkerSideEffect (CF waitUntil) — callers should
 * not wrap again. Returns immediately; does not await FCM.
 */
export function sendPushToUser(
  userId: string | null | undefined,
  payload: PushPayload,
): void {
  if (!userId) return;
  scheduleWorkerSideEffect(deliverPushToUser(userId, payload));
}

export function sendPushToUsers(
  userIds: Array<string | null | undefined>,
  payload: PushPayload,
): void {
  const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return;
  scheduleWorkerSideEffect(
    Promise.all(unique.map((id) => deliverPushToUser(id, payload))),
  );
}

/** One lock-screen alert for the first enabled type (digest = morning or matches). */
export function sendPushToUserFirstEnabled(
  userId: string | null | undefined,
  types: PushType[],
  payload: Omit<PushPayload, "type">,
): void {
  if (!userId || types.length === 0) return;
  scheduleWorkerSideEffect(
    (async () => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { disabledAt: true, pushNotificationPrefs: true },
      });
      if (!user || user.disabledAt) return;
      const type = types.find((item) =>
        isPushTypeEnabled(user.pushNotificationPrefs, item),
      );
      if (!type) return;
      await deliverPushToUser(userId, { ...payload, type });
    })(),
  );
}
