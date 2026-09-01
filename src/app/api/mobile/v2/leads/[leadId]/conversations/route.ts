/**
 * Stage 4.8 — GET/POST /api/mobile/v2/leads/[leadId]/conversations
 *
 * Web Lead Detail "Conversations" = LeadEmailLog list + LeadEmailForm send.
 * Same canonical records as web (no Conversation/Message tables).
 *
 * HTTP-mode safe: reuses sendAndLogClientEmail (sequential send → log → activity).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { sendAndLogClientEmail } from "@/lib/email/client-send";
import { renderAgentMessageEmail } from "@/lib/email/templates";
import { authorizeMobileLeadAccess } from "@/lib/mobile/v2/lead-access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const PAGE_SIZE = 40;

const sendSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
});

function formatEmail(e: {
  id: string;
  subject: string;
  body: string;
  toEmail: string;
  kind: string;
  openedAt: Date | null;
  clickedAt: Date | null;
  openCount: number;
  clickCount: number;
  lastClickedUrl: string | null;
  createdAt: Date;
}) {
  return {
    id: e.id,
    subject: e.subject,
    body: e.body,
    toEmail: e.toEmail,
    kind: e.kind,
    openedAt: e.openedAt ? e.openedAt.toISOString() : null,
    clickedAt: e.clickedAt ? e.clickedAt.toISOString() : null,
    openCount: e.openCount,
    clickCount: e.clickCount,
    lastClickedUrl: e.lastClickedUrl,
    createdAt: e.createdAt.toISOString(),
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ leadId: string }> },
) {
  try {
    const { leadId } = await context.params;
    const access = await authorizeMobileLeadAccess(request, leadId);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    let cursorDate: Date | null = null;
    if (cursor) {
      cursorDate = new Date(cursor);
      if (Number.isNaN(cursorDate.getTime())) {
        return NextResponse.json(
          { ok: false, code: "VALIDATION_ERROR", message: "Invalid cursor" },
          { status: 400 },
        );
      }
    }
    const limitRaw = Number(url.searchParams.get("limit") || PAGE_SIZE);
    const limit = Math.min(
      Math.max(Number.isFinite(limitRaw) ? limitRaw : PAGE_SIZE, 1),
      PAGE_SIZE,
    );

    // Canonical web: lead.emailLogs by leadId after lead auth, createdAt desc, take 40.
    const emails = await prisma.leadEmailLog.findMany({
      where: {
        leadId: access.lead.id,
        ...(cursorDate
          ? {
              createdAt: { lt: cursorDate },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      select: {
        id: true,
        subject: true,
        body: true,
        toEmail: true,
        kind: true,
        openedAt: true,
        clickedAt: true,
        openCount: true,
        clickCount: true,
        lastClickedUrl: true,
        createdAt: true,
      },
    });

    const hasMore = emails.length > limit;
    const page = hasMore ? emails.slice(0, limit) : emails;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.createdAt.toISOString()
        : null;

    const lead = await prisma.lead.findUnique({
      where: { id: access.lead.id },
      select: {
        contactConsentAt: true,
        customer: {
          select: {
            email: true,
            caslConsentAt: true,
            emailAlertsEnabled: true,
          },
        },
      },
    });

    const consented = Boolean(
      lead?.contactConsentAt || lead?.customer?.caslConsentAt,
    );

    return NextResponse.json({
      ok: true,
      emails: page.map(formatEmail),
      nextCursor,
      hasMore,
      composer: {
        toEmail: lead?.customer?.email ?? null,
        consented,
        alertsEnabled: lead?.customer?.emailAlertsEnabled !== false,
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

export async function POST(
  request: Request,
  context: { params: Promise<{ leadId: string }> },
) {
  try {
    const { leadId } = await context.params;
    const access = await authorizeMobileLeadAccess(request, leadId);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const parsed = sendSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Invalid email payload",
        },
        { status: 400 },
      );
    }

    const lead = await prisma.lead.findUnique({
      where: { id: access.lead.id },
      select: {
        id: true,
        organizationId: true,
        contactConsentAt: true,
        customer: {
          select: {
            id: true,
            email: true,
            name: true,
            emailAlertsEnabled: true,
            caslConsentAt: true,
          },
        },
      },
    });

    if (!lead) {
      return NextResponse.json(
        { ok: false, code: "LEAD_NOT_FOUND", message: "Lead not found" },
        { status: 404 },
      );
    }

    const toEmail = lead.customer?.email;
    if (!toEmail) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "No customer email",
        },
        { status: 400 },
      );
    }

    const consented =
      Boolean(lead.contactConsentAt) || Boolean(lead.customer?.caslConsentAt);
    if (!consented || lead.customer?.emailAlertsEnabled === false) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "No CASL consent / alerts off",
        },
        { status: 400 },
      );
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: access.workspaceId,
          userId: access.userId,
        },
      },
      select: {
        user: { select: { email: true } },
      },
    });

    const rendered = renderAgentMessageEmail({
      name: lead.customer?.name,
      subject: parsed.data.subject,
      body: parsed.data.body,
    });

    // Canonical web send path — Resend + LeadEmailLog + LeadActivity.
    const result = await sendAndLogClientEmail({
      to: toEmail,
      rendered,
      stream: "notify",
      customerId: lead.customer?.id,
      leadId: lead.id,
      sentById: access.userId,
      organizationId: lead.organizationId,
      replyTo: membership?.user.email ?? null,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: "SERVER_ERROR",
          message: "Send failed",
        },
        { status: 502 },
      );
    }

    // Return the freshly logged row when available.
    let email = null;
    if (result.emailLogId) {
      const row = await prisma.leadEmailLog.findUnique({
        where: { id: result.emailLogId },
        select: {
          id: true,
          subject: true,
          body: true,
          toEmail: true,
          kind: true,
          openedAt: true,
          clickedAt: true,
          openCount: true,
          clickCount: true,
          lastClickedUrl: true,
          createdAt: true,
        },
      });
      if (row) email = formatEmail(row);
    }

    return NextResponse.json({
      ok: true,
      sent: 1,
      email,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
