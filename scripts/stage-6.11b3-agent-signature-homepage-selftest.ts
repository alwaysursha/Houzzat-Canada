/**
 * Stage 6.11B.3 — Agent Signature premium homepage refinement selftest.
 * Run: pnpm stage-6.11b3-agent-signature-homepage:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import {
  AGENT_SIGNATURE_DEMO,
  AGENT_SIGNATURE_TEMPLATE_ID,
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
    logoUrl: null,
    brokerageLogoUrl: null,
    faviconUrl: null,
    ogImageUrl: null,
    colors: {
      primary: "#1C1917",
      secondary: "#0C0A09",
      accent: "#8B6914",
      surface: "#F7F3EC",
      ink: "#1C1917",
    },
    contact: { email: "office@example.com", phone: "(416) 555-0100" },
    footerLegalText: null,
    seoDescription: "desc",
    version: 1,
    publicOrigin: "https://re-max-realty.houzzatpro.com",
    canonicalOrigin: "https://re-max-realty.houzzatpro.com",
    templateId: AGENT_SIGNATURE_TEMPLATE_ID,
    agent: {
      name: "Jordan Lee",
      title: "Sales Representative",
      photoUrl: "/uploads/jordan.jpg",
      bio: "Real biography.",
      phone: "(416) 555-0199",
      email: "jordan@example.com",
      brokerageName: "RE/MAX Realty Services Inc.",
      markets: ["Toronto"],
    },
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
    templatePreview: null,
    ...overrides,
  };
}

async function main() {
  console.log("\n=== STAGE 6.11B.3 — AGENT SIGNATURE HOMEPAGE REFINEMENT ===\n");

  // 0. Curated homepage composition order
  {
    const home = read(
      "src/components/templates/agent-signature/AgentSignatureHome.tsx",
    );
    assert.ok(home.includes('data-as-homepage="6.11b.5"') || home.includes('data-as-homepage="6.11b.4"') || home.includes('data-as-homepage="6.11b.3"'));
    assert.ok(!home.includes("HomeDeferredBody"));
    assert.ok(!home.includes("HomepageMarketRails"));
    assert.ok(!home.includes("HomeAreaRailLive"));
    assert.ok(!home.includes("HomeRecentlyViewed"));
    assert.ok(!home.includes("HomeSoldRail"));
    assert.ok(!home.includes("AgentSignatureTrustStrip"));
    console.log("[0] Curated homepage order; no inventory overload... PASS");
  }

  // 1. Featured uses real home-rails API (new listings only, limit 3)
  {
    const featured = read(
      "src/components/templates/agent-signature/AgentSignatureFeaturedProperties.tsx",
    );
    assert.ok(featured.includes("/api/listings/home-rails"));
    assert.ok(featured.includes('limit: "3"'));
    assert.ok(featured.includes("newListings"));
    assert.ok(
      featured.includes("ListingCard") ||
        featured.includes("AgentSignatureFeaturedCard"),
    );
    assert.ok(!featured.includes("lockedPreview"));
    assert.ok(!featured.includes("HomeSoldRail"));
    assert.ok(!featured.includes("status=SOLD"));
    console.log("[1] Featured Properties curated (3, live API)... PASS");
  }

  // 2. Communities visual-only (no analytical homepage cards)
  {
    const communities = read(
      "src/components/templates/agent-signature/AgentSignatureCommunities.tsx",
    );
    assert.ok(communities.includes("/api/geo/home-areas"));
    assert.ok(
      communities.includes("formatCommunityDisplayName") ||
        communities.includes("Explore community"),
    );
    assert.ok(!communities.includes("Median ask"));
    assert.ok(!communities.includes("activeCount"));
    assert.ok(!communities.includes("Avg. DOM"));
    // Default HomeAreaRail still analytical
    assert.ok(
      read("src/components/home/HomeAreaRail.tsx").includes("Median ask"),
    );
    console.log("[2] Communities visual; Default rail unchanged... PASS");
  }

  // 3. Compact search + no HouzzatPRO body marketing
  {
    const search = read(
      "src/components/templates/agent-signature/AgentSignatureSearchSection.tsx",
    );
    assert.ok(search.includes("HomeHeroSearch"));
    assert.ok(search.includes('surface="agent"') || search.includes("Find Your Next Home"));
    assert.ok(!search.toLowerCase().includes("houzzatpro market"));
    const valuation = read(
      "src/components/templates/agent-signature/AgentSignatureValuationSection.tsx",
    );
    assert.ok(!valuation.toLowerCase().includes("powered by houzzatpro"));
    const market = read(
      "src/components/templates/agent-signature/AgentSignatureMarketInsights.tsx",
    );
    assert.ok(!market.toLowerCase().includes("houzzatpro market"));
    const footer = read(
      "src/components/templates/agent-signature/AgentSignatureFooter.tsx",
    );
    assert.ok(footer.includes("POWERED_BY_HOUZZATPRO_LABEL"));
    assert.ok(footer.includes("MlsDisclaimer"));
    assert.ok(footer.includes("buildSeoFooterColumns"));
    console.log("[3] Search compact; HouzzatPRO body cleanup; footer... PASS");
  }

  // 4. Default homepage frozen
  {
    const page = read("src/app/(marketing)/page.tsx");
    assert.ok(page.includes("Find Homes in Ontario"));
    assert.ok(page.includes("isAgentSignatureTemplateId"));
    const deferred = read("src/components/home/HomeDeferredBody.tsx");
    assert.ok(deferred.includes("HomepageMarketRails"));
    assert.ok(deferred.includes("HomeRecentlyViewedRail"));
    console.log("[4] Default homepage / shared rails frozen... PASS");
  }

  // 5. Demo-vs-live safety preserved
  {
    const live = resolveAgentSignatureView(baseBrand());
    assert.equal(live.isDemoPreview, false);
    assert.equal(live.name, "Jordan Lee");
    assert.equal(live.metrics, null);
    assert.equal(live.testimonials, null);
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
    assert.ok(preview.metrics);
    assert.ok(preview.testimonials);
    console.log("[5] Demo only in secure preview... PASS");
  }

  // 6. Themes still resolve (all six)
  {
    const agent = listSelectableTemplates().find(
      (t) => t.id === AGENT_SIGNATURE_TEMPLATE_ID,
    );
    assert.ok(agent);
    assert.equal(agent.themes.length, 6);
    for (const t of agent.themes) {
      assert.ok(getThemeById(t.id));
      assert.ok(resolveThemePalette(t.id));
    }
    const hero = read(
      "src/components/templates/agent-signature/AgentSignatureHero.tsx",
    );
    assert.ok(hero.includes("bg-canopy-deep") || hero.includes("text-surface"));
    assert.ok(!hero.includes("bg-[#8C6A3D]"));
    console.log("[6] Themes compatible; no hard-coded Bronze... PASS");
  }

  // 7. Secure preview / SEO chrome isolation
  {
    const below = read("src/components/site/MarketingBelowHeader.tsx");
    assert.ok(below.includes("isAgentSignatureTemplateId"));
    assert.ok(below.includes("SeoFooterLinks"));
    assert.ok(
      below.includes("!isAgentSignatureTemplateId(chromeBrand.templateId)"),
    );
    assert.ok(
      !read("src/middleware.ts").includes("x-houzzat-preview-template"),
    );
    assert.ok(
      read("src/components/templates/OwnerTemplatePreviewBar.tsx").includes(
        "Exit Preview",
      ),
    );
    console.log("[7] Secure preview + footer consolidation wiring... PASS");
  }

  // 8. Search / listings still reachable
  {
    const search = read(
      "src/components/templates/agent-signature/AgentSignatureSearchSection.tsx",
    );
    assert.ok(search.includes("/search?transactionType=SALE"));
    assert.ok(search.includes("/search?status=SOLD"));
    const header = read(
      "src/components/templates/agent-signature/AgentSignatureHeader.tsx",
    );
    assert.ok(header.includes("/search"));
    assert.ok(header.includes("/account"));
    console.log("[8] Search/listings/account entry points preserved... PASS");
  }

  console.log("\nSTAGE 6.11B.3 SELFTEST PASSED\n");
}

main().catch((err) => {
  console.error("\nSTAGE 6.11B.3 SELFTEST FAILED\n");
  console.error(err);
  process.exit(1);
});
