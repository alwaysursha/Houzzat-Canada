/**
 * Stage 3K.2 — brand cache isolation selftest.
 * Run: pnpm tenant-brand-cache-isolation:selftest
 */
import assert from "node:assert/strict";
import {
  brandCacheKey,
  clearBrandCacheForTests,
  readBrandCache,
  writeBrandCache,
} from "../src/lib/tenancy/brand-cache";
import { buildLegacyHouzzatBrand } from "../src/lib/tenancy/legacy-houzzat-brand";
import { workspaceBrandingRowToBrand } from "../src/lib/tenancy/resolve-workspace-brand";
import {
  TENANT_B_TEST_BRANDING_ROW,
  TENANT_B_TEST_WORKSPACE_ID,
} from "../src/lib/tenancy/test-fixtures/tenant-b-brand";

function testCacheKeysDistinct() {
  assert.notEqual(
    brandCacheKey("ws_houzzat", 1),
    brandCacheKey(TENANT_B_TEST_WORKSPACE_ID, 1),
  );
  assert.notEqual(
    brandCacheKey("ws_houzzat", 1),
    brandCacheKey("ws_houzzat", 2),
  );
}

function testNoCrossWorkspaceLeak() {
  clearBrandCacheForTests();

  const houzzat = buildLegacyHouzzatBrand("ws_houzzat");
  houzzat.version = 1;
  writeBrandCache(houzzat);

  const tenantB = workspaceBrandingRowToBrand(
    TENANT_B_TEST_WORKSPACE_ID,
    TENANT_B_TEST_BRANDING_ROW,
  );
  writeBrandCache(tenantB);

  const readHouzzat = readBrandCache("ws_houzzat", 1);
  const readB = readBrandCache(TENANT_B_TEST_WORKSPACE_ID, 1);
  assert.ok(readHouzzat);
  assert.ok(readB);
  assert.equal(readHouzzat!.displayName, "Houzzat");
  assert.equal(readB!.displayName, "Tenant Canary");
  assert.notEqual(readHouzzat!.colors.primary, readB!.colors.primary);

  // Re-read Houzzat after B — must not return B data
  const readHouzzatAgain = readBrandCache("ws_houzzat", 1);
  assert.equal(readHouzzatAgain!.displayName, "Houzzat");
  assert.notEqual(readHouzzatAgain!.displayName, readB!.displayName);
}

function testResolverUsesVersionedKey() {
  const { readFileSync } = require("node:fs");
  const { dirname, join } = require("node:path");
  const { fileURLToPath } = require("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const resolver = readFileSync(
    join(root, "src/lib/tenancy/resolve-workspace-brand.ts"),
    "utf8",
  );
  assert.ok(resolver.includes("readBrandCache(workspaceId, row.version)"));
  assert.ok(resolver.includes("writeBrandCache(brand)"));
  assert.ok(!resolver.includes("readBrandCache()"));
}

async function main() {
  testCacheKeysDistinct();
  testNoCrossWorkspaceLeak();
  testResolverUsesVersionedKey();
  console.log("tenant-brand-cache-isolation:selftest ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
