import { prisma } from "@/lib/prisma";
import type { UtmParams } from "@/lib/ads/utm";

export async function resolveAdCampaignId(
  utm: UtmParams,
): Promise<string | undefined> {
  if (!utm.utmCampaign) return undefined;
  const campaign = await prisma.adCampaign.findFirst({
    where: { utmCampaign: utm.utmCampaign },
    select: { id: true },
  });
  return campaign?.id;
}

export function utmLeadFields(utm: UtmParams, adCampaignId?: string) {
  return {
    utmSource: utm.utmSource,
    utmMedium: utm.utmMedium,
    utmCampaign: utm.utmCampaign,
    utmContent: utm.utmContent,
    adCampaignId,
  };
}
