import { SITE_URL } from "@/lib/constants";

/** UTM campaign stamped on listing / search links in property-alert emails. */
export const PROPERTY_ALERT_UTM_CAMPAIGN = "property_alert";

export function withPropertyAlertUtm(
  href: string,
  content?: string | null,
): string {
  const url = href.startsWith("http")
    ? new URL(href)
    : new URL(href, SITE_URL);
  url.searchParams.set("utm_source", "houzzat");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_campaign", PROPERTY_ALERT_UTM_CAMPAIGN);
  if (content?.trim()) {
    url.searchParams.set("utm_content", content.trim().slice(0, 80));
  }
  return url.toString();
}

export function isPropertyAlertUtmCampaign(
  campaign: string | null | undefined,
): boolean {
  return campaign === PROPERTY_ALERT_UTM_CAMPAIGN;
}

export function pathLooksLikePropertyAlert(
  path: string | null | undefined,
): boolean {
  if (!path) return false;
  return (
    path.includes("utm_campaign=property_alert") ||
    path.includes("utm_campaign%3Dproperty_alert")
  );
}
