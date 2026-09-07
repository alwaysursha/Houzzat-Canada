/**
 * Stage 6.11E.2 — Team Signature Style #1 presentation shell selftest.
 * Run: pnpm stage-6.11e2-team-signature-presentation:selftest
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_SIGNATURE_THEMES } from "@/lib/tenancy/templates/agent-signature-themes";
import { DEFAULT_SIGNATURE_THEMES } from "@/lib/tenancy/templates/default-signature-themes";
import {
  AGENT_SIGNATURE_TEMPLATE_ID,
  DEFAULT_TEMPLATE_ID,
  TEAM_SIGNATURE_TEMPLATE_ID,
  TEAM_SIGNATURE_THEMES,
  getTemplate,
  listOnboardingTemplateOptions,
  listSelectableTemplates,
  requireValidPreviewableThemeId,
  requireValidSelectableThemeId,
  resolveTemplateIdFromThemeId,
  resolveThemePalette,
} from "@/lib/tenancy/templates";
import { resolveTeamSignatureView } from "@/lib/tenancy/templates/resolve-team-signature-view";
import { TEAM_SIGNATURE_DEMO } from "@/lib/tenancy/templates/team-signature-demo";
import type { MarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import { EMPTY_PUBLIC_PROFESSIONAL_IDENTITY } from "@/lib/tenancy/professional-identity/types";
import {
  signOwnerTemplatePreviewCookie,
  verifyOwnerTemplatePreviewCookie,
} from "@/lib/tenancy/owner-template-preview";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function baseBrand(
  overrides: Partial<MarketingPresentationBrand> = {},
): MarketingPresentationBrand {
  return {
    displayName: "RE/MAX REALTY",
    tagline: "Test tagline",
    workspaceSlug: "re-max-realty",
    workspaceId: "cmtn5glsq0005psp7z8wk891q",
    poweredByHouzzatPro: true,
    isHouzzatWorkspace: false,
    logoUrl: null,
    brokerageLogoUrl: null,
    faviconUrl: null,
    ogImageUrl: null,
    colors: {
      primary: "#0F6B4C",
      secondary: "#0A4D38",
      accent: "#1F7A8C",
      surface: "#FFFFFF",
      ink: "#14201C",
    },
    contact: { email: "team@example.com", phone: "(416) 555-9999" },
    footerLegalText: null,
    seoDescription: "test",
    version: 1,
    publicOrigin: "https://re-max-realty.houzzatpro.com",
    canonicalOrigin: "https://re-max-realty.houzzatpro.com",
    templateId: TEAM_SIGNATURE_TEMPLATE_ID,
    agent: null,
    professionalIdentity: EMPTY_PUBLIC_PROFESSIONAL_IDENTITY,
    templatePreview: null,
    ...overrides,
  };
}

async function main() {
  console.log("\n=== STAGE 6.11E.2 — TEAM SIGNATURE PRESENTATION ===\n");

  // 0. Catalog gates
  {
    const team = getTemplate(TEAM_SIGNATURE_TEMPLATE_ID);
    assert.ok(team);
    assert.equal(team.selectable, false);
    assert.equal(team.presentationReady, true);
    assert.equal(listSelectableTemplates().length, 2);
    assert.ok(
      !listOnboardingTemplateOptions().some(
        (o) => o.id === TEAM_SIGNATURE_TEMPLATE_ID,
      ),
    );
    assert.throws(
      () => requireValidSelectableThemeId("team-signature:mint"),
      /INVALID_THEME_ID/,
    );
    assert.equal(
      requireValidPreviewableThemeId("team-signature:mint"),
      "team-signature:mint",
    );
    assert.equal(
      resolveTemplateIdFromThemeId("team-signature:dark-blue"),
      TEAM_SIGNATURE_TEMPLATE_ID,
    );
    console.log("[0] selectable=false; presentationReady=true... PASS");
  }

  // 1. Component family + homepage order markers
  {
    const dir = join(
      root,
      "src/components/templates/team-signature",
    );
    const files = readdirSync(dir).sort();
    for (const required of [
      "TeamSignatureHome.tsx",
      "TeamSignatureHeader.tsx",
      "TeamSignatureHero.tsx",
      "TeamSignatureSearchSection.tsx",
      "TeamSignatureTrustStrip.tsx",
      "TeamSignatureFeaturedProperties.tsx",
      "TeamSignatureListingCard.tsx",
      "TeamSignatureMeetSection.tsx",
      "TeamSignatureBuySellSection.tsx",
      "TeamSignatureCommunities.tsx",
      "TeamSignatureMarketInsights.tsx",
      "TeamSignatureValuationSection.tsx",
      "TeamSignatureTestimonials.tsx",
      "TeamSignatureContactSection.tsx",
      "TeamSignatureFooter.tsx",
    ]) {
      assert.ok(files.includes(required), required);
    }

    const home = read(
      "src/components/templates/team-signature/TeamSignatureHome.tsx",
    );
    const jsx = home.slice(home.indexOf("return ("));
    const order = [
      "TeamSignatureHero",
      "TeamSignatureSearchSection",
      "TeamSignatureTrustStrip",
      "TeamSignatureFeaturedProperties",
      "TeamSignatureMeetSection",
      "TeamSignatureBuySellSection",
      "TeamSignatureCommunities",
      "TeamSignatureMarketInsights",
      "TeamSignatureValuationSection",
      "TeamSignatureTestimonials",
      "TeamSignatureContactSection",
    ];
    let last = -1;
    for (const name of order) {
      const idx = jsx.indexOf(`<${name}`);
      assert.ok(idx > last, `order: ${name}`);
      last = idx;
    }
    assert.ok(home.includes('data-ts-homepage="6.11e.2b"'));
    assert.ok(!jsx.includes("AgentSignature"));
    console.log("[1] Component family + homepage order... PASS");
  }

  // 2. Wiring + isolation from Agent Signature
  {
    const page = read("src/app/(marketing)/page.tsx");
    const layout = read("src/app/(marketing)/layout.tsx");
    const below = read("src/components/site/MarketingBelowHeader.tsx");
    assert.ok(page.includes("TeamSignatureHome"));
    assert.ok(page.includes("isTeamSignatureTemplateId"));
    assert.ok(page.includes("AgentSignatureHome"));
    assert.ok(layout.includes("TeamSignatureHeader"));
    assert.ok(below.includes("TeamSignatureFooter"));
    assert.ok(
      !read(
        "src/components/templates/agent-signature/AgentSignatureHome.tsx",
      ).includes("team-signature"),
    );
    assert.ok(
      !read(
        "src/components/templates/agent-signature/AgentSignatureHero.tsx",
      ).includes("TeamSignature"),
    );
    console.log("[2] Marketing wiring; AS untouched... PASS");
  }

  // 3. Design distinctions vs Agent Signature
  {
    const hero = read(
      "src/components/templates/team-signature/TeamSignatureHero.tsx",
    );
    assert.ok(hero.includes("view.teamName"));
    assert.ok(!hero.includes("view.photoUrl"));
    assert.ok(hero.includes("Search Homes"));
    assert.ok(hero.includes("What&apos;s My Home Worth"));

    const search = read(
      "src/components/templates/team-signature/TeamSignatureSearchSection.tsx",
    );
    assert.ok(search.includes("Buy"));
    assert.ok(search.includes("Rent"));
    assert.ok(search.includes("Commercial"));
    assert.ok(search.includes("Sold"));
    assert.ok(search.includes('surface="team"'));

    const featured = read(
      "src/components/templates/team-signature/TeamSignatureFeaturedProperties.tsx",
    );
    assert.ok(featured.includes("Homes on the market"));
    assert.ok(!/<h2[^>]*>[\s\S]*Our Listings/i.test(featured));
    assert.ok(featured.includes("TeamSignatureListingCard"));

    const meet = read(
      "src/components/templates/team-signature/TeamSignatureMeetSection.tsx",
    );
    assert.ok(meet.includes("meet-the-team"));
    assert.ok(meet.includes('data-ts-meet-layout="leader-supporting"'));
    assert.ok(meet.includes("data-ts-member-card=\"leader\""));
    assert.ok(meet.includes("data-ts-member-card=\"supporting\""));
    assert.ok(meet.includes("supportingGridClass"));
    assert.ok(!meet.includes("User.image"));
    assert.ok(!meet.includes("professionalIdentity.agent"));

    const buySell = read(
      "src/components/templates/team-signature/TeamSignatureBuySellSection.tsx",
    );
    assert.ok(buySell.includes("Buying with the team"));
    assert.ok(buySell.includes("agent-signature-buy-atmosphere.jpg"));
    assert.ok(
      !buySell.includes("agent-signature-buy-neighbourhood.jpg"),
    );

    const communities = read(
      "src/components/templates/team-signature/TeamSignatureCommunities.tsx",
    );
    assert.ok(communities.includes("CommunitiesGrid"));
    assert.ok(communities.includes("featured-plus-four"));
    assert.ok(communities.includes("equal-${n}"));
    assert.ok(communities.includes("n === 4"));

    const market = read(
      "src/components/templates/team-signature/TeamSignatureMarketInsights.tsx",
    );
    assert.ok(market.includes("hero-canadian-homes.jpg"));
    assert.ok(!market.includes("border border-[var(--ts-ink"));

    const header = read(
      "src/components/templates/team-signature/TeamSignatureHeader.tsx",
    );
    assert.ok(header.includes("previewBarActive"));
    assert.ok(header.includes("top-16 sm:top-14"));

    const footer = read(
      "src/components/templates/team-signature/TeamSignatureFooter.tsx",
    );
    assert.ok(footer.includes("data-team-public-identity"));
    assert.ok(footer.includes("BrokeragePublicIdentity"));
    assert.ok(footer.includes('tone="team-signature"'));
    assert.ok(footer.includes("MlsDisclaimer"));
    console.log("[3] Design distinctions + footer contract... PASS");
  }

  // 4. View resolver: live vs demo
  {
    const live = resolveTeamSignatureView(baseBrand());
    assert.equal(live.isDemoPreview, false);
    assert.equal(live.teamName, "RE/MAX REALTY");
    assert.equal(live.phone, "(416) 555-9999");
    assert.equal(live.email, "team@example.com");
    assert.equal(live.members, null);
    assert.equal(live.testimonials, null);

    const demo = resolveTeamSignatureView(
      baseBrand({
        templatePreview: {
          active: true,
          themeId: "team-signature:mint",
          displayLabel: "Team Signature · Mint",
          source: "owner_cookie",
        },
      }),
    );
    assert.equal(demo.isDemoPreview, true);
    assert.equal(demo.teamName, TEAM_SIGNATURE_DEMO.teamName);
    assert.ok(demo.members);
    assert.equal(demo.members!.length, 4);
    assert.ok(demo.testimonials);
    assert.ok(demo.members!.some((m) => m.isLeader));
    console.log("[4] Live vs demo view gating... PASS");
  }

  // 5. Six themes + Default/AS freeze
  {
    assert.equal(TEAM_SIGNATURE_THEMES.length, 6);
    for (const theme of TEAM_SIGNATURE_THEMES) {
      assert.ok(resolveThemePalette(theme.id));
    }
    for (const theme of DEFAULT_SIGNATURE_THEMES) {
      assert.deepEqual(
        resolveThemePalette(theme.id),
        theme.palette,
      );
    }
    assert.equal(AGENT_SIGNATURE_THEMES[0]!.palette.primary, "#1C1917");
    assert.equal(
      resolveTemplateIdFromThemeId("default-signature:mint"),
      DEFAULT_TEMPLATE_ID,
    );
    assert.equal(
      resolveTemplateIdFromThemeId("agent-signature:editorial"),
      AGENT_SIGNATURE_TEMPLATE_ID,
    );
    const themeStyle = read("src/components/tenancy/TenantThemeStyle.tsx");
    assert.ok(themeStyle.includes("--ts-ink"));
    assert.ok(themeStyle.includes("--as-ink"));
    console.log("[5] Six Team themes; Default/AS palettes frozen... PASS");
  }

  // 6. Preview cookie works; roster schema is presentation-only (no account linkage)
  {
    const cookie = signOwnerTemplatePreviewCookie({
      workspaceId: "cmtn5glsq0005psp7z8wk891q",
      themeId: "team-signature:beige",
    });
    const payload = verifyOwnerTemplatePreviewCookie(cookie);
    assert.ok(payload);
    assert.equal(payload.templateId, TEAM_SIGNATURE_TEMPLATE_ID);
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
    console.log("[6] Preview + roster schema (no account linkage)... PASS");
  }

  // 7. Default homepage markers intact
  {
    const page = read("src/app/(marketing)/page.tsx");
    assert.ok(page.includes("Find Homes in Ontario"));
    assert.ok(page.includes("HomeDeferredBody"));
    const onboarding = read(
      "src/components/onboarding/OwnerOnboardingClient.tsx",
    );
    assert.ok(!onboarding.includes("Team Signature"));
    console.log("[7] Default homepage + onboarding freeze... PASS");
  }

  console.log("\nSTAGE 6.11E.2 selftest passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
