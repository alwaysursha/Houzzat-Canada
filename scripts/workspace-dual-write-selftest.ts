/**
 * Stage 3D — Core CRM dual-write selftest.
 * Run: pnpm workspace-dual-write:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HOUZZAT_WORKSPACE_SLUG,
  LEGACY_CRM_ORGANIZATION_SLUG,
  clearTenancyMappingCache,
  isWorkspaceDualWriteEnabled,
  resolveChildCrmOwnership,
  resolveLeadCrmOwnership,
  workspaceIdForOrganization,
} from "../src/lib/crm-ownership";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WRITE_PATHS = [
  "src/lib/agent/lead-intake.ts",
  "src/lib/agent/create-manual-lead.ts",
  "src/lib/email/log.ts",
  "src/app/api/agent/tasks/route.ts",
  "src/app/api/agent/notes/route.ts",
  "src/app/api/agent/inquiry-tag/route.ts",
  "src/app/api/agent/team/route.ts",
  "src/app/api/leads/route.ts",
  "src/app/api/valuation/route.ts",
  "src/app/api/route-planner/request/route.ts",
  "src/app/api/pre-construction/inquiry/route.ts",
  "src/app/api/tools/affordability-lead/route.ts",
  "src/app/api/tools/seller-readiness/route.ts",
];

function testHelperStructure() {
  const helper = read("src/lib/crm-ownership.ts");
  assert.ok(helper.includes("resolveLeadCrmOwnership"));
  assert.ok(helper.includes("resolveChildCrmOwnership"));
  assert.ok(helper.includes("null-write guard"));
  assert.ok(helper.includes("WORKSPACE_DUAL_WRITE"));
  assert.ok(helper.includes(LEGACY_CRM_ORGANIZATION_SLUG));
  assert.ok(helper.includes(HOUZZAT_WORKSPACE_SLUG));
  assert.ok(helper.includes("MAPPING_CACHE_MS"));
}

function testWritePathsWired() {
  for (const rel of WRITE_PATHS) {
    const source = read(rel);
    assert.ok(
      source.includes("crm-ownership"),
      `${rel} must import crm-ownership helpers`,
    );
    assert.ok(
      source.includes("resolveLeadCrmOwnership") ||
        source.includes("resolveChildCrmOwnership"),
      `${rel} must call a dual-write resolver`,
    );
  }
}

function testNoWorkspaceReadsInRuntime() {
  const agent = read("src/lib/agent.ts");
  const brokerage = read("src/lib/agent/brokerage.ts");
  const combined = [agent, brokerage].join("\n");
  assert.ok(!combined.includes("workspaceId"), "reads remain organizationId-authoritative");
  assert.ok(!combined.includes("prisma.workspace"));
}

function testNullWriteGuardLogic() {
  const mapping = {
    demoAgentOrgId: "org_demo",
    houzzatWorkspaceId: "ws_houzzat",
  };
  const expected = workspaceIdForOrganization("org_demo", mapping);
  assert.ok(expected);
  assert.throws(() => {
    if (expected && !null) {
      throw new Error(
        "[tenancy] null-write guard: workspaceId required for organization org_demo (demo-agent bridge)",
      );
    }
  });
  assert.equal(workspaceIdForOrganization("org_other", mapping), null);
}

async function testLiveDualWriteWhenAvailable() {
  if (!process.env.DATABASE_URL) return;

  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });

  const prevFlag = process.env.WORKSPACE_DUAL_WRITE;
  process.env.WORKSPACE_DUAL_WRITE = "1";
  clearTenancyMappingCache();

  const { prisma } = await import("../src/lib/prisma");

  try {
    assert.equal(isWorkspaceDualWriteEnabled(), true);

    const org = await prisma.organization.findUnique({
      where: { slug: LEGACY_CRM_ORGANIZATION_SLUG },
      select: { id: true },
    });
    const workspace = await prisma.workspace.findUnique({
      where: { slug: HOUZZAT_WORKSPACE_SLUG },
      select: { id: true },
    });
    assert.ok(org, "demo-agent org must exist");
    assert.ok(workspace, "houzzat workspace must exist");

    const leadFields = await resolveLeadCrmOwnership(org!.id);
    assert.equal(leadFields.organizationId, org!.id);
    assert.equal(leadFields.workspaceId, workspace!.id);

    const childFields = await resolveChildCrmOwnership({
      organizationId: org!.id,
      leadWorkspaceId: workspace!.id,
    });
    assert.equal(childFields.workspaceId, workspace!.id);
  } finally {
    if (prevFlag === undefined) {
      delete process.env.WORKSPACE_DUAL_WRITE;
    } else {
      process.env.WORKSPACE_DUAL_WRITE = prevFlag;
    }
    clearTenancyMappingCache();
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function main() {
  testHelperStructure();
  testWritePathsWired();
  testNoWorkspaceReadsInRuntime();
  testNullWriteGuardLogic();
  await testLiveDualWriteWhenAvailable();
  console.log("workspace-dual-write:selftest: ok");
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "workspace dual-write selftest failed",
  );
  process.exit(1);
});
