/**
 * Stage 3K.5.5.3 — dynamic tenant favicon regression tests.
 * Run: pnpm tenant-favicon:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMarketingRootMetadata,
  organizationJsonLdForTenancy,
} from "../src/lib/tenancy/tenant-seo";
import { buildLegacyHouzzatBrand } from "../src/lib/tenancy/legacy-houzzat-brand";
import { workspaceBrandingRowToBrand } from "../src/lib/tenancy/resolve-workspace-brand";
import { toMarketingPresentationBrand } from "../src/lib/tenancy/marketing-presentation-brand";
import {
  buildGeneratedTenantFaviconSvg,
  resolveTenantFaviconHref,
  safeFaviconInitial,
  tenantFaviconApiHref,
} from "../src/lib/tenancy/tenant-favicon";
import {
  TENANT_B_TEST_BRANDING_ROW,
  TENANT_B_TEST_PRIMARY_COLOR,
  TENANT_B_TEST_WORKSPACE_ID,
} from "../src/lib/tenancy/test-fixtures/tenant-b-brand";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function tenantBTenancy() {
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

function customFaviconTenancy() {
  const brand = workspaceBrandingRowToBrand(
    "ws_custom",
    {
      ...TENANT_B_TEST_BRANDING_ROW,
      workspaceId: "ws_custom",
      faviconUrl: "/uploads/custom-favicon.png",
      version: 3,
    },
  );
  return {
    ok: true as const,
    hostname: "purple.example.com",
    origin: "https://purple.example.com",
    workspaceId: "ws_custom",
    workspaceSlug: "purple",
    verifiedHostname: true,
    brand,
    resolutionMode: "workspace" as const,
  };
}

function iconUrl(meta: ReturnType<typeof buildMarketingRootMetadata>): string {
  const icons = meta.icons;
  if (!icons || typeof icons === "string") return icons ?? "";
  if (Array.isArray(icons)) return icons[0]?.url ?? "";
  const icon = icons.icon;
  if (!icon) return "";
  if (typeof icon === "string") return icon;
  if (Array.isArray(icon)) return icon[0]?.url ?? "";
  return icon.url ?? "";
}

function testTenantBGeneratedBlueFavicon() {
  const svg = buildGeneratedTenantFaviconSvg({
    primaryColor: TENANT_B_TEST_PRIMARY_COLOR,
    initial: safeFaviconInitial("Tenant Canary"),
  });
  assert.ok(svg.includes(TENANT_B_TEST_PRIMARY_COLOR));
  assert.ok(!svg.includes("#0F6B4C"));
  assert.ok(!svg.includes("houzzat-favicon"));
  assert.ok(!svg.includes("<script"));
  assert.ok(svg.includes(">T<"));
}

function testTenantBMetadataUsesGeneratedApi() {
  const meta = buildMarketingRootMetadata(
    tenantBTenancy(),
    "https://tenant-canary.houzzatpro.com",
  );
  const url = iconUrl(meta);
  assert.ok(url.includes("/api/tenancy/favicon"));
  assert.ok(url.includes("v=1"));
  assert.ok(!url.includes("houzzat-favicon"));
}

function testHouzzatExplicitFaviconPreserved() {
  const tenancy = houzzatTenancy();
  const meta = buildMarketingRootMetadata(tenancy, "https://houzzat.com");
  const url = iconUrl(meta);
  const official = "https://houzzat.com/images/houzzat-app-icon-512.png";
  assert.equal(url, official);
  const icons = meta.icons;
  assert.ok(icons && !Array.isArray(icons) && typeof icons !== "string");
  if (!icons || Array.isArray(icons) || typeof icons === "string") return;
  assert.equal(icons.apple, official);
  assert.equal(icons.shortcut, official);
  const og = meta.openGraph?.images;
  const ogUrl = Array.isArray(og) ? og[0] : og;
  assert.equal(typeof ogUrl === "string" ? ogUrl : ogUrl?.url, official);
  const twitter = meta.twitter?.images;
  const twitterUrl = Array.isArray(twitter) ? twitter[0] : twitter;
  assert.equal(
    typeof twitterUrl === "string" ? twitterUrl : twitterUrl?.url,
    official,
  );
  const jsonLd = organizationJsonLdForTenancy(tenancy, "https://houzzat.com");
  assert.equal(jsonLd.logo, official);
  assert.equal(jsonLd.image, official);
  assert.ok(!url.includes("/api/tenancy/favicon"));

  const tenant = buildMarketingRootMetadata(
    tenantBTenancy(),
    "https://tenant-canary.houzzatpro.com",
  );
  assert.ok(!iconUrl(tenant).includes("houzzat-app-icon-512"));
  const tenantLd = organizationJsonLdForTenancy(
    tenantBTenancy(),
    "https://tenant-canary.houzzatpro.com",
  );
  assert.equal(tenantLd.logo, undefined);

  const stale = houzzatTenancy();
  stale.brand = {
    ...stale.brand,
    logoUrl: "/images/houzzat-house-mark.png",
    faviconUrl: "/images/houzzat-favicon.png",
    ogImageUrl: "/icon.png",
  };
  const staleMeta = buildMarketingRootMetadata(stale, "https://houzzat.com");
  assert.equal(iconUrl(staleMeta), official);
  const staleLd = organizationJsonLdForTenancy(stale, "https://houzzat.com");
  assert.equal(staleLd.logo, official);
  assert.equal(staleLd.image, official);
}

function testCustomFaviconWinsOverGenerated() {
  const brand = toMarketingPresentationBrand(
    customFaviconTenancy(),
    "https://purple.example.com",
  );
  assert.equal(resolveTenantFaviconHref(brand), "/uploads/custom-favicon.png");
  const meta = buildMarketingRootMetadata(
    customFaviconTenancy(),
    "https://purple.example.com",
  );
  const url = iconUrl(meta);
  assert.ok(url.includes("/uploads/custom-favicon.png"));
  assert.ok(!url.includes("/api/tenancy/favicon"));
}

function testVersionedCacheIdentity() {
  assert.notEqual(tenantFaviconApiHref(1), tenantFaviconApiHref(2));
  assert.ok(tenantFaviconApiHref(4).includes("v=4"));
}

function testMaliciousDisplayNameCannotInjectSvg() {
  const initial = safeFaviconInitial('<script>alert("x")</script>');
  assert.equal(initial, "R");
  const svg = buildGeneratedTenantFaviconSvg({
    primaryColor: TENANT_B_TEST_PRIMARY_COLOR,
    initial,
  });
  assert.ok(!svg.includes("<script"));
  assert.ok(!svg.includes("alert"));
}

function testInvalidColorFallsBackSafely() {
  const svg = buildGeneratedTenantFaviconSvg({
    primaryColor: "url(evil)",
    initial: "A",
  });
  assert.ok(svg.includes("#6B7280"));
  assert.ok(!svg.includes("url("));
}

function testApiRouteSecurityWiring() {
  const route = read("src/app/api/tenancy/favicon/route.ts");
  assert.ok(route.includes("resolveRequestTenancy(request)"));
  assert.ok(route.includes("isHouzzatProPlatformRoot"));
  assert.ok(!route.includes("searchParams.get(\"color\")"));
  assert.ok(route.includes('Vary: "Host"'));
}

function testMetadataIntegrationWiring() {
  const seo = read("src/lib/tenancy/tenant-seo.ts");
  assert.ok(seo.includes("resolveTenantFaviconMetadata"));

  const staffMeta = read("src/lib/tenancy/staff-chrome-metadata.ts");
  assert.ok(staffMeta.includes("resolveTenantFaviconMetadata"));
  assert.ok(staffMeta.includes("buildStaffChromeMetadata"));

  const adminLayout = read("src/app/(admin)/admin/layout.tsx");
  assert.ok(adminLayout.includes("buildStaffChromeMetadata"));
  assert.ok(adminLayout.includes("generateMetadata"));

  const agentLayout = read("src/app/(agent)/agent/layout.tsx");
  assert.ok(agentLayout.includes("buildStaffChromeMetadata"));
  assert.ok(agentLayout.includes("generateMetadata"));
}

function testFaviconIcoRewrite() {
  const middleware = read("src/middleware.ts");
  assert.ok(middleware.includes('pathname === "/favicon.ico"'));
  assert.ok(middleware.includes("/api/tenancy/favicon"));
  assert.ok(middleware.includes("houzzatpro.com"));
  assert.ok(middleware.includes("isHouzzatProPlatformRootHost"));
  assert.ok(!middleware.includes('from "@/lib/tenancy/platform-hostname"'));
}

function main() {
  testTenantBGeneratedBlueFavicon();
  testTenantBMetadataUsesGeneratedApi();
  testHouzzatExplicitFaviconPreserved();
  testCustomFaviconWinsOverGenerated();
  testVersionedCacheIdentity();
  testMaliciousDisplayNameCannotInjectSvg();
  testInvalidColorFallsBackSafely();
  testApiRouteSecurityWiring();
  testMetadataIntegrationWiring();
  testFaviconIcoRewrite();
  console.log("tenant-favicon:selftest passed");
}

main();
