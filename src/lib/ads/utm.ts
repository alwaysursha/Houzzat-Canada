export type UtmParams = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
};

export function pickUtm(
  input: Record<string, unknown> | null | undefined,
): UtmParams {
  if (!input) return {};
  const str = (key: string) => {
    const v = input[key];
    return typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : undefined;
  };
  return {
    utmSource: str("utmSource") ?? str("utm_source"),
    utmMedium: str("utmMedium") ?? str("utm_medium"),
    utmCampaign: str("utmCampaign") ?? str("utm_campaign"),
    utmContent: str("utmContent") ?? str("utm_content"),
  };
}

/** Client helper: read UTM from current URL search params. */
export function readUtmFromSearchParams(
  params: URLSearchParams,
): UtmParams {
  return {
    utmSource: params.get("utm_source") ?? undefined,
    utmMedium: params.get("utm_medium") ?? undefined,
    utmCampaign: params.get("utm_campaign") ?? undefined,
    utmContent: params.get("utm_content") ?? undefined,
  };
}
