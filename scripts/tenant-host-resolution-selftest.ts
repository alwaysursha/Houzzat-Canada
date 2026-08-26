/**
 * Stage 3K.3 — hostname → workspace resolver selftest.
 * Run: pnpm tenant-host-resolution:selftest
 */
import { config } from "dotenv";
import assert from "node:assert/strict";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractTrustedRequestHostname,
  TRUSTED_HOSTNAME_AUTHORITY_DOC,
} from "../src/lib/tenancy/extract-request-hostname";
import {
  clearHostResolutionCacheForTests,
  createFixtureHostResolutionDeps,
  resolveWorkspaceFromHostname,
  resolveWorkspaceFromRequest,
  type DomainLookupRow,
} from "../src/lib/tenancy/resolve-workspace-host";
import { blocksTenantHostnameResolution } from "../src/lib/tenancy/reserved-domains";
import {
  findWorkspaceDomainForWorkspaceHostForProbe,
  WORKSPACE_DOMAIN_PROBE_SELECT,
} from "../src/lib/tenancy/workspace-domain-probe";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_a_fixture";
const WS_B = "ws_b_fixture";

const FIXTURE_ROWS: DomainLookupRow[] = [
  {
    hostname: "houzzat.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_A,
    workspaceSlug: "houzzat",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "houzzat.com",
    kind: "CUSTOM",
    role: "PRIMARY",
    workspaceId: WS_A,
    workspaceSlug: "houzzat",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "www.houzzat.com",
    kind: "CUSTOM",
    role: "ALIAS",
    workspaceId: WS_A,
    workspaceSlug: "houzzat",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "tenant-canary.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_B,
    workspaceSlug: "ali-syed",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "alisyed.com",
    kind: "CUSTOM",
    role: "PRIMARY",
    workspaceId: WS_B,
    workspaceSlug: "ali-syed",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "www.alisyed.com",
    kind: "CUSTOM",
    role: "ALIAS",
    workspaceId: WS_B,
    workspaceSlug: "ali-syed",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
];

function withWorkspaceScope<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.TENANT_DOMAIN_SCOPE;
  process.env.TENANT_DOMAIN_SCOPE = "workspace";
  return fn().finally(() => {
    if (prev === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prev;
  });
}

function withLegacyScope<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.TENANT_DOMAIN_SCOPE;
  delete process.env.TENANT_DOMAIN_SCOPE;
  return fn().finally(() => {
    if (prev !== undefined) process.env.TENANT_DOMAIN_SCOPE = prev;
  });
}

async function testWorkspaceModeKnownHosts() {
  await withWorkspaceScope(async () => {
    clearHostResolutionCacheForTests();
    const deps = createFixtureHostResolutionDeps(FIXTURE_ROWS);

    const houzzatPlatform = await resolveWorkspaceFromHostname(
      "houzzat.houzzatpro.com",
      deps,
    );
    assert.ok(houzzatPlatform.ok);
    assert.equal(houzzatPlatform.ok && houzzatPlatform.workspaceId, WS_A);
    assert.equal(houzzatPlatform.ok && houzzatPlatform.domainKind, "PLATFORM");

    for (const input of [
      "houzzat.com",
      "HOUZZAT.COM",
      "houzzat.com:443",
      "houzzat.com.",
    ]) {
      const r = await resolveWorkspaceFromHostname(input, deps);
      assert.ok(r.ok, input);
      assert.equal(r.ok && r.workspaceId, WS_A, input);
      assert.equal(r.ok && r.verifiedHostname, true, input);
    }

    const www = await resolveWorkspaceFromHostname("www.houzzat.com", deps);
    assert.ok(www.ok);
    assert.equal(www.ok && www.workspaceId, WS_A);
    assert.equal(www.ok && www.domainRole, "ALIAS");

    const ali = await resolveWorkspaceFromHostname("alisyed.com", deps);
    assert.ok(ali.ok);
    assert.equal(ali.ok && ali.workspaceId, WS_B);

    const aliWww = await resolveWorkspaceFromHostname("www.alisyed.com", deps);
    assert.ok(aliWww.ok);
    assert.equal(aliWww.ok && aliWww.workspaceId, WS_B);
    assert.equal(aliWww.ok && aliWww.domainRole, "ALIAS");
  });
}

async function testWorkspaceModeFailClosed() {
  await withWorkspaceScope(async () => {
    clearHostResolutionCacheForTests();
    const deps = createFixtureHostResolutionDeps(FIXTURE_ROWS);

    for (const host of [
      "unknown-example.com",
      "unknown.houzzatpro.com",
      "tenant-canary.test",
    ]) {
      const r = await resolveWorkspaceFromHostname(host, deps);
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.reason, "domain_not_found");
    }

    for (const host of ["houzzatpro.com", "www.houzzatpro.com", "foo.workers.dev"]) {
      const r = await resolveWorkspaceFromHostname(host, deps);
      assert.equal(r.ok, false, host);
      if (!r.ok) assert.equal(r.reason, "platform_surface", host);
    }

    for (const host of [
      "https://houzzat.com",
      "houzzat.com/admin",
      "not a host!!!",
    ]) {
      const r = await resolveWorkspaceFromHostname(host, deps);
      assert.equal(r.ok, false, host);
      if (!r.ok) assert.equal(r.reason, "malformed_hostname", host);
    }

    // Unknown must NOT return Houzzat
    const unknown = await resolveWorkspaceFromHostname("unknown-example.com", deps);
    assert.equal(unknown.ok, false);
    const houzzat = await resolveWorkspaceFromHostname("houzzat.com", deps);
    assert.ok(houzzat.ok);
    assert.notEqual(
      unknown.ok ? null : unknown.reason,
      houzzat.ok ? houzzat.workspaceId : null,
    );
  });
}

async function testLegacyMode() {
  await withLegacyScope(async () => {
    clearHostResolutionCacheForTests();
    const deps = createFixtureHostResolutionDeps(FIXTURE_ROWS);

    const r = await resolveWorkspaceFromHostname("unknown-example.com", deps);
    assert.ok(r.ok);
    assert.equal(r.mode, "legacy");
    assert.equal(r.verifiedHostname, false);
    assert.equal(r.workspaceSlug, "houzzat");

    const houzzat = await resolveWorkspaceFromHostname("houzzat.com", deps);
    assert.ok(houzzat.ok);
    assert.equal(houzzat.mode, "legacy");
    assert.equal(houzzat.verifiedHostname, false);
  });
}

async function testCrossTenantIsolation() {
  await withWorkspaceScope(async () => {
    clearHostResolutionCacheForTests();
    const deps = createFixtureHostResolutionDeps(FIXTURE_ROWS);

    const a = await resolveWorkspaceFromHostname("houzzat.com", deps);
    const b = await resolveWorkspaceFromHostname("alisyed.com", deps);
    assert.ok(a.ok && b.ok);
    assert.notEqual(a.workspaceId, b.workspaceId);

    const a2 = await resolveWorkspaceFromHostname("houzzat.com", deps);
    assert.ok(a2.ok);
    assert.equal(a2.workspaceId, WS_A);
    assert.notEqual(a2.workspaceId, WS_B);
  });
}

async function testRequestExtraction() {
  const req = new Request("https://houzzat.com/agent", {
    headers: { Host: "houzzat.com" },
  });
  assert.equal(extractTrustedRequestHostname(req), "houzzat.com");

  const spoof = new Request("https://houzzat.com/", {
    headers: {
      Host: "houzzat.com",
      "X-Forwarded-Host": "evil.com",
    },
  });
  assert.equal(extractTrustedRequestHostname(spoof), "houzzat.com");

  await withWorkspaceScope(async () => {
    clearHostResolutionCacheForTests();
    const deps = createFixtureHostResolutionDeps(FIXTURE_ROWS);
    const r = await resolveWorkspaceFromRequest(
      new Request("https://www.houzzat.com/search"),
      deps,
    );
    assert.ok(r.ok);
    assert.equal(r.ok && r.workspaceId, WS_A);
  });
}

async function testInactiveDomainDenied() {
  await withWorkspaceScope(async () => {
    clearHostResolutionCacheForTests();
    const deps = createFixtureHostResolutionDeps([
      {
        hostname: "pending.example.com",
        role: "PRIMARY",
        workspaceId: WS_B,
        workspaceSlug: "ali-syed",
        domainStatus: "PENDING",
        workspaceStatus: "ACTIVE",
      },
    ]);
    const r = await resolveWorkspaceFromHostname("pending.example.com", deps);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "domain_inactive");
  });
}

async function testProductionReadOnlyProbe() {
  if (!process.env.DATABASE_URL) {
    console.log("  production probe: SKIP (no DATABASE_URL)");
    return;
  }

  await withWorkspaceScope(async () => {
    clearHostResolutionCacheForTests();
    const { prisma } = await import("../src/lib/prisma");

    const houzzat = await resolveWorkspaceFromHostname("houzzat.com");
    assert.ok(houzzat.ok, "prod houzzat.com");
    assert.equal(houzzat.ok && houzzat.workspaceSlug, "houzzat");
    assert.equal(houzzat.ok && houzzat.verifiedHostname, true);

    const www = await resolveWorkspaceFromHostname("www.houzzat.com");
    assert.ok(www.ok, "prod www.houzzat.com");
    assert.equal(www.ok && www.workspaceSlug, "houzzat");

    const unknown = await resolveWorkspaceFromHostname("unknown-example.com");
    assert.equal(unknown.ok, false);

    const platform = await resolveWorkspaceFromHostname("houzzatpro.com");
    assert.equal(platform.ok, false);
    if (!platform.ok) assert.equal(platform.reason, "platform_surface");

    const canaryDomain = await findWorkspaceDomainForWorkspaceHostForProbe(
      prisma,
      (
        await prisma.workspace.findUniqueOrThrow({
          where: { slug: "tenant-canary" },
          select: { id: true },
        })
      ).id,
      "tenant-canary",
      "canary.houzzat.com",
    );
    assert.ok(canaryDomain, "prod tenant-canary domain");
    assert.equal(canaryDomain.hostname, "canary.houzzat.com");
    assert.equal(canaryDomain.kind, "CUSTOM");
    assert.equal(canaryDomain.role, "PRIMARY");
    assert.equal(canaryDomain.status, "ACTIVE");

    const canaryHost = await resolveWorkspaceFromHostname("canary.houzzat.com");
    assert.ok(canaryHost.ok, "prod canary.houzzat.com");
    assert.equal(canaryHost.ok && canaryHost.workspaceSlug, "tenant-canary");
    assert.equal(canaryHost.ok && canaryHost.domainKind, "CUSTOM");
    assert.equal(canaryHost.ok && canaryHost.verifiedHostname, true);

    assert.ok(!("kind" in WORKSPACE_DOMAIN_PROBE_SELECT));

    await prisma.$disconnect();
  });
}

function testStructural() {
  const resolver = read("src/lib/tenancy/resolve-workspace-host.ts");
  assert.ok(resolver.includes("domainKind"));
  assert.ok(resolver.includes("verifiedHostname: false"));
  assert.ok(resolver.includes("domain_not_found"));
  assert.ok(!resolver.includes("organizationId"));
  assert.ok(!resolver.includes("resolveWorkspaceBrand"));
  assert.ok(blocksTenantHostnameResolution("houzzatpro.com"));
  assert.equal(blocksTenantHostnameResolution("houzzat.com"), null);
  assert.ok(TRUSTED_HOSTNAME_AUTHORITY_DOC.length >= 3);
  assert.ok(!read("src/middleware.ts").includes("resolveWorkspaceFromRequest"));
}

async function main() {
  testStructural();
  await testWorkspaceModeKnownHosts();
  await testWorkspaceModeFailClosed();
  await testLegacyMode();
  await testCrossTenantIsolation();
  await testRequestExtraction();
  await testInactiveDomainDenied();
  await testProductionReadOnlyProbe();
  console.log("tenant-host-resolution:selftest ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
