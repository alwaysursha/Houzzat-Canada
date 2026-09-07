/**
 * Stage 6.11E.2A — Team Signature physical design polish checks.
 * Run: pnpm stage-6.11e2a-team-signature-polish:selftest
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

async function main() {
  console.log("\n=== STAGE 6.11E.2A — TEAM SIGNATURE POLISH ===\n");

  {
    const team = getTemplate(TEAM_SIGNATURE_TEMPLATE_ID);
    assert.equal(team?.selectable, false);
    assert.equal(team?.presentationReady, true);
    assert.equal(listSelectableTemplates().length, 2);
    console.log("[0] selectable remains false... PASS");
  }

  {
    const header = read(
      "src/components/templates/team-signature/TeamSignatureHeader.tsx",
    );
    assert.ok(header.includes("sm:text-2xl"));
    assert.ok(header.includes("previewBarActive"));
    assert.ok(header.includes('data-ts-preview-offset'));
    const layout = read("src/app/(marketing)/layout.tsx");
    assert.ok(layout.includes("previewBarActive"));
    assert.ok(
      !read(
        "src/components/templates/agent-signature/AgentSignatureHeader.tsx",
      ).includes("previewBarActive"),
    );
    console.log("[1] Header brand + sticky preview offset (Team-only)... PASS");
  }

  {
    const meet = read(
      "src/components/templates/team-signature/TeamSignatureMeetSection.tsx",
    );
    assert.ok(meet.includes("LeaderFeature"));
    assert.ok(meet.includes("SupportingCard"));
    assert.ok(meet.includes("INITIAL_VISIBLE"));
    assert.ok(meet.includes("supportingGridClass"));
    console.log("[2] Leader + supporting roster... PASS");
  }

  {
    const communities = read(
      "src/components/templates/team-signature/TeamSignatureCommunities.tsx",
    );
    assert.ok(communities.includes("n === 5"));
    assert.ok(communities.includes("n === 4"));
    assert.ok(communities.includes("n === 3"));
    assert.ok(communities.includes("sm:grid-cols-2"));
    console.log("[3] Communities adaptive layouts... PASS");
  }

  {
    const market = read(
      "src/components/templates/team-signature/TeamSignatureMarketInsights.tsx",
    );
    assert.ok(market.includes("Territory knowledge"));
    assert.ok(!/Years Real Estate|Homes Sold|TOP Producer/i.test(market));
    const contact = read(
      "src/components/templates/team-signature/TeamSignatureContactSection.tsx",
    );
    assert.ok(contact.includes("Team desk"));
    assert.ok(contact.includes("view.phone"));
    assert.ok(contact.includes("view.email"));
    const brokerage = read("src/components/site/BrokeragePublicIdentity.tsx");
    assert.ok(brokerage.includes('tone === "team-signature"'));
    assert.ok(brokerage.includes("h-16 max-w-[14rem]"));
    console.log("[4] Market / Contact / Brokerage polish... PASS");
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
    console.log("[5] Roster schema present (no account linkage)... PASS");
  }

  console.log("\nSTAGE 6.11E.2A selftest passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
