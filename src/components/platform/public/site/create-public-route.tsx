import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicSiteFrame } from "@/components/platform/public/site/PublicSiteFrame";
import { PublicStoryView } from "@/components/platform/public/site/PublicStoryView";
import { publicStory } from "@/components/platform/public/site/public-stories";
import {
  HOUZZATPRO_MARKETING_ORIGIN,
  isHouzzatProPlatformApexRequest,
  type OwnedChromePath,
} from "@/lib/platform/public/public-site-paths";

export function createPublicRoute(path: OwnedChromePath) {
  return {
    async generateMetadata(): Promise<Metadata> {
      if (!(await isHouzzatProPlatformApexRequest())) {
        return { title: "Not found", robots: { index: false, follow: false } };
      }
      const story = publicStory(path);
      const canonical = `${HOUZZATPRO_MARKETING_ORIGIN}${path}`;
      return {
        title: story.title,
        description: story.description,
        alternates: { canonical },
        robots: { index: true, follow: true },
        openGraph: {
          title: story.title,
          description: story.description,
          url: canonical,
          siteName: "HouzzatPRO",
          type: "website",
        },
      };
    },
    async Page() {
      if (!(await isHouzzatProPlatformApexRequest())) notFound();
      const story = publicStory(path);
      return (
        <PublicSiteFrame pathname={path}>
          <PublicStoryView story={story} />
        </PublicSiteFrame>
      );
    },
  };
}
