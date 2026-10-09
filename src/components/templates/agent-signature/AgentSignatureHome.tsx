import { PersonalizeHomepageBar } from "@/components/home/PersonalizeHomepageBar";
import { AgentSignatureBuySellSection } from "@/components/templates/agent-signature/AgentSignatureBuySellSection";
import { AgentSignatureCommunities } from "@/components/templates/agent-signature/AgentSignatureCommunities";
import { AgentSignatureContactSection } from "@/components/templates/agent-signature/AgentSignatureContactSection";
import { AgentSignatureFeaturedProperties } from "@/components/templates/agent-signature/AgentSignatureFeaturedProperties";
import { AgentSignatureHero } from "@/components/templates/agent-signature/AgentSignatureHero";
import { AgentSignatureMarketInsights } from "@/components/templates/agent-signature/AgentSignatureMarketInsights";
import { AgentSignatureMeetSection } from "@/components/templates/agent-signature/AgentSignatureMeetSection";
import { AgentSignatureSearchSection } from "@/components/templates/agent-signature/AgentSignatureSearchSection";
import { AgentSignatureTestimonials } from "@/components/templates/agent-signature/AgentSignatureTestimonials";
import { AgentSignatureValuationSection } from "@/components/templates/agent-signature/AgentSignatureValuationSection";
import { suggestedCitiesForLocation } from "@/lib/geo/regions";
import type { MarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import { resolveAgentSignatureView } from "@/lib/tenancy/templates/resolve-agent-signature-view";

/**
 * Stage 6.11B.4 — curated Agent Signature homepage (visual refinement).
 * Demo identity only when OWNER secure template preview is active.
 * Trust metrics strip intentionally omitted.
 */
export function AgentSignatureHome({
  brand,
}: {
  brand: MarketingPresentationBrand;
}) {
  const view = resolveAgentSignatureView(brand);
  const suggestionCities = suggestedCitiesForLocation({ limit: 8 });

  return (
    <div
      data-site-template="agent-signature"
      data-as-demo-preview={view.isDemoPreview ? "true" : "false"}
      data-as-homepage="6.11b.5"
      className="bg-mist"
    >
      <AgentSignatureHero view={view} />
      <AgentSignatureSearchSection />
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-10">
        <PersonalizeHomepageBar cities={suggestionCities} variant="signature" />
      </div>
      <AgentSignatureFeaturedProperties cities={suggestionCities} />
      <AgentSignatureMeetSection view={view} />
      <AgentSignatureBuySellSection view={view} />
      <AgentSignatureCommunities agentFirstName={view.firstName} />
      <AgentSignatureValuationSection />
      <AgentSignatureMarketInsights view={view} />
      <AgentSignatureTestimonials view={view} />
      <AgentSignatureContactSection view={view} />
    </div>
  );
}
