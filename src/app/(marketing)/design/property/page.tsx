import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RoyalCollectionPropertyDemonstration } from "@/components/templates/royal-collection-one/RoyalCollectionPropertyDemonstration";
import { resolveMarketingTenancy } from "@/lib/tenancy/resolve-marketing-tenancy";
import { highOctaneStagingPropertyConceptAllowed } from "@/lib/tenancy/templates/high-octane-staging-property-concept";

/** Hostname and the staging process gate decide access. */
export const dynamic = "force-dynamic";

async function conceptAllowed(): Promise<boolean> {
  const tenancy = await resolveMarketingTenancy();
  if (!tenancy) return false;
  return highOctaneStagingPropertyConceptAllowed({
    workspaceSlug: tenancy.workspaceSlug,
    hostname: tenancy.hostname,
  });
}

export async function generateMetadata(): Promise<Metadata> {
  if (!(await conceptAllowed())) {
    return {
      title: "Not found",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: { absolute: "HIGH OCTANE Real Estate — Property Concept" },
    description: "Staging design concept. This is not an MLS listing.",
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
  };
}

export default async function HighOctaneStagingPropertyConceptPage() {
  if (!(await conceptAllowed())) notFound();
  return <RoyalCollectionPropertyDemonstration />;
}
