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

type Params = { params: Promise<{ city: string; community: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { city: citySlug, community: communitySlug } = await params;
  const place = await resolveHomesForSalePlace({ citySlug, communitySlug });
  if (!place) return { title: "Homes for sale" };

  const [activeCount, pulse] = await Promise.all([
    prisma.listing.count({
      where: {
        status: "ACTIVE",
        segment: { in: ["RESIDENTIAL", "COMMERCIAL"] },
        city: { equals: place.city, mode: "insensitive" },
        community: {
          equals: place.community ?? undefined,
          mode: "insensitive",
        },
      },
    }),
    getMarketPulse({
      city: place.city,
      community: place.community,
      includeSold: false,
    }),
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

export default async function CommunityHomesForSalePage({ params }: Params) {
  const { city: citySlug, community: communitySlug } = await params;
  const place = await resolveHomesForSalePlace({ citySlug, communitySlug });
  if (!place) notFound();
  return <AreaSeoPage place={place} />;
}
