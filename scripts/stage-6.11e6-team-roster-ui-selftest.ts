/**
 * Stage 6.11E.6 — OWNER Team roster management UI selftest.
 * Run: pnpm stage-6.11e6-team-roster-ui:selftest
 * No production mutation / deploy / public wiring / selectable flip.
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
  console.log("\n=== STAGE 6.11E.6 — OWNER TEAM ROSTER UI ===\n");

  const ui = read("src/components/onboarding/TeamRosterSection.tsx");
  const client = read("src/components/onboarding/OwnerOnboardingClient.tsx");
  const resolve = read(
    "src/lib/tenancy/templates/resolve-team-signature-view.ts",
  );

  {
    const team = getTemplate(TEAM_SIGNATURE_TEMPLATE_ID);
    assert.equal(team?.selectable, false);
    assert.equal(listSelectableTemplates().length, 2);
    assert.ok(
      resolve.includes("brand.teamRoster") || resolve.includes("teamRoster"),
    );
    console.log("[0] selectable=false + public roster resolve uses teamRoster... PASS");
  }

  {
    assert.ok(client.includes("TeamRosterSection"));
    assert.ok(client.includes('from "@/components/onboarding/TeamRosterSection"'));
    const brandIdx = client.indexOf("<BrandAssetsSection");
    const teamIdx = client.indexOf("<TeamRosterSection");
    const designIdx = client.indexOf(
      'text-lg font-medium text-slate-900">Website design',
    );
    assert.ok(brandIdx > 0 && teamIdx > brandIdx && designIdx > teamIdx);
    console.log("[1] UI placed after Brand assets, before Website design... PASS");
  }

  {
    assert.ok(ui.includes("/api/onboarding/team-profile"));
    assert.ok(ui.includes("/api/onboarding/team-members"));
    assert.ok(ui.includes("/api/onboarding/team-members/${memberId}/photo"));
    assert.ok(ui.includes('action: "create"'));
    assert.ok(ui.includes('action: "reorder"'));
    assert.ok(ui.includes("isVisible"));
    assert.ok(ui.includes("set_leader") || ui.includes('"set_leader"'));
    assert.ok(ui.includes("Upload photo") || ui.includes("Replace photo"));
    assert.ok(ui.includes("Remove photo"));
    assert.ok(ui.includes("Delete"));
    assert.ok(ui.includes("Publish") || ui.includes("Unpublish"));
    console.log("[2] E.4 + E.5 endpoints wired... PASS");
  }

  {
    assert.ok(!ui.includes("photoUrl: addForm"));
    assert.ok(!ui.includes("photoUrl: editForm"));
    assert.ok(!ui.includes('body.set("photoUrl"'));
    assert.ok(!ui.includes("WorkspaceMember"));
    assert.ok(!ui.includes("DataConnection"));
    assert.ok(!ui.includes("ListingSource"));
    assert.ok(!ui.includes("TYPESENSE"));
    assert.ok(!ui.includes("resolveWorkspaceListingEntitlement"));
    assert.ok(!ui.includes("/api/agent/team"));
    assert.ok(!/\binvite\b/i.test(ui));
    assert.ok(
      ui.includes("do not need logins") ||
        ui.includes("separate from HouzzatPRO"),
    );
    console.log("[3] no arbitrary photoUrl / SaaS / MLS coupling... PASS");
  }

  {
    assert.ok(ui.includes("Loading Team roster"));
    assert.ok(ui.includes("No Team members yet"));
    assert.ok(ui.includes("window.confirm"));
    assert.ok(ui.includes("disabled={busy") || ui.includes("disabled={creating"));
    assert.ok(ui.includes("image/jpeg,image/png,image/webp"));
    assert.ok(ui.includes("5 * 1024 * 1024") || ui.includes("5MB"));
    console.log("[4] loading/empty/confirm/busy/photo accept UX... PASS");
  }

  console.log("\nstage-6.11e6-team-roster-ui:selftest ok\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
