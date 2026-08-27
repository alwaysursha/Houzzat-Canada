/**
 * Stage 3K.5.9.1 — staff chrome metadata (favicon + title) from hostname brand.
 */
import type { Metadata } from "next";
import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";
import { resolveCanonicalPublicOrigin } from "@/lib/tenancy/canonical-public-origin";
import { buildSyntheticRequestFromHeaders } from "@/lib/tenancy/auth-origin";
import { toMarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";
import { resolveTenantFaviconMetadata } from "@/lib/tenancy/tenant-favicon";

export async function buildStaffChromeMetadata(input: {
  titleDefault: string;
  titleTemplate?: string;
}): Promise<Metadata> {
  const request = await buildSyntheticRequestFromHeaders();
  if (!request) {
    return {
      title: {
        default: input.titleDefault,
        template: input.titleTemplate ?? `%s | ${PLATFORM_PRODUCT_NAME}`,
      },
    };
  }

  const tenancy = await resolveRequestTenancy(request);
  if (!tenancy.ok) {
    return {
      title: {
        default: input.titleDefault,
        template: input.titleTemplate ?? `%s | ${PLATFORM_PRODUCT_NAME}`,
      },
    };
  }

  const canonicalOrigin = await resolveCanonicalPublicOrigin(
    tenancy.workspaceId,
    tenancy.hostname,
    tenancy.origin.startsWith("http://") ? "http:" : "https:",
  );
  const brand = toMarketingPresentationBrand(tenancy, canonicalOrigin);

  return {
    metadataBase: new URL(
      canonicalOrigin.endsWith("/") ? canonicalOrigin : `${canonicalOrigin}/`,
    ),
    title: {
      default: input.titleDefault,
      template:
        input.titleTemplate ?? `%s | ${brand.displayName}`,
    },
    applicationName: brand.displayName,
    icons: resolveTenantFaviconMetadata(brand, canonicalOrigin),
  };
}
