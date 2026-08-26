/**
 * Stage 3K.4.3 — domain kind inference + pre-migration probe selftest.
 * Run: pnpm tenant-domain-kind-inference:selftest
 */
import { config } from "dotenv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOUZZAT_WORKSPACE_SLUG } from "../src/lib/crm-ownership";
import { inferWorkspaceDomainKind } from "../src/lib/tenancy/infer-workspace-domain-kind";
import {
  findWorkspaceDomainForWorkspaceHostForProbe,
  listWorkspaceDomainsForProbe,
  lookupActiveWorkspaceDomainRow,
  WORKSPACE_DOMAIN_PROBE_SELECT,
} from "../src/lib/tenancy/workspace-domain-probe";
import {
  clearHostResolutionCacheForTests,
  resolveWorkspaceFromHostname,
} from "../src/lib/tenancy/resolve-workspace-host";
import { CANARY_SLUG } from "./lib/tenant-canary-provision";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testInferencePreMigrationRows() {
  assert.equal(
    inferWorkspaceDomainKind({
      hostname: "houzzat.com",
      workspaceSlug: HOUZZAT_WORKSPACE_SLUG,
    }),
    "CUSTOM",
  );
  assert.equal(
    inferWorkspaceDomainKind({
      hostname: "www.houzzat.com",
      workspaceSlug: HOUZZAT_WORKSPACE_SLUG,
    }),
    "CUSTOM",
  );
  assert.equal(
    inferWorkspaceDomainKind({
      hostname: "canary.houzzat.com",
      workspaceSlug: CANARY_SLUG,
    }),
    "CUSTOM",
  );
  assert.equal(
    inferWorkspaceDomainKind({
      hostname: "houzzat.houzzatpro.com",
      workspaceSlug: HOUZZAT_WORKSPACE_SLUG,
    }),
    "PLATFORM",
  );
  assert.equal(
    inferWorkspaceDomainKind({
      hostname: "tenant-canary.houzzatpro.com",
      workspaceSlug: CANARY_SLUG,
    }),
    "PLATFORM",
  );
}

function testStructuralSafeProbes() {
  const probe = read("src/lib/tenancy/workspace-domain-probe.ts");
  const resolver = read("src/lib/tenancy/resolve-workspace-host.ts");
  assert.ok(probe.includes("WORKSPACE_DOMAIN_PROBE_SELECT"));
  assert.ok(!probe.includes("findMany({\n    where:") || probe.includes("select: WORKSPACE_DOMAIN_PROBE_SELECT"));
  assert.ok(resolver.includes("lookupActiveWorkspaceDomainRow"));
  assert.ok(!Object.keys(WORKSPACE_DOMAIN_PROBE_SELECT).includes("kind"));
}

async function testProductionPreMigrationProbe() {
  if (!process.env.DATABASE_URL) {
    console.log("  production kind inference probe: SKIP (no DATABASE_URL)");
    return;
  }

  const prev = process.env.TENANT_DOMAIN_SCOPE;
  process.env.TENANT_DOMAIN_SCOPE = "workspace";

  try {
    const { prisma } = await import("../src/lib/prisma");

    const houzzatDomains = await listWorkspaceDomainsForProbe(
      prisma,
      (
        await prisma.workspace.findUniqueOrThrow({
          where: { slug: HOUZZAT_WORKSPACE_SLUG },
          select: { id: true },
        })
      ).id,
      HOUZZAT_WORKSPACE_SLUG,
    );
    const houzzatPrimary = houzzatDomains.find((d) => d.hostname === "houzzat.com");
    const houzzatWww = houzzatDomains.find((d) => d.hostname === "www.houzzat.com");
    assert.ok(houzzatPrimary);
    assert.equal(houzzatPrimary.kind, "CUSTOM");
    assert.equal(houzzatPrimary.role, "PRIMARY");
    assert.ok(houzzatWww);
    assert.equal(houzzatWww.kind, "CUSTOM");
    assert.equal(houzzatWww.role, "ALIAS");

    const canaryWs = await prisma.workspace.findUniqueOrThrow({
      where: { slug: CANARY_SLUG },
      select: { id: true },
    });
    const canaryLegacy = await findWorkspaceDomainForWorkspaceHostForProbe(
      prisma,
      canaryWs.id,
      CANARY_SLUG,
      "canary.houzzat.com",
    );
    assert.ok(canaryLegacy);
    assert.equal(canaryLegacy.kind, "CUSTOM");
    assert.equal(canaryLegacy.role, "PRIMARY");

    clearHostResolutionCacheForTests();
    const houzzatHost = await resolveWorkspaceFromHostname("houzzat.com");
    assert.ok(houzzatHost.ok);
    assert.equal(houzzatHost.ok && houzzatHost.domainKind, "CUSTOM");

    const lookup = await lookupActiveWorkspaceDomainRow(prisma, "houzzat.com");
    assert.ok(lookup);
    assert.equal(lookup.kind, "CUSTOM");

    await prisma.$disconnect();
  } finally {
    if (prev === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prev;
  }
}

async function main() {
  testInferencePreMigrationRows();
  testStructuralSafeProbes();
  await testProductionPreMigrationProbe();
  console.log("tenant-domain-kind-inference:selftest ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
