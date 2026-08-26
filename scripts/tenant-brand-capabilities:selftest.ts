/**
 * Stage 3K.4.2 — branding tier capabilities selftest.
 * Run: pnpm tenant-brand-capabilities:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  capabilitiesForTier,
  enforcePoweredByHouzzatPro,
} from "../src/lib/tenancy/brand-capabilities";
import {
  buildTenantFooterModel,
  HOUZZATPRO_PLATFORM_URL,
  POWERED_BY_HOUZZATPRO_LABEL,
} from "../src/lib/tenancy/platform-footer";
import { toWorkspaceBrandPublic } from "../src/lib/tenancy/brand-dto";
import { buildLegacyHouzzatBrand } from "../src/lib/tenancy/legacy-houzzat-brand";
import { workspaceBrandingRowToBrand } from "../src/lib/tenancy/resolve-workspace-brand";
import { TENANT_B_TEST_BRANDING_ROW } from "../src/lib/tenancy/test-fixtures/tenant-b-brand";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testCustomDomainAllTiers() {
  for (const tier of ["GENERIC", "SEMI_BRANDED", "FULL_BRANDED"] as const) {
    const caps = capabilitiesForTier(tier);
    assert.equal(caps.customDomain, true);
    assert.equal(caps.poweredByHouzzatPro, true);
  }
}

function testPoweredByInvariant() {
  assert.equal(enforcePoweredByHouzzatPro(false), true);
  assert.equal(enforcePoweredByHouzzatPro(true), true);
  assert.equal(enforcePoweredByHouzzatPro(null), true);

  const houzzat = buildLegacyHouzzatBrand("ws_h");
  assert.equal(houzzat.poweredByHouzzatPro, true);

  const tenantB = workspaceBrandingRowToBrand("ws_b", {
    ...TENANT_B_TEST_BRANDING_ROW,
    poweredByHouzzatPro: false,
  });
  const pub = toWorkspaceBrandPublic(tenantB);
  assert.equal(pub.poweredByHouzzatPro, true);
}

function testFooterModel() {
  const footer = buildTenantFooterModel({
    displayName: "Tenant Canary",
    footerLegalText: "Canary legal",
  });
  assert.equal(footer.platformCredit.label, POWERED_BY_HOUZZATPRO_LABEL);
  assert.equal(footer.platformCredit.href, HOUZZATPRO_PLATFORM_URL);
  assert.equal(footer.platformCredit.mandatory, true);
}

function testNoTierGatedCustomDomain() {
  const resolver = read("src/lib/tenancy/resolve-workspace-brand.ts");
  const caps = read("src/lib/tenancy/brand-capabilities.ts");
  assert.ok(!resolver.includes("FULL_BRANDED") || caps.includes("customDomain: true"));
  assert.ok(!caps.includes("customDomain: false"));
}

function testTierDifferentiation() {
  const generic = capabilitiesForTier("GENERIC");
  const semi = capabilitiesForTier("SEMI_BRANDED");
  const full = capabilitiesForTier("FULL_BRANDED");
  assert.equal(generic.tenantLogo, false);
  assert.equal(semi.tenantLogo, true);
  assert.equal(full.homepageContentBranding, true);
  assert.equal(generic.homepageContentBranding, false);
}

async function main() {
  testCustomDomainAllTiers();
  testPoweredByInvariant();
  testFooterModel();
  testNoTierGatedCustomDomain();
  testTierDifferentiation();
  console.log("tenant-brand-capabilities:selftest ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
