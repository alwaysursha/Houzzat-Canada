import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminDeferredDeskPicker } from "@/components/admin/AdminDeferredDeskPicker";
import { AdminShell } from "@/components/admin/AdminShell";
import { StaffRouteConsumerGate } from "@/components/mobile/StaffRouteConsumerGate";
import { TenantBrandProvider } from "@/components/tenancy/TenantBrandProvider";
import { TenantThemeStyle } from "@/components/tenancy/TenantThemeStyle";
import { shouldUseHostnameBoundStaffContext } from "@/lib/tenancy/tenant-staff-context";
import { auth } from "@/lib/auth";
import {
  redirectNonAdminFromAdminShell,
  staffSignInRedirectUrl,
} from "@/lib/auth/staff-sign-in-redirect";
import { isAgentRole } from "@/lib/roles";
import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";
import {
  authorizeTenantCommandCentre,
  resolveAdminSurfaceMode,
} from "@/lib/admin/tenant-command-centre-auth";
import { buildSyntheticRequestFromHeaders } from "@/lib/tenancy/auth-origin";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import { resolveCanonicalPublicOrigin } from "@/lib/tenancy/canonical-public-origin";
import { toMarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import { legacyMarketingChromeBrand } from "@/lib/tenancy/resolve-marketing-tenancy";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";
import { buildStaffChromeMetadata } from "@/lib/tenancy/staff-chrome-metadata";
import { resolvePlatformSuspendedHost } from "@/lib/platform/status/resolve-suspended-host";
import { PlatformSuspendedPage } from "@/components/platform/status/PlatformSuspendedPage";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildStaffChromeMetadata({
    titleDefault: "Command Centre",
  });
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (await resolvePlatformSuspendedHost()) {
    return <PlatformSuspendedPage />;
  }

  const session = await auth();
  if (!session?.user) {
    redirect(await staffSignInRedirectUrl("/admin"));
  }
  const user = session!.user;
  if (!isAgentRole(user.role)) {
    await redirectNonAdminFromAdminShell(user.role);
  }

  const request = await buildSyntheticRequestFromHeaders();
  const hostname = request
    ? extractTrustedRequestHostname(request)
    : null;
  const surface = resolveAdminSurfaceMode(hostname);

  if (surface === "deny") {
    redirect("/agent");
  }

  if (surface === "tenant") {
    if (!request || !user.id) {
      redirect(await staffSignInRedirectUrl("/admin"));
    }
    const tenantAuth = await authorizeTenantCommandCentre(request, {
      id: user.id,
      role: user.role ?? "",
    });
    if (!tenantAuth) {
      // AGENT members and platform ADMIN without membership → CRM, not HQ.
      redirect("/agent");
    }

    const tenancy = await resolveRequestTenancy(request);
    if (!tenancy.ok) {
      redirect("/agent");
    }
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
        <AdminShell
          email={user.email ?? "admin"}
          mode="tenant"
          brandDisplayName={brand.displayName}
          brandLogoUrl={brand.logoUrl}
          brandPrimaryColor={brand.colors.primary}
          platformProductName={PLATFORM_PRODUCT_NAME}
        >
          <StaffRouteConsumerGate />
          <Suspense fallback={null}>{children}</Suspense>
        </AdminShell>
      </TenantBrandProvider>
    );
  }

  // Platform / global Command Centre — User.role ADMIN only.
  if (user.role !== "ADMIN") {
    await redirectNonAdminFromAdminShell(user.role);
  }

  if (shouldUseHostnameBoundStaffContext()) {
    // Defense in depth: platform surface already required above.
    if (!hostname || surface !== "platform") {
      redirect("/agent");
    }
  }

  const userId = user.id ?? "";
  const platformBrand = legacyMarketingChromeBrand();

  return (
    <TenantBrandProvider brand={platformBrand}>
      <TenantThemeStyle
        colors={platformBrand.colors}
        isHouzzatWorkspace={platformBrand.isHouzzatWorkspace}
      />
      <AdminShell
        email={user.email ?? "admin"}
        mode="platform"
        brandDisplayName={PLATFORM_PRODUCT_NAME}
        brandLogoUrl={null}
        brandPrimaryColor={platformBrand.colors.primary}
        platformProductName={PLATFORM_PRODUCT_NAME}
        deskSlot={
          userId ? <AdminDeferredDeskPicker userId={userId} /> : null
        }
        deskSlotCompact={
          userId ? (
            <AdminDeferredDeskPicker userId={userId} compact />
          ) : null
        }
        mobileDeskSlot={
          userId ? <AdminDeferredDeskPicker userId={userId} /> : null
        }
      >
        <StaffRouteConsumerGate />
        <Suspense fallback={null}>{children}</Suspense>
      </AdminShell>
    </TenantBrandProvider>
  );
}
