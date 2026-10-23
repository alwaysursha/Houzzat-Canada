import type { Metadata } from "next";
import { createPublicRoute } from "@/components/platform/public/site/create-public-route";
import { RoyalCollectionContactPage } from "@/components/templates/royal-collection-one/RoyalCollectionPages";
import { buildMarketingPageMetadata } from "@/lib/tenancy/marketing-page-metadata";
import { resolveMarketingPresentationBrand } from "@/lib/tenancy/resolve-marketing-tenancy";
import { isRoyalCollectionOneTemplateId } from "@/lib/tenancy/templates";
import { resolveRoyalCollectionView } from "@/lib/tenancy/templates/resolve-royal-collection-view";

const route = createPublicRoute("/contact");

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await resolveMarketingPresentationBrand();
  if (brand && isRoyalCollectionOneTemplateId(brand.templateId)) {
    return buildMarketingPageMetadata({
      title: `Contact | ${brand.displayName}`,
      description: `Contact ${brand.displayName}.`,
      path: "/contact",
    });
  }
  return route.generateMetadata();
}

export default async function ContactPage() {
  const brand = await resolveMarketingPresentationBrand();
  if (brand && isRoyalCollectionOneTemplateId(brand.templateId)) {
    return <RoyalCollectionContactPage view={resolveRoyalCollectionView(brand)} />;
  }
  return route.Page();
}
