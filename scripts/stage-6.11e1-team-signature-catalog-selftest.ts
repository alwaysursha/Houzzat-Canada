/**
 * Stage 6.11E.1 — Team Signature catalog + themes foundation (no homepage).
 * Run: pnpm stage-6.11e1-team-signature-catalog:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_SIGNATURE_THEMES } from "@/lib/tenancy/templates/agent-signature-themes";
import { DEFAULT_SIGNATURE_THEMES } from "@/lib/tenancy/templates/default-signature-themes";
import {
  AGENT_SIGNATURE_TEMPLATE_ID,
  DEFAULT_TEMPLATE_ID,
  IMPLEMENTED_TEMPLATE_IDS,
  RESERVED_TEMPLATE_IDS,
  TEAM_SIGNATURE_TEMPLATE_ID,
  TEAM_SIGNATURE_THEMES,
  buildThemeId,
  categoryForTemplateId,
  getTemplate,
  getThemeById,
  isAgentSignatureTemplateId,
  isReservedFutureTemplateId,
  isTeamSignatureTemplateId,
  isValidThemeId,
  listImplementedTemplates,
  listOnboardingTemplateOptions,
  listSelectableTemplates,
  parseThemeId,
  requireValidSelectableThemeId,
  resolveTemplateIdFromThemeId,
  resolveThemePalette,
} from "@/lib/tenancy/templates";
import {
  resolveDevOnlyTemplatePreviewThemeId,
} from "@/lib/tenancy/template-preview";
import {
  signOwnerTemplatePreviewCookie,
  verifyOwnerTemplatePreviewCookie,
} from "@/lib/tenancy/owner-template-preview";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const TEAM_THEME_KEYS = [
  "mint",
  "light-blue",
  "dark-blue",
  "purple",
  "professional-red",
  "beige",
] as const;

async function main() {
  console.log("\n=== STAGE 6.11E.1 — TEAM SIGNATURE CATALOG + THEMES ===\n");

  // 0. Implemented catalog promotion
  {
    assert.ok(
      (IMPLEMENTED_TEMPLATE_IDS as readonly string[]).includes(
        TEAM_SIGNATURE_TEMPLATE_ID,
      ),
    );
    assert.ok(!isReservedFutureTemplateId(TEAM_SIGNATURE_TEMPLATE_ID));
    assert.deepEqual([...RESERVED_TEMPLATE_IDS], ["brokerage-signature"]);
    const team = getTemplate(TEAM_SIGNATURE_TEMPLATE_ID);
    assert.ok(team);
    assert.equal(team.id, "team-signature");
    assert.equal(team.label, "Team Signature");
    assert.equal(team.category, "TEAM");
    assert.equal(team.categoryLabel, "Team Branded");
    assert.equal(team.selectable, false);
    assert.equal(team.presentationReady, true);
    assert.equal(categoryForTemplateId(TEAM_SIGNATURE_TEMPLATE_ID), "TEAM");
    assert.ok(isTeamSignatureTemplateId(TEAM_SIGNATURE_TEMPLATE_ID));
    assert.ok(!isTeamSignatureTemplateId(AGENT_SIGNATURE_TEMPLATE_ID));
    const implemented = listImplementedTemplates();
    assert.equal(implemented.length, 3);
    assert.ok(implemented.some((t) => t.id === TEAM_SIGNATURE_TEMPLATE_ID));
    console.log("[0] team-signature implemented + TEAM category... PASS");
  }

  // 1. Six Team themes — serialize/parse + Default palette reuse
  {
    assert.equal(TEAM_SIGNATURE_THEMES.length, 6);
    for (let i = 0; i < TEAM_THEME_KEYS.length; i++) {
      const key = TEAM_THEME_KEYS[i]!;
      const id = buildThemeId(TEAM_SIGNATURE_TEMPLATE_ID, key);
      assert.equal(id, `team-signature:${key}`);
      assert.ok(isValidThemeId(id), id);
      const theme = getThemeById(id);
      assert.ok(theme);
      assert.equal(theme.key, key);
      assert.equal(parseThemeId(id)?.templateId, TEAM_SIGNATURE_TEMPLATE_ID);
      assert.equal(parseThemeId(id)?.themeKey, key);
      const palette = resolveThemePalette(id);
      assert.ok(palette);
      const defaultTheme = DEFAULT_SIGNATURE_THEMES[i]!;
      assert.equal(palette.primary, defaultTheme.palette.primary);
      assert.equal(palette.secondary, defaultTheme.palette.secondary);
      assert.equal(palette.accent, defaultTheme.palette.accent);
      assert.equal(palette.surfaceTint, defaultTheme.palette.surfaceTint);
    }
    console.log("[1] Six Team themes + parse/serialize... PASS");
  }

  // 2. Selection + public activation safety
  {
    const selectable = listSelectableTemplates();
    assert.equal(selectable.length, 2);
    assert.ok(!selectable.some((t) => t.id === TEAM_SIGNATURE_TEMPLATE_ID));
    const options = listOnboardingTemplateOptions();
    assert.ok(!options.some((o) => o.id === TEAM_SIGNATURE_TEMPLATE_ID));
    assert.ok(!options.some((o) => o.category === "TEAM"));
    assert.throws(
      () => requireValidSelectableThemeId("team-signature:mint"),
      /INVALID_THEME_ID/,
    );
    assert.equal(
      resolveTemplateIdFromThemeId("team-signature:mint"),
      TEAM_SIGNATURE_TEMPLATE_ID,
    );
    assert.equal(
      resolveTemplateIdFromThemeId("team-signature:beige"),
      TEAM_SIGNATURE_TEMPLATE_ID,
    );
    const previewCookie = signOwnerTemplatePreviewCookie({
      workspaceId: "cmtn5glsq0005psp7z8wk891q",
      themeId: "team-signature:mint",
    });
    assert.ok(previewCookie);
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    process.env.HOUZZAT_TEMPLATE_PREVIEW = "team-signature:mint";
    assert.equal(
      resolveDevOnlyTemplatePreviewThemeId(null),
      "team-signature:mint",
    );
    delete process.env.HOUZZAT_TEMPLATE_PREVIEW;
    process.env.NODE_ENV = prevNodeEnv;

    const home = read("src/app/(marketing)/page.tsx");
    const layout = read("src/app/(marketing)/layout.tsx");
    assert.ok(home.includes("isTeamSignatureTemplateId"));
    assert.ok(home.includes("TeamSignatureHome"));
    assert.ok(layout.includes("isTeamSignatureTemplateId"));
    assert.ok(layout.includes("TeamSignatureHeader"));
    console.log("[2] Non-selectable + previewable presentation... PASS");
  }

  // 3. Default themes unchanged
  {
    for (const theme of DEFAULT_SIGNATURE_THEMES) {
      const resolved = getThemeById(theme.id);
      assert.ok(resolved);
      assert.deepEqual(resolved.palette, theme.palette);
    }
    assert.equal(
      resolveTemplateIdFromThemeId("default-signature:mint"),
      DEFAULT_TEMPLATE_ID,
    );
    assert.equal(
      requireValidSelectableThemeId("default-signature:mint"),
      "default-signature:mint",
    );
    console.log("[3] Default themes unchanged... PASS");
  }

  // 4. Agent Signature themes unchanged
  {
    assert.equal(AGENT_SIGNATURE_THEMES.length, 6);
    assert.equal(AGENT_SIGNATURE_THEMES[0]!.id, "agent-signature:editorial");
    assert.equal(AGENT_SIGNATURE_THEMES[0]!.palette.primary, "#1C1917");
    for (const theme of AGENT_SIGNATURE_THEMES) {
      const resolved = getThemeById(theme.id);
      assert.ok(resolved);
      assert.deepEqual(resolved.palette, theme.palette);
    }
    assert.equal(
      resolveTemplateIdFromThemeId("agent-signature:editorial"),
      AGENT_SIGNATURE_TEMPLATE_ID,
    );
    assert.ok(isAgentSignatureTemplateId(AGENT_SIGNATURE_TEMPLATE_ID));
    assert.equal(
      requireValidSelectableThemeId("agent-signature:navy"),
      "agent-signature:navy",
    );
    console.log("[4] Agent Signature themes unchanged... PASS");
  }

  // 5. Team roster schema present (6.11E.3A); no account linkage; homepage shell present
  {
    const schema = read("prisma/schema.prisma");
    assert.ok(schema.includes("model WorkspaceTeamProfile"));
    assert.ok(schema.includes("model WorkspaceTeamMember"));
    assert.ok(schema.includes("leaderMemberId"));
    const memberBlock = schema.slice(
      schema.indexOf("model WorkspaceTeamMember"),
      schema.indexOf("model WorkspaceDomain"),
    );
    assert.ok(!memberBlock.includes("userId"));
    assert.ok(!memberBlock.includes("membershipId"));
    assert.ok(!memberBlock.includes("isLeader"));
    assert.ok(
      read(
        "src/components/templates/team-signature/TeamSignatureHome.tsx",
      ).includes("data-ts-homepage"),
    );
    console.log(
      "[5] Team roster schema (no account linkage); homepage shell... PASS",
    );
  }

  // 6. Cookie verify accepts presentation-ready Team preview; apply still selectable-only
  {
    const cookie = signOwnerTemplatePreviewCookie({
      workspaceId: "cmtn5glsq0005psp7z8wk891q",
      themeId: "team-signature:mint",
    });
    const payload = verifyOwnerTemplatePreviewCookie(cookie);
    assert.ok(payload);
    assert.equal(payload.themeId, "team-signature:mint");
    assert.equal(payload.templateId, TEAM_SIGNATURE_TEMPLATE_ID);
    const agentCookie = signOwnerTemplatePreviewCookie({
      workspaceId: "cmtn5glsq0005psp7z8wk891q",
      themeId: "agent-signature:editorial",
    });
    const agentPayload = verifyOwnerTemplatePreviewCookie(agentCookie);
    assert.ok(agentPayload);
    assert.equal(agentPayload.themeId, "agent-signature:editorial");
    console.log("[6] Preview cookie presentation-ready... PASS");
  }

  console.log("\nSTAGE 6.11E.1 selftest passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
