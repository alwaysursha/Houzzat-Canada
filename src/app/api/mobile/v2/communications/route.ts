/**
 * Stage 5.8 — GET /api/mobile/v2/communications
 *
 * Global outbound email activity across authorized leads.
 * Same canonical LeadEmailLog rows as Lead Profile → Conversations
 * and web /agent/inbox.
 *
 * INBOUND EMAIL NOT CURRENTLY CANONICAL — this is sent-email activity,
 * not a two-way inbox.
 */

import { NextResponse } from "next/server";
import {
  buildCommunicationsSearchOr,
  COMMUNICATIONS_PAGE_SIZE,
  communicationsLeadWhere,
  formatCommunicationRow,
  parseCommunicationsCursor,
} from "@/lib/mobile/v2/communications";
import { authorizeMobileWorkspaceAccess } from "@/lib/mobile/v2/workspace-access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const access = await authorizeMobileWorkspaceAccess(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    const url = new URL(request.url);
    const channel = (url.searchParams.get("channel") || "all")
      .trim()
      .toLowerCase();
    // Only email exists. Reject invented channels; "all" ≡ email.
    if (channel !== "all" && channel !== "email") {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Unsupported channel. Only email is canonical.",
        },
        { status: 400 },
      );
    }

    const searchQuery = (
      url.searchParams.get("q") ||
      url.searchParams.get("search") ||
      ""
    ).trim();

    const cursorRaw = parseCommunicationsCursor(
      url.searchParams.get("cursor"),
    );
    if (cursorRaw === "invalid") {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid cursor" },
        { status: 400 },
      );
    }

    const limitRaw = Number(
      url.searchParams.get("limit") || COMMUNICATIONS_PAGE_SIZE,
    );
    const limit = Math.min(
      Math.max(
        Number.isFinite(limitRaw) ? limitRaw : COMMUNICATIONS_PAGE_SIZE,
        1,
      ),
      COMMUNICATIONS_PAGE_SIZE,
    );

    const leadFilter = communicationsLeadWhere(
      access.workspaceId,
      access.userId,
      access.role,
    );

    const emails = await prisma.leadEmailLog.findMany({
      where: {
        lead: leadFilter,
        ...(cursorRaw ? { createdAt: { lt: cursorRaw } } : {}),
        ...(searchQuery.length > 0
          ? { OR: buildCommunicationsSearchOr(searchQuery) }
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

    const hasMore = emails.length > limit;
    const page = hasMore ? emails.slice(0, limit) : emails;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.createdAt.toISOString()
        : null;

    return NextResponse.json({
      ok: true,
      data: {
        communications: page.map(formatCommunicationRow),
        nextCursor,
        hasMore,
        meta: {
          /** Honest product semantics for native UI copy. */
          mode: "outbound_email_activity",
          inboundEmailCanonical: false,
          channels: ["email"] as const,
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
