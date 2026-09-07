/**
 * Stage 6.11E.2B — Team Signature contrast / readability checks.
 * Run: pnpm stage-6.11e2b-team-signature-contrast:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getTemplate,
  listSelectableTemplates,
  TEAM_SIGNATURE_TEMPLATE_ID,
  TEAM_SIGNATURE_THEMES,
} from "@/lib/tenancy/templates";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

async function main() {
  console.log("\n=== STAGE 6.11E.2B — TEAM SIGNATURE CONTRAST ===\n");

  {
    const team = getTemplate(TEAM_SIGNATURE_TEMPLATE_ID);
    assert.equal(team?.selectable, false);
    assert.equal(team?.presentationReady, true);
    assert.equal(listSelectableTemplates().length, 2);
    console.log("[0] selectable remains false... PASS");
  }

  {
    assert.equal(TEAM_SIGNATURE_THEMES.length, 6);
    const keys = TEAM_SIGNATURE_THEMES.map((t) => t.key).sort();
    assert.deepEqual(keys, [
      "beige",
      "dark-blue",
      "light-blue",
      "mint",
      "professional-red",
      "purple",
    ]);
    for (const theme of TEAM_SIGNATURE_THEMES) {
      assert.ok(theme.id.startsWith("team-signature:"));
      assert.ok(theme.palette.primary);
      assert.ok(theme.palette.secondary);
      assert.ok(theme.palette.accent);
    }
    console.log("[1] six Team themes token-ready... PASS");
  }

  {
    const heroSearch = read("src/components/home/HomeHeroSearch.tsx");
    assert.ok(heroSearch.includes('"team"'));
    assert.ok(heroSearch.includes("onTeam"));
    assert.ok(heroSearch.includes("text-surface/85"));
    assert.ok(
      heroSearch.includes("bg-[var(--ts-accent,var(--canopy,#1F7A8C))]"),
    );
    // Agent + Default surfaces unchanged in contract
    assert.ok(heroSearch.includes('surface === "agent"'));
    assert.ok(heroSearch.includes('surface === "page"'));
    assert.ok(heroSearch.includes('surface = "hero"'));
    assert.ok(heroSearch.includes('| "team"'));

    const search = read(
      "src/components/templates/team-signature/TeamSignatureSearchSection.tsx",
    );
    assert.ok(search.includes('surface="team"'));
    assert.ok(!search.includes('surface="page"'));
    assert.ok(search.includes("text-surface/75"));
    assert.ok(search.includes("text-surface/85"));
    console.log("[2] search-tab contrast (team surface)... PASS");
  }

  {
    const card = read(
      "src/components/templates/team-signature/TeamSignatureListingCard.tsx",
    );
    assert.ok(card.includes("via-[var(--ts-ink-deep,#0A4D38)]/70"));
    assert.ok(card.includes("[text-shadow:"));
    assert.ok(card.includes("text-surface/90"));
    assert.ok(card.includes("data-ts-listing-card"));
    // No layout dimension rewrite
    assert.ok(card.includes("aspect-[4/5]"));
    assert.ok(card.includes("sm:aspect-[5/4]"));
    console.log("[3] listing-card overlay readability... PASS");
  }

  {
    const home = read(
      "src/components/templates/team-signature/TeamSignatureHome.tsx",
    );
    assert.ok(home.includes('data-ts-homepage="6.11e.2b"'));

    const market = read(
      "src/components/templates/team-signature/TeamSignatureMarketInsights.tsx",
    );
    assert.ok(!market.includes("text-surface/35"));
    assert.ok(market.includes("text-surface/70"));

    const contact = read(
      "src/components/templates/team-signature/TeamSignatureContactSection.tsx",
    );
    assert.ok(!contact.includes("text-surface/40"));
    assert.ok(contact.includes("text-surface/70"));

    const meet = read(
      "src/components/templates/team-signature/TeamSignatureMeetSection.tsx",
    );
    assert.ok(meet.includes("text-surface/75"));
    assert.ok(meet.includes("text-surface/70"));
    console.log("[4] dark-band secondary label contrast... PASS");
  }

  {
    const schema = read("prisma/schema.prisma");
    assert.ok(schema.includes("model WorkspaceTeamProfile"));
    assert.ok(schema.includes("model WorkspaceTeamMember"));
    const memberBlock = schema.slice(
      schema.indexOf("model WorkspaceTeamMember"),
      schema.indexOf("model WorkspaceDomain"),
    );
    assert.ok(!memberBlock.includes("userId"));
    assert.ok(!memberBlock.includes("membershipId"));
    assert.ok(!memberBlock.includes("isLeader"));
    const migration = read(
      "prisma/migrations/20260906190000_stage_611e3a_workspace_team_profile_roster/migration.sql",
    );
    assert.ok(migration.includes("ON DELETE RESTRICT"));
    assert.ok(
      migration.includes(
        'FOREIGN KEY ("workspaceId", "leaderMemberId")',
      ),
    );
    assert.ok(migration.includes('"WorkspaceTeamMember"("workspaceId", "id")'));
    assert.ok(!migration.includes("ON DELETE SET NULL"));
    assert.ok(!/\bDROP\b/i.test(migration));
    assert.ok(!migration.includes('"WorkspaceBranding"'));
    assert.ok(!migration.includes('"WorkspaceProfessionalIdentity"'));
    assert.ok(schema.includes("onDelete: Restrict"));
    assert.ok(schema.includes("fields: [workspaceId, leaderMemberId]"));
    assert.ok(schema.includes("@@unique([workspaceId, id])"));
    assert.ok(schema.includes("@@unique([workspaceId, leaderMemberId])"));
    assert.ok(
      migration.includes(
        "WorkspaceTeamProfile_workspaceId_leaderMemberId_key",
      ),
    );
    const agentSearch = read(
      "src/components/templates/agent-signature/AgentSignatureSearchSection.tsx",
    );
    assert.ok(!agentSearch.includes('surface="team"'));
    console.log("[5] roster schema + tenant-safe leader FK + Agent search... PASS");
  }

  console.log("\nSTAGE 6.11E.2B selftest passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
