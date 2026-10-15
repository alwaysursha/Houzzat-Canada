import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PropertyProfileView } from "@/components/property/PropertyProfileView";
import { loadPropertyProfile } from "@/lib/property-address/load-property-profile";
import { isOffMarketPropertySearchEnabled } from "@/lib/property-address/feature-flag";
import { resolveListingEntitlementContextForServerPage } from "@/lib/tenancy/listing-entitlement";
import { buildMarketingPageMetadata } from "@/lib/tenancy/marketing-page-metadata";
import { resolveMarketingPresentationBrand } from "@/lib/tenancy/resolve-marketing-tenancy";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  if (!isOffMarketPropertySearchEnabled()) {
    return { title: "Property", robots: { index: false, follow: false } };
  }
  const { slug } = await params;
  const sp = await searchParams;
  const address =
    typeof sp.address === "string"
      ? sp.address
      : Array.isArray(sp.address)
        ? sp.address[0]
        : null;
  const title = address?.trim() || slug.replace(/-/g, " ");
  const meta = await buildMarketingPageMetadata({
    title: `${title} | Property`,
    description:
      "Property information for this Ontario address. Claim your address if you are exploring a sale.",
    path: `/property/${slug}`,
  });
  return { ...meta, robots: { index: false, follow: false } };
}

export default async function PropertyProfilePage({
  params,
  searchParams,
}: PageProps) {
  if (!isOffMarketPropertySearchEnabled()) {
    notFound();
  }

  const { slug } = await params;
  const sp = await searchParams;
  const { entitlement } =
    await resolveListingEntitlementContextForServerPage();

  const loaded = await loadPropertyProfile({
    slug,
    searchParams: sp,
    entitlement,
  });

  switch (loaded.kind) {
    case "disabled":
      notFound();
      break;
    case "redirect_listing":
      redirect(loaded.href);
      break;
    case "redirect_canonical":
      redirect(loaded.href);
      break;
    case "unresolvable":
      return (
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="font-display text-2xl font-semibold text-ink">
            Address not available
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink/65">
            {loaded.message}
          </p>
          <Link
            href="/search"
            className="mt-8 inline-flex rounded-lg bg-canopy px-5 py-2.5 text-sm font-semibold text-white"
          >
            Back to search
          </Link>
        </main>
      );
    case "ok": {
      const brand = await resolveMarketingPresentationBrand();
      return (
        <PropertyProfileView
          profile={loaded.profile}
          brandName={brand?.displayName ?? "Houzzat"}
        />
      );
    }
    default: {
      const _exhaustive: never = loaded;
      return _exhaustive;
    }
  }
}
