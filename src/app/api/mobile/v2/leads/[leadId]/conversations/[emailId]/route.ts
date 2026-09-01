/**
 * Stage 4.8 — GET /api/mobile/v2/leads/[leadId]/conversations/[emailId]
 *
 * Preview payload matching GET /api/agent/emails/[id] (htmlBody for native template).
 */

import { NextResponse } from "next/server";
import { authorizeMobileLeadAccess } from "@/lib/mobile/v2/lead-access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ leadId: string; emailId: string }> },
) {
  try {
    const { leadId, emailId } = await context.params;
    const access = await authorizeMobileLeadAccess(request, leadId);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    if (!emailId) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Missing emailId" },
        { status: 400 },
      );
    }

    const email = await prisma.leadEmailLog.findUnique({
      where: { id: emailId },
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
            customer: { select: { name: true, email: true } },
          },
        },
        sentBy: { select: { name: true, email: true } },
      },
    });

    if (!email || email.leadId !== access.lead.id) {
      return NextResponse.json(
        {
          ok: false,
          code: "EMAIL_NOT_FOUND",
          message: "Email not found for this lead",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      email: {
        id: email.id,
        subject: email.subject,
        body: email.body,
        htmlBody: email.htmlBody,
        toEmail: email.toEmail,
        kind: email.kind,
        mlsNumber: email.mlsNumber,
        openedAt: email.openedAt ? email.openedAt.toISOString() : null,
        openCount: email.openCount,
        clickedAt: email.clickedAt ? email.clickedAt.toISOString() : null,
        clickCount: email.clickCount,
        lastClickedUrl: email.lastClickedUrl,
        createdAt: email.createdAt.toISOString(),
        leadId: email.leadId,
        customerName: email.lead.customer?.name ?? null,
        sentByName: email.sentBy?.name || email.sentBy?.email || null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
