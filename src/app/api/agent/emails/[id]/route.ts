import { NextResponse } from "next/server";
import { canAccessLead, requireAgentContextFromRequest } from "@/lib/agent";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const email = await prisma.leadEmailLog.findUnique({
      where: { id },
      select: {
        id: true,
        subject: true,
        body: true,
        htmlBody: true,
        toEmail: true,
        kind: true,
        mlsNumber: true,
        openedAt: true,
        openCount: true,
        clickedAt: true,
        clickCount: true,
        lastClickedUrl: true,
        createdAt: true,
        leadId: true,
        lead: {
          select: {
            id: true,
            organizationId: true,
            workspaceId: true,
            assignedAgentId: true,
            customer: { select: { name: true, email: true } },
          },
        },
        sentBy: { select: { name: true, email: true } },
      },
    });

    if (!email || !canAccessLead(ctx, email.lead)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: email.id,
      subject: email.subject,
      body: email.body,
      htmlBody: email.htmlBody,
      toEmail: email.toEmail,
      kind: email.kind,
      mlsNumber: email.mlsNumber,
      openedAt: email.openedAt?.toISOString() ?? null,
      openCount: email.openCount,
      clickedAt: email.clickedAt?.toISOString() ?? null,
      clickCount: email.clickCount,
      lastClickedUrl: email.lastClickedUrl,
      createdAt: email.createdAt.toISOString(),
      leadId: email.leadId,
      customerName: email.lead.customer?.name ?? null,
      sentByName: email.sentBy?.name || email.sentBy?.email || null,
    });
  } catch (err) {
    console.error("[agent/emails]", err);
    const message =
      err instanceof Error ? err.message : "Failed to load email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
