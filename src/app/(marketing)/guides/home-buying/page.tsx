import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RoyalCollectionHomeBuyingGuide } from "@/components/templates/royal-collection-one/RoyalCollectionHomeBuyingGuide";
import { buildMarketingPageMetadata } from "@/lib/tenancy/marketing-page-metadata";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";
import { requireRoyalCollectionPage } from "@/lib/tenancy/templates/require-royal-collection-page";

export async function generateMetadata(): Promise<Metadata> {
  const { brand } = await requireRoyalCollectionPage();
  if (brand.workspaceSlug !== HIGH_OCTANE_STAGING_WORKSPACE_SLUG) {
    return { title: "Guide" };
  }
  return buildMarketingPageMetadata({
    title: "Step by Step Home Buying Guide",
    description:
      "Saad Qureshi’s briefing for Niagara buyers: decide, measure what you can carry, arrange the mortgage, choose the home, and close.",
    path: "/guides/home-buying",
  });
}

export default async function HomeBuyingGuidePage() {
  const { brand, view } = await requireRoyalCollectionPage();
  if (brand.workspaceSlug !== HIGH_OCTANE_STAGING_WORKSPACE_SLUG) {
    notFound();
  }
  return <RoyalCollectionHomeBuyingGuide view={view} />;
}
