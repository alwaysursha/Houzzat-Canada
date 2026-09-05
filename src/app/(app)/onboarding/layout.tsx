import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TenantBrandProvider } from "@/components/tenancy/TenantBrandProvider";
import { TenantThemeStyle } from "@/components/tenancy/TenantThemeStyle";
import { buildSyntheticRequestFromHeaders } from "@/lib/tenancy/auth-origin";
import { resolveCanonicalPublicOrigin } from "@/lib/tenancy/canonical-public-origin";
import { toMarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const request = await buildSyntheticRequestFromHeaders();
  if (!request) return { title: "Workspace setup" };
  const tenancy = await resolveRequestTenancy(request);
  if (!tenancy.ok) return { title: "Workspace setup" };
  return {
    title: `Workspace setup | ${tenancy.brand.displayName}`,
    robots: { index: false, follow: false },
  };
}

/**
 * Stage 6.10C.3 — tenant hostname branding for OWNER onboarding.
 * TENANT = BRAND via WorkspaceDomain resolution (not hardcoded).
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const request = await buildSyntheticRequestFromHeaders();
  if (!request) notFound();
  const tenancy = await resolveRequestTenancy(request);
  if (!tenancy.ok) notFound();

  const canonicalOrigin = await resolveCanonicalPublicOrigin(
    tenancy.workspaceId,
    tenancy.hostname,
    tenancy.origin.startsWith("http://") ? "http:" : "https:",
  );
  const brand = toMarketingPresentationBrand(tenancy, canonicalOrigin);

  return (
    <TenantBrandProvider brand={brand}>
      <TenantThemeStyle
        colors={brand.colors}
        isHouzzatWorkspace={brand.isHouzzatWorkspace}
      />
      {children}
    </TenantBrandProvider>
  );
}
