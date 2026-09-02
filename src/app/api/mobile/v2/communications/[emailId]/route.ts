/**
 * Stage 5.8 — GET /api/mobile/v2/communications/[emailId]
 *
 * Global communication detail for a LeadEmailLog row.
 * Authorization: workspace membership + lead read-scope (same as Conversations).
 */

import { NextResponse } from "next/server";
import { authorizeMobileLeadAccess } from "@/lib/mobile/v2/lead-access";
import { authorizeMobileWorkspaceAccess } from "@/lib/mobile/v2/workspace-access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ emailId: string }> },
) {
  try {
    const ws = await authorizeMobileWorkspaceAccess(request);
    if (!ws.ok) {
      return NextResponse.json(
        { ok: false, code: ws.code, message: ws.message },
        { status: ws.status },
      );
    }

    const { emailId } = await context.params;
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
        workspaceId: true,
        lead: {
          select: {
            id: true,
            workspaceId: true,
            contactConsentAt: true,
            customer: {
              select: {
                name: true,
                email: true,
                caslConsentAt: true,
                emailAlertsEnabled: true,
              },
            },
          },
        },
        sentBy: { select: { name: true, email: true } },
      },
    });

    if (!email || email.lead.workspaceId !== ws.workspaceId) {
      return NextResponse.json(
        {
          ok: false,
          code: "COMMUNICATION_NOT_FOUND",
          message: "Communication not found",
        },
        { status: 404 },
      );
    }

    // Re-check lead visibility (AGENT: assigned + pond only).
    const leadAccess = await authorizeMobileLeadAccess(request, email.leadId);
    if (!leadAccess.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: "COMMUNICATION_NOT_FOUND",
          message: "Communication not found",
        },
        { status: 404 },
      );
    }

    const consented = Boolean(
      email.lead.contactConsentAt || email.lead.customer?.caslConsentAt,
    );

    return NextResponse.json({
      ok: true,
      data: {
        communication: {
          id: email.id,
          channel: "email" as const,
          direction: "outbound" as const,
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
          customerEmail: email.lead.customer?.email ?? null,
          sentByName: email.sentBy?.name || email.sentBy?.email || null,
        },
        composer: {
          toEmail: email.lead.customer?.email ?? null,
          consented,
          alertsEnabled: email.lead.customer?.emailAlertsEnabled !== false,
        },
        meta: {
          mode: "outbound_email_activity",
          inboundEmailCanonical: false,
        },
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
