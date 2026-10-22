import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AreaSeoPage } from "@/components/areas/AreaSeoPage";
import {
  buildAreaPageCopy,
  resolveHomesForSalePlace,
} from "@/lib/geo/area-seo";
import { getMarketPulse } from "@/lib/market/pulse";
import { prisma } from "@/lib/prisma";
import { buildMarketingPageMetadata } from "@/lib/tenancy/marketing-page-metadata";
import { withStagingSnapshotBoundary } from "@/lib/tenancy/templates/high-octane-staging-snapshot";
import { stagingSnapshotVisibleForServerPage } from "@/lib/tenancy/templates/high-octane-staging-snapshot-request";

type Params = { params: Promise<{ city: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { city: citySlug } = await params;
  const place = await resolveHomesForSalePlace({ citySlug });
  if (!place) return { title: "Homes for sale" };

  const stagingSnapshotVisible = await stagingSnapshotVisibleForServerPage();
  const [activeCount, pulse] = await Promise.all([
    prisma.listing.count({
      where: withStagingSnapshotBoundary(
        {
          status: "ACTIVE",
          segment: { in: ["RESIDENTIAL", "COMMERCIAL"] },
          city: { equals: place.city, mode: "insensitive" },
        },
        stagingSnapshotVisible,
      ),
    }),
    getMarketPulse({ city: place.city, includeSold: false }),
  ]);
  const copy = buildAreaPageCopy({
    place,
    activeCount,
    pulse,
    amenityCounts: {},
  });

  return buildMarketingPageMetadata({
    title: copy.h1,
    description: copy.metaDescription,
    path: place.path,
  });
}

export default async function CityHomesForSalePage({ params }: Params) {
  const { city: citySlug } = await params;
  const place = await resolveHomesForSalePlace({ citySlug });
  if (!place) notFound();
  return <AreaSeoPage place={place} />;
}
