/**
 * Stage 6.11E.8 / 6.11E.8B — Team Signature data + template/theme readiness.
 * Run: pnpm stage-6.11e8-team-signature-readiness:selftest
 * No production mutation / deploy / selectable flip / MLS / migration.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  brandingRequirementsForCategory,
  evaluateBrandingStatus,
} from "@/lib/tenancy/branding-assets/requirements";
import {
  evaluateProfessionalIdentityStatus,
  evaluateWebsiteSetupComplete,
  listMissingProfessionalIdentityFields,
  listMissingWebsiteSetupFields,
  WEBSITE_SETUP_FIELD_LABELS,
} from "@/lib/tenancy/professional-identity";
import type { ProfessionalIdentitySnapshot } from "@/lib/tenancy/professional-identity/types";
import {
  evaluateTeamSignatureDataReadiness,
  TEAM_SIGNATURE_READINESS_FIELD_LABELS,
} from "@/lib/tenancy/team-roster/readiness";
import {
  getTemplate,
  isOwnerPersistableThemeId,
  isValidConfiguredTeamSignatureTheme,
  listOnboardingTemplateOptions,
  listOwnerWebsiteDesignTemplateOptions,
  listSelectableTemplates,
  requireValidOwnerPersistableThemeId,
  requireValidSelectableThemeId,
  resolveOnboardingCategoryFromThemeId,
  resolveTemplateIdFromThemeId,
  TEAM_SIGNATURE_TEMPLATE_ID,
} from "@/lib/tenancy/templates";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS = "ws_team_e8";
const OTHER = "ws_other_e8";
const MEM = "mem_leader_e8";
const LOGO = "/uploads/branding/workspaces/ws_team_e8/branding/logo/x.png";
const BROKERAGE_LOGO =
  "/uploads/branding/workspaces/ws_team_e8/branding/brokerage-logo/x.png";
const TEAM_THEME = "team-signature:mint";
const AGENT_THEME = "agent-signature:editorial";
const DEFAULT_THEME = "default-signature:mint";

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
    designation: string | null;
    photoUrl: string | null;
    isVisible: boolean;
  }> = {},
) {
  const id = overrides.id ?? MEM;
  const workspaceId = overrides.workspaceId ?? WS;
  return {
    id,
    workspaceId,
    name: overrides.name !== undefined ? overrides.name : "Alex Leader",
    designation:
      overrides.designation !== undefined
        ? overrides.designation
        : "Team Leader",
    photoUrl:
      overrides.photoUrl !== undefined
        ? overrides.photoUrl
        : `/uploads/branding/workspaces/${workspaceId}/team-members/${id}/abc123def456.jpg`,
    isVisible: overrides.isVisible ?? true,
  };
}

function baseReadyInput(
  overrides: Partial<
    Parameters<typeof evaluateTeamSignatureDataReadiness>[0]
  > = {},
) {
  return {
    workspaceId: WS,
    displayName: "Team Acme",
    contactEmail: "team@acme.test",
    logoUrl: LOGO,
    identity: FULL_BROKERAGE,
    brokerageLogoUrl: BROKERAGE_LOGO,
    leaderMemberId: MEM,
    members: [validMember()],
    ...overrides,
  };
}

function teamWebsiteSetupBase(overrides: {
  themeId?: string | null;
  teamSignatureDataReady?: boolean;
  templateThemeStatus?: string;
} = {}) {
  const identityStatus = evaluateProfessionalIdentityStatus({
    identity: FULL_BROKERAGE,
    assets: { brokerageLogoUrl: BROKERAGE_LOGO },
    category: "TEAM",
  });
  const brandingStatus = evaluateBrandingStatus({
    category: "TEAM",
    assets: {
      agentProfilePhotoUrl: null,
      logoUrl: LOGO,
      brokerageLogoUrl: BROKERAGE_LOGO,
      faviconUrl: null,
    },
  });
  const teamReady = evaluateTeamSignatureDataReadiness(baseReadyInput());
  return evaluateWebsiteSetupComplete({
    businessProfileStatus: "COMPLETE",
    brandingStatus,
    professionalIdentityStatus: identityStatus,
    templateThemeStatus: overrides.templateThemeStatus ?? "COMPLETE",
    category: "TEAM",
    teamSignatureDataReady:
      overrides.teamSignatureDataReady ?? teamReady.ready,
    themeId: overrides.themeId === undefined ? TEAM_THEME : overrides.themeId,
  });
}

async function main() {
  console.log("=== Stage 6.11E.8 / E.8B Team Signature readiness ===\n");

  // --- Ready case (data) ---
  {
    const result = evaluateTeamSignatureDataReadiness(baseReadyInput());
    assert.equal(result.ready, true);
    assert.deepEqual(result.missing, []);
    console.log("[1] Complete Team data readiness TRUE... PASS");
  }

  // --- Business / branding / brokerage / roster / leader (E.8) ---
  {
    assert.equal(
      evaluateTeamSignatureDataReadiness(
        baseReadyInput({ displayName: "" }),
      ).ready,
      false,
    );
    assert.equal(
      evaluateTeamSignatureDataReadiness(
        baseReadyInput({ contactEmail: null }),
      ).ready,
      false,
    );
    assert.ok(
      brandingRequirementsForCategory("TEAM").some(
        (r) => r.asset === "logo" && r.required,
      ),
    );
    assert.ok(
      !listMissingProfessionalIdentityFields({
        identity: FULL_BROKERAGE,
        assets: { brokerageLogoUrl: BROKERAGE_LOGO },
        category: "TEAM",
      }).includes("agentRegisteredName"),
    );
    assert.equal(
      evaluateTeamSignatureDataReadiness(
        baseReadyInput({ members: [], leaderMemberId: null }),
      ).ready,
      false,
    );
    assert.ok(
      evaluateTeamSignatureDataReadiness(
        baseReadyInput({ leaderMemberId: null }),
      ).missing.includes("teamLeader"),
    );
    console.log("[2] Business/branding/brokerage/roster/leader gates... PASS");
  }

  // --- E.8B theme configuration cases A–F ---
  {
    // A. No theme
    assert.equal(teamWebsiteSetupBase({ themeId: null }), false);
    assert.equal(isValidConfiguredTeamSignatureTheme(null), false);

    // B. Invalid theme
    assert.equal(teamWebsiteSetupBase({ themeId: "not-a-theme" }), false);
    assert.equal(isValidConfiguredTeamSignatureTheme("not-a-theme"), false);

    // C. Agent/Default theme cannot satisfy TEAM
    assert.equal(teamWebsiteSetupBase({ themeId: AGENT_THEME }), false);
    assert.equal(teamWebsiteSetupBase({ themeId: DEFAULT_THEME }), false);
    assert.equal(isValidConfiguredTeamSignatureTheme(AGENT_THEME), false);

    // D. Valid Team theme while selectable=false → COMPLETE
    const team = getTemplate(TEAM_SIGNATURE_TEMPLATE_ID);
    assert.equal(team?.selectable, false);
    assert.equal(team?.presentationReady, true);
    assert.equal(isValidConfiguredTeamSignatureTheme(TEAM_THEME), true);
    assert.equal(
      resolveTemplateIdFromThemeId(TEAM_THEME),
      TEAM_SIGNATURE_TEMPLATE_ID,
    );
    assert.equal(resolveOnboardingCategoryFromThemeId(TEAM_THEME), "TEAM");
    assert.equal(teamWebsiteSetupBase({ themeId: TEAM_THEME }), true);

    // E. Valid Team theme missing roster
    assert.equal(
      teamWebsiteSetupBase({
        themeId: TEAM_THEME,
        teamSignatureDataReady: evaluateTeamSignatureDataReadiness(
          baseReadyInput({ members: [], leaderMemberId: null }),
        ).ready,
      }),
      false,
    );

    // F. Valid Team theme missing leader
    assert.equal(
      teamWebsiteSetupBase({
        themeId: TEAM_THEME,
        teamSignatureDataReady: evaluateTeamSignatureDataReadiness(
          baseReadyInput({ leaderMemberId: null }),
        ).ready,
      }),
      false,
    );

    const missingNoTheme = listMissingWebsiteSetupFields({
      category: "TEAM",
      businessProfileStatus: "COMPLETE",
      templateThemeStatus: "NOT_STARTED",
      identity: FULL_BROKERAGE,
      assets: {
        agentProfilePhotoUrl: null,
        brokerageLogoUrl: BROKERAGE_LOGO,
        logoUrl: LOGO,
      },
      teamSignatureReadiness: evaluateTeamSignatureDataReadiness(
        baseReadyInput(),
      ),
      themeId: null,
    });
    assert.ok(missingNoTheme.includes("templateTheme"));
    assert.equal(
      WEBSITE_SETUP_FIELD_LABELS.templateTheme,
      "Website design",
    );

    console.log("[3] E.8B cases A–F theme configuration... PASS");
  }

  // --- G/H Agent + Default regressions ---
  {
    assert.equal(
      evaluateWebsiteSetupComplete({
        businessProfileStatus: "COMPLETE",
        brandingStatus: "COMPLETE",
        professionalIdentityStatus: "COMPLETE",
        templateThemeStatus: "NOT_STARTED",
        category: "AGENT",
        themeId: AGENT_THEME,
      }),
      false,
    );
    assert.equal(
      evaluateWebsiteSetupComplete({
        businessProfileStatus: "COMPLETE",
        brandingStatus: "COMPLETE",
        professionalIdentityStatus: "COMPLETE",
        templateThemeStatus: "COMPLETE",
        category: "AGENT",
        teamSignatureDataReady: false,
        themeId: AGENT_THEME,
      }),
      true,
    );
    assert.equal(
      evaluateWebsiteSetupComplete({
        businessProfileStatus: "COMPLETE",
        brandingStatus: "COMPLETE",
        professionalIdentityStatus: "COMPLETE",
        templateThemeStatus: "COMPLETE",
        category: "DEFAULT",
        themeId: DEFAULT_THEME,
      }),
      true,
    );
    assert.equal(resolveOnboardingCategoryFromThemeId(AGENT_THEME), "AGENT");
    assert.equal(
      resolveOnboardingCategoryFromThemeId(DEFAULT_THEME),
      "DEFAULT",
    );
    console.log("[4] Agent + Default regressions... PASS");
  }

  // --- I/J/K persist gates ---
  {
    assert.throws(() => requireValidSelectableThemeId(TEAM_THEME));
    assert.equal(
      requireValidOwnerPersistableThemeId(TEAM_THEME),
      TEAM_THEME,
    );
    assert.equal(isOwnerPersistableThemeId(TEAM_THEME), true);
    assert.equal(
      requireValidOwnerPersistableThemeId(AGENT_THEME),
      AGENT_THEME,
    );
    assert.equal(
      requireValidOwnerPersistableThemeId(DEFAULT_THEME),
      DEFAULT_THEME,
    );
    // I. Unrelated non-selectable presentationReady templates are not a
    // generic bypass — only Team Signature gets the QA exception.
    assert.throws(() =>
      requireValidOwnerPersistableThemeId("brokerage-signature:mint"),
    );
    assert.equal(
      isOwnerPersistableThemeId("brokerage-signature:mint"),
      false,
    );

    // Commercial catalog unchanged
    assert.ok(
      !listSelectableTemplates().some(
        (t) => t.id === TEAM_SIGNATURE_TEMPLATE_ID,
      ),
    );
    assert.ok(
      !listOnboardingTemplateOptions().some(
        (t) => t.id === TEAM_SIGNATURE_TEMPLATE_ID,
      ),
    );
    // OWNER Website Design includes Team for QA configuration
    assert.ok(
      listOwnerWebsiteDesignTemplateOptions().some(
        (t) => t.id === TEAM_SIGNATURE_TEMPLATE_ID,
      ),
    );

    const previewBar = read(
      "src/components/templates/OwnerTemplatePreviewBar.tsx",
    );
    assert.ok(previewBar.includes("isOwnerPersistableThemeId"));
    assert.ok(!previewBar.includes("selectable === true"));

    console.log("[5] Persist gates I/J/K + Website Design options... PASS");
  }

  // --- Isolation / optional / wiring ---
  {
    assert.equal(
      evaluateTeamSignatureDataReadiness(
        baseReadyInput({
          members: [validMember({ id: "foreign", workspaceId: OTHER })],
          leaderMemberId: "foreign",
        }),
      ).ready,
      false,
    );
    const onboarding = read("src/lib/platform/activation/onboarding.ts");
    assert.ok(onboarding.includes("requireValidOwnerPersistableThemeId"));
    assert.ok(onboarding.includes("listOwnerWebsiteDesignTemplateOptions"));
    assert.ok(onboarding.includes("isValidConfiguredTeamSignatureTheme"));
    assert.ok(
      getTemplate(TEAM_SIGNATURE_TEMPLATE_ID)?.selectable === false,
    );
    const e8 = read("src/lib/tenancy/team-roster/readiness.ts");
    assert.ok(!e8.includes("$transaction"));
    assert.ok(!e8.includes("updateMany"));
    assert.ok(
      WEBSITE_SETUP_FIELD_LABELS.teamLogoUrl ===
        TEAM_SIGNATURE_READINESS_FIELD_LABELS.teamLogoUrl,
    );
    console.log("[6] Isolation + wiring + selectable false... PASS");
  }

  console.log("\n=== Stage 6.11E.8/E.8B COMPLETE — all assertions passed ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
