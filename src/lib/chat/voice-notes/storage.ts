/**
 * Private chat media storage for voice notes.
 *
 * Never uses branding public CDN URLs. Playback is always via authorized API
 * streaming — clients never receive raw object credentials or unrestricted URLs.
 *
 * Production Cloudflare: CHAT_MEDIA R2 binding (private bucket).
 * Production Vercel: CHAT_MEDIA_R2_BUCKET_NAME + dedicated chat S3 credentials
 *   (CHAT_MEDIA_R2_ACCESS_KEY_ID / CHAT_MEDIA_R2_SECRET_ACCESS_KEY), with
 *   legacy fallback to branding R2_* keys only when both dedicated vars are absent.
 * Development/test: local private/chat-media (outside public/).
 */

import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { CHAT_MEDIA_STORAGE_NOT_CONFIGURED } from "@/lib/chat/voice-notes/constants";
import { tryGetCloudflareEnvAsync } from "@/lib/runtime/cloudflare-context";

export class ChatMediaStorageNotConfiguredError extends Error {
  readonly code = CHAT_MEDIA_STORAGE_NOT_CONFIGURED;
  readonly status = 503;

  constructor() {
    super("Private chat media storage is not configured.");
    this.name = "ChatMediaStorageNotConfiguredError";
  }
}

type R2Like = {
  put: (
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | null,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>;
  get: (key: string) => Promise<{
    arrayBuffer: () => Promise<ArrayBuffer>;
    httpMetadata?: { contentType?: string };
  } | null>;
  delete: (key: string | string[]) => Promise<void>;
};

type ChatMediaStorageTestDeps = {
  getBucket?: () => Promise<R2Like | null>;
  isProduction?: () => boolean;
  localRoot?: string;
};

let testDeps: ChatMediaStorageTestDeps | null = null;

/** Selftest-only — never call from production request paths. */
export function setChatMediaStorageTestDeps(
  deps: ChatMediaStorageTestDeps | null,
): void {
  testDeps = deps;
}

function isProductionRuntime(): boolean {
  if (testDeps?.isProduction) return testDeps.isProduction();
  return process.env.NODE_ENV === "production";
}

function isR2Like(value: unknown): value is R2Like {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as R2Like).put === "function" &&
    typeof (value as R2Like).get === "function" &&
    typeof (value as R2Like).delete === "function"
  );
}

function trimEnv(name: string): string | null {
  const raw = process.env[name]?.trim();
  return raw || null;
}

function localRootDir(): string {
  if (testDeps?.localRoot) return testDeps.localRoot;
  return path.join(process.cwd(), "private", "chat-media");
}

export type ChatMediaR2S3Config = {
  accessKeyId: string;
  secretAccessKey: string;
  endpointOrigin: string;
  bucket: string;
  /** Which credential pair was selected (never logged with secret values). */
  credentialSource: "chat-dedicated" | "legacy-shared";
};

function parseHttpsEndpointOrigin(endpointRaw: string): string | null {
  try {
    const url = new URL(endpointRaw);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (url.pathname && url.pathname !== "/") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Resolve Vercel/Node S3 config for the private chat-media bucket.
 *
 * Credential selection (fail closed — never mix pairs):
 * 1. Both CHAT_MEDIA_R2_ACCESS_KEY_ID + CHAT_MEDIA_R2_SECRET_ACCESS_KEY → dedicated.
 * 2. Exactly one of those two set → null (do not fall back to branding keys).
 * 3. Neither set → legacy shared R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY.
 *
 * Endpoint: optional CHAT_MEDIA_R2_S3_ENDPOINT, else shared R2_S3_ENDPOINT.
 * Bucket: always CHAT_MEDIA_R2_BUCKET_NAME (never R2_BUCKET_NAME).
 */
export function readChatMediaR2S3Config(): ChatMediaR2S3Config | null {
  const bucket = trimEnv("CHAT_MEDIA_R2_BUCKET_NAME");
  if (!bucket) return null;

  const dedicatedAccessKeyId = trimEnv("CHAT_MEDIA_R2_ACCESS_KEY_ID");
  const dedicatedSecretAccessKey = trimEnv("CHAT_MEDIA_R2_SECRET_ACCESS_KEY");
  const dedicatedKeyPresent = Boolean(dedicatedAccessKeyId);
  const dedicatedSecretPresent = Boolean(dedicatedSecretAccessKey);

  if (dedicatedKeyPresent !== dedicatedSecretPresent) {
    // Incomplete dedicated pair — never substitute the missing half from branding.
    return null;
  }

  let accessKeyId: string;
  let secretAccessKey: string;
  let credentialSource: ChatMediaR2S3Config["credentialSource"];

  if (dedicatedKeyPresent && dedicatedSecretPresent) {
    accessKeyId = dedicatedAccessKeyId!;
    secretAccessKey = dedicatedSecretAccessKey!;
    credentialSource = "chat-dedicated";
  } else {
    const sharedAccessKeyId = trimEnv("R2_ACCESS_KEY_ID");
    const sharedSecretAccessKey = trimEnv("R2_SECRET_ACCESS_KEY");
    if (!sharedAccessKeyId || !sharedSecretAccessKey) return null;
    accessKeyId = sharedAccessKeyId;
    secretAccessKey = sharedSecretAccessKey;
    credentialSource = "legacy-shared";
  }

  const endpointRaw =
    trimEnv("CHAT_MEDIA_R2_S3_ENDPOINT") || trimEnv("R2_S3_ENDPOINT");
  if (!endpointRaw) return null;

  const endpointOrigin = parseHttpsEndpointOrigin(endpointRaw);
  if (!endpointOrigin) return null;

  return {
    accessKeyId,
    secretAccessKey,
    endpointOrigin,
    bucket,
    credentialSource,
  };
}

async function getChatMediaBucket(): Promise<R2Like | null> {
  if (testDeps?.getBucket) return testDeps.getBucket();

  const env = await tryGetCloudflareEnvAsync();
  const binding = env?.CHAT_MEDIA;
  if (isR2Like(binding)) return binding;

  const s3 = readChatMediaR2S3Config();
  if (s3) {
    return createPrivateR2S3Bucket(s3);
  }
  return null;
}

function encodeS3Path(bucket: string, objectKey: string): string {
  const rfc3986 = (value: string) =>
    encodeURIComponent(value).replace(
      /[!'()*]/g,
      (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  const keyPath = objectKey.split("/").map(rfc3986).join("/");
  return `/${rfc3986(bucket)}/${keyPath}`;
}

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function createPrivateR2S3Bucket(config: {
  accessKeyId: string;
  secretAccessKey: string;
  endpointOrigin: string;
  bucket: string;
}): R2Like {
  async function signed(
    method: "PUT" | "GET" | "DELETE",
    objectKey: string,
    body: Buffer,
    contentType?: string,
  ): Promise<Response> {
    const host = new URL(config.endpointOrigin).host;
    const canonicalUri = encodeS3Path(config.bucket, objectKey);
    const payloadHash =
      method === "GET" || method === "DELETE"
        ? sha256Hex(Buffer.alloc(0))
        : sha256Hex(body);
    const amz = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amz.slice(0, 8);
    const headers: Record<string, string> = {
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amz,
    };
    if (method === "PUT" && contentType) {
      headers["content-type"] = contentType;
    }
    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames
      .map((name) => `${name}:${headers[name]}\n`)
      .join("");
    const signedHeaders = signedHeaderNames.join(";");
    const canonicalRequest = [
      method,
      canonicalUri,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amz,
      credentialScope,
      sha256Hex(Buffer.from(canonicalRequest, "utf8")),
    ].join("\n");
    const kDate = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, "auto");
    const kService = hmac(kRegion, "s3");
    const kSigning = hmac(kService, "aws4_request");
    const signature = hmac(kSigning, stringToSign).toString("hex");
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const requestHeaders = new Headers();
    requestHeaders.set("authorization", authorization);
    requestHeaders.set("host", host);
    requestHeaders.set("x-amz-content-sha256", payloadHash);
    requestHeaders.set("x-amz-date", amz);
    if (method === "PUT" && contentType) {
      requestHeaders.set("content-type", contentType);
    }

    return fetch(`${config.endpointOrigin}${canonicalUri}`, {
      method,
      headers: requestHeaders,
      body: method === "PUT" ? new Uint8Array(body) : undefined,
    });
  }

  return {
    async put(key, value, options) {
      const body =
        value == null
          ? Buffer.alloc(0)
          : typeof value === "string"
            ? Buffer.from(value, "utf8")
            : value instanceof ArrayBuffer
              ? Buffer.from(value)
              : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      const res = await signed(
        "PUT",
        key,
        body,
        options?.httpMetadata?.contentType,
      );
      if (!res.ok) throw new Error("Chat media storage put failed.");
    },
    async get(key) {
      const res = await signed("GET", key, Buffer.alloc(0));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Chat media storage get failed.");
      const buffer = Buffer.from(await res.arrayBuffer());
      return {
        arrayBuffer: async () =>
          buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength,
          ),
        httpMetadata: {
          contentType: res.headers.get("content-type") ?? undefined,
        },
      };
    },
    async delete(key) {
      const keys = Array.isArray(key) ? key : [key];
      for (const objectKey of keys) {
        const res = await signed("DELETE", objectKey, Buffer.alloc(0));
        if (!res.ok && res.status !== 404) {
          throw new Error("Chat media storage delete failed.");
        }
      }
    },
  };
}

async function putLocal(objectKey: string, bytes: Uint8Array): Promise<void> {
  const full = path.join(localRootDir(), objectKey);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
}

async function getLocal(objectKey: string): Promise<Uint8Array | null> {
  try {
    const full = path.join(localRootDir(), objectKey);
    return await readFile(full);
  } catch {
    return null;
  }
}

async function deleteLocal(objectKey: string): Promise<void> {
  try {
    await unlink(path.join(localRootDir(), objectKey));
  } catch {
    // best-effort cleanup
  }
}

export function chatMediaStorageConfiguredSyncHint(): {
  configured: boolean;
  mode: "r2-binding" | "r2-s3" | "local-dev" | "missing";
  blocker: string | null;
} {
  if (process.env.CHAT_MEDIA_FORCE_LOCAL === "1" && !isProductionRuntime()) {
    return { configured: true, mode: "local-dev", blocker: null };
  }
  if (readChatMediaR2S3Config()) {
    return { configured: true, mode: "r2-s3", blocker: null };
  }
  if (isProductionRuntime()) {
    const dedicatedPartial =
      Boolean(trimEnv("CHAT_MEDIA_R2_ACCESS_KEY_ID")) !==
      Boolean(trimEnv("CHAT_MEDIA_R2_SECRET_ACCESS_KEY"));
    return {
      configured: false,
      mode: "missing",
      blocker: dedicatedPartial
        ? "CHAT_MEDIA_R2_ACCESS_KEY_ID and CHAT_MEDIA_R2_SECRET_ACCESS_KEY must both be set (incomplete dedicated chat credentials). " +
          "Do not mix chat keys with branding R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY."
        : "Configure Cloudflare R2 binding CHAT_MEDIA (private bucket, no public CDN), " +
          "or set CHAT_MEDIA_R2_BUCKET_NAME with CHAT_MEDIA_R2_ACCESS_KEY_ID / CHAT_MEDIA_R2_SECRET_ACCESS_KEY " +
          "(preferred) or legacy R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY, plus R2_S3_ENDPOINT. " +
          "Do not use BRANDING_ASSETS or BRANDING_ASSETS_PUBLIC_BASE_URL for chat audio.",
    };
  }
  return { configured: true, mode: "local-dev", blocker: null };
}

export async function putChatMediaObject(input: {
  objectKey: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<{ objectKey: string }> {
  const bucket = await getChatMediaBucket();
  if (bucket) {
    await bucket.put(input.objectKey, input.bytes, {
      httpMetadata: { contentType: input.contentType },
    });
    return { objectKey: input.objectKey };
  }
  if (isProductionRuntime()) {
    throw new ChatMediaStorageNotConfiguredError();
  }
  await putLocal(input.objectKey, input.bytes);
  return { objectKey: input.objectKey };
}

export async function getChatMediaObject(input: {
  objectKey: string;
}): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
  const bucket = await getChatMediaBucket();
  if (bucket) {
    const object = await bucket.get(input.objectKey);
    if (!object) return null;
    const buffer = Buffer.from(await object.arrayBuffer());
    return {
      bytes: buffer,
      contentType: object.httpMetadata?.contentType ?? null,
    };
  }
  if (isProductionRuntime()) {
    throw new ChatMediaStorageNotConfiguredError();
  }
  const bytes = await getLocal(input.objectKey);
  if (!bytes) return null;
  return { bytes, contentType: null };
}

export async function deleteChatMediaObject(objectKey: string): Promise<void> {
  const bucket = await getChatMediaBucket();
  if (bucket) {
    await bucket.delete(objectKey);
    return;
  }
  if (isProductionRuntime()) return;
  await deleteLocal(objectKey);
}
