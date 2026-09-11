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
  shouldRedirectUnauthenticatedProToSignIn,
  shouldRunProWorkspaceBootstrap,
} from "../src/lib/mobile/platform-bootstrap";
import {
  findMembershipForHostname,
  resolveMobileWorkspaceBootstrapState,
  resolveVercelTestAliasCurrentHostMembership,
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
  assert.equal(isPlatformMobileBootstrapHost("app.houzzatpro.com"), true);
  assert.equal(isPlatformMobileBootstrapHost("houzzatpro.com"), false);
  assert.equal(isPlatformMobileBootstrapHost("www.houzzatpro.com"), false);
  assert.equal(isPlatformMobileBootstrapHost("tenant-canary.houzzatpro.com"), false);
  assert.equal(isPlatformMobileBootstrapHost("houzzat.com"), false);
  assert.equal(isApprovedProCapacitorServerUrl(HOUZZATPRO_BOOTSTRAP_SERVER_URL), true);
  assert.equal(
    isApprovedProCapacitorServerUrl("https://app.houzzatpro.com/pro"),
    true,
  );
  assert.equal(isApprovedProCapacitorServerUrl("https://houzzatpro.com/pro"), false);
  assert.equal(isApprovedProCapacitorServerUrl("https://houzzat.com/pro"), false);
}

/**
 * Stage 3K.5.10.7 — unauthenticated platform bootstrap must redirect to /pro/sign-in.
 * platformBootstrap=true, authenticated=false, kind=platform_sign_in, normal /pro.
 */
function testUnauthenticatedPlatformProRedirect() {
  assert.deepEqual(
    resolveMobileWorkspaceBootstrapState({
      authenticated: false,
      requestHostname: "app.houzzatpro.com",
      memberships: [],
      currentHostMembership: null,
    }),
    { kind: "platform_sign_in" },
  );

  assert.equal(
    shouldRedirectUnauthenticatedProToSignIn({
      pathname: "/pro",
      hostname: "app.houzzatpro.com",
      authenticated: false,
      diagParam: null,
    }),
    true,
  );
  assert.equal(
    shouldRedirectUnauthenticatedProToSignIn({
      pathname: "/pro",
      hostname: "app.houzzatpro.com",
      authenticated: false,
      diagParam: "1",
    }),
    false,
    "diag=1 must not auto-redirect",
  );
  assert.equal(
    shouldRedirectUnauthenticatedProToSignIn({
      pathname: "/pro",
      hostname: "app.houzzatpro.com",
      authenticated: true,
      diagParam: null,
    }),
    false,
  );
  assert.equal(
    shouldRedirectUnauthenticatedProToSignIn({
      pathname: "/pro",
      hostname: "houzzatpro.com",
      authenticated: false,
      diagParam: null,
    }),
    false,
    "sales apex is not the app bootstrap host",
  );
  assert.equal(
    shouldRedirectUnauthenticatedProToSignIn({
      pathname: "/pro/sign-in",
      hostname: "app.houzzatpro.com",
      authenticated: false,
      diagParam: null,
    }),
    false,
  );

  assert.equal(
    shouldRunProWorkspaceBootstrap({
      pathname: "/pro",
      hostname: "app.houzzatpro.com",
      isNative: false,
    }),
    true,
    "browser on app host must run bootstrap (not native-only)",
  );
  assert.equal(
    shouldRunProWorkspaceBootstrap({
      pathname: "/pro",
      hostname: "houzzatpro.com",
      isNative: false,
    }),
    false,
  );
  assert.equal(
    shouldRunProWorkspaceBootstrap({
      pathname: "/pro",
      hostname: "tenant-canary.houzzatpro.com",
      isNative: true,
    }),
    true,
    "native Capacitor still runs on any host /pro",
  );
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
      requestHostname: "app.houzzatpro.com",
      memberships: [canary],
      currentHostMembership: null,
    }),
    { kind: "platform_sign_in" },
  );

  assert.deepEqual(
    resolveMobileWorkspaceBootstrapState({
      authenticated: true,
      requestHostname: "app.houzzatpro.com",
      memberships: [],
      currentHostMembership: null,
    }),
    { kind: "no_workspace" },
  );

  assert.deepEqual(
    resolveMobileWorkspaceBootstrapState({
      authenticated: true,
      requestHostname: "app.houzzatpro.com",
      memberships: [canary],
      currentHostMembership: null,
    }),
    { kind: "handoff", membership: canary },
  );

  assert.deepEqual(
    resolveMobileWorkspaceBootstrapState({
      authenticated: true,
      requestHostname: "app.houzzatpro.com",
      memberships: [houzzat],
      currentHostMembership: null,
    }),
    { kind: "handoff", membership: houzzat },
  );

  assert.equal(
    resolveMobileWorkspaceBootstrapState({
      authenticated: true,
      requestHostname: "app.houzzatpro.com",
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
  assert.ok(bootstrap.includes("onProBootstrapSurface"));
  assert.ok(bootstrap.includes("shouldRunProWorkspaceBootstrap"));
  assert.ok(bootstrap.includes("return null"));
  assert.ok(bootstrap.includes("isMobileDiagnosticFreezePath"));
  assert.ok(bootstrap.includes("DIAGNOSTIC FREEZE"));
  assert.ok(bootstrap.includes('kind: "platform_sign_in"'));
  assert.ok(bootstrap.includes("REDIRECT_SIGN_IN"));
  assert.ok(!providers.includes("HouzzatProStartup"));
  assert.ok(proPage.includes("HouzzatProStartup"));
  assert.ok(proPage.includes("ProShellRuntimeDiagnostic"));
  assert.ok(middleware.includes("workspace bootstrap handles authenticated routing"));
  assert.ok(middleware.includes("shouldRedirectUnauthenticatedProToSignIn"));
  assert.ok(middleware.includes("x-houzzat-request-path"));
  const marketingLayout = readFileSync(
    join(root, "src/app/(marketing)/layout.tsx"),
    "utf8",
  );
  assert.ok(marketingLayout.includes("isHouzzatProPlatformBootstrapRequest"));
  assert.ok(capPro.includes("https://app.houzzatpro.com/pro"));
  assert.ok(!capPro.includes('"https://houzzatpro.com/pro"'));
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

function testVercelTestAliasCurrentHostMembership() {
  const remax = membership({
    workspaceId: "ws_remax_alias_test",
    role: "OWNER",
    slug: "re-max-realty",
    canonicalHostname: "re-max-realty.houzzatpro.com",
  });
  const houzzatAgent = membership({
    workspaceId: HOUZZAT_FIXTURE_WORKSPACE_ID,
    role: "AGENT",
    slug: "houzzat",
    canonicalHostname: "houzzat.com",
  });

  assert.equal(
    resolveVercelTestAliasCurrentHostMembership({
      hostname: "houzzat-vercel-test.vercel.app",
      memberships: [houzzatAgent, remax],
      canonicalMatch: null,
      aliasWorkspaceId: remax.workspaceId,
    })?.workspaceId,
    remax.workspaceId,
  );
  assert.equal(
    resolveVercelTestAliasCurrentHostMembership({
      hostname: "houzzat-vercel-test.vercel.app",
      memberships: [houzzatAgent],
      canonicalMatch: null,
      aliasWorkspaceId: remax.workspaceId,
    }),
    null,
  );
  assert.equal(
    resolveVercelTestAliasCurrentHostMembership({
      hostname: "app.houzzatpro.com",
      memberships: [remax],
      canonicalMatch: null,
      aliasWorkspaceId: remax.workspaceId,
    }),
    null,
  );
  assert.equal(
    resolveVercelTestAliasCurrentHostMembership({
      hostname: "re-max-realty.houzzatpro.com",
      memberships: [remax],
      canonicalMatch: remax,
      aliasWorkspaceId: remax.workspaceId,
    })?.workspaceId,
    remax.workspaceId,
  );

  assert.equal(
    resolveMobileWorkspaceBootstrapState({
      authenticated: true,
      requestHostname: "houzzat-vercel-test.vercel.app",
      memberships: [remax],
      currentHostMembership: remax,
    }).kind,
    "tenant_destination",
  );
  assert.equal(
    resolveMobileWorkspaceBootstrapState({
      authenticated: true,
      requestHostname: "houzzat-vercel-test.vercel.app",
      memberships: [houzzatAgent],
      currentHostMembership: null,
    }).kind,
    "handoff",
  );

  const route = readFileSync(
    join(root, "src/app/api/mobile/workspace-bootstrap/route.ts"),
    "utf8",
  );
  assert.ok(route.includes("isHouzzatVercelTestHost(hostname)"));
  assert.ok(route.includes("lookupActiveWorkspaceDomainRow"));
  assert.ok(route.includes("resolveVercelTestAliasCurrentHostMembership"));
  assert.ok(!route.includes("*.vercel.app"));
  assert.ok(!route.includes('endsWith(".vercel.app")'));
}

function testAbaNoWorkspaceBleed() {
  const canary = membership({
    workspaceId: TENANT_B_TEST_WORKSPACE_ID,
    role: "OWNER",
    slug: "tenant-canary",
    canonicalHostname: "tenant-canary.houzzatpro.com",
  });
  const houzzat = membership({
    workspaceId: HOUZZAT_FIXTURE_WORKSPACE_ID,
    role: "OWNER",
    slug: "houzzat",
    canonicalHostname: "houzzat.com",
  });

  // Simulate sequential users in the same process — pure function, no globals.
  const canaryBoot = resolveMobileWorkspaceBootstrapState({
    authenticated: true,
    requestHostname: "app.houzzatpro.com",
    memberships: [canary],
    currentHostMembership: null,
  });
  assert.equal(canaryBoot.kind, "handoff");
  if (canaryBoot.kind === "handoff") {
    assert.equal(canaryBoot.membership.slug, "tenant-canary");
    assert.equal(
      canaryBoot.membership.canonicalHostname,
      "tenant-canary.houzzatpro.com",
    );
  }

  const houzzatBoot = resolveMobileWorkspaceBootstrapState({
    authenticated: true,
    requestHostname: "app.houzzatpro.com",
    memberships: [houzzat],
    currentHostMembership: null,
  });
  assert.equal(houzzatBoot.kind, "handoff");
  if (houzzatBoot.kind === "handoff") {
    assert.equal(houzzatBoot.membership.slug, "houzzat");
    assert.equal(houzzatBoot.membership.canonicalHostname, "houzzat.com");
    assert.notEqual(
      houzzatBoot.membership.canonicalHostname,
      "tenant-canary.houzzatpro.com",
    );
  }

  const canaryAgain = resolveMobileWorkspaceBootstrapState({
    authenticated: true,
    requestHostname: "app.houzzatpro.com",
    memberships: [canary],
    currentHostMembership: null,
  });
  assert.equal(canaryAgain.kind, "handoff");
  if (canaryAgain.kind === "handoff") {
    assert.equal(canaryAgain.membership.slug, "tenant-canary");
  }

  // Reverse then A again: Houzzat → Canary → Houzzat
  const a = resolveMobileWorkspaceBootstrapState({
    authenticated: true,
    requestHostname: "app.houzzatpro.com",
    memberships: [houzzat],
    currentHostMembership: null,
  });
  const b = resolveMobileWorkspaceBootstrapState({
    authenticated: true,
    requestHostname: "app.houzzatpro.com",
    memberships: [canary],
    currentHostMembership: null,
  });
  const a2 = resolveMobileWorkspaceBootstrapState({
    authenticated: true,
    requestHostname: "app.houzzatpro.com",
    memberships: [houzzat],
    currentHostMembership: null,
  });
  assert.equal(a.kind === "handoff" && a.membership.slug, "houzzat");
  assert.equal(b.kind === "handoff" && b.membership.slug, "tenant-canary");
  assert.equal(a2.kind === "handoff" && a2.membership.slug, "houzzat");
}

function testHouzzatUserOnCanaryHostStillSelectsHouzzat() {
  const houzzat = membership({
    workspaceId: HOUZZAT_FIXTURE_WORKSPACE_ID,
    role: "OWNER",
    slug: "houzzat",
    canonicalHostname: "houzzat.com",
  });
  // Wrong WebView host (canary) + Houzzat-only memberships → handoff to houzzat.com
  // (never tenant_destination for canary; never invents canary membership).
  const state = resolveMobileWorkspaceBootstrapState({
    authenticated: true,
    requestHostname: "tenant-canary.houzzatpro.com",
    memberships: [houzzat],
    currentHostMembership: null,
  });
  assert.equal(state.kind, "handoff");
  if (state.kind === "handoff") {
    assert.equal(state.membership.slug, "houzzat");
    assert.equal(state.membership.canonicalHostname, "houzzat.com");
  }
}

function testHandoffRouteRevalidatesMembership() {
  const route = readFileSync(
    join(root, "src/app/api/mobile/workspace-handoff/route.ts"),
    "utf8",
  );
  const lib = readFileSync(
    join(root, "src/lib/mobile/mobile-workspace-handoff.ts"),
    "utf8",
  );
  assert.ok(route.includes("loadMobileBootstrapMemberships(session.user.id)"));
  assert.ok(route.includes("memberships.find"));
  assert.ok(route.includes("createMobileWorkspaceHandoff"));
  assert.ok(lib.includes("isPlatformMobileBootstrapHost"));
  assert.ok(lib.includes("workspaceMember.findFirst"));
  assert.ok(lib.includes("resolveMobileWorkspaceCanonicalHost"));
  // No client-provided hostname accepted on mint.
  assert.ok(!route.includes("targetHostname"));
}

function testNativeAppShellCrossHostResolution() {
  const appShellFile = readFileSync(
    join(root, "src/lib/mobile/app-shell.ts"),
    "utf8",
  );
  assert.ok(appShellFile.includes("nativeAppIdFromUserAgent"));
  assert.ok(appShellFile.includes("const uaMarker = nativeAppIdFromUserAgent"));
  assert.ok(appShellFile.includes("cachedShell = mapNativeAppId(uaMarker)"));
}

function main() {
  testPlatformBootstrapHost();
  testUnauthenticatedPlatformProRedirect();
  testCanonicalHostPolicy();
  testBootstrapStateMatrix();
  testAbaNoWorkspaceBleed();
  testHouzzatUserOnCanaryHostStillSelectsHouzzat();
  testHandoffRouteRevalidatesMembership();
  testHandoffIdentifier();
  testRoutingWiring();
  testFixtureDomains();
  testHostnameMembershipLookup();
  testVercelTestAliasCurrentHostMembership();
  testNativeAppShellCrossHostResolution();
  console.log("mobile-workspace-bootstrap:selftest OK");
}

main();
