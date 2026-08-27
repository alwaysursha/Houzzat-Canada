/**
 * Stage 3K.5.5 — tenant branding propagation selftests.
 * Run: pnpm tenant-branding-propagation:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  selectCanonicalHostname,
  canonicalOriginForHostname,
} from "../src/lib/tenancy/canonical-public-origin";
import { buildTenantThemeCss } from "../src/lib/tenancy/brand-theme-css";
import { buildLegacyHouzzatBrand } from "../src/lib/tenancy/legacy-houzzat-brand";
import {
  toMarketingPresentationBrand,
  tenantAccountLabel,
} from "../src/lib/tenancy/marketing-presentation-brand";
import {
  buildMarketingRootMetadata,
  organizationJsonLdForTenancy,
} from "../src/lib/tenancy/tenant-seo";
import { workspaceBrandingRowToBrand } from "../src/lib/tenancy/resolve-workspace-brand";
import {
  TENANT_B_TEST_BRANDING_ROW,
  TENANT_B_TEST_DISPLAY_NAME,
  TENANT_B_TEST_PRIMARY_COLOR,
  TENANT_B_TEST_WORKSPACE_ID,
} from "../src/lib/tenancy/test-fixtures/tenant-b-brand";
import {
  HOUZZATPRO_PLATFORM_URL,
  POWERED_BY_HOUZZATPRO_LABEL,
} from "../src/lib/tenancy/platform-footer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_HOUZZAT = "ws_houzzat";
const WS_B = TENANT_B_TEST_WORKSPACE_ID;

function houzzatTenancy(origin: string) {
  return {
    ok: true as const,
    hostname: new URL(origin).hostname,
    origin,
    workspaceId: WS_HOUZZAT,
    workspaceSlug: "houzzat",
    verifiedHostname: true,
    brand: buildLegacyHouzzatBrand(WS_HOUZZAT),
    resolutionMode: "legacy" as const,
  };
}

function tenantBTenancy(origin = "https://tenant-canary.houzzatpro.com") {
  return {
    ok: true as const,
    hostname: "tenant-canary.houzzatpro.com",
    origin,
    workspaceId: WS_B,
    workspaceSlug: "tenant-canary",
    verifiedHostname: true,
    brand: workspaceBrandingRowToBrand(WS_B, TENANT_B_TEST_BRANDING_ROW),
    resolutionMode: "workspace" as const,
  };
}

function testCanonicalHostnamePolicy() {
  const hostname = selectCanonicalHostname(
    [
      {
        hostname: "tenant-canary.houzzatpro.com",
        kind: "PLATFORM",
        role: "PRIMARY",
        status: "ACTIVE",
      },
      {
        hostname: "canary.houzzat.com",
        kind: "CUSTOM",
        role: "PRIMARY",
        status: "ACTIVE",
      },
    ],
    "tenant-canary.houzzatpro.com",
  );
  assert.equal(hostname, "tenant-canary.houzzatpro.com");

  const houzzatCanonical = selectCanonicalHostname(
    [
      {
        hostname: "houzzat.houzzatpro.com",
        kind: "PLATFORM",
        role: "PRIMARY",
        status: "ACTIVE",
      },
      {
        hostname: "houzzat.com",
        kind: "CUSTOM",
        role: "PRIMARY",
        status: "ACTIVE",
      },
    ],
    "houzzat.houzzatpro.com",
  );
  assert.equal(houzzatCanonical, "houzzat.com");

  const platformOnly = selectCanonicalHostname(
    [
      {
        hostname: "tenant-canary.houzzatpro.com",
        kind: "PLATFORM",
        role: "PRIMARY",
        status: "ACTIVE",
      },
    ],
    "tenant-canary.houzzatpro.com",
  );
  assert.equal(platformOnly, "tenant-canary.houzzatpro.com");
  assert.equal(
    canonicalOriginForHostname(platformOnly),
    "https://tenant-canary.houzzatpro.com",
  );
}

function testRootMetadataPerHost() {
  const houzzat = buildMarketingRootMetadata(
    houzzatTenancy("https://houzzat.com"),
    "https://houzzat.com",
  );
  const tenant = buildMarketingRootMetadata(
    tenantBTenancy(),
    "https://tenant-canary.houzzatpro.com",
  );

  const houzzatTitle =
    typeof houzzat.title === "string"
      ? houzzat.title
      : houzzat.title?.default ?? "";
  const tenantTitle =
    typeof tenant.title === "string"
      ? tenant.title
      : tenant.title?.default ?? "";

  assert.match(houzzatTitle, /Houzzat/);
  assert.doesNotMatch(tenantTitle, /Houzzat/);
  assert.match(tenantTitle, /Tenant Canary/);
  assert.equal(tenant.openGraph?.siteName, TENANT_B_TEST_DISPLAY_NAME);
  assert.equal(houzzat.openGraph?.siteName, "Houzzat");
}

function testPresentationBrandIsolation() {
  const houzzat = toMarketingPresentationBrand(
    houzzatTenancy("https://houzzat.com"),
    "https://houzzat.com",
  );
  const tenant = toMarketingPresentationBrand(
    tenantBTenancy(),
    "https://tenant-canary.houzzatpro.com",
  );

  assert.equal(houzzat.isHouzzatWorkspace, true);
  assert.equal(tenant.isHouzzatWorkspace, false);
  assert.equal(tenant.colors.primary, TENANT_B_TEST_PRIMARY_COLOR);
  assert.notEqual(tenant.colors.primary, houzzat.colors.primary);
  assert.equal(tenantAccountLabel(tenant), "Your Tenant Canary");
  assert.equal(tenantAccountLabel(houzzat), "Your Houzzat");
}

function testThemeCssSafety() {
  const css = buildTenantThemeCss({
    primary: TENANT_B_TEST_PRIMARY_COLOR,
    secondary: "#1E40AF",
    accent: "#0EA5E9",
    surface: "#FFFFFF",
    ink: "#111827",
  });
  assert.ok(css.includes("--canopy:#2563EB"));
  assert.ok(!css.includes("url("));

  const unsafe = buildTenantThemeCss({
    primary: "url(#evil)",
    secondary: "#1E40AF",
    accent: "#0EA5E9",
    surface: "#FFFFFF",
    ink: "#111827",
  });
  assert.ok(!unsafe.includes("url("));
}

function testPoweredByInvariant() {
  const footer = read("src/components/site/SiteFooter.tsx");
  assert.ok(footer.includes("HOUZZATPRO_PLATFORM_URL"));
  assert.ok(footer.includes("POWERED_BY_HOUZZATPRO_LABEL"));
  assert.ok(footer.includes("isHouzzatWorkspace"));
}

function testMarketingLayoutWiring() {
  const layout = read("src/app/(marketing)/layout.tsx");
  assert.ok(layout.includes("generateMetadata"));
  assert.ok(layout.includes("buildMarketingRootMetadata"));
  assert.ok(layout.includes("TenantBrandProvider"));
  assert.ok(layout.includes("TenantThemeStyle"));
  assert.ok(layout.includes('export const dynamic = "force-dynamic"'));
}

function testNoHouzzatLeakageInTenantFooter() {
  const footer = read("src/components/site/SiteFooter.tsx");
  assert.ok(footer.includes("isHouzzatWorkspace"));
  assert.ok(footer.includes("Ali Syed"));
  assert.ok(footer.includes("brokerageLogoUrl"));
}

function testListingMetadataWiring() {
  const listing = read("src/app/(marketing)/listing/[...parts]/page.tsx");
  assert.ok(listing.includes("buildTenantPublicPageMetadata"));
  assert.ok(listing.includes("resolveMarketingTenancy"));
  assert.ok(!listing.includes("siteName: SITE_NAME"));
}

function testAccountLayoutBranding() {
  const layout = read("src/app/(account)/account/layout.tsx");
  assert.ok(layout.includes("resolveMarketingPresentationBrand"));
  assert.ok(layout.includes("TenantThemeStyle"));
  assert.ok(!layout.includes('label: "Your Houzzat"'));
}

function testOrganizationJsonLd() {
  const tenant = organizationJsonLdForTenancy(
    tenantBTenancy(),
    "https://tenant-canary.houzzatpro.com",
  );
  assert.equal(tenant.name, TENANT_B_TEST_DISPLAY_NAME);
  assert.ok(String(tenant.url).includes("tenant-canary.houzzatpro.com"));
}

function testCacheAbSequence() {
  const sequence = [
    tenantBTenancy(),
    houzzatTenancy("https://houzzat.com"),
    tenantBTenancy(),
    houzzatTenancy("https://houzzat.houzzatpro.com"),
  ] as const;

  for (const tenancy of sequence) {
    const canonical =
      tenancy.workspaceSlug === "houzzat"
        ? "https://houzzat.com"
        : "https://tenant-canary.houzzatpro.com";
    const brand = toMarketingPresentationBrand(tenancy, canonical);
    if (tenancy.workspaceSlug === "houzzat") {
      assert.equal(brand.displayName, "Houzzat");
    } else {
      assert.equal(brand.displayName, TENANT_B_TEST_DISPLAY_NAME);
    }
  }
}

function testHomepageMetadataNotStaticHouzzat() {
  const homepage = read("src/app/(marketing)/page.tsx");
  assert.ok(!homepage.includes("export const metadata"));
  assert.ok(!homepage.includes("SITE_NAME"));
  assert.ok(homepage.includes("--tenant-primary-rgb"));
}

function testRootLayoutMetadataMinimal() {
  const layout = read("src/app/layout.tsx");
  assert.ok(!layout.includes("buildRootMetadata"));
  assert.ok(!layout.includes('title: "Houzzat"'));
  assert.ok(!layout.includes("SITE_NAME"));
  assert.ok(layout.includes('title: "Real Estate"'));
}

function testProductionWorkerUnchanged() {
  const production = read("wrangler.jsonc");
  assert.ok(production.includes('"name": "houzzat"'));
  assert.ok(!production.includes("TENANT_BRANDING_SCOPE"));
}

function main() {
  testCanonicalHostnamePolicy();
  testRootMetadataPerHost();
  testPresentationBrandIsolation();
  testThemeCssSafety();
  testPoweredByInvariant();
  testMarketingLayoutWiring();
  testNoHouzzatLeakageInTenantFooter();
  testListingMetadataWiring();
  testAccountLayoutBranding();
  testOrganizationJsonLd();
  testCacheAbSequence();
  testHomepageMetadataNotStaticHouzzat();
  testRootLayoutMetadataMinimal();
  testProductionWorkerUnchanged();
  console.log("tenant-branding-propagation:selftest passed");
}

main();
