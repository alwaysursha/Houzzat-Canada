import { TeamSignatureBuySellSection } from "@/components/templates/team-signature/TeamSignatureBuySellSection";
import { TeamSignatureCommunities } from "@/components/templates/team-signature/TeamSignatureCommunities";
import { TeamSignatureContactSection } from "@/components/templates/team-signature/TeamSignatureContactSection";
import { TeamSignatureFeaturedProperties } from "@/components/templates/team-signature/TeamSignatureFeaturedProperties";
import { TeamSignatureHero } from "@/components/templates/team-signature/TeamSignatureHero";
import { TeamSignatureMarketInsights } from "@/components/templates/team-signature/TeamSignatureMarketInsights";
import { TeamSignatureMeetSection } from "@/components/templates/team-signature/TeamSignatureMeetSection";
import { TeamSignatureSearchSection } from "@/components/templates/team-signature/TeamSignatureSearchSection";
import { TeamSignatureTestimonials } from "@/components/templates/team-signature/TeamSignatureTestimonials";
import { TeamSignatureTrustStrip } from "@/components/templates/team-signature/TeamSignatureTrustStrip";
import { TeamSignatureValuationSection } from "@/components/templates/team-signature/TeamSignatureValuationSection";
import { suggestedCitiesForLocation } from "@/lib/geo/regions";
import type { MarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import { resolveTeamSignatureView } from "@/lib/tenancy/templates/resolve-team-signature-view";

/**
 * Stage 6.11E.2 — Team Signature Style #1 homepage.
 * Demo roster/testimonials only when template preview is active.
 */
export function TeamSignatureHome({
  brand,
}: {
  brand: MarketingPresentationBrand;
}) {
  const view = resolveTeamSignatureView(brand);
  const suggestionCities = suggestedCitiesForLocation({ limit: 8 });

  return (
    <div
      data-site-template="team-signature"
      data-ts-demo-preview={view.isDemoPreview ? "true" : "false"}
      data-ts-homepage="6.11e.2b"
      className="bg-[var(--ts-surface,#EEF3F0)]"
    >
      <TeamSignatureHero view={view} />
      <TeamSignatureSearchSection />
      <TeamSignatureTrustStrip view={view} />
      <TeamSignatureFeaturedProperties cities={suggestionCities} />
      <TeamSignatureMeetSection view={view} />
      <TeamSignatureBuySellSection view={view} />
      <TeamSignatureCommunities />
      <TeamSignatureMarketInsights view={view} />
      <TeamSignatureValuationSection />
      <TeamSignatureTestimonials view={view} />
      <TeamSignatureContactSection view={view} />
    </div>
  );
}
