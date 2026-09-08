import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdsTrackingPixels } from "@/components/ads/AdsTrackingPixels";
import { UtmCapture } from "@/components/ads/UtmCapture";
import { JsonLd } from "@/components/seo/JsonLd";
import { MarketingBelowHeader } from "@/components/site/MarketingBelowHeader";
import { MarketingChromeGate } from "@/components/site/MarketingChromeGate";
import { SiteHeader } from "@/components/site/SiteHeader";
import { MobileBottomNav } from "@/components/site/MobileBottomNav";
import { ScrollToTopButton } from "@/components/site/ScrollToTopButton";
import { RoutePlannerFloatingChip } from "@/components/route-planner/RoutePlannerFloatingChip";
import { ListingSheetHostLazy } from "@/components/mobile/ListingSheetHostLazy";
import { TenantBrandProvider } from "@/components/tenancy/TenantBrandProvider";
import { TenantThemeStyle } from "@/components/tenancy/TenantThemeStyle";
import { AgentSignatureHeader } from "@/components/templates/agent-signature/AgentSignatureHeader";
import { TeamSignatureHeader } from "@/components/templates/team-signature/TeamSignatureHeader";
import { OwnerTemplatePreviewBar } from "@/components/templates/OwnerTemplatePreviewBar";
import { TemplatePresentationProvider } from "@/components/templates/TemplatePresentationProvider";
import { suggestedCitiesForLocation } from "@/lib/geo/regions";
import {
  isAgentSignatureTemplateId,
  isTeamSignatureTemplateId,
} from "@/lib/tenancy/templates";
import { resolveAgentSignatureView } from "@/lib/tenancy/templates/resolve-agent-signature-view";
import { resolveTeamSignatureView } from "@/lib/tenancy/templates/resolve-team-signature-view";
import { resolveCanonicalPublicOrigin } from "@/lib/tenancy/canonical-public-origin";
import {
  resolveMarketingPresentationBrand,
  resolveMarketingTenancy,
} from "@/lib/tenancy/resolve-marketing-tenancy";
import {
  buildMarketingRootMetadata,
  organizationJsonLdForTenancy,
} from "@/lib/tenancy/tenant-seo";
import { getExpertWhatsAppNumber } from "@/lib/whatsapp";
import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";
import { isHouzzatProPlatformBootstrapRequest } from "@/lib/mobile/platform-bootstrap-request";
import {
  HOUZZATPRO_SUPPORT_DOCUMENT_TITLE,
  isHouzzatProPlatformSupportRequest,
  PLATFORM_SUSPENDED_DOCUMENT_TITLE,
} from "@/lib/platform/status";
import {
  BOOK_DEMO_DOCUMENT_TITLE,
  PLATFORM_HOME_DOCUMENT_DESCRIPTION,
  PLATFORM_HOME_DOCUMENT_TITLE,
  isHouzzatProPlatformBookDemoRequest,
  isHouzzatProPlatformHomeRequest,
  isHouzzatProPlatformMarketingShellRequest,
} from "@/lib/platform/public";
import { isHouzzatProPlatformPrivateOfferRequest } from "@/lib/platform/offers/private-offer-request";
import { PRIVATE_OFFER_DOCUMENT_TITLE } from "@/lib/platform/offers/private-offer-copy";
import { resolvePlatformSuspendedHost } from "@/lib/platform/status/resolve-suspended-host";
import {
  PlatformSuspendedPage,
} from "@/components/platform/status/PlatformSuspendedPage";
import { PlatformMarketingFooter } from "@/components/platform/public/PlatformMarketingFooter";
import { PlatformMarketingHeader } from "@/components/platform/public/PlatformMarketingHeader";

/** Hostname-aware tenancy — must not be statically generated (see tenancy-cache-policy). */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  if (await isHouzzatProPlatformBootstrapRequest()) {
    return { title: PLATFORM_PRODUCT_NAME, robots: { index: false, follow: false } };
  }
  if (await isHouzzatProPlatformSupportRequest()) {
    return {
      title: HOUZZATPRO_SUPPORT_DOCUMENT_TITLE,
      robots: { index: false, follow: false },
    };
  }
  if (await isHouzzatProPlatformBookDemoRequest()) {
    return {
      title: BOOK_DEMO_DOCUMENT_TITLE,
      robots: { index: true, follow: true },
    };
  }
  if (await isHouzzatProPlatformPrivateOfferRequest()) {
    return {
      title: PRIVATE_OFFER_DOCUMENT_TITLE,
      robots: {
        index: false,
        follow: false,
        nocache: true,
        googleBot: { index: false, follow: false, noimageindex: true },
      },
    };
  }
  if (await isHouzzatProPlatformHomeRequest()) {
    return {
      title: PLATFORM_HOME_DOCUMENT_TITLE,
      description: PLATFORM_HOME_DOCUMENT_DESCRIPTION,
      robots: { index: true, follow: true },
    };
  }
  if (await isHouzzatProPlatformMarketingShellRequest()) {
    // /terms and /privacy supply their own page metadata; keep indexable shell.
    return {
      robots: { index: true, follow: true },
    };
  }
  if (await resolvePlatformSuspendedHost()) {
    return {
      title: PLATFORM_SUSPENDED_DOCUMENT_TITLE,
      robots: { index: false, follow: false },
    };
  }
  const tenancy = await resolveMarketingTenancy();
  if (!tenancy) {
    return { title: "Not found" };
  }
  const canonicalOrigin = await resolveCanonicalPublicOrigin(
    tenancy.workspaceId,
    tenancy.hostname,
    tenancy.origin.startsWith("http://") ? "http:" : "https:",
  );
  return buildMarketingRootMetadata(tenancy, canonicalOrigin);
}

export default async function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (await isHouzzatProPlatformBootstrapRequest()) {
    return <>{children}</>;
  }

  if (await isHouzzatProPlatformSupportRequest()) {
    return <>{children}</>;
  }

  if (await isHouzzatProPlatformBookDemoRequest()) {
    return <>{children}</>;
  }

  if (await isHouzzatProPlatformPrivateOfferRequest()) {
    return <>{children}</>;
  }

  // V1 SaaS sales shell: / , /terms, /privacy on houzzatpro.com / www only.
  // Does not resolve tenancy and does not grant tenant authority.
  if (await isHouzzatProPlatformMarketingShellRequest()) {
    return (
      <div className="flex min-h-dvh flex-col bg-[#f7f8f7] text-slate-900">
        <PlatformMarketingHeader />
        <main className="flex-1">{children}</main>
        <PlatformMarketingFooter />
      </div>
    );
  }

  if (await resolvePlatformSuspendedHost()) {
    return <PlatformSuspendedPage />;
  }

  const tenancy = await resolveMarketingTenancy();
  if (!tenancy) {
    notFound();
  }
  const chromeBrand = await resolveMarketingPresentationBrand();
  if (!chromeBrand) {
    notFound();
  }

  const cities = suggestedCitiesForLocation({ limit: 12 });
  const phone =
    chromeBrand.contact.phone ?? getExpertWhatsAppNumber() ?? undefined;

  const agentSignature = isAgentSignatureTemplateId(chromeBrand.templateId);
  const agentSignatureView = agentSignature
    ? resolveAgentSignatureView(chromeBrand)
    : null;
  const teamSignature = isTeamSignatureTemplateId(chromeBrand.templateId);
  const teamSignatureView = teamSignature
    ? resolveTeamSignatureView(chromeBrand)
    : null;

  return (
    <TenantBrandProvider brand={chromeBrand}>
      <TemplatePresentationProvider templateId={chromeBrand.templateId}>
        <TenantThemeStyle
          colors={chromeBrand.colors}
          isHouzzatWorkspace={chromeBrand.isHouzzatWorkspace}
          templateId={chromeBrand.templateId}
        />
        <div className="min-h-dvh">
          {chromeBrand.templatePreview?.active ? (
            <OwnerTemplatePreviewBar
              displayLabel={chromeBrand.templatePreview.displayLabel}
              themeId={chromeBrand.templatePreview.themeId}
            />
          ) : null}
          <JsonLd
            data={organizationJsonLdForTenancy(
              tenancy,
              chromeBrand.canonicalOrigin,
              { telephone: phone },
            )}
          />
          <AdsTrackingPixels />
          <Suspense fallback={null}>
            <UtmCapture />
          </Suspense>
          <Suspense fallback={null}>
            <MarketingChromeGate>
              {agentSignature && agentSignatureView ? (
                <AgentSignatureHeader view={agentSignatureView} />
              ) : teamSignature && teamSignatureView ? (
                <TeamSignatureHeader
                  view={teamSignatureView}
                  previewBarActive={Boolean(
                    chromeBrand.templatePreview?.active,
                  )}
                />
              ) : (
                <SiteHeader chromeBrand={chromeBrand} />
              )}
            </MarketingChromeGate>
          </Suspense>
          <Suspense fallback={null}>
            <MarketingBelowHeader cities={cities} chromeBrand={chromeBrand}>
              {children}
            </MarketingBelowHeader>
          </Suspense>
          <Suspense fallback={null}>
            <MarketingChromeGate>
              <RoutePlannerFloatingChip />
              <ScrollToTopButton />
              <MobileBottomNav cities={cities} chromeBrand={chromeBrand} />
            </MarketingChromeGate>
          </Suspense>
          <ListingSheetHostLazy />
        </div>
      </TemplatePresentationProvider>
    </TenantBrandProvider>
  );
}
