/**
 * Stage 6.11B.4 — Agent Signature visual refinement selftest.
 * Run: pnpm stage-6.11b4-agent-signature-visual:selftest
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_SIGNATURE_TEMPLATE_ID,
  formatCommunityDisplayName,
  listSelectableTemplates,
  resolveThemePalette,
} from "@/lib/tenancy/templates";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

async function main() {
  console.log("\n=== STAGE 6.11B.4 — AGENT SIGNATURE VISUAL REFINEMENT ===\n");

  // 0. Homepage: no trust strip; curated order
  {
    const home = read(
      "src/components/templates/agent-signature/AgentSignatureHome.tsx",
    );
    assert.ok(
      home.includes('data-as-homepage="6.11b.5"') ||
        home.includes('data-as-homepage="6.11b.4"'),
    );
    assert.ok(!home.includes("AgentSignatureTrustStrip"));
    const body = home.slice(home.indexOf("return ("));
    const order = [
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
    ];
    let last = -1;
    for (const token of order) {
      const idx = body.indexOf(`<${token}`);
      assert.ok(idx > last, `order broken at ${token}`);
      last = idx;
    }
    console.log("[0] No trust strip; homepage order... PASS");
  }

  // 1. Hero soft blend, shorter type
  {
    const hero = read(
      "src/components/templates/agent-signature/AgentSignatureHero.tsx",
    );
    assert.ok(!hero.includes("shadow-[0_40px"));
    assert.ok(!hero.includes("shadow-[0_50px"));
    assert.ok(hero.includes("object-top"));
    assert.ok(hero.includes("from-canopy-deep"));
    assert.ok(hero.includes("lg:text-[3.75rem]"));
    console.log("[1] Hero integration refinements... PASS");
  }

  // 2. Search agent surface additive
  {
    const search = read(
      "src/components/templates/agent-signature/AgentSignatureSearchSection.tsx",
    );
    assert.ok(search.includes('surface="agent"'));
    assert.ok(search.includes("bg-mist"));
    assert.ok(!search.includes("bg-ink px-4 py-6"));
    const heroSearch = read("src/components/home/HomeHeroSearch.tsx");
    assert.ok(heroSearch.includes('"agent"'));
    assert.ok(heroSearch.includes('surface === "page"'));
    assert.ok(heroSearch.includes('surface === "hero"') || heroSearch.includes('= "hero"'));
    console.log("[2] Agent search surface additive... PASS");
  }

  // 3. ListingCard signature gated; Default path intact
  {
    const card = read("src/components/listings/ListingCard.tsx");
    assert.ok(card.includes("AGENT_SIGNATURE_TEMPLATE_ID"));
    assert.ok(card.includes("const signature ="));
    assert.ok(card.includes('signature ? "aspect-[5/4]" : "aspect-[4/3]"'));
    assert.ok(card.includes("rounded-2xl"));
    assert.ok(card.includes("ListingLink"));
    assert.ok(card.includes("ListingCardActions"));
    assert.ok(card.includes("MLS#"));
    console.log("[3] ListingCard signature gating... PASS");
  }

  // 4. Buy/Sell distinct assets (B.5 supersedes atmosphere crops)
  {
    const buySell = read(
      "src/components/templates/agent-signature/AgentSignatureBuySellSection.tsx",
    );
    const buyAsset =
      buySell.includes("agent-signature-buy-neighbourhood.jpg") ||
      buySell.includes("agent-signature-buy-atmosphere.jpg");
    const sellAsset =
      buySell.includes("agent-signature-sell-architecture.jpg") ||
      buySell.includes("agent-signature-sell-atmosphere.jpg");
    assert.ok(buyAsset);
    assert.ok(sellAsset);
    assert.ok(
      existsSync(
        join(root, "public/images/agent-signature-buy-neighbourhood.jpg"),
      ) ||
        existsSync(
          join(root, "public/images/agent-signature-buy-atmosphere.jpg"),
        ),
    );
    assert.ok(
      existsSync(
        join(root, "public/images/agent-signature-sell-architecture.jpg"),
      ) ||
        existsSync(
          join(root, "public/images/agent-signature-sell-atmosphere.jpg"),
        ),
    );
    console.log("[4] Distinct Buy/Sell atmosphere assets... PASS");
  }

  // 5. Community display-name cleanup (presentation only)
  {
    assert.equal(formatCommunityDisplayName("05 - Gananoque"), "Gananoque");
    assert.equal(
      formatCommunityDisplayName("055 - Grimsby Escarpment"),
      "Grimsby Escarpment",
    );
    assert.equal(
      formatCommunityDisplayName("056 - West Lincoln"),
      "West Lincoln",
    );
    assert.equal(formatCommunityDisplayName("Oakville"), "Oakville");
    assert.equal(formatCommunityDisplayName("12 — Test"), "Test");
    const communities = read(
      "src/components/templates/agent-signature/AgentSignatureCommunities.tsx",
    );
    assert.ok(communities.includes("formatCommunityDisplayName"));
    assert.ok(!communities.includes("place.summary"));
    assert.ok(
      read("src/components/home/HomeAreaRail.tsx").includes("place.displayName"),
    );
    console.log("[5] Community label cleanup; Default rail raw names... PASS");
  }

  // 6. Testimonials editorial; gating preserved
  {
    const t = read(
      "src/components/templates/agent-signature/AgentSignatureTestimonials.tsx",
    );
    assert.ok(t.includes("if (!view.testimonials"));
    assert.ok(t.includes("preview only"));
    assert.ok(!t.includes("border border-surface/15 bg-surface/[0.04]"));
    assert.ok(t.includes("space-y-14"));
    console.log("[6] Testimonials editorial + gating... PASS");
  }

  // 7. Footer SEO subordinated; compliance kept
  {
    const footer = read(
      "src/components/templates/agent-signature/AgentSignatureFooter.tsx",
    );
    assert.ok(footer.includes("MlsDisclaimer"));
    assert.ok(footer.includes("buildSeoFooterColumns"));
    assert.ok(footer.includes("POWERED_BY_HOUZZATPRO_LABEL"));
    assert.ok(
      footer.includes("text-ink/45") ||
        footer.includes("text-ink/40") ||
        footer.includes("text-ink/35"),
    );
    assert.ok(
      footer.includes("text-[12px]") ||
        footer.includes("text-[11px]") ||
        footer.includes("text-[10px]"),
    );
    console.log("[7] Footer SEO muted; disclosures intact... PASS");
  }

  // 8. Themes + Default frozen
  {
    const agent = listSelectableTemplates().find(
      (t) => t.id === AGENT_SIGNATURE_TEMPLATE_ID,
    );
    assert.ok(agent);
    assert.equal(agent.themes.length, 6);
    for (const theme of agent.themes) {
      assert.ok(resolveThemePalette(theme.id));
    }
    const page = read("src/app/(marketing)/page.tsx");
    assert.ok(page.includes("Find Homes in Ontario"));
    assert.ok(
      read("src/components/home/HomeDeferredBody.tsx").includes(
        "HomepageMarketRails",
      ),
    );
    console.log("[8] Six themes + Default frozen... PASS");
  }

  // 9. Featured still 3 via home-rails
  {
    const featured = read(
      "src/components/templates/agent-signature/AgentSignatureFeaturedProperties.tsx",
    );
    assert.ok(featured.includes('limit: "3"'));
    assert.ok(featured.includes("newListings"));
    assert.ok(
      featured.includes("ListingCard") ||
        featured.includes("AgentSignatureFeaturedCard"),
    );
    assert.ok(!featured.includes("HomeSoldRail"));
    assert.ok(!featured.includes("status=SOLD"));
    console.log("[9] Featured Properties still curated (3)... PASS");
  }

  console.log("\nSTAGE 6.11B.4 SELFTEST PASSED\n");
}

main().catch((err) => {
  console.error("\nSTAGE 6.11B.4 SELFTEST FAILED\n");
  console.error(err);
  process.exit(1);
});
