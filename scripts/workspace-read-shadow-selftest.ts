/**
 * Stage 3E — shadow read / access comparison (read-only).
 * Run: pnpm workspace-read-shadow:selftest
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runWorkspaceReadShadowValidation,
  summarizeShadowReadReport,
} from "./lib/workspace-read-shadow";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testNoRuntimeWorkspaceReads() {
  const brokerage = read("src/lib/agent/brokerage.ts");
  const readScope = read("src/lib/crm-read-scope.ts");
  const workspaceCtx = read("src/lib/workspace-context.ts");

  assert.ok(readScope.includes("parseCrmReadScope"));
  assert.ok(workspaceCtx.includes("resolveWorkspaceStaffContext"));
  assert.ok(!brokerage.includes("workspaceId"), "brokerage desk must stay org-scoped");
}

function testShadowHelperStructure() {
  const helper = read("scripts/lib/workspace-read-shadow.ts");
  assert.ok(helper.includes("leadScopeWhereWorkspace"));
  assert.ok(helper.includes("canAccessLeadWorkspaceProposed"));
  assert.ok(helper.includes("runWorkspaceReadShadowValidation"));
  assert.ok(!helper.includes(".create("));
  assert.ok(!helper.includes(".update("));
  assert.ok(!helper.includes(".delete("));
}

function testNoHotPathDoubleQueries() {
  const src = read("src/lib/crm-ownership.ts");
  assert.ok(
    !src.includes("compareLegacyAndWorkspace"),
    "runtime must not shadow-compare on every request",
  );
}

function testFeatureFlagNotEnabled() {
  const wrangler = read("wrangler.jsonc");
  const deployYml = read(".github/workflows/deploy.yml");
  // Persistence: READ_SCOPE=shadow may live in wrangler so deploys do not wipe it.
  assert.ok(
    /"WORKSPACE_READ_SCOPE"\s*:\s*"shadow"/.test(wrangler),
    "wrangler must persist WORKSPACE_READ_SCOPE=shadow",
  );
  // Activation flags must stay dashboard/secret-only — never baked into deploy config.
  for (const flag of [
    "WORKSPACE_ROUTING_SCOPE",
    "WORKSPACE_NOTIFICATION_SCOPE",
    "WORKSPACE_TEAM_SCOPE",
  ]) {
    assert.ok(
      !wrangler.includes(flag) && !deployYml.includes(flag),
      `${flag} must not be set in deploy config`,
    );
  }
}

async function testLiveShadowWhenAvailable() {
  if (!process.env.DATABASE_URL) {
    console.log("workspace-read-shadow: skipping live DB (no DATABASE_URL)");
    return;
  }

  const { prisma } = await import("../src/lib/prisma");

  try {
    const report = await runWorkspaceReadShadowValidation(prisma);
    const summary = summarizeShadowReadReport(report);

    console.log(
      JSON.stringify(
        {
          deskAndDerived: report.comparisons.filter((r) =>
            r.surface.includes(".desk") || r.surface.includes("viaLead"),
          ),
          agentScoped: report.comparisons.filter((r) =>
            r.surface.includes(".agent."),
          ),
          hotness: report.comparisons.filter((r) =>
            r.surface.startsWith("Hotness."),
          ),
          accessMatrix: report.accessMatrix,
          canAccessMismatches: report.canAccessMismatches,
          taskParentMismatches: report.taskParentMismatches,
          platformAdminsWithoutWorkspace: report.platformAdminsWithoutWorkspace,
          statisticsMismatches: report.statisticsMismatches,
          ok: summary.ok,
          failedSurfaces: summary.failedSurfaces,
        },
        null,
        2,
      ),
    );

    if (!summary.ok) {
      console.error("SHADOW READ VALIDATION FAILED");
      console.error(summary.failedSurfaces.join("\n"));
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function main() {
  testNoRuntimeWorkspaceReads();
  testShadowHelperStructure();
  testNoHotPathDoubleQueries();
  testFeatureFlagNotEnabled();
  await testLiveShadowWhenAvailable();
  console.log("workspace-read-shadow:selftest: ok");
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "workspace read shadow failed",
  );
  process.exit(1);
});
