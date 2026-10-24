import { suggestedCitiesForLocation } from "@/lib/geo/regions";
import type { MarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import { resolveRoyalCollectionView } from "@/lib/tenancy/templates/resolve-royal-collection-view";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";
import { RoyalCollectionAbout } from "./RoyalCollectionAbout";
import { RoyalCollectionCommunities } from "./RoyalCollectionCommunities";
import { RoyalCollectionFeatured } from "./RoyalCollectionFeatured";
import { RoyalCollectionHero } from "./RoyalCollectionHero";
import { RoyalCollectionJournal } from "./RoyalCollectionJournal";
import { RoyalCollectionSearch } from "./RoyalCollectionSearch";
import { RoyalCollectionStory } from "./RoyalCollectionStory";
import { RoyalCollectionValuation } from "./RoyalCollectionValuation";
import styles from "./royal-collection.module.css";

/**
 * Royal Collection — Signature One.
 * Testimonials are omitted until a tenant configures real social proof.
 */
export function RoyalCollectionHome({
  brand,
}: {
  brand: MarketingPresentationBrand;
}) {
  const view = resolveRoyalCollectionView(brand);
  const cities = view.featuredCities ?? suggestedCitiesForLocation({ limit: 8 });

  return (
    <div
      className={styles.root}
      data-site-template="royal-collection-one"
      data-rc-display-fixture={view.displayFixtureId ?? undefined}
    >
      <RoyalCollectionHero view={view} />
      <RoyalCollectionSearch actionsDisabled={view.actionsDisabled} />
      <RoyalCollectionFeatured
        cities={cities}
        actionsDisabled={view.actionsDisabled}
        preserveEmpty={
          brand.workspaceSlug === HIGH_OCTANE_STAGING_WORKSPACE_SLUG &&
          view.displayFixtureId == null
        }
      />
      <RoyalCollectionStory view={view} />
      <RoyalCollectionCommunities view={view} />
      <RoyalCollectionValuation view={view} />
      <RoyalCollectionAbout view={view} />
      <RoyalCollectionJournal view={view} />
    </div>
  );
}
