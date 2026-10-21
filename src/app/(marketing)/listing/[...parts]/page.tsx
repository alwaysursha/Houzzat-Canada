import type { Metadata } from "next";
import { RoyalCollectionPropertyDemonstration } from "@/components/templates/royal-collection-one/RoyalCollectionPropertyDemonstration";
import { resolveMarketingPresentationBrand } from "@/lib/tenancy/resolve-marketing-tenancy";
import { isHighOctaneConceptFixture } from "@/lib/tenancy/templates/resolve-royal-collection-view";

/** Per-request: VOW/IDX gates, sold/history redaction, session access. */
export const dynamic = "force-dynamic";

type ListingPageProps = {
  params: Promise<{ parts: string[] }>;
  searchParams: Promise<{ sheet?: string | string[] }>;
};

function previewMetadata(): Metadata {
  return {
    title: { absolute: "HIGH OCTANE Real Estate — Design Preview" },
    description: "Local design preview. Actions are disabled.",
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
  };
}

export async function generateMetadata(
  props: Pick<ListingPageProps, "params">,
): Promise<Metadata> {
  const brand = await resolveMarketingPresentationBrand();
  if (brand && isHighOctaneConceptFixture(brand)) {
    return previewMetadata();
  }

  const operational = await import("./listing-operational");
  return operational.generateMetadata(props);
}

export default async function ListingDetailPage(props: ListingPageProps) {
  const brand = await resolveMarketingPresentationBrand();
  if (brand && isHighOctaneConceptFixture(brand)) {
    return <RoyalCollectionPropertyDemonstration />;
  }

  const { OperationalListingDetail } = await import("./listing-operational");
  return <OperationalListingDetail {...props} />;
}
