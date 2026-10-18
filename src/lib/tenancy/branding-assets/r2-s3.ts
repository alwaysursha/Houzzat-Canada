/**
 * Vercel-only S3-compatible client for the existing branding R2 bucket.
 * Cloudflare Workers keep using the native BRANDING_ASSETS binding.
 */

import { createHash, createHmac } from "node:crypto";

const R2_S3_REGION = "auto";
const R2_S3_SERVICE = "s3";

/** Bound how much of a failed response we read for Code extraction (never logged). */
const MAX_ERROR_BODY_BYTES = 4_096;

/** Allowlisted S3/R2 error codes safe to surface in server logs. */
const RECOGNIZED_S3_ERROR_CODES = new Set([
  "AccessDenied",
  "SignatureDoesNotMatch",
  "InvalidAccessKeyId",
  "NoSuchBucket",
  "InvalidArgument",
  "InvalidRequest",
  "EntityTooLarge",
  "IncompleteBody",
  "InternalError",
  "ServiceUnavailable",
  "SlowDown",
  "RequestTimeout",
  "NoSuchKey",
  "MethodNotAllowed",
  "AccessDeniedException",
]);

const SAFE_REQUEST_ID_HEADER_NAMES = [
  "x-amz-request-id",
  "x-amz-id-2",
] as const;

const SAFE_REQUEST_ID_RE = /^[A-Za-z0-9+/=._:-]{1,128}$/;

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

export type BrandingAssetStorageOperation = "PUT" | "DELETE";

export type BrandingAssetStorageFailureDiagnostics = {
  operation: BrandingAssetStorageOperation;
  httpStatus: number;
  s3ErrorCode: string;
  requestId: string | null;
};

/**
 * Storage request failed after reaching R2 (non-2xx).
 * Message stays generic for clients; safe fields are for server logs only.
 */
export class BrandingAssetStorageRequestError extends Error {
  readonly operation: BrandingAssetStorageOperation;
  readonly httpStatus: number;
  readonly s3ErrorCode: string;
  readonly requestId: string | null;

  constructor(diagnostics: BrandingAssetStorageFailureDiagnostics) {
    super("Brand asset storage request failed.");
    this.name = "BrandingAssetStorageRequestError";
    this.operation = diagnostics.operation;
    this.httpStatus = diagnostics.httpStatus;
    this.s3ErrorCode = diagnostics.s3ErrorCode;
    this.requestId = diagnostics.requestId;
  }
}

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

/**
 * Extract allowlisted `<Code>…</Code>` from a bounded S3 error XML snippet.
 * Never returns unrecognized codes; never throws.
 */
export function recognizeS3ErrorCodeFromXml(xmlSnippet: string): string {
  try {
    const match = /<Code>([A-Za-z][A-Za-z0-9_]{1,63})<\/Code>/.exec(xmlSnippet);
    if (!match) return "UNKNOWN";
    const code = match[1]!;
    if (!RECOGNIZED_S3_ERROR_CODES.has(code)) return "UNKNOWN";
    return code;
  } catch {
    return "UNKNOWN";
  }
}

function safeRequestIdFromHeaders(headers: Headers): string | null {
  for (const name of SAFE_REQUEST_ID_HEADER_NAMES) {
    const raw = headers.get(name)?.trim();
    if (!raw) continue;
    if (!SAFE_REQUEST_ID_RE.test(raw)) continue;
    return raw;
  }
  return null;
}

async function buildStorageFailureDiagnostics(
  operation: BrandingAssetStorageOperation,
  res: Response,
): Promise<BrandingAssetStorageFailureDiagnostics> {
  const httpStatus =
    typeof res.status === "number" && Number.isFinite(res.status)
      ? res.status
      : 0;
  let s3ErrorCode = "UNKNOWN";
  let requestId: string | null = null;

  try {
    requestId = safeRequestIdFromHeaders(res.headers);
  } catch {
    requestId = null;
  }

  try {
    // Bound read: stop after MAX_ERROR_BODY_BYTES; do not retain/log the body.
    const reader = res.body?.getReader();
    if (!reader) {
      return { operation, httpStatus, s3ErrorCode, requestId };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    let oversized = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      if (total + value.byteLength > MAX_ERROR_BODY_BYTES) {
        oversized = true;
        const remain = MAX_ERROR_BODY_BYTES - total;
        if (remain > 0) {
          chunks.push(value.subarray(0, remain));
          total += remain;
        }
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
    if (oversized) {
      s3ErrorCode = "UNKNOWN";
    } else if (total === 0) {
      s3ErrorCode = "UNKNOWN";
    } else {
      const joined = Buffer.concat(chunks.map((c) => Buffer.from(c)));
      // Heuristic: S3 errors are XML; reject obvious non-XML without logging.
      const head = joined.subarray(0, Math.min(64, joined.length)).toString("utf8");
      if (!head.includes("<") || !/<Error[\s>]|<Code>/.test(head)) {
        s3ErrorCode = "UNKNOWN";
      } else {
        s3ErrorCode = recognizeS3ErrorCodeFromXml(joined.toString("utf8"));
      }
    }
  } catch {
    s3ErrorCode = "UNKNOWN";
  }

  return { operation, httpStatus, s3ErrorCode, requestId };
}

function logStorageFailure(diagnostics: BrandingAssetStorageFailureDiagnostics): void {
  console.error("[branding-assets/r2-s3] storage request failed", {
    operation: diagnostics.operation,
    httpStatus: diagnostics.httpStatus,
    s3ErrorCode: diagnostics.s3ErrorCode,
    requestId: diagnostics.requestId,
  });
}

async function signedS3Fetch(
  config: R2S3Config,
  method: BrandingAssetStorageOperation,
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
    const diagnostics = await buildStorageFailureDiagnostics(method, res);
    logStorageFailure(diagnostics);
    throw new BrandingAssetStorageRequestError(diagnostics);
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
