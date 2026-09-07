/**
 * Stage 6.11G.3 / G.3A — Workspace REO multi-board membership selftest.
 * Run: pnpm stage-6.11g3-workspace-reo-membership:selftest
 * No production mutation / migration apply.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MEMBERSHIP_GRANTS_LISTING_ACCESS,
  VERIFIED_MEMBERSHIP_GRANTS_LISTING_ACCESS,
  WORKSPACE_REO_MEMBERSHIP_MODEL,
  WORKSPACE_REO_MEMBERSHIP_STATUSES,
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
  "prisma/migrations/20260907120000_stage_611g3_workspace_reo_membership/migration.sql";

function modelBlock(schema: string, modelName: string): string {
  const start = schema.indexOf(`model ${modelName} {`);
  assert.ok(start >= 0, `missing model ${modelName}`);
  const end = schema.indexOf("\nmodel ", start + 1);
  assert.ok(end > start);
  return schema.slice(start, end);
}

async function main() {
  console.log(
    "\n=== STAGE 6.11G.3A — WORKSPACE MULTI-BOARD REO MEMBERSHIP ===\n",
  );

  const schema = read("prisma/schema.prisma");
  const migration = read(MIGRATION);
  const contract = read("src/lib/tenancy/reo-membership/contract.ts");
  const membership = modelBlock(
    schema,
    "WorkspaceRealEstateOrganizationMembership",
  );
  const reo = modelBlock(schema, "RealEstateOrganization");
  const workspace = modelBlock(schema, "Workspace");
  const teamMember = modelBlock(schema, "WorkspaceTeamMember");
  const ddl = migration.replace(/^--.*$/gm, "");

  {
    assert.equal(
      WORKSPACE_REO_MEMBERSHIP_MODEL,
      "WorkspaceRealEstateOrganizationMembership",
    );
    assert.ok(schema.includes("model WorkspaceRealEstateOrganizationMembership"));
    assert.ok(membership.includes("workspaceId"));
    assert.ok(workspace.includes("realEstateOrganizationMemberships"));
    assert.ok(
      migration.includes(
        'CREATE TABLE "WorkspaceRealEstateOrganizationMembership"',
      ),
    );
    assert.ok(
      migration.includes('REFERENCES "Workspace"("id") ON DELETE CASCADE'),
    );
    assert.ok(contract.includes("Workspace is the MLS/listing-access boundary"));
    console.log("[0] Workspace is MLS/listing-access boundary... PASS");
  }

  {
    assert.ok(membership.includes("organizationId"));
    assert.ok(reo.includes("workspaceMemberships"));
    assert.ok(
      migration.includes(
        'REFERENCES "RealEstateOrganization"("id") ON DELETE RESTRICT',
      ),
    );
    assert.ok(!/\n\s+name\s+/.test(membership));
    assert.ok(!membership.includes("countryCode"));
    assert.ok(!membership.includes("regionCode"));
    console.log("[1] membership references RealEstateOrganization... PASS");
  }

  {
    assert.ok(membership.includes("@@unique([workspaceId, organizationId])"));
    assert.ok(
      !membership.includes("@@unique([workspaceId, organizationId, context])"),
    );
    assert.ok(
      migration.includes('"workspaceId", "organizationId"') &&
        !ddl.includes('"context"'),
    );
    assert.ok(!membership.includes("@@unique([workspaceId])"));
    assert.ok(contract.includes("TRREB") && contract.includes("LSTAR"));
    console.log("[2] multi-board UNIQUE(workspaceId, organizationId)... PASS");
  }

  {
    assert.ok(!schema.includes("enum WorkspaceReoMembershipContext"));
    assert.ok(!schema.includes("WorkspaceReoMembershipContext"));
    assert.ok(!ddl.includes("WorkspaceReoMembershipContext"));
    assert.ok(!/\n\s+context\s+/.test(membership));
    assert.ok(!ddl.includes('"context"'));
    console.log("[3] membership context removed... PASS");
  }

  {
    for (const status of WORKSPACE_REO_MEMBERSHIP_STATUSES) {
      assert.ok(schema.includes(status));
      assert.ok(migration.includes(`'${status}'`));
    }
    assert.ok(schema.includes("@default(DECLARED)"));
    assert.ok(migration.includes("DEFAULT 'DECLARED'"));
    console.log("[4] membership status retained... PASS");
  }

  {
    assert.ok(membership.includes("membershipIdentifier"));
    assert.ok(
      !/\n\s+(password|bearerToken|secret|apiKey|accessToken|refreshToken)\s+/i.test(
        membership,
      ),
    );
    assert.ok(
      !/\b(password|bearerToken|secret|apiKey|accessToken)\b/i.test(ddl),
    );
    assert.ok(
      contract.includes("Never a password") ||
        contract.includes("Not credentials"),
    );
    console.log("[5] membershipIdentifier is optional metadata only... PASS");
  }

  {
    assert.ok(!membership.includes("userId"));
    assert.ok(!teamMember.includes("organizationId"));
    assert.ok(!teamMember.includes("RealEstateOrganization"));
    assert.ok(contract.includes("NOT linked to WorkspaceTeamMember"));
    assert.ok(
      contract.includes(
        "Team members do NOT require individual MLS membership",
      ),
    );
    assert.ok(
      schema.includes(
        "Team members do NOT require individual MLS membership rows",
      ),
    );
    console.log("[6] no Team-member / User MLS coupling... PASS");
  }

  {
    assert.ok(!membership.includes("workspaceMemberId"));
    assert.ok(!/\n\s+membershipId\s+/.test(membership));
    assert.ok(contract.includes("ACTIVE OWNER WorkspaceMember"));
    assert.ok(
      contract.includes("no WorkspaceMember") ||
        contract.includes("SaaS seat") ||
        contract.includes("SaaS seat rows"),
    );
    console.log("[7] no WorkspaceMember MLS coupling... PASS");
  }

  {
    assert.equal(MEMBERSHIP_GRANTS_LISTING_ACCESS, false);
    assert.equal(VERIFIED_MEMBERSHIP_GRANTS_LISTING_ACCESS, false);
    assert.ok(contract.includes("ZERO listing rights"));
    assert.ok(contract.includes("Even VERIFIED"));
    assert.ok(schema.includes("DOES NOT grant listing inventory"));
    assert.ok(schema.includes("Even VERIFIED grants ZERO listing rights"));
    // G.3 membership migration must not create DataConnection; G.4 adds it as sibling.
    assert.ok(!migration.includes("WorkspaceDataConnection"));
    assert.ok(schema.includes("model WorkspaceDataConnection"));
    console.log("[8] membership + VERIFIED grant ZERO listing rights... PASS");
  }

  {
    assert.ok(contract.includes("Data Connection"));
    assert.ok(contract.includes("independently revocable"));
    assert.ok(
      contract.includes("Multiple ACTIVE DataConnections") ||
        contract.includes("ALL ACTIVE"),
    );
    assert.ok(contract.includes("UNION"));
    assert.ok(schema.includes("multiple ACTIVE connections may UNION"));
    console.log("[9] future multi-DataConnection compatibility... PASS");
  }

  {
    assert.ok(!/ALTER TABLE "Listing"|CREATE TABLE "Listing"/i.test(ddl));
    assert.ok(!ddl.includes("Typesense"));
    assert.ok(!/PropTx|PROPTX|TRREB/i.test(ddl));
    assert.ok(!/\bDROP\b/i.test(ddl));
    assert.ok(!/INSERT\s+INTO/i.test(ddl));
    assert.ok(!ddl.includes("WorkspaceReoMembershipContext"));
    assert.ok(migration.includes('CREATE TYPE "WorkspaceReoMembershipStatus"'));
    console.log("[10] additive migration; no Listing/Typesense/PropTx... PASS");
  }

  {
    assert.ok(!/houzzat/i.test(ddl));
    assert.ok(reo.includes("supportStatus"));
    assert.ok(!membership.includes("supportStatus"));
    console.log("[11] Houzzat / directory unchanged (no seed)... PASS");
  }

  {
    assert.ok(contract.includes("Preview Listing Provider"));
    assert.ok(contract.includes("curated demo dataset"));
    assert.ok(
      contract.includes("Preview remains populated even with zero memberships"),
    );
    assert.ok(
      !read("src/lib/listings/provider.ts").includes(
        "WorkspaceRealEstateOrganizationMembership",
      ),
    );
    console.log("[12] Preview Listing rule preserved... PASS");
  }

  {
    const team = getTemplate(TEAM_SIGNATURE_TEMPLATE_ID);
    assert.equal(team?.selectable, false);
    assert.equal(listSelectableTemplates().length, 2);
    assert.ok(
      !read(
        "src/components/templates/team-signature/TeamSignatureHome.tsx",
      ).includes("WorkspaceRealEstateOrganizationMembership"),
    );
    console.log("[13] Team Signature untouched / selectable=false... PASS");
  }

  {
    assert.ok(
      !read("src/app/api/onboarding/team-profile/route.ts").includes(
        "WorkspaceRealEstateOrganizationMembership",
      ),
    );
    assert.ok(contract.includes("DEFERRED"));
    assert.ok(!contract.includes("prisma."));
    console.log("[14] runtime APIs deferred (contract only)... PASS");
  }

  console.log("\nSTAGE 6.11G.3A selftest passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
