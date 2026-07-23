import { NextResponse } from "next/server";
import { requireAgentUser } from "@/lib/agent";
import { isAdminRole } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/**
 * Layer 2 stub — would call Meta Marketing API / Google Ads API
 * to create Draft/Paused campaigns. Never enables spend.
 */
export async function POST(_request: Request, { params }: Params) {
  const user = await requireAgentUser();
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const campaign = await prisma.adCampaign.findUnique({
    where: { id },
    include: { creatives: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const connections = await prisma.adAccountConnection.findMany();
  const metaReady = connections.some(
    (c) => c.provider === "meta" && c.status === "connected",
  );
  const googleReady = connections.some(
    (c) => c.provider === "google" && c.status === "connected",
  );

  if (!metaReady && !googleReady) {
    await prisma.adCampaign.update({
      where: { id },
      data: { status: "PUBLISH_STUB" },
    });
    return NextResponse.json({
      ok: false,
      stub: true,
      message:
        "No Meta/Google ad accounts connected. Campaign marked publish-stub. Connect OAuth in a later release, then push Draft/Paused only.",
      checklist: [
        "Export CSV and paste into Ads Manager / Google Ads today",
        "Wire Meta Marketing API + Google Ads API OAuth when ready",
        "Always create Draft/Paused — never auto-enable spend",
      ],
    });
  }

  return NextResponse.json({
    ok: true,
    stub: true,
    message:
      "Account connected flag present, but live publish is not enabled in this environment. Use export for now.",
  });
}
