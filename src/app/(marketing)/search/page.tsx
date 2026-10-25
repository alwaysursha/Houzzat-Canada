import type { Metadata } from "next";
import { RoyalCollectionSearchDemonstration } from "@/components/templates/royal-collection-one/RoyalCollectionSearchDemonstration";
import { buildMarketingPageMetadata } from "@/lib/tenancy/marketing-page-metadata";
import { resolveMarketingPresentationBrand } from "@/lib/tenancy/resolve-marketing-tenancy";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";
import { isHighOctaneConceptFixture } from "@/lib/tenancy/templates/resolve-royal-collection-view";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await resolveMarketingPresentationBrand();
  if (brand && isHighOctaneConceptFixture(brand)) {
    return {
      title: { absolute: "HIGH OCTANE Real Estate — Design Preview" },
      description: "Local design preview. Actions are disabled.",
      robots: {
        index: false,
        follow: false,
        nocache: true,
        googleBot: { index: false, follow: false, noimageindex: true },
      },
    };
  }
  const niagara = brand?.workspaceSlug === HIGH_OCTANE_STAGING_WORKSPACE_SLUG;
  return buildMarketingPageMetadata({
    title: niagara ? "Search Niagara Homes for Sale" : "Search GTA Homes for Sale",
    description: niagara
      ? "Filter Niagara listings by price, beds, baths, property type, and neighbourhood."
      : "Filter MLS listings across the Greater Toronto Area by price, beds, baths, property type, and neighbourhood.",
    path: "/search",
  });
}

export default async function SearchPage() {
  const brand = await resolveMarketingPresentationBrand();
  if (brand && isHighOctaneConceptFixture(brand)) {
    return <RoyalCollectionSearchDemonstration />;
  }

  const { OperationalPropertySearch } = await import("./search-operational");
  return <OperationalPropertySearch />;
}
