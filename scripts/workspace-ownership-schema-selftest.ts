/**
 * Stage 3B — core CRM nullable workspace ownership columns (schema only).
 * Run: pnpm workspace-ownership-schema:selftest
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const schema = read("prisma/schema.prisma");
const appSrc = [
  "src/lib/agent.ts",
  "src/lib/agent/brokerage.ts",
  "src/lib/agent/lead-intake.ts",
  "src/lib/notifications/staff-events.ts",
  "src/lib/email/log.ts",
  "src/middleware.ts",
]
  .map((rel) => read(rel))
  .join("\n");

function testCoreModelsHaveNullableWorkspaceId() {
  for (const model of ["Lead", "AgentTask", "LeadNote", "LeadEmailLog"]) {
    const start = schema.indexOf(`model ${model} `);
    assert.ok(start > 0, `model ${model}`);
    const end = schema.indexOf("\nmodel ", start + 1);
    const block = schema.slice(start, end > 0 ? end : start + 2500);
    assert.match(block, /workspaceId\s+String\?/);
  }
}

function testWorkspaceInverseRelations() {
  const workspaceStart = schema.indexOf("model Workspace ");
  const workspaceEnd = schema.indexOf("\nmodel ", workspaceStart + 1);
  const workspaceBlock = schema.slice(workspaceStart, workspaceEnd);
  for (const field of [
    "leads",
    "agentTasks",
    "leadNotes",
    "leadEmailLogs",
    "cmaReports",
  ]) {
    assert.ok(workspaceBlock.includes(field), `Workspace.${field}`);
  }
}

function testFkRestrictOnDelete() {
  for (const model of ["Lead", "AgentTask", "LeadNote", "LeadEmailLog"]) {
    const start = schema.indexOf(`model ${model} `);
    const end = schema.indexOf("\nmodel ", start + 1);
    const block = schema.slice(start, end > 0 ? end : start + 2500);
    assert.match(
      block,
      /workspace\s+Workspace\?\s+@relation\(fields: \[workspaceId\], references: \[id\], onDelete: Restrict\)/,
      `${model} workspace FK must use onDelete: Restrict`,
    );
  }
}

function testApprovedIndexes() {
  assert.ok(schema.includes("@@index([workspaceId, status])"));
  assert.ok(schema.includes("@@index([workspaceId, assignedAgentId])"));
  assert.ok(schema.includes("@@index([workspaceId, status, dueAt])"));
  assert.ok(schema.includes("@@index([workspaceId, createdAt])"));
}

function testOrganizationIndexesPreserved() {
  assert.ok(schema.includes("@@index([organizationId, status])"));
  assert.ok(schema.includes("@@index([organizationId, assignedAgentId])"));
  assert.ok(schema.includes("@@index([organizationId, status, dueAt])"));
  assert.ok(schema.includes("@@index([organizationId, createdAt])"));
}

function testDeferredModelsHaveNoWorkspaceId() {
  for (const model of [
    "LeadActivity",
    "Appointment",
    "LandingPage",
    "AdCampaign",
    "ReferralHandoff",
    "SavedListing",
  ]) {
    const start = schema.indexOf(`model ${model} `);
    assert.ok(start > 0, `model ${model}`);
    const end = schema.indexOf("\nmodel ", start + 1);
    const block = schema.slice(start, end > 0 ? end : start + 2000);
    assert.ok(
      !block.includes("workspaceId"),
      `${model} must not have workspaceId`,
    );
  }
}

function testCmaReportHasNullableWorkspaceId() {
  const start = schema.indexOf("model CmaReport ");
  assert.ok(start > 0, "model CmaReport");
  const end = schema.indexOf("\nmodel ", start + 1);
  const block = schema.slice(start, end > 0 ? end : start + 3500);
  assert.match(block, /workspaceId\s+String\?/);
  assert.match(block, /leadId\s+String\?/);
  assert.match(
    block,
    /workspace\s+Workspace\?\s+@relation\(fields: \[workspaceId\], references: \[id\], onDelete: Restrict\)/,
  );
  assert.ok(block.includes("@@index([workspaceId, updatedAt])"));
  assert.ok(block.includes("revokedAt"));
  assert.ok(block.includes("selectedComps"));
  assert.ok(block.includes("subjectSnapshot"));
  assert.ok(block.includes("analysis"));
}

function testRoutingSettingsHasNullableWorkspaceId() {
  const start = schema.indexOf("model CrmRoutingSettings ");
  const end = schema.indexOf("\nmodel ", start + 1);
  const block = schema.slice(start, end > 0 ? end : start + 800);
  assert.match(block, /workspaceId\s+String\?/);
}

function testRuntimeWorkspaceOwnershipReadFoundation() {
  const readScope = read("src/lib/crm-read-scope.ts");
  const ownership = read("src/lib/crm-ownership.ts");
  const workspaceCtx = read("src/lib/workspace-context.ts");

  assert.ok(readScope.includes("leadTenantWhere"));
  assert.ok(ownership.includes("resolveLeadCrmOwnership"));
  assert.ok(workspaceCtx.includes("workspaceMember.findMany"));
  assert.ok(!read("src/lib/agent/brokerage.ts").includes("workspaceId"));
}

function testStage3bMigrationSql() {
  const migrationsDir = join(root, "prisma/migrations");
  const migrationDirs = readdirSync(migrationsDir)
    .filter((name) => name.includes("core_crm_workspace_ownership"))
    .sort();
  assert.ok(migrationDirs.length >= 1, "Stage 3B migration must exist");
  const sql = read(
    join("prisma/migrations", migrationDirs.at(-1)!, "migration.sql"),
  );
  assert.ok(sql.includes('ADD COLUMN     "workspaceId"'));
  assert.ok(sql.includes("ON DELETE RESTRICT"));
  assert.ok(!/(^|\n)\s*UPDATE\b/i.test(sql));
  assert.ok(!/(^|\n)\s*DELETE\b/i.test(sql));
  assert.ok(!/(^|\n)\s*DROP\b/i.test(sql));
  assert.ok(!/\bSET NOT NULL\b/i.test(sql));
}

testCoreModelsHaveNullableWorkspaceId();
testWorkspaceInverseRelations();
testFkRestrictOnDelete();
testApprovedIndexes();
testOrganizationIndexesPreserved();
testDeferredModelsHaveNoWorkspaceId();
testCmaReportHasNullableWorkspaceId();
testRoutingSettingsHasNullableWorkspaceId();
testRuntimeWorkspaceOwnershipReadFoundation();
testStage3bMigrationSql();

console.log("workspace-ownership-schema:selftest: ok");
