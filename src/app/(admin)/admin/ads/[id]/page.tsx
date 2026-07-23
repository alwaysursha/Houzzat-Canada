import { notFound } from "next/navigation";
import { AdCampaignDetailClient } from "@/components/admin/AdCampaignDetailClient";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  const campaign = await prisma.adCampaign.findUnique({ where: { id } });
  return { title: campaign?.name ?? "Campaign" };
}

export default async function AdminAdCampaignPage({ params }: Params) {
  const { id } = await params;
  const campaign = await prisma.adCampaign.findUnique({
    where: { id },
    include: {
      creatives: true,
      _count: { select: { leads: true } },
    },
  });
  if (!campaign) notFound();

  return <AdCampaignDetailClient initial={campaign} />;
}
