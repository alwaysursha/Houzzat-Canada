import type { Metadata } from "next";
import { RoyalCollectionCommunityPage } from "@/components/templates/royal-collection-one/RoyalCollectionPages";
import { buildMarketingPageMetadata } from "@/lib/tenancy/marketing-page-metadata";
import { requireRoyalCollectionPage } from "@/lib/tenancy/templates/require-royal-collection-page";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { brand } = await requireRoyalCollectionPage();
  return buildMarketingPageMetadata({
    title: `${slug.replace(/-/g, " ")} | ${brand.displayName}`,
    description: `A community page for ${brand.displayName}.`,
    path: `/communities/${slug}`,
  });
}

export default async function CommunityPage({ params }: PageProps) {
  const { slug } = await params;
  const { view } = await requireRoyalCollectionPage();
  return <RoyalCollectionCommunityPage view={view} slug={slug} />;
}
