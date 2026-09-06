/**
 * Stage 6.11C.3 — Brand assets deployment safety (production fail-closed).
 * Run: pnpm stage-6.11c3-brand-assets-safety:selftest
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BrandingStorageNotConfiguredError,
  BRANDING_STORAGE_NOT_CONFIGURED,
  putBrandingAssetObject,
  setBrandingStorageTestDeps,
} from "@/lib/tenancy/branding-assets";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

async function main() {
  console.log("\n=== STAGE 6.11C.3 — BRAND ASSETS DEPLOYMENT SAFETY ===\n");

  // 0. All three Workers declare BRANDING_ASSETS
  {
    for (const file of [
      "wrangler.jsonc",
      "wrangler.houzzatpro.jsonc",
      "wrangler.tenant-canary.jsonc",
    ]) {
      const src = read(file);
      assert.ok(src.includes('"binding": "BRANDING_ASSETS"'), file);
      assert.ok(src.includes("houzzatpro-branding-assets"), file);
      assert.ok(src.includes("houzzatpro-branding-assets-preview"), file);
    }
    console.log("[0] Wrangler R2 bindings (houzzat/houzzatpro/canary)... PASS");
  }

  // 1. Production + missing R2 binding → fail closed, no local write
  {
    setBrandingStorageTestDeps({
      getBucket: async () => null,
      isProduction: () => true,
      getPublicBase: () => "https://branding-assets.example.com",
    });
    const objectKey =
      "workspaces/ws_test/branding/logo/safety-prod-missing-bucket.png";
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
      (err: unknown) => {
        assert.ok(err instanceof BrandingStorageNotConfiguredError);
        assert.equal(err.code, BRANDING_STORAGE_NOT_CONFIGURED);
        assert.equal(err.status, 503);
        assert.ok(!String(err.message).includes("BRANDING_ASSETS"));
        assert.ok(!String(err.message).includes("houzzatpro-branding"));
        return true;
      },
    );
    assert.ok(!existsSync(localPath));
    setBrandingStorageTestDeps(null);
    console.log("[1] Production missing binding fail-closed... PASS");
  }

  // 2. Production + R2 present + missing public base → fail closed before PUT
  {
    let putCalled = false;
    setBrandingStorageTestDeps({
      isProduction: () => true,
      getPublicBase: () => null,
      getBucket: async () => ({
        put: async () => {
          putCalled = true;
        },
        delete: async () => undefined,
      }),
    });
    await assert.rejects(
      () =>
        putBrandingAssetObject({
          objectKey: "workspaces/ws_test/branding/logo/x.png",
          bytes: new Uint8Array([1]),
          contentType: "image/png",
        }),
      (err: unknown) => err instanceof BrandingStorageNotConfiguredError,
    );
    assert.equal(putCalled, false);
    setBrandingStorageTestDeps(null);
    console.log("[2] Production missing public base fail-closed... PASS");
  }

  // 3. Development + missing binding → local fallback allowed
  {
    setBrandingStorageTestDeps({
      getBucket: async () => null,
      isProduction: () => false,
      getPublicBase: () => null,
    });
    const objectKey =
      "workspaces/ws_test/branding/logo/safety-dev-fallback.png";
    const localPath = join(
      root,
      "public",
      "uploads",
      "branding",
      ...objectKey.split("/"),
    );
    if (existsSync(localPath)) rmSync(localPath, { force: true });

    const result = await putBrandingAssetObject({
      objectKey,
      bytes: new Uint8Array([137, 80, 78, 71]),
      contentType: "image/png",
    });
    assert.equal(result.publicUrl, `/uploads/branding/${objectKey}`);
    assert.ok(existsSync(localPath));
    rmSync(localPath, { force: true });
    setBrandingStorageTestDeps(null);
    console.log("[3] Development local fallback allowed... PASS");
  }

  // 4. Configured R2 path builds public URL without double slash
  {
    let putKey: string | null = null;
    setBrandingStorageTestDeps({
      isProduction: () => true,
      getPublicBase: () => "https://branding-assets.example.com/",
      getBucket: async () => ({
        put: async (key) => {
          putKey = String(key);
        },
        delete: async () => undefined,
      }),
    });
    const objectKey = "workspaces/ws_a/branding/agent-profile/abc.jpg";
    const result = await putBrandingAssetObject({
      objectKey,
      bytes: new Uint8Array([1]),
      contentType: "image/jpeg",
    });
    assert.equal(putKey, objectKey);
    assert.equal(
      result.publicUrl,
      `https://branding-assets.example.com/${objectKey}`,
    );
    assert.ok(!result.publicUrl.includes("example.com//"));
    setBrandingStorageTestDeps(null);
    console.log("[4] Public base URL join (no double slash)... PASS");
  }

  // 5. API maps STORAGE_NOT_CONFIGURED; put precedes DB update
  {
    const route = read("src/app/api/onboarding/branding-assets/route.ts");
    assert.ok(route.includes("STORAGE_NOT_CONFIGURED"));
    assert.ok(route.includes("BrandingStorageNotConfiguredError"));
    const manage = read("src/lib/tenancy/branding-assets/manage.ts");
    const putIdx = manage.indexOf("putBrandingAssetObject");
    const dbIdx = manage.indexOf("workspaceBranding.update");
    assert.ok(putIdx > 0 && dbIdx > putIdx);
    assert.ok(manage.includes("STORAGE_NOT_CONFIGURED") || manage.includes("BrandingStorageNotConfiguredError"));
    const storage = read("src/lib/tenancy/branding-assets/storage.ts");
    assert.ok(storage.includes("isProductionRuntime"));
    assert.ok(storage.includes("BrandingStorageNotConfiguredError"));
    assert.ok(!storage.includes("branding-assets.houzzatpro.com"));
    console.log("[5] API mapping + put-before-DB order... PASS");
  }

  // 6. .env.example documents public base (no secret value)
  {
    const envExample = read(".env.example");
    assert.ok(envExample.includes("BRANDING_ASSETS_PUBLIC_BASE_URL"));
    assert.ok(!envExample.includes("https://branding-assets.houzzatpro.com\""));
    console.log("[6] Public base documented, not hardcoded... PASS");
  }

  console.log("\nSTAGE 6.11C.3 SELFTEST PASSED\n");
}

main().catch((err) => {
  console.error("\nSTAGE 6.11C.3 SELFTEST FAILED\n");
  console.error(err);
  setBrandingStorageTestDeps(null);
  process.exit(1);
});
