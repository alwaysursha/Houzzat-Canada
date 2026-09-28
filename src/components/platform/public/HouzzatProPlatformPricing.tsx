import { PublicSiteFrame } from "@/components/platform/public/site/PublicSiteFrame";
import { HouzzatProPlansExperience } from "@/components/platform/public/HouzzatProPlansExperience";

/** HouzzatPRO /pricing — catalog packages, no public dollar amounts. */
export function HouzzatProPlatformPricing() {
  return (
    <PublicSiteFrame pathname="/pricing">
      <HouzzatProPlansExperience />
    </PublicSiteFrame>
  );
}
