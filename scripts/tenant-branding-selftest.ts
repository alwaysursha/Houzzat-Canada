/**
 * Stage 3K.2 — branding resolver + policy selftest.
 * Run: pnpm tenant-branding:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  contrastRatio,
  primaryColorMeetsLargeTextAa,
  validateBrandColor,
} from "../src/lib/tenancy/brand-colors";
import { toWorkspaceBrandPublic } from "../src/lib/tenancy/brand-dto";
import {
  buildLegacyHouzzatBrand,
  LEGACY_HOUZZAT_COLORS,
} from "../src/lib/tenancy/legacy-houzzat-brand";
import { buildNeutralTenantBrand } from "../src/lib/tenancy/neutral-tenant-brand";
import {
  assertHostnameClaimable,
  isReservedPlatformHostname,
} from "../src/lib/tenancy/reserved-domains";
import { workspaceBrandingRowToBrand } from "../src/lib/tenancy/resolve-workspace-brand";
import {
  TENANT_B_TEST_BRANDING_ROW,
  TENANT_B_TEST_DISPLAY_NAME,
  TENANT_B_TEST_PRIMARY_COLOR,
  TENANT_B_TEST_WORKSPACE_ID,
} from "../src/lib/tenancy/test-fixtures/tenant-b-brand";
import {
  isTenantBrandingScopeWorkspace,
  parseTenantBrandingScope,
} from "../src/lib/tenancy/tenant-scope-flags";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testLegacyDefaultFlag() {
  delete process.env.TENANT_BRANDING_SCOPE;
  assert.equal(parseTenantBrandingScope(), "legacy");
  assert.equal(isTenantBrandingScopeWorkspace(), false);
  delete process.env.TENANT_DOMAIN_SCOPE;
  delete process.env.TENANT_PUBLIC_LEAD_SCOPE;
  delete process.env.TENANT_ADMIN_HOST_LOCK;
}

function testLegacyModePreservesHouzzat() {
  delete process.env.TENANT_BRANDING_SCOPE;
  const houzzat = buildLegacyHouzzatBrand("ws_houzzat");
  const other = buildLegacyHouzzatBrand("ws_other");
  assert.equal(houzzat.displayName, "Houzzat");
  assert.deepEqual(houzzat.colors.primary, LEGACY_HOUZZAT_COLORS.primary);
  assert.equal(other.displayName, "Houzzat");
}

function testNeutralNotHouzzat() {
  const neutral = buildNeutralTenantBrand("ws_ali");
  assert.notEqual(neutral.displayName, "Houzzat");
  assert.notEqual(neutral.colors.primary, LEGACY_HOUZZAT_COLORS.primary);
  assert.equal(neutral.source, "neutral_default");
}

function testHouzzatVsTenantBFixture() {
  const houzzat = buildLegacyHouzzatBrand("ws_houzzat");
  const tenantB = workspaceBrandingRowToBrand(
    TENANT_B_TEST_WORKSPACE_ID,
    TENANT_B_TEST_BRANDING_ROW,
  );
  assert.notEqual(houzzat.displayName, tenantB.displayName);
  assert.equal(tenantB.displayName, TENANT_B_TEST_DISPLAY_NAME);
  assert.equal(tenantB.colors.primary, TENANT_B_TEST_PRIMARY_COLOR);
  assert.notEqual(houzzat.colors.primary, tenantB.colors.primary);
}

function testColors() {
  const c = validateBrandColor("#0f6b4c");
  assert.ok(c.ok);
  if (c.ok) assert.equal(c.value, "#0F6B4C");
  assert.equal(validateBrandColor("rgb(1,2,3)").ok, false);
  assert.equal(validateBrandColor("#abc").ok, false);
  assert.equal(validateBrandColor("url(#x)").ok, false);
  assert.ok(primaryColorMeetsLargeTextAa("#0F6B4C"));
  assert.ok(contrastRatio("#000000", "#FFFFFF") > 10);
}

function testReservedDomains() {
  assert.ok(isReservedPlatformHostname("houzzat.com").reserved);
  assert.ok(isReservedPlatformHostname("www.houzzatpro.com").reserved);
  assert.ok(isReservedPlatformHostname("foo.workers.dev").reserved);
  assert.equal(isReservedPlatformHostname("alisyed.com").reserved, false);

  assert.ok(assertHostnameClaimable({ hostname: "houzzat.com" }));
  assert.equal(
    assertHostnameClaimable({
      hostname: "houzzat.com",
      trustedHouzzatMigration: true,
    }),
    null,
  );
  assert.ok(assertHostnameClaimable({ hostname: "alisyed.com" }) === null);
}

function testSafeDto() {
  const brand = buildLegacyHouzzatBrand("ws1");
  const pub = toWorkspaceBrandPublic(brand);
  assert.ok(!("source" in pub));
  assert.ok(!("staffDisplayName" in pub));
  assert.equal(pub.displayName, "Houzzat");
}

function testMarketingLayoutWiring() {
  const layout = read("src/app/(marketing)/layout.tsx");
  assert.ok(layout.includes("generateMetadata"));
  assert.ok(layout.includes("resolveMarketingTenancy"));
  const footer = read("src/components/site/SiteFooter.tsx");
  assert.ok(footer.includes("isHouzzatWorkspace"));
}

async function main() {
  testLegacyDefaultFlag();
  testLegacyModePreservesHouzzat();
  testNeutralNotHouzzat();
  testHouzzatVsTenantBFixture();
  testColors();
  testReservedDomains();
  testSafeDto();
  testMarketingLayoutWiring();
  console.log("tenant-branding:selftest ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
