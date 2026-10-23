import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RoyalCollectionSyntheticPreview } from "@/components/templates/royal-collection-one/RoyalCollectionSyntheticPreview";
import { resolveMarketingTenancy } from "@/lib/tenancy/resolve-marketing-tenancy";
import { highOctaneStagingPropertyConceptAllowed } from "@/lib/tenancy/templates/high-octane-staging-property-concept";
import {
  ROYAL_COLLECTION_SYNTHETIC_BANNER,
  resolveRoyalCollectionSyntheticCase,
} from "@/lib/tenancy/templates/royal-collection-synthetic-preview";

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ case?: string[] }>;
}): Promise<Metadata> {
  const { case: parts } = await params;
  if (!(await harnessAllowed()) || !resolveRoyalCollectionSyntheticCase(parts)) {
    return {
      title: "Not found",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: { absolute: ROYAL_COLLECTION_SYNTHETIC_BANNER },
    description: "Staging synthetic preview. This is not an MLS listing.",
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
  };
}

export default async function HighOctaneSyntheticPropertyPreviewPage({
  params,
}: {
  params: Promise<{ case?: string[] }>;
}) {
  if (!(await harnessAllowed())) notFound();
  const { case: parts } = await params;
  const caseId = resolveRoyalCollectionSyntheticCase(parts);
  if (!caseId) notFound();
  return <RoyalCollectionSyntheticPreview caseId={caseId} />;
}
