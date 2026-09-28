import Link from "next/link";
import { PublicSiteFrame } from "@/components/platform/public/site/PublicSiteFrame";
import { PublicStoryView } from "@/components/platform/public/site/PublicStoryView";
import { publicStory } from "@/components/platform/public/site/public-stories";

/** HouzzatPRO /pricing — private proposal, no public dollar amounts. */
export function HouzzatProPlatformPricing() {
  return (
    <PublicSiteFrame pathname="/pricing">
      <PublicStoryView story={publicStory("/pricing")} />
      <section className="hp-pub-band">
        <p className="hp-pub-lead">
          Existing customers sign in from the header. New conversations start with a demo.
        </p>
        <Link href="/book-a-demo" className="hp-pub-primary">
          Book a Demo
        </Link>
      </section>
    </PublicSiteFrame>
  );
}
