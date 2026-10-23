import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RoyalCollectionSyntheticSearch } from "@/components/templates/royal-collection-one/RoyalCollectionSyntheticSearch";
import { resolveMarketingTenancy } from "@/lib/tenancy/resolve-marketing-tenancy";
import { highOctaneStagingPropertyConceptAllowed } from "@/lib/tenancy/templates/high-octane-staging-property-concept";

/** Hostname and the staging process gate decide access. */
export const dynamic = "force-dynamic";

async function harnessAllowed(): Promise<boolean> {
  const tenancy = await resolveMarketingTenancy();
  if (!tenancy) return false;
  return highOctaneStagingPropertyConceptAllowed({
    workspaceSlug: tenancy.workspaceSlug,
    hostname: tenancy.hostname,
  });
}

export async function generateMetadata(): Promise<Metadata> {
  if (!(await harnessAllowed())) {
    return {
      title: "Not found",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: { absolute: "SYNTHETIC TEST DATA — NOT MLS LISTINGS" },
    description: "Staging synthetic search cards. These are not MLS listings.",
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
  };
}

export default async function HighOctaneSyntheticSearchPage() {
  if (!(await harnessAllowed())) notFound();
  return <RoyalCollectionSyntheticSearch />;
}
