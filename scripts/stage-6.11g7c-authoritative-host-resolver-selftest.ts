/**
 * Stage 6.11G.7C — authoritative host resolver selftest.
 * Run: pnpm stage-6.11g7c-authoritative-host-resolver:selftest
 *
 * No production mutation. Proves fail-closed authority even under legacy scope.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createFixtureAuthoritativeHostDeps,
  resolveAuthoritativeWorkspaceFromHost,
  resolveAuthoritativeWorkspaceFromHostname,
  type AuthoritativeDomainLookupRow,
} from "@/lib/tenancy/resolve-authoritative-workspace-host";
import {
  createFixtureHostResolutionDeps,
  resolveWorkspaceFromHostname,
} from "@/lib/tenancy/resolve-workspace-host";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

/** Production Houzzat workspace id — must never be returned for unknown hosts. */
const HOUZZAT_PROD_WORKSPACE_ID = "cmt7kfcth0000gvu0bqsycsvz";
const WS_HOUZZAT = "ws_houzzat_fixture";
const WS_CANARY = "ws_canary_fixture";

const FIXTURE_ROWS: AuthoritativeDomainLookupRow[] = [
  {
    hostname: "houzzat.com",
    kind: "CUSTOM",
    role: "PRIMARY",
    workspaceId: WS_HOUZZAT,
    workspaceSlug: "houzzat",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "www.houzzat.com",
    kind: "CUSTOM",
    role: "ALIAS",
    workspaceId: WS_HOUZZAT,
    workspaceSlug: "houzzat",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "houzzat.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_HOUZZAT,
    workspaceSlug: "houzzat",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "tenant-canary.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_CANARY,
    workspaceSlug: "tenant-canary",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "canary.houzzat.com",
    kind: "CUSTOM",
    role: "PRIMARY",
    workspaceId: WS_CANARY,
    workspaceSlug: "tenant-canary",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
];

async function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    prev[key] = process.env[key];
    const value = overrides[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

async function main() {
  console.log("\n=== STAGE 6.11G.7C — AUTHORITATIVE HOST RESOLVER ===\n");

  const source = read("src/lib/tenancy/resolve-authoritative-workspace-host.ts");
  const deps = createFixtureAuthoritativeHostDeps(FIXTURE_ROWS);

  {
    assert.ok(source.includes("AUTHORITATIVE TENANT RESOLUTION MUST FAIL CLOSED"));
    assert.ok(source.includes("MLS entitlement"));
    assert.ok(!source.includes("process.env.TENANT_DOMAIN_SCOPE"));
    assert.ok(!source.includes("HOUZZAT_WORKSPACE_SLUG"));
    assert.ok(!source.includes("isTenantDomainScopeWorkspace"));
    assert.ok(!source.includes("resolveLegacyHouzzatWorkspace"));
    assert.ok(!/from ["']@\/lib\/tenancy\/resolve-workspace-host["']/.test(source));
    assert.ok(source.includes("extractTrustedRequestHostname"));
    assert.ok(source.includes("lookupActiveWorkspaceDomainRow"));
    assert.ok(source.includes("blocksTenantHostnameResolution"));
    console.log("[0] contract / no legacy coupling... PASS");
  }

  {
    for (const host of [
      "houzzat.com",
      "www.houzzat.com",
      "houzzat.houzzatpro.com",
    ]) {
      const r = await resolveAuthoritativeWorkspaceFromHostname(host, deps);
      assert.ok(r.ok, host);
      assert.equal(r.ok && r.workspaceId, WS_HOUZZAT, host);
      assert.equal(r.ok && r.workspaceSlug, "houzzat", host);
      assert.equal(r.ok && r.workspaceStatus, "ACTIVE", host);
      assert.equal(r.ok && r.verifiedHostname, true, host);
    }
    console.log("[1] valid Houzzat hosts... PASS");
  }

  {
    for (const host of [
      "tenant-canary.houzzatpro.com",
      "canary.houzzat.com",
    ]) {
      const r = await resolveAuthoritativeWorkspaceFromHostname(host, deps);
      assert.ok(r.ok, host);
      assert.equal(r.ok && r.workspaceId, WS_CANARY, host);
      assert.equal(r.ok && r.workspaceSlug, "tenant-canary", host);
      assert.notEqual(r.ok && r.workspaceId, WS_HOUZZAT, host);
    }
    console.log("[2] valid Canary hosts... PASS");
  }

  {
    await withEnv({ TENANT_DOMAIN_SCOPE: undefined }, async () => {
      const unknown = await resolveAuthoritativeWorkspaceFromHostname(
        "unknown-example.invalid",
        deps,
      );
      assert.equal(unknown.ok, false);
      if (!unknown.ok) assert.equal(unknown.reason, "domain_not_found");
      assert.notEqual(
        unknown.ok ? unknown.workspaceId : null,
        HOUZZAT_PROD_WORKSPACE_ID,
      );
      assert.notEqual(unknown.ok ? unknown.workspaceId : null, WS_HOUZZAT);
    });

    await withEnv({ TENANT_DOMAIN_SCOPE: "legacy" }, async () => {
      const unknown = await resolveAuthoritativeWorkspaceFromHostname(
        "unknown-example.invalid",
        deps,
      );
      assert.equal(unknown.ok, false);
      if (!unknown.ok) assert.equal(unknown.reason, "domain_not_found");
      assert.notEqual(
        unknown.ok ? unknown.workspaceId : null,
        HOUZZAT_PROD_WORKSPACE_ID,
      );
    });

    // Contrast: legacy-capable resolver STILL falls back under legacy scope.
    await withEnv({ TENANT_DOMAIN_SCOPE: "legacy" }, async () => {
      const legacyDeps = createFixtureHostResolutionDeps(
        FIXTURE_ROWS.map((r) => ({
          hostname: r.hostname,
          kind: r.kind,
          role: r.role,
          workspaceId: r.workspaceId,
          workspaceSlug: r.workspaceSlug,
          domainStatus: r.domainStatus,
          workspaceStatus: r.workspaceStatus,
        })),
        { workspaceId: WS_HOUZZAT, workspaceSlug: "houzzat" },
      );
      const legacy = await resolveWorkspaceFromHostname(
        "unknown-example.invalid",
        legacyDeps,
      );
      assert.ok(legacy.ok);
      assert.equal(legacy.ok && legacy.mode, "legacy");
      assert.equal(legacy.ok && legacy.workspaceId, WS_HOUZZAT);
      assert.equal(legacy.ok && legacy.verifiedHostname, false);
    });

    console.log("[3] unknown host denied under legacy/unset (no Houzzat)... PASS");
  }

  {
    for (const input of [null, undefined, "", "   "]) {
      const r = await resolveAuthoritativeWorkspaceFromHostname(
        input as string | null | undefined,
        deps,
      );
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.reason, "missing_hostname");
    }

    const malformed = await resolveAuthoritativeWorkspaceFromHostname(
      "https://houzzat.com/path",
      deps,
    );
    assert.equal(malformed.ok, false);
    if (!malformed.ok) assert.equal(malformed.reason, "malformed_hostname");

    // Invalid Host → extractTrustedRequestHostname returns null → missing_hostname.
    const badHostReq = await resolveAuthoritativeWorkspaceFromHost(
      new Request("https://houzzat.com/", {
        headers: { Host: "not a host!!!" },
      }),
      deps,
    );
    assert.equal(badHostReq.ok, false);
    if (!badHostReq.ok) assert.equal(badHostReq.reason, "missing_hostname");
    console.log("[4] missing/malformed hostname denied... PASS");
  }

  {
    for (const host of [
      "app.houzzatpro.com",
      "houzzatpro.com",
      "www.houzzatpro.com",
    ]) {
      const r = await resolveAuthoritativeWorkspaceFromHostname(host, deps);
      assert.equal(r.ok, false, host);
      if (!r.ok) assert.equal(r.reason, "platform_surface", host);
    }
    console.log("[5] platform/bootstrap hosts denied... PASS");
  }

  {
    const inactiveDomainDeps = createFixtureAuthoritativeHostDeps([
      {
        hostname: "pending.example.com",
        kind: "CUSTOM",
        role: "PRIMARY",
        workspaceId: WS_CANARY,
        workspaceSlug: "tenant-canary",
        domainStatus: "PENDING",
        workspaceStatus: "ACTIVE",
      },
    ]);
    const inactiveDomain = await resolveAuthoritativeWorkspaceFromHostname(
      "pending.example.com",
      inactiveDomainDeps,
    );
    assert.equal(inactiveDomain.ok, false);
    if (!inactiveDomain.ok) {
      assert.equal(inactiveDomain.reason, "domain_inactive");
    }

    const inactiveWsDeps = createFixtureAuthoritativeHostDeps([
      {
        hostname: "inactive-ws.example.com",
        kind: "CUSTOM",
        role: "PRIMARY",
        workspaceId: WS_CANARY,
        workspaceSlug: "tenant-canary",
        domainStatus: "ACTIVE",
        workspaceStatus: "CANCELLED",
      },
    ]);
    const inactiveWs = await resolveAuthoritativeWorkspaceFromHostname(
      "inactive-ws.example.com",
      inactiveWsDeps,
    );
    assert.equal(inactiveWs.ok, false);
    if (!inactiveWs.ok) {
      assert.equal(inactiveWs.reason, "workspace_inactive");
    }

    const suspendedDeps = createFixtureAuthoritativeHostDeps([
      {
        hostname: "suspended.example.com",
        kind: "CUSTOM",
        role: "PRIMARY",
        workspaceId: WS_CANARY,
        workspaceSlug: "tenant-canary",
        domainStatus: "ACTIVE",
        workspaceStatus: "SUSPENDED",
      },
    ]);
    const suspended = await resolveAuthoritativeWorkspaceFromHostname(
      "suspended.example.com",
      suspendedDeps,
    );
    assert.equal(suspended.ok, false);
    if (!suspended.ok) {
      assert.equal(suspended.reason, "workspace_suspended");
    }

    console.log("[6] inactive domain/workspace denied... PASS");
  }

  {
    const request = new Request("https://houzzat.com/listings", {
      headers: { Host: "houzzat.com" },
    });
    const r = await resolveAuthoritativeWorkspaceFromHost(request, deps);
    assert.ok(r.ok);
    assert.equal(r.ok && r.workspaceId, WS_HOUZZAT);
    assert.equal(r.ok && r.verifiedHostname, true);

    const spoof = new Request("https://houzzat.com/", {
      headers: {
        Host: "houzzat.com",
        "X-Forwarded-Host": "evil.com",
      },
    });
    const spoofed = await resolveAuthoritativeWorkspaceFromHost(spoof, deps);
    assert.ok(spoofed.ok);
    assert.equal(spoofed.ok && spoofed.hostname, "houzzat.com");
    console.log("[7] request helper + X-Forwarded-Host ignored... PASS");
  }

  {
    // Structural: legacy resolver file still has Houzzat fallback (unchanged).
    const legacy = read("src/lib/tenancy/resolve-workspace-host.ts");
    assert.ok(legacy.includes("resolveLegacyHouzzatWorkspace"));
    assert.ok(legacy.includes("HOUZZAT_WORKSPACE_SLUG"));
    assert.ok(legacy.includes("isTenantDomainScopeWorkspace"));
    console.log("[8] legacy resolver preserved... PASS");
  }

  console.log("\nstage-6.11g7c-authoritative-host-resolver:selftest ok\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
