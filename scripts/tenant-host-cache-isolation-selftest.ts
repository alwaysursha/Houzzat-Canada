/**
 * Stage 3K.3 — hostname resolution cache isolation selftest.
 * Run: pnpm tenant-host-cache-isolation:selftest
 */
import assert from "node:assert/strict";
import {
  clearHostResolutionCacheForTests,
  createFixtureHostResolutionDeps,
  resolveWorkspaceFromHostname,
  type DomainLookupRow,
} from "../src/lib/tenancy/resolve-workspace-host";
import {
  hostResolutionCacheKey,
  readHostResolutionCache,
} from "../src/lib/tenancy/host-resolution-cache";

const WS_A = "ws_a_fixture";
const WS_B = "ws_b_fixture";

const FIXTURE_ROWS: DomainLookupRow[] = [
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
    hostname: "alisyed.com",
    kind: "CUSTOM",
    role: "PRIMARY",
    workspaceId: WS_B,
    workspaceSlug: "ali-syed",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
];

async function withWorkspaceScope<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.TENANT_DOMAIN_SCOPE;
  process.env.TENANT_DOMAIN_SCOPE = "workspace";
  return fn().finally(() => {
    if (prev === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prev;
  });
}

async function main() {
  await withWorkspaceScope(async () => {
    clearHostResolutionCacheForTests();
    const deps = createFixtureHostResolutionDeps(FIXTURE_ROWS);

    assert.notEqual(
      hostResolutionCacheKey("workspace", "houzzat.com"),
      hostResolutionCacheKey("workspace", "alisyed.com"),
    );

    const houzzat = await resolveWorkspaceFromHostname("houzzat.com", deps);
    const ali = await resolveWorkspaceFromHostname("alisyed.com", deps);
    assert.ok(houzzat.ok && ali.ok);
    assert.notEqual(houzzat.workspaceId, ali.workspaceId);

    const cachedH = readHostResolutionCache("workspace", "houzzat.com");
    const cachedA = readHostResolutionCache("workspace", "alisyed.com");
    assert.ok(cachedH?.ok);
    assert.ok(cachedA?.ok);
    assert.equal(cachedH.ok && cachedH.workspaceId, WS_A);
    assert.equal(cachedA.ok && cachedA.workspaceId, WS_B);

    const houzzatAgain = await resolveWorkspaceFromHostname("houzzat.com", deps);
    assert.ok(houzzatAgain.ok);
    assert.equal(houzzatAgain.workspaceId, WS_A);
    assert.notEqual(houzzatAgain.workspaceId, WS_B);

    const unknown = await resolveWorkspaceFromHostname("unknown-example.com", deps);
    assert.equal(unknown.ok, false);
    const cachedUnknown = readHostResolutionCache(
      "workspace",
      "unknown-example.com",
    );
    assert.equal(cachedUnknown?.ok, false);
    if (cachedUnknown && !cachedUnknown.ok) {
      assert.equal(cachedUnknown.reason, "domain_not_found");
    }

    const houzzatFinal = await resolveWorkspaceFromHostname("houzzat.com", deps);
    assert.ok(houzzatFinal.ok);
    assert.equal(houzzatFinal.workspaceId, WS_A);
  });

  console.log("tenant-host-cache-isolation:selftest ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
