/**
 * Vercel S3-compatible R2 branding storage (Worker binding path unchanged).
 * Run: node --import tsx scripts/vercel-r2-s3-selftest.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BrandingStorageNotConfiguredError,
  deleteBrandingAssetObject,
  putBrandingAssetObject,
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
  assert.ok(s3.includes('process.env.VERCEL'));
  assert.ok(s3.includes("R2_ACCESS_KEY_ID"));
  assert.ok(s3.includes("R2_SECRET_ACCESS_KEY"));
  assert.ok(s3.includes("R2_S3_ENDPOINT"));
  assert.ok(s3.includes("R2_BUCKET_NAME"));
  assert.ok(s3.includes("AWS4-HMAC-SHA256"));
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

  console.log("\nVERCEL R2 S3 SELFTEST PASSED\n");
}

main().catch((err) => {
  console.error("\nVERCEL R2 S3 SELFTEST FAILED\n");
  console.error(err);
  setBrandingStorageTestDeps(null);
  restoreEnv();
  process.exit(1);
});
