/**
 * Stage 3K.5.5.2 — listing popup/sheet chrome tenant branding regression.
 * Run: pnpm tenant-listing-popup-branding:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toMarketingPresentationBrand } from "../src/lib/tenancy/marketing-presentation-brand";
import { buildLegacyHouzzatBrand } from "../src/lib/tenancy/legacy-houzzat-brand";
import { workspaceBrandingRowToBrand } from "../src/lib/tenancy/resolve-workspace-brand";
import {
  TENANT_B_TEST_BRANDING_ROW,
  TENANT_B_TEST_DISPLAY_NAME,
  TENANT_B_TEST_WORKSPACE_ID,
} from "../src/lib/tenancy/test-fixtures/tenant-b-brand";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function tenantBBrand() {
  const tenancy = {
    ok: true as const,
    hostname: "tenant-canary.houzzatpro.com",
    origin: "https://tenant-canary.houzzatpro.com",
    workspaceId: TENANT_B_TEST_WORKSPACE_ID,
    workspaceSlug: "tenant-canary",
    verifiedHostname: true,
    brand: workspaceBrandingRowToBrand(
      TENANT_B_TEST_WORKSPACE_ID,
      TENANT_B_TEST_BRANDING_ROW,
    ),
    resolutionMode: "workspace" as const,
  };
  return toMarketingPresentationBrand(
    tenancy,
    "https://tenant-canary.houzzatpro.com",
  );
}

function houzzatBrand() {
  const tenancy = {
    ok: true as const,
    hostname: "houzzat.com",
    origin: "https://houzzat.com",
    workspaceId: "ws_houzzat",
    workspaceSlug: "houzzat",
    verifiedHostname: true,
    brand: buildLegacyHouzzatBrand("ws_houzzat"),
    resolutionMode: "legacy" as const,
  };
  return toMarketingPresentationBrand(tenancy, "https://houzzat.com");
}

function testSheetHostInsideTenantProviderTree() {
  const providers = read("src/components/Providers.tsx");
  assert.ok(!providers.includes("ListingSheetHostLazy"));

  const marketing = read("src/app/(marketing)/layout.tsx");
  assert.ok(marketing.includes("ListingSheetHostLazy"));
  assert.ok(marketing.includes("<TenantBrandProvider"));
  const hostIdx = marketing.indexOf("<ListingSheetHostLazy");
  const providerIdx = marketing.indexOf("<TenantBrandProvider");
  assert.ok(providerIdx >= 0 && hostIdx > providerIdx);
  assert.ok(marketing.lastIndexOf("</TenantBrandProvider>") > hostIdx);

  const account = read("src/app/(account)/account/layout.tsx");
  assert.ok(account.includes("ListingSheetHostLazy"));
}

function testListingSheetChromeNoHouzzatFallback() {
  const chrome = read("src/components/mobile/ListingSheetChrome.tsx");
  assert.ok(chrome.includes("useTenantDisplayName"));
  assert.ok(!chrome.includes('useTenantDisplayName("Houzzat")'));
  assert.ok(!chrome.includes("SITE_NAME"));
}

function testListingSheetChromeCenteredLabelWiring() {
  const chrome = read("src/components/mobile/ListingSheetChrome.tsx");
  assert.ok(chrome.includes("const tenantDisplayName = useTenantDisplayName()"));
  assert.match(
    chrome,
    /justify-center transition-opacity[\s\S]{0,1600}\{tenantDisplayName\}/,
  );
}

function testTenantBBrandDisplayName() {
  assert.equal(tenantBBrand().displayName, TENANT_B_TEST_DISPLAY_NAME);
}

function testHouzzatBrandDisplayName() {
  assert.equal(houzzatBrand().displayName, "Houzzat");
}

function main() {
  testSheetHostInsideTenantProviderTree();
  testListingSheetChromeNoHouzzatFallback();
  testListingSheetChromeCenteredLabelWiring();
  testTenantBBrandDisplayName();
  testHouzzatBrandDisplayName();
  console.log("tenant-listing-popup-branding:selftest passed");
}

main();
