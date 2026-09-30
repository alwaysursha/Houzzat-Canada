/**
 * Stage 3K.5.5.1 — theme coherence + live metadata leak regression tests.
 * Run: pnpm tenant-branding-theme-coherence:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTenantThemeCss } from "../src/lib/tenancy/brand-theme-css";
import {
  deriveTenantThemeTokens,
  mixHexWithWhite,
} from "../src/lib/tenancy/tenant-theme-tokens";
import { buildMarketingRootMetadata } from "../src/lib/tenancy/tenant-seo";
import { buildLegacyHouzzatBrand } from "../src/lib/tenancy/legacy-houzzat-brand";
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

function tenantTenancy() {
  return {
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
}

function houzzatTenancy() {
  return {
    ok: true as const,
    hostname: "houzzat.com",
    origin: "https://houzzat.com",
    workspaceId: "ws_houzzat",
    workspaceSlug: "houzzat",
    verifiedHostname: true,
    brand: buildLegacyHouzzatBrand("ws_houzzat"),
    resolutionMode: "legacy" as const,
  };
}

function testHomepageNoStaticHouzzatMetadata() {
  const homepage = read("src/app/(marketing)/page.tsx");
  assert.ok(!homepage.includes("export const metadata"));
  assert.ok(!homepage.includes("SITE_NAME"));
  assert.ok(homepage.includes("--tenant-primary-rgb"));
}

function testRootLayoutNoHouzzatTitleTemplate() {
  const layout = read("src/app/layout.tsx");
  assert.ok(!layout.includes("buildRootMetadata"));
  assert.ok(!layout.includes('title: "Houzzat"'));
  assert.ok(!layout.includes("SITE_NAME"));
}

function testTenantHomepageTitleMetadata() {
  const meta = buildMarketingRootMetadata(
    tenantTenancy(),
    "https://tenant-canary.houzzatpro.com",
  );
  const title =
    typeof meta.title === "object" && meta.title
      ? meta.title.absolute ?? meta.title.default
      : meta.title;
  assert.match(String(title), /Tenant Canary/);
  assert.doesNotMatch(String(title), /Houzzat/);
  assert.equal(meta.openGraph?.siteName, TENANT_B_TEST_DISPLAY_NAME);
}

function testHouzzatMetadataUnchanged() {
  const meta = buildMarketingRootMetadata(
    houzzatTenancy(),
    "https://houzzat.com",
  );
  const title =
    typeof meta.title === "object" && meta.title
      ? meta.title.absolute ?? meta.title.default
      : meta.title;
  assert.match(String(title), /Houzzat/);
}

function testTenantThemeTokensCoherent() {
  const tokens = deriveTenantThemeTokens({
    primary: TENANT_B_TEST_PRIMARY_COLOR,
    secondary: "#1E40AF",
    accent: "#0EA5E9",
    surface: "#FFFFFF",
    ink: "#111827",
  });
  assert.equal(tokens.primary, TENANT_B_TEST_PRIMARY_COLOR);
  assert.notEqual(tokens.mist.toLowerCase(), "#eef3f0");
  assert.notEqual(tokens.line.toLowerCase(), "#d5e0da");
  assert.equal(tokens.primaryRgb, "37 99 235");
}

function testTenantThemeCssNoHouzzatGreen() {
  const css = buildTenantThemeCss({
    primary: TENANT_B_TEST_PRIMARY_COLOR,
    secondary: "#1E40AF",
    accent: "#0EA5E9",
    surface: "#FFFFFF",
    ink: "#111827",
  });
  assert.ok(css.includes("--mist:#"));
  assert.ok(css.includes("37 99 235"));
  assert.ok(!css.includes("#0F6B4C"));
  assert.ok(!css.includes("#eef3f0"));
  assert.ok(!css.includes("15 107 76"));
}

function testTenantThemeSkippedForHouzzat() {
  const theme = read("src/components/tenancy/TenantThemeStyle.tsx");
  assert.ok(theme.includes("isHouzzatWorkspace"));
  assert.ok(theme.includes("return null"));
}

function testNoHouzzatLogoFallbackOnTenant() {
  const footer = read("src/components/site/SiteFooter.tsx");
  assert.ok(!footer.includes("houzzat-house-mark"));
  const seo = read("src/lib/tenancy/tenant-seo.ts");
  assert.ok(seo.includes("HOUZZAT_OFFICIAL_LOGO_PATH"));
  assert.ok(!seo.includes("houzzat-house-mark"));
}

function testListingSheetUsesTenantName() {
  const chrome = read("src/components/mobile/ListingSheetChrome.tsx");
  assert.ok(chrome.includes("useTenantDisplayName"));
  assert.ok(!chrome.includes("SITE_NAME"));
}

function testInsightChartsUseCssVar() {
  const charts = read("src/components/listings/insights/InsightCharts.tsx");
  assert.ok(charts.includes("var(--canopy)"));
  assert.ok(!charts.includes("#0f6b4c"));
  assert.ok(!charts.includes("rgb(15 107 76"));
}

function testListingInsightsSkeletonTenantAware() {
  const deferred = read("src/components/listings/insights/ListingInsightsDeferred.tsx");
  assert.ok(!deferred.includes('aria-label="Loading Houzzat Insights"'));
  assert.ok(deferred.includes("brandDisplayName"));
}

function testMapDrawUsesThemeColor() {
  const searchMap = read("src/components/listings/SearchMap.tsx");
  assert.ok(searchMap.includes("readThemeColor"));
  assert.ok(!searchMap.includes('"fill-color": "#0f6b4c"'));
  const nearby = read("src/components/listings/NearbyMap.tsx");
  assert.ok(nearby.includes("readThemeColor"));
  assert.ok(!nearby.includes('PARK: "#0F6B4C"'));
}

function testMixHexWithWhiteDeterministic() {
  const mixed = mixHexWithWhite("#2563EB", 0.94);
  assert.ok(mixed.startsWith("#"));
  assert.notEqual(mixed.toUpperCase(), "#2563EB");
}

function main() {
  testHomepageNoStaticHouzzatMetadata();
  testRootLayoutNoHouzzatTitleTemplate();
  testTenantHomepageTitleMetadata();
  testHouzzatMetadataUnchanged();
  testTenantThemeTokensCoherent();
  testTenantThemeCssNoHouzzatGreen();
  testTenantThemeSkippedForHouzzat();
  testNoHouzzatLogoFallbackOnTenant();
  testListingSheetUsesTenantName();
  testInsightChartsUseCssVar();
  testListingInsightsSkeletonTenantAware();
  testMapDrawUsesThemeColor();
  testMixHexWithWhiteDeterministic();
  console.log("tenant-branding-theme-coherence:selftest passed");
}

main();
