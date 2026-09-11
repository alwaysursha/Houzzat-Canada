import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import { tryGetCloudflareEnvSync } from "@/lib/runtime/cloudflare-context";
import {
  audienceForPushType,
  isPushTypeEnabled,
  shellForAudience,
  type PushType,
} from "@/lib/notifications/catalog";
import {
  HOUZZAT_PRO_ALERTS_CHANNEL_ID,
  HOUZZAT_UPDATES_CHANNEL_ID,
} from "@/lib/notifications/android-channel";

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
  type?: string;
  project_id: string;
  client_email: string;
  private_key: string;
};

export type FcmFailureCategory =
  | "firebase_service_account_missing"
  | "firebase_service_account_invalid"
  | "firebase_project_mismatch"
  | "firebase_oauth_failed"
  | "firebase_private_key_invalid"
  | "fcm_permission_denied"
  | "fcm_api_not_enabled"
  | "fcm_invalid_argument"
  | "fcm_sender_id_mismatch"
  | "fcm_unregistered"
  | "fcm_internal_error"
  | "fcm_unknown"
  | "fcm_stubbed";

export type FirebaseServiceAccountInspect = {
  bindingPresent: boolean;
  jsonParseOk: boolean;
  typeIsServiceAccount: boolean;
  hasProjectId: boolean;
  hasClientEmail: boolean;
  hasPrivateKey: boolean;
  privateKeyLooksPem: boolean;
  projectIdMatchesExpected: boolean;
  expectedProjectId: string;
  /** Masked prefix only — never full project beyond exact match check. */
  projectIdPrefix: string | null;
};

export type PushDeliveryStatus =
  | "sent"
  | "failed"
  | "skipped"
  | "unregistered"
  | "no_device"
  | "pref_off"
  | "disabled";

export type PushDeliveryDetail = {
  status: PushDeliveryStatus;
  failureCategory?: FcmFailureCategory;
  providerHttpStatus?: number;
};

const EXPECTED_FIREBASE_PROJECT_ID = "houzzat-aa1b0";

type CachedAccessToken = {
  value: string;
  exp: number;
};

let cachedAccessToken: CachedAccessToken | null = null;

function readServiceAccountJson(): string {
  const env = tryGetCloudflareEnvSync() as FirebaseBindings | null;
  const fromBinding = env?.FIREBASE_SERVICE_ACCOUNT;
  if (typeof fromBinding === "string" && fromBinding.trim()) {
    return fromBinding.trim();
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
      type: typeof parsed.type === "string" ? parsed.type : undefined,
      project_id: parsed.project_id,
      client_email: parsed.client_email,
      private_key: parsed.private_key,
    };
  } catch {
    return null;
  }
}

/** Normalize common Wrangler-secret newline escaping for PEM keys. */
function normalizePrivateKeyPem(pem: string): string {
  return pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
}

/**
 * Sanitized service-account shape check. Never returns secret material.
 * Expected secret format: one JSON string (raw service-account object),
 * not base64, not double-encoded.
 */
export function inspectFirebaseServiceAccountShape(
  expectedProjectId: string = EXPECTED_FIREBASE_PROJECT_ID,
): FirebaseServiceAccountInspect {
  const raw = readServiceAccountJson();
  const bindingPresent = Boolean(raw);
  if (!bindingPresent) {
    return {
      bindingPresent: false,
      jsonParseOk: false,
      typeIsServiceAccount: false,
      hasProjectId: false,
      hasClientEmail: false,
      hasPrivateKey: false,
      privateKeyLooksPem: false,
      projectIdMatchesExpected: false,
      expectedProjectId,
      projectIdPrefix: null,
    };
  }

  let parsed: Partial<ServiceAccount> | null = null;
  let jsonParseOk = false;
  try {
    parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    jsonParseOk = true;
  } catch {
    parsed = null;
  }

  const projectId =
    typeof parsed?.project_id === "string" ? parsed.project_id : null;
  const privateKey =
    typeof parsed?.private_key === "string" ? parsed.private_key : null;
  const normalizedKey = privateKey ? normalizePrivateKeyPem(privateKey) : null;

  return {
    bindingPresent: true,
    jsonParseOk,
    typeIsServiceAccount: parsed?.type === "service_account",
    hasProjectId: Boolean(projectId),
    hasClientEmail: Boolean(parsed?.client_email),
    hasPrivateKey: Boolean(privateKey),
    privateKeyLooksPem: Boolean(
      normalizedKey?.includes("BEGIN PRIVATE KEY") &&
        normalizedKey.includes("END PRIVATE KEY"),
    ),
    projectIdMatchesExpected: projectId === expectedProjectId,
    expectedProjectId,
    projectIdPrefix: projectId ? projectId.slice(0, 8) : null,
  };
}

/**
 * Classify Google FCM / OAuth error text into a non-secret category.
 * Never include tokens, emails, or raw keys.
 */
export function classifyFcmProviderError(
  httpStatus: number | null,
  bodyText: string,
): FcmFailureCategory {
  const lower = bodyText.toLowerCase();

  if (
    httpStatus === 404 ||
    lower.includes("unregistered") ||
    lower.includes("notregistered") ||
    lower.includes('"not_found"') ||
    lower.includes("not found")
  ) {
    return "fcm_unregistered";
  }
  if (
    lower.includes("senderidmismatch") ||
    lower.includes("sender_id_mismatch") ||
    lower.includes("mismatched_credential")
  ) {
    return "fcm_sender_id_mismatch";
  }
  if (
    lower.includes("permission_denied") ||
    lower.includes("permission denied") ||
    httpStatus === 403
  ) {
    if (
      lower.includes("firebasecloudmessaging") ||
      lower.includes("has not been used") ||
      lower.includes("api has not been enabled") ||
      lower.includes("service_disabled")
    ) {
      return "fcm_api_not_enabled";
    }
    return "fcm_permission_denied";
  }
  if (
    lower.includes("invalid_argument") ||
    lower.includes("invalid argument") ||
    httpStatus === 400
  ) {
    return "fcm_invalid_argument";
  }
  if (httpStatus === 401 || lower.includes("unauthorized")) {
    return "firebase_oauth_failed";
  }
  if (
    httpStatus === 500 ||
    httpStatus === 503 ||
    lower.includes("internal") ||
    lower.includes("unavailable")
  ) {
    return "fcm_internal_error";
  }
  return "fcm_unknown";
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
  const cleaned = normalizePrivateKeyPem(pem)
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

async function getAccessToken(
  account: ServiceAccount,
): Promise<{ token: string } | { error: FcmFailureCategory }> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.exp - 60 > now) {
    return { token: cachedAccessToken.value };
  }

  let key: CryptoKey;
  try {
    key = await importPrivateKey(account.private_key);
  } catch (error) {
    console.error("[push:fcm] private_key import failed", error instanceof Error ? error.name : "error");
    return { error: "firebase_private_key_invalid" };
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
    const text = await res.text();
    console.error("[push:fcm] token", res.status, text.slice(0, 200));
    return { error: "firebase_oauth_failed" };
  }
  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token) return { error: "firebase_oauth_failed" };
  cachedAccessToken = {
    value: body.access_token,
    exp: now + (body.expires_in ?? 3600),
  };
  return { token: body.access_token };
}

function isUnregisteredToken(status: number, body: string): boolean {
  return classifyFcmProviderError(status, body) === "fcm_unregistered";
}

async function deliverFcm(
  token: string,
  payload: PushPayload,
): Promise<PushDeliveryDetail> {
  const raw = readServiceAccountJson();
  if (!raw) {
    console.info("[push:stub]", payload.type, payload.title);
    return { status: "skipped", failureCategory: "fcm_stubbed" };
  }

  const account = parseServiceAccount(raw);
  if (!account) {
    console.error("[push:fcm] invalid FIREBASE_SERVICE_ACCOUNT JSON");
    return {
      status: "failed",
      failureCategory: "firebase_service_account_invalid",
    };
  }

  if (account.project_id !== EXPECTED_FIREBASE_PROJECT_ID) {
    console.error(
      "[push:fcm] project_id mismatch",
      account.project_id.slice(0, 8),
    );
    return {
      status: "failed",
      failureCategory: "firebase_project_mismatch",
    };
  }

  try {
    const access = await getAccessToken(account);
    if ("error" in access) {
      return { status: "failed", failureCategory: access.error };
    }

    const shell = shellForAudience(audienceForPushType(payload.type));
    const androidConfig =
      shell === "houzzat"
        ? {
            priority: "HIGH" as const,
            notification: {
              channel_id: HOUZZAT_UPDATES_CHANNEL_ID,
              notification_priority: "PRIORITY_HIGH" as const,
              default_sound: true,
              default_vibrate_timings: true,
              visibility: "PUBLIC" as const,
            },
          }
        : {
            priority: "HIGH" as const,
            notification: {
              channel_id: HOUZZAT_PRO_ALERTS_CHANNEL_ID,
              notification_priority: "PRIORITY_HIGH" as const,
              default_sound: true,
              default_vibrate_timings: true,
              // CRM payloads may include customer names/addresses — private lock screen.
              visibility: "PRIVATE" as const,
            },
          };

    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access.token}`,
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
            android: androidConfig,
          },
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      const category = classifyFcmProviderError(res.status, text);
      console.error("[push:fcm]", res.status, category, text.slice(0, 240));
      if (isUnregisteredToken(res.status, text)) {
        await prisma.pushDevice.deleteMany({ where: { token } }).catch(() => null);
        return {
          status: "unregistered",
          failureCategory: "fcm_unregistered",
          providerHttpStatus: res.status,
        };
      }
      return {
        status: "failed",
        failureCategory: category,
        providerHttpStatus: res.status,
      };
    }
    return { status: "sent" };
  } catch (error) {
    console.error(
      "[push:fcm]",
      error instanceof Error ? error.name : "error",
    );
    return { status: "failed", failureCategory: "fcm_unknown" };
  }
}

export type PushDeliveryResult = {
  userId: string;
  status: PushDeliveryStatus;
  failureCategory?: FcmFailureCategory;
  providerHttpStatus?: number;
};

/** True when Firebase service-account JSON is available (Worker binding or env). */
export function isFirebasePushConfigured(): boolean {
  return Boolean(readServiceAccountJson());
}

/** True when binding parses and matches expected Firebase project shape. */
export function isFirebaseServiceAccountReady(
  expectedProjectId: string = EXPECTED_FIREBASE_PROJECT_ID,
): boolean {
  const inspect = inspectFirebaseServiceAccountShape(expectedProjectId);
  return (
    inspect.bindingPresent &&
    inspect.jsonParseOk &&
    inspect.hasProjectId &&
    inspect.hasClientEmail &&
    inspect.hasPrivateKey &&
    inspect.privateKeyLooksPem &&
    inspect.projectIdMatchesExpected
  );
}

async function deliverPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<PushDeliveryDetail> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, disabledAt: true, pushNotificationPrefs: true },
  });
  if (!user || user.disabledAt) return { status: "disabled" };
  if (!isPushTypeEnabled(user.pushNotificationPrefs, payload.type)) {
    return { status: "pref_off" };
  }

  const shell = shellForAudience(audienceForPushType(payload.type));
  const devices = await prisma.pushDevice.findMany({
    where: { userId, shell },
    select: { token: true },
  });

  if (devices.length === 0) {
    console.info("[push:no-device]", userId, payload.type);
    return { status: "no_device" };
  }

  const results = await Promise.all(devices.map((d) => deliverFcm(d.token, payload)));
  if (results.some((r) => r.status === "sent")) return { status: "sent" };
  if (results.every((r) => r.status === "skipped")) {
    return { status: "skipped", failureCategory: "fcm_stubbed" };
  }
  const unregistered = results.find((r) => r.status === "unregistered");
  if (unregistered) {
    return {
      status: "unregistered",
      failureCategory: "fcm_unregistered",
      providerHttpStatus: unregistered.providerHttpStatus,
    };
  }
  const failed = results.find((r) => r.status === "failed");
  return {
    status: "failed",
    failureCategory: failed?.failureCategory ?? "fcm_unknown",
    providerHttpStatus: failed?.providerHttpStatus,
  };
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

/**
 * Awaitable staff/consumer push for guarded CLI canaries (Node scripts).
 * Same preference + device + FCM path as sendPushToUsers; does not schedule waitUntil.
 * Returns per-user outcomes so canaries can distinguish stub/skip vs sent.
 */
export async function deliverPushToUsersNow(
  userIds: Array<string | null | undefined>,
  payload: PushPayload,
): Promise<PushDeliveryResult[]> {
  const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return [];
  return Promise.all(
    unique.map(async (userId) => {
      const detail = await deliverPushToUser(userId, payload);
      return {
        userId,
        status: detail.status,
        failureCategory: detail.failureCategory,
        providerHttpStatus: detail.providerHttpStatus,
      };
    }),
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
