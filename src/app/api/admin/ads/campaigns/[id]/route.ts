import { NextResponse } from "next/server";
import { creativesToCsv, type GeneratedCreativePack } from "@/lib/ads/generate";
import { requireAgentUser } from "@/lib/agent";
import { isAdminRole } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await requireAgentUser();
  if (!user || !isAdminRole(user.role)) return null;
  return user;
}

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const campaign = await prisma.adCampaign.findUnique({
    where: { id },
    include: {
      creatives: true,
      _count: { select: { leads: true } },
    },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "json";

  if (format === "csv") {
    const meta = campaign.creatives.find((c) => c.platform === "META");
    const google = campaign.creatives.find((c) => c.platform === "GOOGLE");
    const pack: GeneratedCreativePack = {
      destinationUrl: campaign.destinationUrl,
      utm: {
        utm_source: campaign.utmSource ?? "meta",
        utm_medium: campaign.utmMedium ?? "paid",
        utm_campaign: campaign.utmCampaign ?? campaign.id,
        utm_content: campaign.utmContent ?? "",
      },
      complianceNotes: campaign.complianceNotes,
      meta: {
        headlines: meta?.headlines ?? [],
        primaryTexts: meta?.primaryTexts ?? [],
        descriptions: meta?.descriptions ?? [],
      },
      google: {
        headlines: google?.headlines ?? [],
        descriptions: google?.descriptions ?? [],
      },
      imagePresets: [],
    };
    const csv = creativesToCsv(pack);
    await prisma.adCampaign.update({
      where: { id },
      data: { status: "EXPORTED" },
    });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="houzzat-ad-${id}.csv"`,
      },
    });
  }

  return NextResponse.json({ item: campaign });
}

export async function DELETE(_request: Request, { params }: Params) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  await prisma.adCampaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
