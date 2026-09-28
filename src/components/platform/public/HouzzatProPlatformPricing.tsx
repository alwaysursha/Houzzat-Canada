import { PublicSiteFrame } from "@/components/platform/public/site/PublicSiteFrame";
import { PublicStoryView } from "@/components/platform/public/site/PublicStoryView";
import { publicStory } from "@/components/platform/public/site/public-stories";

/** HouzzatPRO /pricing — private proposal, no public dollar amounts. */
export function HouzzatProPlatformPricing() {
  return (
    <PublicSiteFrame pathname="/pricing">
      <PublicStoryView story={publicStory("/pricing")} />
    </PublicSiteFrame>
  );
}
