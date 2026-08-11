import { SiteHeaderClient } from "@/components/site/SiteHeaderClient";
import { SITE_NAME } from "@/lib/constants";

/** Marketing header shell — session/portal resolved client-side via useSession. */
export function SiteHeader() {
  return <SiteHeaderClient siteName={SITE_NAME} />;
}
