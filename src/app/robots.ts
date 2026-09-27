import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";
import { resolveMarketingCanonicalOrigin } from "@/lib/tenancy/marketing-page-metadata";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const canonicalOrigin = await resolveMarketingCanonicalOrigin();
  const siteUrl = (canonicalOrigin ?? SITE_URL).replace(/\/$/, "");

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/agent/",
        "/account/",
        "/api/",
        "/owner/",
        "/share/",
        "/cma/",
        "/partners/portal/",
        "/route-planner/share/",
        "/viewings/share/",
        "/r/",
        "/coming-soon",
        "/home-preview",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
