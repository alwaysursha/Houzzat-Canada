/**
 * Stage 6.11G.4 — Workspace data connection foundation selftest.
 * Run: pnpm stage-6.11g4-workspace-data-connection:selftest
 * No production mutation / migration apply.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENTITLEMENT_ELIGIBLE_CONNECTION_STATUS,
  MEMBERSHIP_ALONE_GRANTS_LISTING_ACCESS,
  NON_ACTIVE_CONNECTION_GRANTS_LISTING_ACCESS,
  VERIFIED_MEMBERSHIP_GRANTS_LISTING_ACCESS,
  WORKSPACE_DATA_CONNECTION_CAPABILITY_KINDS,
  WORKSPACE_DATA_CONNECTION_CAPABILITY_MODEL,
  WORKSPACE_DATA_CONNECTION_MODEL,
  WORKSPACE_DATA_CONNECTION_STATUSES,
} from "@/lib/tenancy/data-connection";
import {
  MEMBERSHIP_GRANTS_LISTING_ACCESS,
  VERIFIED_MEMBERSHIP_GRANTS_LISTING_ACCESS as G3_VERIFIED_ZERO,
} from "@/lib/tenancy/reo-membership";
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
  "prisma/migrations/20260907180000_stage_611g4_workspace_data_connection/migration.sql";

function modelBlock(schema: string, modelName: string): string {
  const start = schema.indexOf(`model ${modelName} {`);
  assert.ok(start >= 0, `missing model ${modelName}`);
  const end = schema.indexOf("\nmodel ", start + 1);
  assert.ok(end > start);
  return schema.slice(start, end);
}

async function main() {
  console.log("\n=== STAGE 6.11G.4 — WORKSPACE DATA CONNECTION FOUNDATION ===\n");

  const schema = read("prisma/schema.prisma");
  const migration = read(MIGRATION);
  const contract = read("src/lib/tenancy/data-connection/contract.ts");
  const connection = modelBlock(schema, "WorkspaceDataConnection");
  const capability = modelBlock(schema, "WorkspaceDataConnectionCapability");
  const membership = modelBlock(
    schema,
    "WorkspaceRealEstateOrganizationMembership",
  );
  const workspace = modelBlock(schema, "Workspace");
  const teamMember = modelBlock(schema, "WorkspaceTeamMember");
  const ddl = migration.replace(/^--.*$/gm, "");

  {
    assert.equal(WORKSPACE_DATA_CONNECTION_MODEL, "WorkspaceDataConnection");
    assert.ok(schema.includes("model WorkspaceDataConnection"));
    assert.ok(connection.includes("workspaceId"));
    assert.ok(workspace.includes("dataConnections"));
    assert.ok(migration.includes('CREATE TABLE "WorkspaceDataConnection"'));
    assert.ok(
      migration.includes('REFERENCES "Workspace"("id") ON DELETE CASCADE'),
    );
    console.log("[0] connection belongs to Workspace... PASS");
  }

  {
    assert.ok(connection.includes("organizationId"));
    assert.ok(
      migration.includes(
        'REFERENCES "RealEstateOrganization"("id") ON DELETE RESTRICT',
      ),
    );
    assert.ok(!connection.includes("membershipId"));
    assert.ok(contract.includes("No FK to WorkspaceRealEstateOrganizationMembership"));
    console.log("[1] connection belongs to RealEstateOrganization (no membership FK)... PASS");
  }

  {
    assert.ok(
      connection.includes(
        "@@unique([workspaceId, organizationId, providerKey])",
      ),
    );
    assert.ok(!connection.includes("@@unique([workspaceId, organizationId])"));
    assert.ok(!connection.includes("@@unique([workspaceId])"));
    assert.ok(contract.includes("UNION"));
    console.log("[2] multiple org/provider connections per Workspace... PASS");
  }

  {
    assert.ok(connection.includes("providerKey"));
    assert.ok(schema.includes("Not the board/MLS organization") || contract.includes("providerKey"));
    assert.ok(contract.includes("independent"));
    console.log("[3] provider independent from organization... PASS");
  }

  {
    assert.ok(connection.includes("credentialRef"));
    assert.ok(
      !/\n\s+(apiKey|password|bearerToken|accessToken|refreshToken|clientSecret|secret)\s+/i.test(
        connection,
      ),
    );
    assert.ok(
      !/\b(apiKey|password|bearerToken|accessToken|clientSecret)\b/i.test(ddl),
    );
    assert.ok(contract.includes("credentialRef only"));
    console.log("[4] raw credential fields absent; opaque credentialRef only... PASS");
  }

  {
    for (const status of WORKSPACE_DATA_CONNECTION_STATUSES) {
      assert.ok(schema.includes(status));
      assert.ok(migration.includes(`'${status}'`));
    }
    assert.ok(schema.includes("@default(PENDING)"));
    assert.ok(migration.includes("DEFAULT 'PENDING'"));
    assert.equal(ENTITLEMENT_ELIGIBLE_CONNECTION_STATUS, "ACTIVE");
    assert.equal(NON_ACTIVE_CONNECTION_GRANTS_LISTING_ACCESS, false);
    assert.ok(contract.includes("fail closed") || contract.includes("NO MLS inventory"));
    console.log("[5] connection status fail-closed (ACTIVE only eligible)... PASS");
  }

  {
    assert.equal(
      WORKSPACE_DATA_CONNECTION_CAPABILITY_MODEL,
      "WorkspaceDataConnectionCapability",
    );
    assert.ok(schema.includes("model WorkspaceDataConnectionCapability"));
    for (const kind of WORKSPACE_DATA_CONNECTION_CAPABILITY_KINDS) {
      assert.ok(schema.includes(kind));
      assert.ok(migration.includes(`'${kind}'`));
    }
    // G.4A: IDX/VOW are access/display policy — not universal data capabilities.
    assert.ok(!schema.includes("IDX_DISPLAY"));
    assert.ok(!schema.includes("VOW_DISPLAY"));
    assert.ok(!ddl.includes("IDX_DISPLAY"));
    assert.ok(!ddl.includes("VOW_DISPLAY"));
    assert.ok(contract.includes("DATA / inventory only"));
    assert.ok(contract.includes("provider adapters"));
    assert.ok(capability.includes("@@unique([connectionId, capability])"));
    assert.ok(migration.includes('CREATE TABLE "WorkspaceDataConnectionCapability"'));
    console.log("[6] capabilities as normalized DATA rows (no IDX/VOW)... PASS");
  }

  {
    assert.equal(MEMBERSHIP_ALONE_GRANTS_LISTING_ACCESS, false);
    assert.equal(VERIFIED_MEMBERSHIP_GRANTS_LISTING_ACCESS, false);
    assert.equal(MEMBERSHIP_GRANTS_LISTING_ACCESS, false);
    assert.equal(G3_VERIFIED_ZERO, false);
    assert.ok(schema.includes("DOES NOT grant listing inventory"));
    assert.ok(schema.includes("Even VERIFIED grants ZERO listing rights"));
    assert.ok(!/\n\s+credentialRef\s+/.test(membership));
    console.log("[7] membership / VERIFIED grant ZERO access... PASS");
  }

  {
    assert.ok(contract.includes("ACTIVE"));
    assert.ok(contract.includes("capabilities"));
    assert.ok(contract.includes("resolveWorkspaceListingEntitlement"));
    console.log("[8] ACTIVE + capability is future entitlement input... PASS");
  }

  {
    assert.ok(!connection.includes("userId"));
    assert.ok(!connection.includes("workspaceMemberId"));
    assert.ok(!/\n\s+teamMemberId\s+/.test(connection));
    assert.ok(!teamMember.includes("DataConnection"));
    assert.ok(contract.includes("No User / WorkspaceMember / WorkspaceTeamMember"));
    console.log("[9] no User / seat / Team roster ownership coupling... PASS");
  }

  {
    assert.ok(!/ALTER TABLE "Listing"|CREATE TABLE "Listing"/i.test(ddl));
    assert.ok(!ddl.includes("Typesense"));
    assert.ok(!/PropTx|PROPTX|TRREB/i.test(ddl));
    assert.ok(!/\bDROP\b/i.test(ddl));
    assert.ok(!/INSERT\s+INTO/i.test(ddl));
    assert.ok(migration.includes('CREATE TYPE "WorkspaceDataConnectionStatus"'));
    assert.ok(
      migration.includes('CREATE TYPE "WorkspaceDataConnectionCapabilityKind"'),
    );
    console.log("[10] additive migration; no Listing/Typesense/PropTx... PASS");
  }

  {
    assert.ok(!/houzzat/i.test(ddl));
    assert.ok(contract.includes("Never fall back to Houzzat") || contract.includes("no implicit"));
    console.log("[11] Houzzat unchanged / no implicit feed... PASS");
  }

  {
    assert.ok(contract.includes("Preview Listing Provider"));
    assert.ok(contract.includes("curated demo dataset"));
    assert.ok(
      !read("src/lib/listings/provider.ts").includes("WorkspaceDataConnection"),
    );
    console.log("[12] Preview Listing Provider rule preserved... PASS");
  }

  {
    const team = getTemplate(TEAM_SIGNATURE_TEMPLATE_ID);
    assert.equal(team?.selectable, false);
    assert.equal(listSelectableTemplates().length, 2);
    assert.ok(
      !read(
        "src/components/templates/team-signature/TeamSignatureHome.tsx",
      ).includes("WorkspaceDataConnection"),
    );
    console.log("[13] Team Signature untouched / selectable=false... PASS");
  }

  {
    assert.ok(connection.includes("externalConnectionIdentifier"));
    assert.ok(connection.includes("lastVerifiedAt"));
    assert.ok(connection.includes("lastSuccessfulAccessAt"));
    assert.ok(connection.includes("lastErrorCode"));
    assert.ok(contract.includes("Shared warehouse"));
    console.log("[14] health fields + shared-warehouse compatible... PASS");
  }

  console.log("\nSTAGE 6.11G.4 selftest passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
