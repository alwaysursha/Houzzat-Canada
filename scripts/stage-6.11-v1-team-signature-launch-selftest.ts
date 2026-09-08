/**
 * V1 — Team Signature launch completion selftest.
 * Run: pnpm stage-6.11-v1-team-signature-launch:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PLATFORM_HOME_TEMPLATES } from "@/lib/platform/public/platform-home-copy";
import {
  PLATFORM_TEMPLATES_CATALOG,
  PLATFORM_TEMPLATES_DOCUMENT_DESCRIPTION,
} from "@/lib/platform/public/platform-pricing-templates-copy";
import {
  evaluateTeamSignatureDataReadiness,
} from "@/lib/tenancy/team-roster/readiness";
import type { ProfessionalIdentitySnapshot } from "@/lib/tenancy/professional-identity/types";
import {
  AGENT_SIGNATURE_TEMPLATE_ID,
  TEAM_SIGNATURE_TEMPLATE_ID,
  TEAM_SIGNATURE_THEME_KEYS,
  getTemplate,
  isOwnerPersistableThemeId,
  isValidConfiguredTeamSignatureTheme,
  listOnboardingTemplateOptions,
  listOwnerWebsiteDesignTemplateOptions,
  listSelectableTemplates,
  requireValidOwnerPersistableThemeId,
  requireValidSelectableThemeId,
  buildThemeId,
} from "@/lib/tenancy/templates";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS = "ws_team_launch_v1";
const MEM = "mem_leader_launch_v1";
const LOGO = "/uploads/branding/workspaces/ws_team_launch_v1/branding/logo/x.png";
const BROKERAGE_LOGO =
  "/uploads/branding/workspaces/ws_team_launch_v1/branding/brokerage-logo/x.png";

const FULL_BROKERAGE: ProfessionalIdentitySnapshot = {
  agentRegisteredName: null,
  agentDesignation: null,
  agentCellPhone: null,
  brokerageRegisteredName: "Acme Realty",
  brokerageAddress: "1 Main St",
  brokeragePhone: "416-555-0100",
  brokerageFax: "416-555-0101",
};

function validMember(
  overrides: Partial<{
    id: string;
    workspaceId: string;
    name: string | null;
    isVisible: boolean;
  }> = {},
) {
  const id = overrides.id ?? MEM;
  const workspaceId = overrides.workspaceId ?? WS;
  return {
    id,
    workspaceId,
    name: overrides.name !== undefined ? overrides.name : "Alex Leader",
    designation: "Team Lead",
    photoUrl: `/uploads/branding/workspaces/${workspaceId}/team-members/${id}/abc123def456.jpg`,
    isVisible: overrides.isVisible ?? true,
  };
}

function readyInput(
  overrides: Partial<Parameters<typeof evaluateTeamSignatureDataReadiness>[0]> = {},
) {
  return {
    workspaceId: WS,
    displayName: "Launch Team",
    contactEmail: "team@example.com",
    logoUrl: LOGO,
    identity: FULL_BROKERAGE,
    brokerageLogoUrl: BROKERAGE_LOGO,
    leaderMemberId: MEM,
    members: [validMember()],
    ...overrides,
  };
}

async function main() {
  console.log("\n=== V1 TEAM SIGNATURE LAUNCH ===\n");

  // 1. Catalog selectable
  {
    const team = getTemplate(TEAM_SIGNATURE_TEMPLATE_ID);
    assert.ok(team);
    assert.equal(team.selectable, true);
    assert.equal(team.presentationReady, true);
    const selectable = listSelectableTemplates();
    assert.ok(selectable.some((t) => t.id === TEAM_SIGNATURE_TEMPLATE_ID));
    assert.ok(
      selectable.some((t) => t.id === AGENT_SIGNATURE_TEMPLATE_ID),
    );
    console.log("[1] Team selectable=true; Agent remains selectable... PASS");
  }

  // 2. OWNER Website Design options + persist
  {
    const ownerOpts = listOwnerWebsiteDesignTemplateOptions();
    const onboardingOpts = listOnboardingTemplateOptions();
    assert.ok(ownerOpts.some((t) => t.id === TEAM_SIGNATURE_TEMPLATE_ID));
    assert.ok(onboardingOpts.some((t) => t.id === TEAM_SIGNATURE_TEMPLATE_ID));
    assert.deepEqual(
      ownerOpts.map((t) => t.id),
      onboardingOpts.map((t) => t.id),
    );
    for (const key of TEAM_SIGNATURE_THEME_KEYS) {
      const themeId = buildThemeId(TEAM_SIGNATURE_TEMPLATE_ID, key);
      assert.equal(requireValidSelectableThemeId(themeId), themeId);
      assert.equal(requireValidOwnerPersistableThemeId(themeId), themeId);
      assert.equal(isOwnerPersistableThemeId(themeId), true);
      assert.equal(isValidConfiguredTeamSignatureTheme(themeId), true);
    }
    const catalog = read("src/lib/tenancy/templates/index.ts");
    assert.ok(
      catalog.includes("return requireValidSelectableThemeId(raw)"),
    );
    assert.ok(!catalog.includes("presentationReady && !selectable"));
    console.log("[2] OWNER options + persist + six themes... PASS");
  }

  // 3. Readiness pass / fail
  {
    assert.equal(evaluateTeamSignatureDataReadiness(readyInput()).ready, true);
    assert.equal(
      evaluateTeamSignatureDataReadiness(
        readyInput({ displayName: null }),
      ).ready,
      false,
    );
    assert.equal(
      evaluateTeamSignatureDataReadiness(
        readyInput({ contactEmail: null }),
      ).ready,
      false,
    );
    assert.equal(
      evaluateTeamSignatureDataReadiness(readyInput({ logoUrl: null })).ready,
      false,
    );
    assert.equal(
      evaluateTeamSignatureDataReadiness(
        readyInput({ brokerageLogoUrl: null }),
      ).ready,
      false,
    );
    assert.equal(
      evaluateTeamSignatureDataReadiness(
        readyInput({ members: [], leaderMemberId: null }),
      ).ready,
      false,
    );
    assert.equal(
      evaluateTeamSignatureDataReadiness(
        readyInput({ leaderMemberId: null }),
      ).ready,
      false,
    );
    console.log("[3] Team readiness success + failure gates... PASS");
  }

  // 4. Tenant isolation + MLS independence (source wiring)
  {
    assert.equal(
      evaluateTeamSignatureDataReadiness(
        readyInput({
          members: [validMember({ workspaceId: "other_ws" })],
          leaderMemberId: MEM,
        }),
      ).ready,
      false,
    );
    const manage = read("src/lib/tenancy/team-roster/manage.ts");
    const publicRoster = read("src/lib/tenancy/team-roster/public.ts");
    const readiness = read("src/lib/tenancy/team-roster/readiness.ts");
    assert.ok(manage.includes("where: { id: memberId, workspaceId }"));
    assert.ok(publicRoster.includes("where: { workspaceId }"));
    assert.ok(readiness.includes("member.workspaceId !== workspaceId"));
    assert.ok(readiness.includes("no listing-feed"));
    assert.ok(!manage.includes("WorkspaceMls"));
    assert.ok(!manage.includes("listingFeed"));
    console.log("[4] Tenant isolation + roster ≠ MLS... PASS");
  }

  // 5. Member-count rendering safety (no hard cap)
  {
    const meet = read(
      "src/components/templates/team-signature/TeamSignatureMeetSection.tsx",
    );
    assert.ok(meet.includes("supportingGridClass"));
    assert.ok(!meet.includes("INITIAL_VISIBLE"));
    assert.ok(!meet.includes("publishing coming soon"));
    assert.ok(meet.includes("15+"));
    console.log("[5] Meet section has no hard member cap... PASS");
  }

  // 6. Marketing Available (no Coming Soon claim for Team)
  {
    const teamHome = PLATFORM_HOME_TEMPLATES.find(
      (t) => t.name === "Team Signature",
    );
    const teamTemplates = PLATFORM_TEMPLATES_CATALOG.find(
      (t) => t.name === "Team Signature",
    );
    assert.equal(teamHome?.status, "available");
    assert.equal(teamTemplates?.status, "available");
    assert.ok(
      !PLATFORM_HOME_TEMPLATES.some((t) => t.status === "coming_soon"),
    );
    assert.ok(
      !PLATFORM_TEMPLATES_CATALOG.some((t) => t.status === "coming_soon"),
    );
    assert.ok(
      PLATFORM_TEMPLATES_DOCUMENT_DESCRIPTION.includes("Team Signature"),
    );
    assert.ok(
      !PLATFORM_TEMPLATES_DOCUMENT_DESCRIPTION.toLowerCase().includes(
        "coming soon",
      ),
    );
    console.log("[6] Marketing Team Signature Available... PASS");
  }

  console.log("\nV1 Team Signature launch selftest OK\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
