/**
 * Stage 3K.5.9 — Tenant Command Centre + theme + platform naming selftest.
 * Run: pnpm tenant-command-centre:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canAccessTenantCommandCentreRole,
  isTenantCommandCentrePathAllowed,
  recordBelongsToTenantCommandCentreWorkspace,
  resolveAdminSurfaceMode,
  tenantCommandCentreAppointmentWhere,
  tenantCommandCentreLeadWhere,
  tenantCommandCentreMemberWhere,
  tenantCommandCentreTaskWhere,
} from "../src/lib/admin/tenant-command-centre-auth";
import { PLATFORM_PRODUCT_NAME, SITE_NAME } from "../src/lib/constants";
import { buildTenantThemeCss } from "../src/lib/tenancy/brand-theme-css";
import { buildLegacyHouzzatBrand } from "../src/lib/tenancy/legacy-houzzat-brand";
import { POWERED_BY_HOUZZATPRO_LABEL } from "../src/lib/tenancy/platform-footer";
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

function withWorkspaceMode(fn: () => void) {
  const prevDomain = process.env.TENANT_DOMAIN_SCOPE;
  const prevRead = process.env.WORKSPACE_READ_SCOPE;
  process.env.TENANT_DOMAIN_SCOPE = "workspace";
  process.env.WORKSPACE_READ_SCOPE = "workspace";
  try {
    fn();
  } finally {
    if (prevDomain === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prevDomain;
    if (prevRead === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prevRead;
  }
}

function testAuthMatrix() {
  withWorkspaceMode(() => {
    assert.equal(resolveAdminSurfaceMode("houzzatpro.com"), "platform");
    assert.equal(resolveAdminSurfaceMode("www.houzzatpro.com"), "platform");
    assert.equal(
      resolveAdminSurfaceMode("tenant-canary.houzzatpro.com"),
      "tenant",
    );
    assert.equal(canAccessTenantCommandCentreRole("OWNER"), true);
    assert.equal(canAccessTenantCommandCentreRole("ADMIN"), true);
    assert.equal(canAccessTenantCommandCentreRole("AGENT"), false);
  });

  const layout = read("src/app/(admin)/admin/layout.tsx");
  assert.ok(layout.includes("authorizeTenantCommandCentre"));
  assert.ok(layout.includes('surface === "tenant"'));
  assert.ok(layout.includes('redirect("/agent")'));
  assert.ok(layout.includes("TenantBrandProvider"));
  assert.ok(layout.includes("TenantThemeStyle"));
  // User.role ADMIN alone must not authorize tenant HQ
  assert.ok(layout.includes("authorizeTenantCommandCentre(request"));
}

function testWorkspacePredicates() {
  const ws = TENANT_B_TEST_WORKSPACE_ID;
  const houzzat = "ws_houzzat_fixture";
  assert.deepEqual(tenantCommandCentreLeadWhere(ws), { workspaceId: ws });
  assert.deepEqual(tenantCommandCentreTaskWhere(ws), { workspaceId: ws });
  assert.deepEqual(tenantCommandCentreAppointmentWhere(ws), {
    lead: { workspaceId: ws },
  });
  assert.deepEqual(tenantCommandCentreMemberWhere(ws), {
    workspaceId: ws,
    status: "ACTIVE",
  });
  assert.equal(
    recordBelongsToTenantCommandCentreWorkspace(ws, ws),
    true,
  );
  assert.equal(
    recordBelongsToTenantCommandCentreWorkspace(houzzat, ws),
    false,
  );
  assert.equal(
    recordBelongsToTenantCommandCentreWorkspace(null, ws),
    false,
  );

  const loader = read("src/lib/admin/tenant-hq-deferred.ts");
  assert.ok(loader.includes("tenantCommandCentreLeadWhere"));
  assert.ok(loader.includes("workspaceId"));
  assert.ok(!loader.includes("organizationId"));
  assert.ok(!loader.includes("siteSession"));
}

function testPathAllowlistAndMiddleware() {
  assert.equal(isTenantCommandCentrePathAllowed("/admin"), true);
  assert.equal(isTenantCommandCentrePathAllowed("/admin/notifications"), true);
  assert.equal(isTenantCommandCentrePathAllowed("/admin/search"), true);
  assert.equal(isTenantCommandCentrePathAllowed("/admin/mls"), true);
  assert.equal(isTenantCommandCentrePathAllowed("/admin/lead-routing"), true);
  assert.equal(isTenantCommandCentrePathAllowed("/admin/people"), true);
  assert.equal(isTenantCommandCentrePathAllowed("/admin/analytics"), true);
  assert.equal(isTenantCommandCentrePathAllowed("/admin/visitors"), false);
  assert.equal(isTenantCommandCentrePathAllowed("/admin/ads"), false);
  assert.equal(isTenantCommandCentrePathAllowed("/admin/landings"), false);

  const mw = read("src/middleware.ts");
  assert.ok(mw.includes("tenantAdminAllowed"));
  assert.ok(mw.includes("isAgentRole(session.user.role)"));
  assert.ok(!mw.includes("if (!isAdminRole(session.user.role))"));

  const adminLayout = read("src/app/(admin)/admin/layout.tsx");
  assert.ok(adminLayout.includes("buildStaffChromeMetadata"));
  assert.ok(adminLayout.includes("generateMetadata"));
  const agentLayout = read("src/app/(agent)/agent/layout.tsx");
  assert.ok(agentLayout.includes("buildStaffChromeMetadata"));
}

function testThemeIsolationAbAb() {
  const houzzat = buildLegacyHouzzatBrand("ws_houzzat_fixture");
  const canary = workspaceBrandingRowToBrand(
    TENANT_B_TEST_WORKSPACE_ID,
    TENANT_B_TEST_BRANDING_ROW,
  );

  assert.equal(houzzat.displayName, SITE_NAME);
  assert.equal(canary.displayName, TENANT_B_TEST_DISPLAY_NAME);
  assert.notEqual(houzzat.colors.primary.toLowerCase(), canary.colors.primary.toLowerCase());
  assert.equal(canary.colors.primary.toUpperCase(), TENANT_B_TEST_PRIMARY_COLOR.toUpperCase());

  const sequence = [houzzat, canary, houzzat, canary];
  const seen: string[] = [];
  for (const brand of sequence) {
    seen.push(`${brand.displayName}:${brand.colors.primary}`);
    if (brand.displayName === TENANT_B_TEST_DISPLAY_NAME) {
      const css = buildTenantThemeCss(brand.colors);
      assert.ok(css.includes(TENANT_B_TEST_PRIMARY_COLOR) || css.toLowerCase().includes("#2563eb"));
      assert.ok(!css.toLowerCase().includes("#0f6b4c"));
    }
  }
  assert.deepEqual(seen, [
    `${SITE_NAME}:${houzzat.colors.primary}`,
    `${TENANT_B_TEST_DISPLAY_NAME}:${canary.colors.primary}`,
    `${SITE_NAME}:${houzzat.colors.primary}`,
    `${TENANT_B_TEST_DISPLAY_NAME}:${canary.colors.primary}`,
  ]);

  const agentLayout = read("src/app/(agent)/agent/layout.tsx");
  assert.ok(agentLayout.includes("TenantBrandProvider"));
  assert.ok(agentLayout.includes("TenantThemeStyle"));
}

function testPlatformNaming() {
  assert.equal(PLATFORM_PRODUCT_NAME, "HouzzatPRO");
  assert.equal(SITE_NAME, "Houzzat");
  assert.equal(POWERED_BY_HOUZZATPRO_LABEL, "Powered by HouzzatPRO");

  const adminShell = read("src/components/admin/AdminShell.tsx");
  assert.ok(adminShell.includes("platformProductName"));
  assert.ok(adminShell.includes("brandDisplayName"));
  assert.ok(!adminShell.includes("Houzzat control center"));

  const agentShell = read("src/components/agent/AgentShell.tsx");
  assert.ok(agentShell.includes("brandDisplayName"));
  assert.ok(agentShell.includes("platformProductName"));
  assert.ok(agentShell.includes("PLATFORM_PRODUCT_NAME"));

  const team = read("src/app/(agent)/agent/team/page.tsx");
  assert.ok(team.includes("HouzzatPRO HQ"));
  assert.ok(!team.includes("Houzzat HQ"));

  // Future tenant must not hardcode Houzzat as fallback brand in staff shells
  assert.ok(!agentShell.includes('SITE_NAME}'));
  assert.ok(!adminShell.includes("{SITE_NAME}"));
}

function testNoOrgAuthority() {
  const auth = read("src/lib/admin/tenant-command-centre-auth.ts");
  assert.ok(!auth.includes("organizationMembership"));
  assert.ok(!auth.includes("demo-agent"));
  assert.ok(!auth.includes("from \"@/lib/agent/brokerage\""));
  assert.ok(auth.includes("tryTenantStaffContext"));
  assert.ok(auth.includes("no ADMIN bypass"));
}

function testCapacitorProTenancyAllowlist() {
  const cap = read("capacitor.config.pro.ts");
  assert.ok(cap.includes("*.houzzatpro.com"));
  assert.ok(cap.includes("HOUZZAT_CAP_PRO_SERVER_URL"));
  assert.ok(cap.includes("https://houzzatpro.com/pro"));
}

function main() {
  testAuthMatrix();
  testWorkspacePredicates();
  testPathAllowlistAndMiddleware();
  testThemeIsolationAbAb();
  testPlatformNaming();
  testNoOrgAuthority();
  testCapacitorProTenancyAllowlist();
  console.log("tenant-command-centre:selftest ok");
}

main();
