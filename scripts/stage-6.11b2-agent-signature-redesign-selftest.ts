/**
 * Stage 6.11B.2 — Agent Signature redesign + demo-vs-live safety selftest.
 * Run: pnpm stage-6.11b2-agent-signature-redesign:selftest
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import {
  AGENT_SIGNATURE_DEMO,
  AGENT_SIGNATURE_TEMPLATE_ID,
  DEFAULT_TEMPLATE_ID,
  getThemeById,
  listSelectableTemplates,
  resolveAgentSignatureView,
  resolveThemePalette,
} from "@/lib/tenancy/templates";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function baseBrand(
  overrides: Partial<MarketingPresentationBrand> = {},
): MarketingPresentationBrand {
  return {
    displayName: "RE/MAX Realty Demo Tenant",
    tagline: "Real tenant tagline",
    workspaceSlug: "re-max-realty",
    workspaceId: "cmtn5glsq0005psp7z8wk891q",
    poweredByHouzzatPro: true,
    isHouzzatWorkspace: false,
    logoUrl: "/images/tenant-logo.png",
    brokerageLogoUrl: null,
    faviconUrl: null,
    ogImageUrl: null,
    colors: {
      primary: "#c8102e",
      secondary: "#1a1a1a",
      accent: "#c8102e",
      surface: "#ffffff",
      ink: "#111111",
    },
    contact: {
      email: "office@remax-example.com",
      phone: "(416) 555-0100",
    },
    footerLegalText: null,
    seoDescription: "desc",
    version: 1,
    publicOrigin: "https://re-max-realty.houzzatpro.com",
    canonicalOrigin: "https://re-max-realty.houzzatpro.com",
    templateId: AGENT_SIGNATURE_TEMPLATE_ID,
    agent: {
      name: "Jordan Lee",
      title: "Sales Representative",
      // Stale secondary path — must NOT be used for live portrait once
      // professionalIdentity.agent.photoUrl is the authoritative source.
      photoUrl:
        "https://branding-assets.example/workspaces/ws/branding/agent-profile/stale.jpg",
      bio: "Real biography from tenant profile.",
      phone: "(416) 555-0199",
      email: "jordan@remax-example.com",
      brokerageName: "RE/MAX Realty Services Inc.",
      markets: ["Toronto", "Mississauga"],
    },
    professionalIdentity: {
      agent: {
        name: null,
        designation: null,
        cellPhone: null,
        photoUrl: "https://cdn.example/agents/jordan.jpg",
      },
      brokerage: {
        name: null,
        fax: null,
        address: null,
        phone: null,
        logoUrl: null,
      },
    },
    teamRoster: null,
    templatePreview: null,
    ...overrides,
  };
}

async function main() {
  console.log("\n=== STAGE 6.11B.2 — AGENT SIGNATURE REDESIGN ===\n");

  // 0. Theme catalog (six professional Agent Branded palettes)
  {
    const agent = listSelectableTemplates().find(
      (t) => t.id === AGENT_SIGNATURE_TEMPLATE_ID,
    );
    assert.ok(agent);
    assert.equal(agent.themes.length, 6);
    for (const key of [
      "editorial",
      "navy",
      "forest",
      "slate",
      "burgundy",
      "bronze",
    ]) {
      const id = `agent-signature:${key}`;
      const palette = resolveThemePalette(id);
      assert.ok(palette, id);
      assert.ok(getThemeById(id));
      assert.match(palette.primary, /^#[0-9A-Fa-f]{6}$/);
    }
    assert.equal(resolveThemePalette("agent-signature:mint"), null);
    const editorial = resolveThemePalette("agent-signature:editorial");
    assert.ok(editorial);
    assert.equal(editorial.primary, "#1C1917");
    const navy = resolveThemePalette("agent-signature:navy");
    assert.ok(navy);
    assert.equal(navy.primary, "#1B3A5C");
    console.log("[0] Agent Signature multi-theme catalog... PASS");
  }

  // 0b. Theme tokens wired into presentation
  {
    const themeStyle = read("src/components/tenancy/TenantThemeStyle.tsx");
    assert.ok(themeStyle.includes("--as-ink"));
    assert.ok(themeStyle.includes("AGENT_SIGNATURE_TEMPLATE_ID"));
    const brandResolve = read("src/lib/tenancy/resolve-workspace-brand.ts");
    assert.ok(brandResolve.includes("surfaceTint"));
    assert.ok(brandResolve.includes("isAgentSignatureTheme"));
    const hero = read(
      "src/components/templates/agent-signature/AgentSignatureHero.tsx",
    );
    assert.ok(hero.includes("bg-canopy-deep"));
    assert.ok(hero.includes("text-surface"));
    assert.ok(!hero.includes("bg-[#1C1917]"));
    console.log("[0b] Theme tokens wired into Agent Signature UI... PASS");
  }
  {
    const live = resolveAgentSignatureView(baseBrand());
    assert.equal(live.isDemoPreview, false);
    assert.equal(live.name, "Jordan Lee");
    assert.equal(live.brokerageName, "RE/MAX Realty Services Inc.");
    assert.equal(live.photoUrl, "https://cdn.example/agents/jordan.jpg");
    assert.equal(live.metrics, null);
    assert.equal(live.testimonials, null);
    assert.ok(!live.name.includes("Alex Morgan"));
    assert.ok(live.bio?.includes("Real biography"));

    // Cleared personal portrait must not resurrect via brand.agent.photoUrl.
    const clearedPersonal = resolveAgentSignatureView(
      baseBrand({
        professionalIdentity: {
          agent: {
            name: null,
            designation: null,
            cellPhone: null,
            photoUrl: null,
          },
          brokerage: {
            name: null,
            fax: null,
            address: null,
            phone: null,
            logoUrl: null,
          },
        },
      }),
    );
    assert.equal(clearedPersonal.photoUrl, null);
    assert.notEqual(
      clearedPersonal.photoUrl,
      baseBrand().agent?.photoUrl ?? undefined,
    );

    const preview = resolveAgentSignatureView(
      baseBrand({
        templatePreview: {
          active: true,
          themeId: "agent-signature:editorial",
          displayLabel: "Agent Signature · Editorial",
          source: "owner_cookie",
        },
      }),
    );
    assert.equal(preview.isDemoPreview, true);
    assert.equal(preview.name, AGENT_SIGNATURE_DEMO.name);
    assert.equal(preview.brokerageName, AGENT_SIGNATURE_DEMO.brokerageName);
    assert.equal(preview.photoUrl, AGENT_SIGNATURE_DEMO.photoUrl);
    assert.ok(preview.metrics && preview.metrics.length > 0);
    assert.ok(preview.testimonials && preview.testimonials.length > 0);
    assert.equal(preview.tagline, "Helping You Move With Confidence");
    console.log("[1] Demo only in preview; live uses tenant... PASS");
  }

  // 2. Live without agent falls back to brand — never demo
  {
    const noAgent = resolveAgentSignatureView(
      baseBrand({
        agent: null,
        displayName: "Acme Realty Brand",
        templatePreview: null,
      }),
    );
    assert.equal(noAgent.isDemoPreview, false);
    assert.equal(noAgent.name, "Acme Realty Brand");
    assert.equal(noAgent.metrics, null);
    assert.equal(noAgent.testimonials, null);
    assert.notEqual(noAgent.name, AGENT_SIGNATURE_DEMO.name);
    console.log("[2] Live fallback never leaks demo... PASS");
  }

  // 3. Demo portrait asset is local
  {
    assert.equal(
      AGENT_SIGNATURE_DEMO.photoUrl,
      "/images/agent-signature-demo-portrait.jpg",
    );
    assert.ok(
      existsSync(join(root, "public/images/agent-signature-demo-portrait.jpg")),
    );
    const jpg = readFileSync(
      join(root, "public/images/agent-signature-demo-portrait.jpg"),
    );
    assert.ok(jpg.length > 10_000);
    assert.ok(!AGENT_SIGNATURE_DEMO.photoUrl.toLowerCase().includes("shahid"));
    console.log("[3] Local demo portrait asset... PASS");
  }

  // 4. Homepage structure (presentation sections)
  {
    const home = read(
      "src/components/templates/agent-signature/AgentSignatureHome.tsx",
    );
    for (const token of [
      "AgentSignatureHero",
      "AgentSignatureSearchSection",
      "AgentSignatureFeaturedProperties",
      "AgentSignatureMeetSection",
      "AgentSignatureBuySellSection",
      "AgentSignatureCommunities",
      "AgentSignatureValuationSection",
      "AgentSignatureMarketInsights",
      "AgentSignatureTestimonials",
      "AgentSignatureContactSection",
      "resolveAgentSignatureView",
    ]) {
      assert.ok(home.includes(token), `missing ${token}`);
    }
    assert.ok(!home.includes("HomeDeferredBody"));
    assert.ok(!home.includes("HomeAreaRailLive"));
    assert.ok(!home.includes("brand.agent?.name"));
    assert.ok(!home.includes("AgentSignatureTrustStrip"));
    console.log("[4] Homepage structure... PASS");
  }

  // 5. Header / hero / footer consume view (not raw brand.agent hardcodes)
  {
    const header = read(
      "src/components/templates/agent-signature/AgentSignatureHeader.tsx",
    );
    const hero = read(
      "src/components/templates/agent-signature/AgentSignatureHero.tsx",
    );
    const footer = read(
      "src/components/templates/agent-signature/AgentSignatureFooter.tsx",
    );
    const layout = read("src/app/(marketing)/layout.tsx");
    const below = read("src/components/site/MarketingBelowHeader.tsx");

    assert.ok(header.includes("view: AgentSignatureView"));
    assert.ok(header.includes("Buy"));
    assert.ok(header.includes("Market Insights"));
    assert.ok(header.includes("/account"));
    assert.ok(hero.includes("Find a Home"));
    assert.ok(hero.includes("Sell Your Home"));
    assert.ok(hero.includes("view.photoUrl"));
    assert.ok(footer.includes("POWERED_BY_HOUZZATPRO_LABEL"));
    assert.ok(layout.includes("resolveAgentSignatureView"));
    assert.ok(layout.includes("OwnerTemplatePreviewBar"));
    assert.ok(below.includes("resolveAgentSignatureView"));
    assert.ok(!hero.includes("Alex Morgan"));
    assert.ok(!header.includes("Alex Morgan"));
    console.log("[5] Header/hero/footer + layout wiring... PASS");
  }

  // 6. Trust / testimonials gated
  {
    const trust = read(
      "src/components/templates/agent-signature/AgentSignatureTrustStrip.tsx",
    );
    const testimonials = read(
      "src/components/templates/agent-signature/AgentSignatureTestimonials.tsx",
    );
    assert.ok(trust.includes("if (!view.metrics"));
    assert.ok(trust.includes("Sample preview metrics"));
    assert.ok(testimonials.includes("if (!view.testimonials"));
    assert.ok(testimonials.includes("preview only"));
    console.log("[6] Metrics/testimonials gated... PASS");
  }

  // 7. Secure preview compatibility preserved
  {
    assert.ok(
      existsSync(
        join(root, "src/app/api/onboarding/template-preview/route.ts"),
      ),
    );
    assert.ok(
      read("src/lib/tenancy/owner-template-preview.ts").includes(
        "houzzat_owner_template_preview",
      ),
    );
    assert.ok(!read("src/middleware.ts").includes("x-houzzat-preview-template"));
    console.log("[7] Secure preview surfaces intact... PASS");
  }

  // 8. Default template homepage unchanged; no Team/Brokerage
  {
    const page = read("src/app/(marketing)/page.tsx");
    assert.ok(page.includes("Find Homes in Ontario"));
    assert.ok(page.includes("isAgentSignatureTemplateId"));
    const client = read("src/components/onboarding/OwnerOnboardingClient.tsx");
    assert.ok(!client.includes("Team Signature"));
    assert.ok(!client.includes("Brokerage Signature"));
    assert.equal(
      resolveAgentSignatureView(
        baseBrand({ templateId: DEFAULT_TEMPLATE_ID }),
      ).isDemoPreview,
      false,
    );
    console.log("[8] Default template + no Team/Brokerage... PASS");
  }

  // 9. Search uses shared HomeHeroSearch
  {
    const search = read(
      "src/components/templates/agent-signature/AgentSignatureSearchSection.tsx",
    );
    assert.ok(search.includes("HomeHeroSearch"));
    assert.ok(search.includes("Find Your Next Home"));
    assert.ok(search.includes("transactionType=SALE"));
    console.log("[9] Shared search presentation... PASS");
  }

  // 10. Mobile structure markers (responsive classes)
  {
    const hero = read(
      "src/components/templates/agent-signature/AgentSignatureHero.tsx",
    );
    const header = read(
      "src/components/templates/agent-signature/AgentSignatureHeader.tsx",
    );
    assert.ok(hero.includes("lg:grid-cols-"));
    assert.ok(hero.includes("aspect-[3/4]") || hero.includes("aspect-[4/5]"));
    assert.ok(header.includes("xl:hidden"));
    assert.ok(header.includes("as-mobile-nav"));
    console.log("[10] Mobile structure markers... PASS");
  }

  console.log("\nSTAGE 6.11B.2 SELFTEST PASSED\n");
}

main().catch((err) => {
  console.error("\nSTAGE 6.11B.2 SELFTEST FAILED\n");
  console.error(err);
  process.exit(1);
});
