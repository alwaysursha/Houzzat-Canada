import type { Metadata } from "next";
import { RoyalCollectionAboutPage } from "@/components/templates/royal-collection-one/RoyalCollectionPages";
import { buildMarketingPageMetadata } from "@/lib/tenancy/marketing-page-metadata";
import { requireRoyalCollectionPage } from "@/lib/tenancy/templates/require-royal-collection-page";

export async function generateMetadata(): Promise<Metadata> {
  const { brand, view } = await requireRoyalCollectionPage();
  const name = view.agentName || brand.displayName;
  return buildMarketingPageMetadata({
    title: `About ${name}`,
    description: `${name} at ${brand.displayName}.`,
    path: "/about",
  });
}

export default async function AboutPage() {
  const { view } = await requireRoyalCollectionPage();
  return <RoyalCollectionAboutPage view={view} />;
}
