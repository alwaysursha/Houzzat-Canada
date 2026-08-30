import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import { ActiveWorkspaceGate } from "@/components/agent/ActiveWorkspaceGate";
import { AgentDeferredLeaderBanner } from "@/components/agent/AgentDeferredLeaderBanner";
import { AgentShell } from "@/components/agent/AgentShell";
import { StaffRouteConsumerGate } from "@/components/mobile/StaffRouteConsumerGate";
import { TenantBrandProvider } from "@/components/tenancy/TenantBrandProvider";
import { TenantThemeStyle } from "@/components/tenancy/TenantThemeStyle";
import { requireAgentContext, requireAgentGate } from "@/lib/agent";
import { staffSignInRedirectUrl } from "@/lib/auth/staff-sign-in-redirect";
import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";
import { buildSyntheticRequestFromHeaders } from "@/lib/tenancy/auth-origin";
import { resolveCanonicalPublicOrigin } from "@/lib/tenancy/canonical-public-origin";
import { toMarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import { legacyMarketingChromeBrand } from "@/lib/tenancy/resolve-marketing-tenancy";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";
import { buildStaffChromeMetadata } from "@/lib/tenancy/staff-chrome-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildStaffChromeMetadata({
    titleDefault: "CRM",
  });
}
export default async function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gate = await requireAgentGate();
  if (!gate) {
    redirect(await staffSignInRedirectUrl("/agent"));
  }

  const ctx = await requireAgentContext();
  if (!ctx) {
    redirect(await staffSignInRedirectUrl("/agent"));
  }

  const membershipRole =
    ctx.workspaceRole === "OWNER" || ctx.workspaceRole === "ADMIN"
      ? "OWNER"
      : "AGENT";

  const request = await buildSyntheticRequestFromHeaders();
  let brand = legacyMarketingChromeBrand();
  if (request) {
    const tenancy = await resolveRequestTenancy(request);
    if (tenancy.ok) {
      const canonicalOrigin = await resolveCanonicalPublicOrigin(
        tenancy.workspaceId,
        tenancy.hostname,
        tenancy.origin.startsWith("http://") ? "http:" : "https:",
      );
      brand = toMarketingPresentationBrand(tenancy, canonicalOrigin);
    }
  }

  const orgName =
    brand.displayName ||
    ctx.workspaceName ||
    `${PLATFORM_PRODUCT_NAME} Team`;

  return (
    <TenantBrandProvider brand={brand}>
      <TenantThemeStyle
        colors={brand.colors}
        isHouzzatWorkspace={brand.isHouzzatWorkspace}
      />
      <AgentShell
        email={gate.user.email}
        orgName={orgName}
        membershipRole={membershipRole}
        brandDisplayName={brand.displayName}
        brandLogoUrl={brand.logoUrl}
        brandPrimaryColor={brand.colors.primary}
        platformProductName={PLATFORM_PRODUCT_NAME}
        showCommandCentreLink={membershipRole === "OWNER"}
      >
        {ctx.requiresWorkspaceSelection ? <ActiveWorkspaceGate /> : null}
        <StaffRouteConsumerGate />
        {ctx.canSeeTeamLeads ? <AgentDeferredLeaderBanner /> : null}
        <Suspense fallback={null}>{children}</Suspense>
      </AgentShell>
    </TenantBrandProvider>
  );
}
