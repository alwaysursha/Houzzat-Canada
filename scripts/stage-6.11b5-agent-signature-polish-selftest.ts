/**
 * Stage 6.11B.5 — Agent Signature final visual polish selftest.
 * Run: pnpm stage-6.11b5-agent-signature-polish:selftest
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_SIGNATURE_TEMPLATE_ID,
  listSelectableTemplates,
  resolveThemePalette,
} from "@/lib/tenancy/templates";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

async function main() {
  console.log("\n=== STAGE 6.11B.5 — AGENT SIGNATURE FINAL POLISH ===\n");

  // 0. Homepage marker + frozen areas still present
  {
    const home = read(
      "src/components/templates/agent-signature/AgentSignatureHome.tsx",
    );
    assert.ok(home.includes('data-as-homepage="6.11b.5"'));
    assert.ok(!home.includes("AgentSignatureTrustStrip"));
    assert.ok(!home.includes("HomeDeferredBody"));
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
    ]) {
      assert.ok(home.includes(token), token);
    }
    console.log("[0] Homepage polish marker + curated sections... PASS");
  }

  // 1. Search full-width composition
  {
    const search = read(
      "src/components/templates/agent-signature/AgentSignatureSearchSection.tsx",
    );
    assert.ok(search.includes('surface="agent"'));
    assert.ok(search.includes("w-full"));
    assert.ok(!search.includes("max-w-3xl"));
    const heroSearch = read("src/components/home/HomeHeroSearch.tsx");
    assert.ok(heroSearch.includes('onAgent ? "max-w-none"'));
    assert.ok(heroSearch.includes('surface === "page"'));
    assert.ok(heroSearch.includes("Buy a Home"));
    console.log("[1] Search composition rebalanced... PASS");
  }

  // 2. Editorial featured card isolation
  {
    const featured = read(
      "src/components/templates/agent-signature/AgentSignatureFeaturedProperties.tsx",
    );
    assert.ok(featured.includes("AgentSignatureFeaturedCard"));
    assert.ok(!featured.includes('from "@/components/listings/ListingCard"'));
    assert.ok(featured.includes('limit: "3"'));
    const card = read(
      "src/components/templates/agent-signature/AgentSignatureFeaturedCard.tsx",
    );
    assert.ok(card.includes("ListingLink"));
    assert.ok(card.includes("ListingPhoto"));
    assert.ok(card.includes("font-display"));
    assert.ok(card.includes("brokerageName"));
    assert.ok(!card.includes("ListingCardActions"));
    assert.ok(!card.includes("formatListingTiming"));
    assert.ok(!card.includes("MLS#"));
    // Shared ListingCard still exists for Default/Search
    assert.ok(
      read("src/components/listings/ListingCard.tsx").includes(
        "ListingCardActions",
      ),
    );
    console.log("[2] Featured editorial card isolated... PASS");
  }

  // 3. Distinct Buy/Sell assets
  {
    const buySell = read(
      "src/components/templates/agent-signature/AgentSignatureBuySellSection.tsx",
    );
    assert.ok(buySell.includes("agent-signature-buy-neighbourhood.jpg"));
    assert.ok(buySell.includes("agent-signature-sell-architecture.jpg"));
    assert.ok(
      existsSync(
        join(root, "public/images/agent-signature-buy-neighbourhood.jpg"),
      ),
    );
    assert.ok(
      existsSync(
        join(root, "public/images/agent-signature-sell-architecture.jpg"),
      ),
    );
    assert.ok(!buySell.includes("agent-signature-buy-atmosphere.jpg"));
    assert.ok(!buySell.includes("agent-signature-sell-atmosphere.jpg"));
    console.log("[3] Distinct Buy/Sell imagery... PASS");
  }

  // 4. Communities editorial layout
  {
    const communities = read(
      "src/components/templates/agent-signature/AgentSignatureCommunities.tsx",
    );
    assert.ok(communities.includes("featured"));
    assert.ok(communities.includes("lg:grid-cols-2"));
    assert.ok(communities.includes("formatCommunityDisplayName"));
    assert.ok(!communities.includes("lg:grid-cols-4"));
    assert.ok(
      read("src/components/home/HomeAreaRail.tsx").includes("Median ask"),
    );
    console.log("[4] Communities featured + supporting layout... PASS");
  }

  // 5. Footer hierarchy
  {
    const footer = read(
      "src/components/templates/agent-signature/AgentSignatureFooter.tsx",
    );
    assert.ok(footer.includes("PRIMARY") || footer.includes("font-display text-3xl"));
    assert.ok(footer.includes("Explore {regionLabel}"));
    assert.ok(footer.includes("text-[11px]") || footer.includes("text-[10px]"));
    assert.ok(footer.includes("MlsDisclaimer"));
    assert.ok(footer.includes("POWERED_BY_HOUZZATPRO_LABEL"));
    assert.ok(footer.includes("buildSeoFooterColumns"));
    console.log("[5] Footer agent-first hierarchy... PASS");
  }

  // 6. Themes + Default frozen
  {
    const agent = listSelectableTemplates().find(
      (t) => t.id === AGENT_SIGNATURE_TEMPLATE_ID,
    );
    assert.ok(agent);
    assert.equal(agent.themes.length, 6);
    for (const t of agent.themes) assert.ok(resolveThemePalette(t.id));
    assert.ok(
      read("src/app/(marketing)/page.tsx").includes("Find Homes in Ontario"),
    );
    assert.ok(
      read("src/components/home/HomeDeferredBody.tsx").includes(
        "HomepageMarketRails",
      ),
    );
    console.log("[6] Themes + Default frozen... PASS");
  }

  console.log("\nSTAGE 6.11B.5 SELFTEST PASSED\n");
}

main().catch((err) => {
  console.error("\nSTAGE 6.11B.5 SELFTEST FAILED\n");
  console.error(err);
  process.exit(1);
});
