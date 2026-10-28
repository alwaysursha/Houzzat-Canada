import type { Metadata } from "next";
import { RoyalCollectionCommunityPage } from "@/components/templates/royal-collection-one/RoyalCollectionPages";
import { highOctaneCommunityGuideBySlug } from "@/lib/tenancy/templates/high-octane-community-guides";
import { buildMarketingPageMetadata } from "@/lib/tenancy/marketing-page-metadata";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";
import { requireRoyalCollectionPage } from "@/lib/tenancy/templates/require-royal-collection-page";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { brand } = await requireRoyalCollectionPage();
  const guide =
    brand.workspaceSlug === HIGH_OCTANE_STAGING_WORKSPACE_SLUG
      ? highOctaneCommunityGuideBySlug(slug)
      : null;
  return buildMarketingPageMetadata({
    title: `${guide?.name ?? slug.replace(/-/g, " ")} | ${brand.displayName}`,
    description: guide?.summary ?? `A community page for ${brand.displayName}.`,
    path: `/communities/${slug}`,
  });
}

export default async function CommunityPage({ params }: PageProps) {
  const { slug } = await params;
  const { view } = await requireRoyalCollectionPage();
  return <RoyalCollectionCommunityPage view={view} slug={slug} />;
}
