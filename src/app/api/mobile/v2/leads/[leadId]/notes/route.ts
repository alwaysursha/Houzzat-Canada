/**
 * Stage 4.5 / 4.5.1 — POST /api/mobile/v2/leads/[leadId]/notes
 *
 * Creates a LeadNote using the same canonical model and side effects as
 * POST /api/agent/notes (LeadNote row + LeadActivity + legacy notes blob sync).
 *
 * HTTP-mode safe: flat sequential Prisma writes only (no nested relations,
 * no $transaction, no updateMany). PrismaNeonHttp rejects internal txns.
 *
 * Authorization: same Stage 4.3A / 4.4 mobile lead visibility rules.
 * Workspace authority: token.wsId ONLY.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveChildCrmOwnership, resolveLeadCrmOwnership } from "@/lib/crm-ownership";
import { authorizeMobileLeadAccess } from "@/lib/mobile/v2/lead-access";
import { markLeadFirstResponseHttpSafe } from "@/lib/mobile/v2/lead-write-effects";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const createSchema = z.object({
  body: z.string().min(1).max(8000),
  category: z.enum(["GENERAL", "CALL"]).optional().default("GENERAL"),
  pinned: z.boolean().optional().default(false),
});

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

    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid note payload" },
        { status: 400 },
      );
    }

    const { userId, lead } = access;
    const orgId = lead.organizationId;
    if (!orgId) {
      return NextResponse.json(
        {
          ok: false,
          code: "SERVER_ERROR",
          message: "Lead is missing organization ownership required for notes",
        },
        { status: 500 },
      );
    }

    const body = parsed.data.body.trim();
    if (!body) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Note body is required" },
        { status: 400 },
      );
    }

    const category = parsed.data.category;
    const pinned = parsed.data.pinned;

    const ownership = await resolveChildCrmOwnership({
      organizationId: orgId,
      leadId: lead.id,
      leadWorkspaceId: lead.workspaceId,
    });

    // 1) LeadNote — flat create
    const note = await prisma.leadNote.create({
      data: {
        organizationId: ownership.organizationId,
        workspaceId: ownership.workspaceId,
        leadId: lead.id,
        authorId: userId,
        body,
        category,
        pinned,
        pinnedAt: pinned ? new Date() : null,
      },
    });

    // 2) Response SLA (idempotent) — flat update when applicable
    await markLeadFirstResponseHttpSafe(lead.id, {
      status: lead.status,
      firstRespondedAt: lead.firstRespondedAt,
    });

    // 3) LeadActivity — flat create (single activity; no duplicate)
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId,
        type: "note",
        body: body.slice(0, 500),
        meta: {
          noteId: note.id,
          category,
          pinned,
        },
      },
    });

    // 4) Legacy notes blob sync — flat update
    const stamp = new Date().toLocaleString("en-CA");
    const kind = category === "CALL" ? "Call" : "General";
    const pinMark = pinned ? " · pinned" : "";
    const authorUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const author = authorUser?.name || authorUser?.email || "Agent";
    const line = `[${stamp}] [${kind}${pinMark}] ${author}: ${body}`;
    const leadOwnership = await resolveLeadCrmOwnership(orgId);
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        notes: lead.notes ? `${lead.notes}\n\n${line}` : line,
        organizationId: orgId,
        workspaceId: leadOwnership.workspaceId ?? lead.workspaceId,
      },
    });

    return NextResponse.json({
      ok: true,
      note: {
        id: note.id,
        body: note.body,
        category: note.category,
        pinned: note.pinned,
        createdAt: note.createdAt.toISOString(),
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
