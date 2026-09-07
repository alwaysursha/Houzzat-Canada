/**
 * Stage 6.11G.2 — Real estate organization / MLS directory foundation selftest.
 * Run: pnpm stage-6.11g2-reo-directory:selftest
 * No production mutation / migration apply.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getTemplate,
  listSelectableTemplates,
  TEAM_SIGNATURE_TEMPLATE_ID,
} from "@/lib/tenancy/templates";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const MIGRATION =
  "prisma/migrations/20260907010000_stage_611g2_real_estate_organization_directory/migration.sql";

async function main() {
  console.log("\n=== STAGE 6.11G.2 — REO / MLS DIRECTORY FOUNDATION ===\n");

  const schema = read("prisma/schema.prisma");
  const migration = read(MIGRATION);

  {
    assert.ok(schema.includes("model RealEstateOrganization"));
    assert.ok(schema.includes("enum RealEstateOrganizationKind"));
    assert.ok(schema.includes("enum RealEstateOrganizationSupportStatus"));
    assert.ok(schema.includes("Distinct from legacy CRM"));
    assert.ok(schema.includes("model Organization {"));
    const orgBlock = schema.slice(
      schema.indexOf("model Organization {"),
      schema.indexOf("model OrganizationMembership"),
    );
    assert.ok(!orgBlock.includes("countryCode"));
    assert.ok(!orgBlock.includes("supportStatus"));
    console.log("[0] neutral RealEstateOrganization model... PASS");
  }

  {
    assert.ok(schema.includes("countryCode"));
    assert.ok(schema.includes("regionCode"));
    assert.ok(migration.includes('"countryCode"'));
    assert.ok(migration.includes('"regionCode"'));
    // Geography is codes on the org row — not per-province tables
    assert.ok(!schema.includes("model Province"));
    assert.ok(!schema.includes("model State"));
    console.log("[1] CA + US geography via country/region codes... PASS");
  }

  {
    for (const kind of [
      "BOARD",
      "ASSOCIATION",
      "MLS",
      "DATA_SYSTEM",
      "OTHER",
    ]) {
      assert.ok(schema.includes(kind));
      assert.ok(migration.includes(`'${kind}'`));
    }
    console.log("[2] organization kinds... PASS");
  }

  {
    for (const status of ["SUPPORTED", "PLANNED", "UNSUPPORTED"]) {
      assert.ok(schema.includes(status));
      assert.ok(migration.includes(`'${status}'`));
    }
    assert.ok(schema.includes("@default(UNSUPPORTED)"));
    assert.ok(migration.includes("DEFAULT 'UNSUPPORTED'"));
    console.log("[3] support status (incl. unsupported default)... PASS");
  }

  {
    assert.ok(!schema.includes("model WorkspaceBoardMembership"));
    // G.2 directory migration must not create DataConnection; later G.4 may.
    assert.ok(!migration.includes("WorkspaceDataConnection"));
    const reoStart = schema.indexOf("model RealEstateOrganization {");
    const reoEnd = schema.indexOf("\nmodel ", reoStart + 1);
    const reoBlock = schema.slice(reoStart, reoEnd);
    assert.ok(reoBlock.includes("countryCode"));
    // Directory row itself has no workspace FK column (membership is a sibling model).
    assert.ok(!/\n\s+workspaceId\s+/.test(reoBlock));
    // Field-level lock (doc comments may mention credentials as a non-goal).
    assert.ok(
      !/\n\s+(password|bearerToken|secret|apiKey|accessToken|credential)\s+/i.test(
        reoBlock,
      ),
    );
    assert.ok(!migration.toLowerCase().includes("insert into"));
    console.log("[4] no workspace entitlement / credentials / seed... PASS");
  }

  {
    assert.ok(!/ALTER TABLE "Listing"|CREATE TABLE "Listing"/i.test(migration));
    assert.ok(!/Typesense|PROPTX|PropTx/i.test(migration.replace(/^--.*$/gm, "")));
    assert.ok(!/\bDROP\b/i.test(migration));
    assert.ok(migration.includes('CREATE TABLE "RealEstateOrganization"'));
    assert.ok(migration.includes("CREATE TYPE \"RealEstateOrganizationKind\""));
    console.log("[5] additive migration; no Listing/Typesense/PropTx... PASS");
  }

  {
    const team = getTemplate(TEAM_SIGNATURE_TEMPLATE_ID);
    assert.equal(team?.selectable, false);
    assert.equal(listSelectableTemplates().length, 2);
    assert.ok(
      !read(
        "src/components/templates/team-signature/TeamSignatureHome.tsx",
      ).includes("RealEstateOrganization"),
    );
    console.log("[6] Team Signature untouched / selectable=false... PASS");
  }

  {
    assert.ok(schema.includes("@@index([countryCode, regionCode, active])"));
    assert.ok(schema.includes("@@index([countryCode, name])"));
    assert.ok(schema.includes("@@index([shortName])"));
    assert.ok(migration.includes("countryCode_regionCode_active_idx"));
    console.log("[7] onboarding search indexes present... PASS");
  }

  console.log("\nSTAGE 6.11G.2 selftest passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
