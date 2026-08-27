/**
 * Stage 3K.5.10 — mobile workspace bootstrap selftest.
 * Run: pnpm mobile-workspace-bootstrap:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { selectCanonicalHostname } from "../src/lib/tenancy/canonical-public-origin";
import {
  HOUZZATPRO_BOOTSTRAP_SERVER_URL,
  isApprovedProCapacitorServerUrl,
  isPlatformMobileBootstrapHost,
} from "../src/lib/mobile/platform-bootstrap";
import {
  findMembershipForHostname,
  resolveMobileWorkspaceBootstrapState,
  type MobileBootstrapMembership,
} from "../src/lib/mobile/workspace-bootstrap";
import { resolveWorkspaceMemberMobileDestination } from "../src/lib/mobile/workspace-destination";
import {
  buildMobileHandoffIdentifier,
  parseMobileHandoffIdentifier,
} from "../src/lib/mobile/mobile-workspace-handoff";
import {
  HOUZZAT_FIXTURE_WORKSPACE_ID,
  TENANT_B_LEAD_ROUTING_FIXTURE_ROWS,
} from "../src/lib/tenancy/test-fixtures/tenant-b-lead-routing";
import { TENANT_B_TEST_WORKSPACE_ID } from "../src/lib/tenancy/test-fixtures/tenant-b-brand";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function membership(
  partial: Partial<MobileBootstrapMembership> & Pick<MobileBootstrapMembership, "workspaceId" | "role" | "slug" | "canonicalHostname">,
): MobileBootstrapMembership {
  return {
    name: partial.slug,
    displayName: partial.displayName ?? partial.slug,
    primaryColor: partial.primaryColor ?? null,
    canonicalOrigin: `https://${partial.canonicalHostname}`,
    ...partial,
  };
}

function testPlatformBootstrapHost() {
  assert.equal(isPlatformMobileBootstrapHost("houzzatpro.com"), true);
  assert.equal(isPlatformMobileBootstrapHost("tenant-canary.houzzatpro.com"), false);
  assert.equal(isPlatformMobileBootstrapHost("houzzat.com"), false);
  assert.equal(isApprovedProCapacitorServerUrl(HOUZZATPRO_BOOTSTRAP_SERVER_URL), true);
  assert.equal(isApprovedProCapacitorServerUrl("https://houzzat.com/pro"), false);
}

function testCanonicalHostPolicy() {
  const houzzatHost = selectCanonicalHostname(
    [
      {
        hostname: "houzzat.com",
        kind: "CUSTOM",
        role: "PRIMARY",
        status: "ACTIVE",
      },
      {
        hostname: "houzzat.houzzatpro.com",
        kind: "PLATFORM",
        role: "PRIMARY",
        status: "ACTIVE",
      },
    ],
    "houzzat.houzzatpro.com",
  );
  assert.equal(houzzatHost, "houzzat.com");

  const canaryHost = selectCanonicalHostname(
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
  assert.equal(canaryHost, "tenant-canary.houzzatpro.com");
}

function testBootstrapStateMatrix() {
  const canary = membership({
    workspaceId: TENANT_B_TEST_WORKSPACE_ID,
    role: "OWNER",
    slug: "tenant-canary",
    displayName: "Tenant Canary",
    canonicalHostname: "tenant-canary.houzzatpro.com",
    primaryColor: "#2563EB",
  });
  const houzzat = membership({
    workspaceId: HOUZZAT_FIXTURE_WORKSPACE_ID,
    role: "OWNER",
    slug: "houzzat",
    displayName: "Houzzat",
    canonicalHostname: "houzzat.com",
    primaryColor: "#1A7B59",
  });

  assert.deepEqual(
    resolveMobileWorkspaceBootstrapState({
      authenticated: false,
      requestHostname: "houzzatpro.com",
      memberships: [canary],
      currentHostMembership: null,
    }),
    { kind: "platform_sign_in" },
  );

  assert.deepEqual(
    resolveMobileWorkspaceBootstrapState({
      authenticated: true,
      requestHostname: "houzzatpro.com",
      memberships: [],
      currentHostMembership: null,
    }),
    { kind: "no_workspace" },
  );

  assert.deepEqual(
    resolveMobileWorkspaceBootstrapState({
      authenticated: true,
      requestHostname: "houzzatpro.com",
      memberships: [canary],
      currentHostMembership: null,
    }),
    { kind: "handoff", membership: canary },
  );

  assert.deepEqual(
    resolveMobileWorkspaceBootstrapState({
      authenticated: true,
      requestHostname: "houzzatpro.com",
      memberships: [houzzat],
      currentHostMembership: null,
    }),
    { kind: "handoff", membership: houzzat },
  );

  assert.equal(
    resolveMobileWorkspaceBootstrapState({
      authenticated: true,
      requestHostname: "houzzatpro.com",
      memberships: [canary, houzzat],
      currentHostMembership: null,
    }).kind,
    "select_workspace",
  );

  assert.deepEqual(
    resolveMobileWorkspaceBootstrapState({
      authenticated: true,
      requestHostname: "tenant-canary.houzzatpro.com",
      memberships: [canary],
      currentHostMembership: canary,
    }),
    {
      kind: "tenant_destination",
      membership: canary,
      destination: "/admin",
    },
  );

  assert.equal(
    resolveWorkspaceMemberMobileDestination("AGENT"),
    "/agent",
  );
}

function testHandoffIdentifier() {
  const identifier = buildMobileHandoffIdentifier({
    userId: "user_fixture_12345678",
    workspaceId: TENANT_B_TEST_WORKSPACE_ID,
    targetHostname: "tenant-canary.houzzatpro.com",
  });
  assert.ok(identifier.startsWith("mobile-handoff:"));
  const parsed = parseMobileHandoffIdentifier(identifier);
  assert.deepEqual(parsed, {
    userId: "user_fixture_12345678",
    workspaceId: TENANT_B_TEST_WORKSPACE_ID,
    targetHostname: "tenant-canary.houzzatpro.com",
  });
}

function testRoutingWiring() {
  const startup = readFileSync(
    join(root, "src/components/mobile/HouzzatProStartup.tsx"),
    "utf8",
  );
  const bootstrap = readFileSync(
    join(root, "src/components/mobile/ProWorkspaceBootstrap.tsx"),
    "utf8",
  );
  const providers = readFileSync(
    join(root, "src/components/Providers.tsx"),
    "utf8",
  );
  const proPage = readFileSync(
    join(root, "src/app/(marketing)/pro/page.tsx"),
    "utf8",
  );
  const middleware = readFileSync(join(root, "src/middleware.ts"), "utf8");
  const capPro = readFileSync(join(root, "capacitor.config.pro.ts"), "utf8");
  assert.ok(startup.includes("ProWorkspaceBootstrap"));
  assert.ok(bootstrap.includes("onNativeProColdStart"));
  assert.ok(bootstrap.includes("return null"));
  assert.ok(!providers.includes("HouzzatProStartup"));
  assert.ok(proPage.includes("HouzzatProStartup"));
  assert.ok(middleware.includes("workspace bootstrap handles authenticated routing"));
  assert.ok(middleware.includes("x-houzzat-request-path"));
  const marketingLayout = readFileSync(
    join(root, "src/app/(marketing)/layout.tsx"),
    "utf8",
  );
  assert.ok(marketingLayout.includes("isHouzzatProPlatformBootstrapRequest"));
  assert.ok(capPro.includes("https://houzzatpro.com/pro"));
}

function testFixtureDomains() {
  const houzzat = TENANT_B_LEAD_ROUTING_FIXTURE_ROWS.find(
    (row) => row.workspaceId === HOUZZAT_FIXTURE_WORKSPACE_ID,
  );
  const canary = TENANT_B_LEAD_ROUTING_FIXTURE_ROWS.find(
    (row) => row.workspaceId === TENANT_B_TEST_WORKSPACE_ID,
  );
  assert.equal(houzzat?.hostname, "houzzat.com");
  assert.equal(canary?.hostname, "tenant-canary.houzzatpro.com");
}

function testHostnameMembershipLookup() {
  const canary = membership({
    workspaceId: TENANT_B_TEST_WORKSPACE_ID,
    role: "AGENT",
    slug: "tenant-canary",
    canonicalHostname: "tenant-canary.houzzatpro.com",
  });
  assert.equal(
    findMembershipForHostname([canary], "tenant-canary.houzzatpro.com")?.role,
    "AGENT",
  );
  assert.equal(findMembershipForHostname([canary], "houzzat.com"), null);
}

function main() {
  testPlatformBootstrapHost();
  testCanonicalHostPolicy();
  testBootstrapStateMatrix();
  testHandoffIdentifier();
  testRoutingWiring();
  testFixtureDomains();
  testHostnameMembershipLookup();
  console.log("mobile-workspace-bootstrap:selftest OK");
}

main();
