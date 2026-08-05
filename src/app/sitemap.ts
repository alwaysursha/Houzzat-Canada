import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";
import { listingPath } from "@/lib/listings/listing-path";
import { prisma } from "@/lib/prisma";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [listings, areas, landings] = await Promise.all([
    prisma.listing.findMany({
      where: { status: "ACTIVE" },
      select: {
        mlsNumber: true,
        addressLine: true,
        unitNumber: true,
        city: true,
        updatedAt: true,
      },
      take: 500,
    }),
    prisma.geoPlace.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true },
    }),
    prisma.landingPage.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true },
    }),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    "",
    "/search",
    "/open-houses",
    "/areas",
    "/home-valuation",
    "/tools/affordability",
    "/tools/seller-readiness",
    "/partners",
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "daily",
    priority: path === "" ? 1 : 0.7,
  }));

  return [
    ...staticRoutes,
    ...listings.map((l) => ({
      url: `${SITE_URL}${listingPath(l)}`,
      lastModified: l.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...areas.map((a) => ({
      url: `${SITE_URL}/areas/${a.slug}`,
      lastModified: a.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...landings.map((l) => ({
      url: `${SITE_URL}/lp/${l.slug}`,
      lastModified: l.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
