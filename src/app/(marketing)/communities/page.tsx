import type { Metadata } from "next";
import { RoyalCollectionCommunitiesPage } from "@/components/templates/royal-collection-one/RoyalCollectionPages";
import { buildMarketingPageMetadata } from "@/lib/tenancy/marketing-page-metadata";
import { requireRoyalCollectionPage } from "@/lib/tenancy/templates/require-royal-collection-page";

export async function generateMetadata(): Promise<Metadata> {
  const { brand } = await requireRoyalCollectionPage();
  return buildMarketingPageMetadata({
    title: `Communities | ${brand.displayName}`,
    description: `Communities served by ${brand.displayName}.`,
    path: "/communities",
  });
}

export default async function CommunitiesPage() {
  const { view } = await requireRoyalCollectionPage();
  return <RoyalCollectionCommunitiesPage view={view} />;
}
