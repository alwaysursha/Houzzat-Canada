import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";
import { homesForSalePath } from "@/lib/geo/area-seo";
import { listingPath } from "@/lib/listings/listing-path";
import { prisma } from "@/lib/prisma";
import { resolveMarketingCanonicalOrigin } from "@/lib/tenancy/marketing-page-metadata";

/** Google allows 50k URLs/file; keep headroom for static + area rows. */
const LISTING_CHUNK = 4_000;

export async function generateSitemaps() {
  try {
    const count = await prisma.listing.count({ where: { status: "ACTIVE" } });
    const chunks = Math.max(1, Math.ceil(count / LISTING_CHUNK));
    return Array.from({ length: chunks }, (_, id) => ({ id }));
  } catch (error) {
    console.error("[sitemap] generateSitemaps failed; using a single chunk", error);
    return [{ id: 0 }];
  }
}

export default async function sitemap(props: {
  id: Promise<string> | string | number;
}): Promise<MetadataRoute.Sitemap> {
  const id = Number(await Promise.resolve(props.id));
  const chunk = Number.isFinite(id) && id >= 0 ? Math.floor(id) : 0;
  const skip = chunk * LISTING_CHUNK;
  const canonicalOrigin = await resolveMarketingCanonicalOrigin();
  const siteUrl = (canonicalOrigin ?? SITE_URL).replace(/\/$/, "");

  try {
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
        orderBy: { updatedAt: "desc" },
        skip,
        take: LISTING_CHUNK,
      }),
      chunk === 0
        ? prisma.geoPlace.findMany({
            where: { published: true },
            select: {
              city: true,
              community: true,
              updatedAt: true,
            },
          })
        : Promise.resolve([]),
      chunk === 0
        ? prisma.landingPage.findMany({
            where: { published: true },
            select: { slug: true, updatedAt: true },
          })
        : Promise.resolve([]),
    ]);

    const staticRoutes: MetadataRoute.Sitemap =
      chunk === 0
        ? [
            "",
            "/search",
            "/open-houses",
            "/areas",
            "/home-valuation",
            "/tools/affordability",
            "/tools/seller-readiness",
            "/partners",
            "/route-planner",
          ].map((path) => ({
            url: `${siteUrl}${path}`,
            changeFrequency: "daily" as const,
            priority: path === "" ? 1 : 0.7,
          }))
        : [];

    return [
      ...staticRoutes,
      ...listings.map((l) => ({
        url: `${siteUrl}${listingPath(l)}`,
        lastModified: l.updatedAt,
        changeFrequency: "daily" as const,
        priority: 0.8,
      })),
      ...areas.map((a) => ({
        url: `${siteUrl}${homesForSalePath({
          city: a.city,
          community: a.community,
        })}`,
        lastModified: a.updatedAt,
        changeFrequency: "daily" as const,
        priority: a.community ? 0.65 : 0.75,
      })),
      ...landings.map((l) => ({
        url: `${siteUrl}/lp/${l.slug}`,
        lastModified: l.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      })),
    ];
  } catch (error) {
    console.error("[sitemap] sitemap() failed; returning an empty chunk", error);
    return [];
  }
}
