/**
 * Vercel S3-compatible R2 branding storage (Worker binding path unchanged).
 * Run: pnpm vercel-r2-s3:selftest
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BrandingAssetStorageRequestError,
  BrandingStorageNotConfiguredError,
  deleteBrandingAssetObject,
  putBrandingAssetObject,
  recognizeS3ErrorCodeFromXml,
  setBrandingStorageTestDeps,
} from "@/lib/tenancy/branding-assets";
import { readVercelR2S3Config } from "@/lib/tenancy/branding-assets/r2-s3";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const ENV_KEYS = [
  "VERCEL",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_S3_ENDPOINT",
  "R2_BUCKET_NAME",
] as const;

const savedEnv: Record<string, string | undefined> = {};

function snapshotEnv() {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function setVercelR2Env(overrides?: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  process.env.VERCEL = "1";
  process.env.R2_ACCESS_KEY_ID = "r2-test-access";
  process.env.R2_SECRET_ACCESS_KEY = "r2-test-secret";
  process.env.R2_S3_ENDPOINT = "https://abc123.r2.cloudflarestorage.com";
  process.env.R2_BUCKET_NAME = "houzzatpro-branding-assets";
  if (!overrides) return;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === "") delete process.env[key];
    else process.env[key] = value;
  }
}

type CapturedRequest = {
  method: string;
  url: string;
  contentType: string | null;
  authorization: string | null;
};

function s3ErrorXml(code: string, message = "denied"): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`;
}

function mockErrorResponse(input: {
  status: number;
  body?: string | null;
  headers?: Record<string, string>;
  throwOnRead?: boolean;
}): Response {
  if (input.throwOnRead) {
    const headers = new Headers(input.headers);
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error("diagnostic-parse-boom"));
        },
      }),
      { status: input.status, headers },
    );
  }
  if (input.body == null) {
    return new Response(null, {
      status: input.status,
      headers: input.headers,
    });
  }
  return new Response(input.body, {
    status: input.status,
    headers: {
      "content-type": "application/xml",
      ...input.headers,
    },
  });
}

async function expectStorageFailure(
  fetchImpl: typeof fetch,
  assertDiagnostics: (err: BrandingAssetStorageRequestError) => void,
) {
  const originalFetch = globalThis.fetch;
  const logs: unknown[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args);
  };
  globalThis.fetch = fetchImpl;
  setVercelR2Env();
  setBrandingStorageTestDeps({
    isProduction: () => true,
    getPublicBase: () => "https://branding-assets.example.com",
  });
  try {
    await assert.rejects(
      () =>
        putBrandingAssetObject({
          objectKey: "workspaces/ws_a/agents/user_b/profile/abc123.jpg",
          bytes: new Uint8Array([1, 2, 3, 4]),
          contentType: "image/jpeg",
        }),
      (err: unknown) => {
        assert.ok(err instanceof BrandingAssetStorageRequestError);
        assert.equal(err.message, "Brand asset storage request failed.");
        assertDiagnostics(err);
        return true;
      },
    );
    const serialized = JSON.stringify(logs);
    assert.ok(!serialized.includes("Authorization"));
    assert.ok(!serialized.includes("r2-test-secret"));
    assert.ok(!serialized.includes("r2-test-access"));
    assert.ok(!serialized.includes("AWS4-HMAC-SHA256"));
    assert.ok(!serialized.includes("workspaces/ws_a/agents/user_b/profile/abc123.jpg"));
    assert.ok(!serialized.includes("<Message>"));
    assert.ok(!serialized.includes("secret-in-body"));
    assert.ok(
      logs.some(
        (entry) =>
          Array.isArray(entry) &&
          String(entry[0]).includes("[branding-assets/r2-s3] storage request failed"),
      ),
    );
  } finally {
    console.error = originalError;
    globalThis.fetch = originalFetch;
    setBrandingStorageTestDeps(null);
    restoreEnv();
  }
}

async function main() {
  console.log("\n=== VERCEL R2 S3 DUAL-RUNTIME ===\n");
  snapshotEnv();

  const storage = read("src/lib/tenancy/branding-assets/storage.ts");
  const s3 = read("src/lib/tenancy/branding-assets/r2-s3.ts");
  const wrangler = read("wrangler.jsonc");
  const envExample = read(".env.example");

  assert.ok(wrangler.includes('"binding": "BRANDING_ASSETS"'));
  assert.ok(wrangler.includes("houzzatpro-branding-assets"));
  assert.ok(storage.includes("tryGetCloudflareEnvAsync"));
  assert.ok(storage.includes("readVercelR2S3Config"));
  assert.ok(storage.includes("createR2S3Bucket"));
  assert.ok(s3.includes("process.env.VERCEL"));
  assert.ok(s3.includes("R2_ACCESS_KEY_ID"));
  assert.ok(s3.includes("R2_SECRET_ACCESS_KEY"));
  assert.ok(s3.includes("R2_S3_ENDPOINT"));
  assert.ok(s3.includes("R2_BUCKET_NAME"));
  assert.ok(s3.includes("AWS4-HMAC-SHA256"));
  assert.ok(s3.includes("BrandingAssetStorageRequestError"));
  assert.ok(s3.includes("recognizeS3ErrorCodeFromXml"));
  assert.ok(!s3.includes("console.error(await res.text"));
  assert.ok(envExample.includes("R2_ACCESS_KEY_ID"));
  assert.ok(envExample.includes("BRANDING_ASSETS_PUBLIC_BASE_URL"));
  console.log("[0] Binding + Vercel env surface... PASS");

  {
    delete process.env.VERCEL;
    setVercelR2Env();
    delete process.env.VERCEL;
    assert.equal(readVercelR2S3Config(), null);
    restoreEnv();
    console.log("[1] S3 config ignored off Vercel... PASS");
  }

  {
    setVercelR2Env({ R2_SECRET_ACCESS_KEY: "" });
    assert.equal(readVercelR2S3Config(), null);
    restoreEnv();
    console.log("[2] Incomplete Vercel creds → null... PASS");
  }

  {
    setVercelR2Env({ R2_S3_ENDPOINT: "http://abc123.r2.cloudflarestorage.com" });
    assert.equal(readVercelR2S3Config(), null);
    restoreEnv();
    console.log("[3] Non-HTTPS endpoint rejected... PASS");
  }

  {
    setVercelR2Env();
    const cfg = readVercelR2S3Config();
    assert.ok(cfg);
    assert.equal(cfg.endpointOrigin, "https://abc123.r2.cloudflarestorage.com");
    assert.equal(cfg.bucket, "houzzatpro-branding-assets");
    restoreEnv();
    console.log("[4] Complete Vercel S3 config accepted... PASS");
  }

  {
    setVercelR2Env({ R2_ACCESS_KEY_ID: "" });
    setBrandingStorageTestDeps({
      isProduction: () => true,
      getPublicBase: () => "https://branding-assets.example.com",
    });
    const objectKey = "workspaces/ws_test/branding/logo/vercel-missing-creds.png";
    const localPath = join(
      root,
      "public",
      "uploads",
      "branding",
      ...objectKey.split("/"),
    );
    if (existsSync(localPath)) rmSync(localPath, { force: true });
    await assert.rejects(
      () =>
        putBrandingAssetObject({
          objectKey,
          bytes: new Uint8Array([1, 2, 3]),
          contentType: "image/png",
        }),
      (err: unknown) => err instanceof BrandingStorageNotConfiguredError,
    );
    assert.ok(!existsSync(localPath));
    setBrandingStorageTestDeps(null);
    restoreEnv();
    console.log("[5] Vercel production missing creds fail-closed... PASS");
  }

  {
    let bindingPut = 0;
    let s3Calls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      s3Calls += 1;
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    setVercelR2Env();
    setBrandingStorageTestDeps({
      isProduction: () => true,
      getPublicBase: () => "https://branding-assets.example.com",
      getBucket: async () => ({
        put: async () => {
          bindingPut += 1;
        },
        delete: async () => undefined,
      }),
    });
    const objectKey = "workspaces/ws_a/branding/logo/binding-wins.png";
    const result = await putBrandingAssetObject({
      objectKey,
      bytes: new Uint8Array([1]),
      contentType: "image/png",
    });
    assert.equal(bindingPut, 1);
    assert.equal(s3Calls, 0);
    assert.equal(
      result.publicUrl,
      `https://branding-assets.example.com/${objectKey}`,
    );
    setBrandingStorageTestDeps(null);
    globalThis.fetch = originalFetch;
    restoreEnv();
    console.log("[6] Native R2 binding still preferred... PASS");
  }

  {
    const captured: CapturedRequest[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const req = new Request(input, init);
      captured.push({
        method: req.method,
        url: req.url,
        contentType: req.headers.get("content-type"),
        authorization: req.headers.get("authorization"),
      });
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    setVercelR2Env();
    setBrandingStorageTestDeps({
      isProduction: () => true,
      getPublicBase: () => "https://branding-assets.example.com/",
    });
    const objectKey = "workspaces/ws_a/branding/agent-profile/abc.jpg";
    const result = await putBrandingAssetObject({
      objectKey,
      bytes: new Uint8Array([1, 2, 3, 4]),
      contentType: "image/jpeg",
    });
    assert.equal(result.objectKey, objectKey);
    assert.equal(
      result.publicUrl,
      `https://branding-assets.example.com/${objectKey}`,
    );
    assert.ok(!result.publicUrl.includes("example.com//"));
    assert.equal(captured.length, 1);
    assert.equal(captured[0]?.method, "PUT");
    assert.equal(
      captured[0]?.url,
      `https://abc123.r2.cloudflarestorage.com/houzzatpro-branding-assets/${objectKey}`,
    );
    assert.equal(captured[0]?.contentType, "image/jpeg");
    assert.ok(captured[0]?.authorization?.startsWith("AWS4-HMAC-SHA256 "));

    await deleteBrandingAssetObject(objectKey);
    assert.equal(captured.length, 2);
    assert.equal(captured[1]?.method, "DELETE");
    assert.equal(captured[1]?.url, captured[0]?.url);

    setBrandingStorageTestDeps(null);
    globalThis.fetch = originalFetch;
    restoreEnv();
    console.log("[7] Vercel S3 PUT + public URL + DELETE... PASS");
  }

  assert.equal(recognizeS3ErrorCodeFromXml(s3ErrorXml("AccessDenied")), "AccessDenied");
  assert.equal(
    recognizeS3ErrorCodeFromXml(s3ErrorXml("SignatureDoesNotMatch")),
    "SignatureDoesNotMatch",
  );
  assert.equal(recognizeS3ErrorCodeFromXml(s3ErrorXml("NotARealCode")), "UNKNOWN");
  assert.equal(recognizeS3ErrorCodeFromXml("not-xml"), "UNKNOWN");
  console.log("[8] S3 Code allowlist parser... PASS");

  await expectStorageFailure(
    (async () =>
      mockErrorResponse({
        status: 403,
        body: s3ErrorXml("AccessDenied", "secret-in-body"),
        headers: { "x-amz-request-id": "req-access-denied-1" },
      })) as typeof fetch,
    (err) => {
      assert.equal(err.operation, "PUT");
      assert.equal(err.httpStatus, 403);
      assert.equal(err.s3ErrorCode, "AccessDenied");
      assert.equal(err.requestId, "req-access-denied-1");
    },
  );
  console.log("[9] 403 AccessDenied diagnostics... PASS");

  await expectStorageFailure(
    (async () =>
      mockErrorResponse({
        status: 403,
        body: s3ErrorXml("SignatureDoesNotMatch"),
      })) as typeof fetch,
    (err) => {
      assert.equal(err.httpStatus, 403);
      assert.equal(err.s3ErrorCode, "SignatureDoesNotMatch");
      assert.equal(err.requestId, null);
    },
  );
  console.log("[10] 403 SignatureDoesNotMatch diagnostics... PASS");

  await expectStorageFailure(
    (async () =>
      mockErrorResponse({
        status: 404,
        body: s3ErrorXml("NoSuchBucket"),
      })) as typeof fetch,
    (err) => {
      assert.equal(err.httpStatus, 404);
      assert.equal(err.s3ErrorCode, "NoSuchBucket");
    },
  );
  console.log("[11] 404 NoSuchBucket diagnostics... PASS");

  await expectStorageFailure(
    (async () =>
      mockErrorResponse({
        status: 400,
        body: s3ErrorXml("InvalidArgument"),
      })) as typeof fetch,
    (err) => {
      assert.equal(err.httpStatus, 400);
      assert.equal(err.s3ErrorCode, "InvalidArgument");
    },
  );
  console.log("[12] 400 InvalidArgument diagnostics... PASS");

  await expectStorageFailure(
    (async () =>
      mockErrorResponse({
        status: 500,
        body: s3ErrorXml("InternalError"),
      })) as typeof fetch,
    (err) => {
      assert.equal(err.httpStatus, 500);
      assert.equal(err.s3ErrorCode, "InternalError");
    },
  );
  console.log("[13] 500 upstream InternalError diagnostics... PASS");

  await expectStorageFailure(
    (async () => mockErrorResponse({ status: 502, body: null })) as typeof fetch,
    (err) => {
      assert.equal(err.httpStatus, 502);
      assert.equal(err.s3ErrorCode, "UNKNOWN");
    },
  );
  console.log("[14] Empty response body → UNKNOWN... PASS");

  await expectStorageFailure(
    (async () =>
      mockErrorResponse({
        status: 400,
        body: "{not-xml: true, secret-in-body: 1}",
      })) as typeof fetch,
    (err) => {
      assert.equal(err.httpStatus, 400);
      assert.equal(err.s3ErrorCode, "UNKNOWN");
    },
  );
  console.log("[15] Malformed XML → UNKNOWN... PASS");

  await expectStorageFailure(
    (async () =>
      mockErrorResponse({
        status: 403,
        body: `${"x".repeat(5000)}<Code>AccessDenied</Code>`,
      })) as typeof fetch,
    (err) => {
      assert.equal(err.httpStatus, 403);
      assert.equal(err.s3ErrorCode, "UNKNOWN");
    },
  );
  console.log("[16] Oversized response body → UNKNOWN... PASS");

  await expectStorageFailure(
    (async () =>
      mockErrorResponse({
        status: 403,
        body: s3ErrorXml("TotallyUnexpectedCode"),
      })) as typeof fetch,
    (err) => {
      assert.equal(err.httpStatus, 403);
      assert.equal(err.s3ErrorCode, "UNKNOWN");
    },
  );
  console.log("[17] Unexpected error code → UNKNOWN... PASS");

  await expectStorageFailure(
    (async () =>
      mockErrorResponse({
        status: 503,
        body: s3ErrorXml("ServiceUnavailable"),
        throwOnRead: true,
      })) as typeof fetch,
    (err) => {
      assert.equal(err.httpStatus, 503);
      assert.equal(err.s3ErrorCode, "UNKNOWN");
      assert.equal(err.message, "Brand asset storage request failed.");
    },
  );
  console.log("[18] Diagnostic parsing failure still throws storage error... PASS");

  {
    // Reject unsafe request-id header shapes.
    await expectStorageFailure(
      (async () =>
        mockErrorResponse({
          status: 403,
          body: s3ErrorXml("AccessDenied"),
          headers: {
            // Valid HTTP header value, but rejected by SAFE_REQUEST_ID_RE (spaces / !).
            "x-amz-request-id": "bad id with spaces!!!",
          },
        })) as typeof fetch,
      (err) => {
        assert.equal(err.requestId, null);
        assert.equal(err.s3ErrorCode, "AccessDenied");
      },
    );
    console.log("[19] Unsafe request-id discarded... PASS");
  }

  console.log("\nVERCEL R2 S3 SELFTEST PASSED\n");
}

main().catch((err) => {
  console.error("\nVERCEL R2 S3 SELFTEST FAILED\n");
  console.error(err);
  setBrandingStorageTestDeps(null);
  restoreEnv();
  process.exit(1);
});
