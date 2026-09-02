/**
 * Stage 5.6 — Public Viewings share brand isolation selftest.
 * Run: pnpm stage-56-viewing-share-brand-isolation:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLegacyHouzzatBrand,
  LEGACY_HOUZZAT_COLORS,
} from "../src/lib/tenancy/legacy-houzzat-brand";
import { workspaceBrandingRowToBrand } from "../src/lib/tenancy/resolve-workspace-brand";
import {
  TENANT_B_TEST_BRANDING_ROW,
  TENANT_B_TEST_DISPLAY_NAME,
  TENANT_B_TEST_PRIMARY_COLOR,
  TENANT_B_TEST_WORKSPACE_ID,
} from "../src/lib/tenancy/test-fixtures/tenant-b-brand";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testTenantCanaryFixture() {
  const canary = workspaceBrandingRowToBrand(
    TENANT_B_TEST_WORKSPACE_ID,
    TENANT_B_TEST_BRANDING_ROW,
  );
  assert.equal(canary.displayName, TENANT_B_TEST_DISPLAY_NAME);
  assert.equal(canary.displayName, "Tenant Canary");
  assert.equal(canary.colors.primary.toUpperCase(), TENANT_B_TEST_PRIMARY_COLOR);
  assert.equal(canary.colors.primary.toUpperCase(), "#2563EB");
}

function testLegacyHouzzatFixture() {
  const houzzat = buildLegacyHouzzatBrand("ws_houzzat_fixture");
  assert.notEqual(houzzat.displayName, "Tenant Canary");
  assert.equal(
    houzzat.colors.primary.toUpperCase(),
    LEGACY_HOUZZAT_COLORS.primary.toUpperCase(),
  );
  assert.equal(houzzat.colors.primary.toUpperCase(), "#0F6B4C");
}

function testCrossTenantIsolation() {
  const canary = workspaceBrandingRowToBrand(
    TENANT_B_TEST_WORKSPACE_ID,
    TENANT_B_TEST_BRANDING_ROW,
  );
  const houzzat = buildLegacyHouzzatBrand("ws_houzzat_fixture");
  assert.notEqual(houzzat.displayName, canary.displayName);
  assert.notEqual(houzzat.colors.primary, canary.colors.primary);
}

function testResolverBypassesLegacyScopeFlag() {
  const resolver = read("src/lib/tenancy/resolve-public-viewing-share-brand.ts");
  assert.ok(resolver.includes("resolvePublicViewingShareBrand"));
  assert.ok(
    resolver.includes("TENANT_BRANDING_SCOPE=legacy") ||
      resolver.includes("Ignores TENANT_BRANDING_SCOPE"),
  );
  assert.equal(resolver.includes("isTenantBrandingScopeWorkspace"), false);
  assert.equal(resolver.includes("resolveWorkspaceBrand"), false);
  assert.ok(resolver.includes("workspaceBrandingRowToBrand"));
  assert.ok(resolver.includes("buildLegacyHouzzatBrand"));
}

function testQueryParamsCannotAffectServerComponent() {
  const page = read("src/app/viewings/share/[token]/page.tsx");
  const resolver = read("src/lib/tenancy/resolve-public-viewing-share-brand.ts");

  // Static analysis: public share is a server component keyed only on route params.
  assert.equal(page.includes("searchParams"), false);
  assert.ok(page.includes("params: Promise<{ token: string }>"));
  assert.ok(page.includes("resolvePublicViewingShareBrand(tour.workspaceId)"));
  assert.ok(
    resolver.includes("query parameters") ||
      resolver.includes("query params") ||
      resolver.includes("Never uses hostname"),
  );

  console.log(
    "  NOTE: Query params cannot affect server component branding — " +
      "page.tsx reads only `params.token`; brand resolves from tour.workspaceId via prisma.",
  );
}

function main() {
  console.log("stage-56-viewing-share-brand-isolation:selftest\n");
  testTenantCanaryFixture();
  testLegacyHouzzatFixture();
  testCrossTenantIsolation();
  testResolverBypassesLegacyScopeFlag();
  testQueryParamsCannotAffectServerComponent();
  console.log("\nstage-56-viewing-share-brand-isolation:selftest ok");
}

main();
