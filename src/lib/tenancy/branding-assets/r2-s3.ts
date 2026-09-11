/**
 * Vercel-only S3-compatible client for the existing branding R2 bucket.
 * Cloudflare Workers keep using the native BRANDING_ASSETS binding.
 */

import { createHash, createHmac } from "node:crypto";

const R2_S3_REGION = "auto";
const R2_S3_SERVICE = "s3";

export type R2S3Config = {
  accessKeyId: string;
  secretAccessKey: string;
  endpointOrigin: string;
  bucket: string;
};

export type R2S3Like = {
  put: (
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | null,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>;
  delete: (key: string | string[]) => Promise<void>;
};

function trimEnv(name: string): string | null {
  const raw = process.env[name]?.trim();
  return raw || null;
}

/** Vercel Node only. Incomplete or non-HTTPS config → null (fail closed). */
export function readVercelR2S3Config(): R2S3Config | null {
  if (!process.env.VERCEL) return null;

  const accessKeyId = trimEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = trimEnv("R2_SECRET_ACCESS_KEY");
  const bucket = trimEnv("R2_BUCKET_NAME");
  const endpointRaw = trimEnv("R2_S3_ENDPOINT");
  if (!accessKeyId || !secretAccessKey || !bucket || !endpointRaw) {
    return null;
  }

  let origin: string;
  try {
    const url = new URL(endpointRaw);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (url.pathname && url.pathname !== "/") return null;
    origin = url.origin;
  } catch {
    return null;
  }

  return {
    accessKeyId,
    secretAccessKey,
    endpointOrigin: origin,
    bucket,
  };
}

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function rfc3986Encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeS3Path(bucket: string, objectKey: string): string {
  const keyPath = objectKey
    .split("/")
    .map((segment) => rfc3986Encode(segment))
    .join("/");
  return `/${rfc3986Encode(bucket)}/${keyPath}`;
}

function toBodyBuffer(
  value: ArrayBuffer | ArrayBufferView | string | null,
): Buffer {
  if (value == null) return Buffer.alloc(0);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

function amzDate(now: Date): { amz: string; dateStamp: string } {
  const amz = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz, dateStamp: amz.slice(0, 8) };
}

async function signedS3Fetch(
  config: R2S3Config,
  method: "PUT" | "DELETE",
  objectKey: string,
  body: Buffer,
  contentType: string | undefined,
): Promise<void> {
  const host = new URL(config.endpointOrigin).host;
  const canonicalUri = encodeS3Path(config.bucket, objectKey);
  const payloadHash = sha256Hex(body);
  const { amz, dateStamp } = amzDate(new Date());

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

  const credentialScope = `${dateStamp}/${R2_S3_REGION}/${R2_S3_SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amz,
    credentialScope,
    sha256Hex(Buffer.from(canonicalRequest, "utf8")),
  ].join("\n");

  const kDate = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, R2_S3_REGION);
  const kService = hmac(kRegion, R2_S3_SERVICE);
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

  const url = `${config.endpointOrigin}${canonicalUri}`;
  const res = await fetch(url, {
    method,
    headers: requestHeaders,
    body: method === "PUT" ? new Uint8Array(body) : undefined,
  });
  if (!res.ok) {
    throw new Error("Brand asset storage request failed.");
  }
}

export function createR2S3Bucket(config: R2S3Config): R2S3Like {
  return {
    async put(key, value, options) {
      await signedS3Fetch(
        config,
        "PUT",
        key,
        toBodyBuffer(value),
        options?.httpMetadata?.contentType,
      );
    },
    async delete(key) {
      const keys = Array.isArray(key) ? key : [key];
      for (const objectKey of keys) {
        await signedS3Fetch(
          config,
          "DELETE",
          objectKey,
          Buffer.alloc(0),
          undefined,
        );
      }
    },
  };
}
