import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RoyalCollectionSellingGuide } from "@/components/templates/royal-collection-one/RoyalCollectionSellingGuide";
import { buildMarketingPageMetadata } from "@/lib/tenancy/marketing-page-metadata";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";
import { requireRoyalCollectionPage } from "@/lib/tenancy/templates/require-royal-collection-page";

export async function generateMetadata(): Promise<Metadata> {
  const { brand } = await requireRoyalCollectionPage();
  if (brand.workspaceSlug !== HIGH_OCTANE_STAGING_WORKSPACE_SLUG) {
    return { title: "Guide" };
  }
  return buildMarketingPageMetadata({
    title: "Preparing to Sell with Confidence",
    description:
      "Saad Qureshi’s briefing for Niagara sellers: prepare the house, price it from the market, run the campaign, and close cleanly.",
    path: "/guides/preparing-to-sell",
  });
}

export default async function PreparingToSellGuidePage() {
  const { brand, view } = await requireRoyalCollectionPage();
  if (brand.workspaceSlug !== HIGH_OCTANE_STAGING_WORKSPACE_SLUG) {
    notFound();
  }
  return <RoyalCollectionSellingGuide view={view} />;
}
