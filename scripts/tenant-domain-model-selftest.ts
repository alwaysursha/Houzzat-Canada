/**
 * Stage 3K.2 — domain model structural selftest.
 * Run: pnpm tenant-domain-model:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testSchema() {
  const schema = read("prisma/schema.prisma");
  assert.ok(schema.includes("model WorkspaceDomain"));
  assert.ok(schema.includes("model WorkspaceBranding"));
  assert.ok(schema.includes("enum WorkspaceDomainRole"));
  assert.ok(schema.includes("enum WorkspaceDomainKind"));
  assert.ok(schema.includes("PLATFORM"));
  assert.ok(schema.includes("CUSTOM"));
  assert.ok(schema.includes("PRIMARY"));
  assert.ok(schema.includes("ALIAS"));
  assert.ok(schema.includes("@unique\n  hostname") || schema.includes("hostname          String                @unique"));
  assert.ok(!schema.includes("@@unique([workspaceId, isPrimary]"));
  assert.ok(schema.includes("one PLATFORM hostname per workspace"));
  assert.ok(schema.includes("domains       WorkspaceDomain[]"));
  assert.ok(schema.includes("branding      WorkspaceBranding?"));
  assert.ok(schema.includes("deprecated"));
}

function testMigration() {
  const sql = read(
    "prisma/migrations/20260826143000_stage_3k2_tenant_domain_branding/migration.sql",
  );
  const sql42 = read(
    "prisma/migrations/20260826163000_stage_3k42_platform_hostname_kind/migration.sql",
  );
  assert.ok(sql.includes('CREATE TABLE "WorkspaceDomain"'));
  assert.ok(sql.includes('CREATE TABLE "WorkspaceBranding"'));
  assert.ok(sql42.includes('"WorkspaceDomainKind"'));
  assert.ok(sql42.includes("WorkspaceDomain_one_platform_per_workspace"));
  assert.ok(sql42.includes("WorkspaceDomain_one_custom_primary_per_workspace"));
  assert.ok(sql42.includes('DROP INDEX IF EXISTS "WorkspaceDomain_one_primary_per_workspace"'));
  assert.ok(!sql.includes('DROP TABLE "Workspace"'));
}

function testPrimaryConstraintDesign() {
  const schema = read("prisma/schema.prisma");
  assert.ok(schema.includes("WorkspaceDomainKind"));
  assert.ok(schema.includes("one PLATFORM hostname per workspace"));
  assert.ok(schema.includes("one CUSTOM PRIMARY per workspace"));
}

async function main() {
  testSchema();
  testMigration();
  testPrimaryConstraintDesign();
  console.log("tenant-domain-model:selftest ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
