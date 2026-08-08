import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

export default function robots(): MetadataRoute.Robots {
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
        "/r/",
        "/coming-soon",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
