import { notFound } from "next/navigation";
import { resolveMarketingPresentationBrand } from "@/lib/tenancy/resolve-marketing-tenancy";
import { isRoyalCollectionOneTemplateId } from "@/lib/tenancy/templates";
import {
  resolveRoyalCollectionView,
  type RoyalCollectionView,
} from "@/lib/tenancy/templates/resolve-royal-collection-view";
import type { MarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";

export async function requireRoyalCollectionPage(): Promise<{
  brand: MarketingPresentationBrand;
  view: RoyalCollectionView;
}> {
  const brand = await resolveMarketingPresentationBrand();
  if (!brand || !isRoyalCollectionOneTemplateId(brand.templateId)) {
    notFound();
  }
  return { brand, view: resolveRoyalCollectionView(brand) };
}
