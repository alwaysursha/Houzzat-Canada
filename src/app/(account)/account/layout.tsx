import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountVerifiedSuccessSlot } from "@/components/account/AccountVerifiedSuccessSlot";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { MobileBottomNav } from "@/components/site/MobileBottomNav";
import { ListingSheetHostLazy } from "@/components/mobile/ListingSheetHostLazy";
import { TenantBrandProvider } from "@/components/tenancy/TenantBrandProvider";
import { TenantThemeStyle } from "@/components/tenancy/TenantThemeStyle";
import { requireCustomerUser } from "@/lib/account";
import { auth } from "@/lib/auth";
import { isDatabaseUnavailableError } from "@/lib/errors";
import { getRequestAppShell } from "@/lib/mobile/app-shell-server";
import { shouldRedirectStaffAccountToCrm } from "@/lib/mobile/app-shell";
import { tenantAccountLabel } from "@/lib/tenancy/marketing-presentation-brand";
import { resolveCanonicalPublicOrigin } from "@/lib/tenancy/canonical-public-origin";
import {
  resolveMarketingPresentationBrand,
  resolveMarketingTenancy,
} from "@/lib/tenancy/resolve-marketing-tenancy";
import { buildMarketingRootMetadata } from "@/lib/tenancy/tenant-seo";
import { PLATFORM_SUSPENDED_DOCUMENT_TITLE } from "@/lib/platform/status";
import { resolvePlatformSuspendedHost } from "@/lib/platform/status/resolve-suspended-host";
import { PlatformSuspendedPage } from "@/components/platform/status/PlatformSuspendedPage";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  if (await resolvePlatformSuspendedHost()) {
    return {
      title: PLATFORM_SUSPENDED_DOCUMENT_TITLE,
      robots: { index: false, follow: false },
    };
  }
  const tenancy = await resolveMarketingTenancy();
  if (!tenancy) {
    return { title: "Account" };
  }
  const canonicalOrigin = await resolveCanonicalPublicOrigin(
    tenancy.workspaceId,
    tenancy.hostname,
    tenancy.origin.startsWith("http://") ? "http:" : "https:",
  );
  const root = buildMarketingRootMetadata(tenancy, canonicalOrigin);
  return {
    ...root,
    title: {
      default: `Account | ${tenancy.brand.displayName}`,
      template: `%s | ${tenancy.brand.displayName}`,
    },
  };
}

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (await resolvePlatformSuspendedHost()) {
    return <PlatformSuspendedPage />;
  }

  let session;
  try {
    session = await auth();
  } catch (error) {
    console.error("[account-layout] auth failed", error);
    throw error;
  }

  if (!session?.user) {
    redirect("/auth/sign-in?callbackUrl=/account");
  }

  let customer;
  try {
    customer = await requireCustomerUser();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) throw error;
    console.error("[account-layout] customer load failed", error);
    throw error;
  }

  if (!customer) {
    redirect("/auth/sign-out");
  }

  if (shouldRedirectStaffAccountToCrm(await getRequestAppShell())) {
    if (session.user.role === "ADMIN") {
      redirect("/admin");
    }
    if (session.user.role === "AGENT") {
      redirect("/agent");
    }
  }

  const chromeBrand = await resolveMarketingPresentationBrand();

  const nav = [
    {
      href: "/account",
      label: chromeBrand ? tenantAccountLabel(chromeBrand) : "Your account",
    },
    { href: "/account/notifications", label: "Notifications" },
    { href: "/route-planner", label: "Route Planner" },
    { href: "/account/saved", label: "Saved" },
    { href: "/account/notes", label: "Notes" },
    { href: "/account/searches", label: "Searches" },
    { href: "/account/watchlist", label: "Watchlist" },
    { href: "/account/activity", label: "Activity" },
    { href: "/search", label: "Search" },
    { href: "/", label: "Home" },
  ];

  const displayName = chromeBrand?.displayName ?? "Account";
  const primaryColor = chromeBrand?.colors.primary ?? "#1A7B59";

  const shell = (
    <div className="min-h-full bg-mist">
      <header className="sticky top-0 z-40">
        <div
          aria-hidden
          className="[height:env(safe-area-inset-top,0px)]"
          style={{ backgroundColor: primaryColor }}
        />
        <div className="border-b border-line/80 bg-mist/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div>
              <Link href="/" className="font-display text-2xl text-ink">
                {displayName}
              </Link>
              <p className="text-xs uppercase tracking-[0.14em] text-ink/45">
                {chromeBrand
                  ? tenantAccountLabel(chromeBrand)
                  : "Your account"}
              </p>
            </div>
            <nav className="hidden flex-wrap items-center gap-3 text-sm font-medium md:flex">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-ink/70 transition hover:text-canopy"
                >
                  {item.label}
                </Link>
              ))}
              <SignOutButton className="ml-1 border-l border-line pl-3" />
            </nav>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 pb-[calc(2.5rem+var(--mobile-bottom-nav,0px))] sm:px-6 md:pb-10">
        <AccountVerifiedSuccessSlot />
        {children}
      </main>
      <MobileBottomNav chromeBrand={chromeBrand ?? undefined} />
    </div>
  );

  if (!chromeBrand) {
    return shell;
  }

  return (
    <TenantBrandProvider brand={chromeBrand}>
      <TenantThemeStyle
        colors={chromeBrand.colors}
        isHouzzatWorkspace={chromeBrand.isHouzzatWorkspace}
      />
      {shell}
      <ListingSheetHostLazy />
    </TenantBrandProvider>
  );
}
