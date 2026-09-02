/**
 * Stage 4.5.2 — PATCH /api/mobile/v2/leads/[leadId]/notes/[noteId]
 *
 * Unpin / retoggle pin on a LeadNote (web PATCH /api/agent/notes parity).
 *
 * HTTP-mode safe: flat sequential Prisma writes only (no $transaction,
 * no nested relation writes). PrismaNeonHttp rejects internal txns.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMobileLeadAccess } from "@/lib/mobile/v2/lead-access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const patchSchema = z.object({
  pinned: z.boolean(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ leadId: string; noteId: string }> },
) {
  try {
    const { leadId, noteId } = await context.params;
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

    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid note payload" },
        { status: 400 },
      );
    }

    const existing = await prisma.leadNote.findFirst({
      where: {
        id: noteId,
        leadId: access.lead.id,
      },
      select: {
        id: true,
        body: true,
        pinned: true,
        pinnedAt: true,
        category: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", message: "Note not found" },
        { status: 404 },
      );
    }

    const nextPinned = parsed.data.pinned;
    if (nextPinned === existing.pinned) {
      return NextResponse.json({
        ok: true,
        note: {
          id: existing.id,
          pinned: existing.pinned,
          category: existing.category,
        },
      });
    }

    const note = await prisma.leadNote.update({
      where: { id: existing.id },
      data: {
        pinned: nextPinned,
        pinnedAt: nextPinned ? new Date() : null,
      },
      select: {
        id: true,
        pinned: true,
        category: true,
      },
    });

    // Keep timeline pin state in sync (mobile reads pinned from activity.meta).
    const related = await prisma.leadActivity.findMany({
      where: {
        leadId: access.lead.id,
        type: { in: ["note", "note_pin"] },
      },
      select: { id: true, type: true, meta: true },
      take: 80,
      orderBy: { createdAt: "desc" },
    });

    for (const act of related) {
      const meta =
        act.meta && typeof act.meta === "object" && !Array.isArray(act.meta)
          ? (act.meta as Record<string, unknown>)
          : null;
      if (!meta || meta.noteId !== existing.id) continue;
      if (act.type === "note") {
        await prisma.leadActivity.update({
          where: { id: act.id },
          data: {
            meta: {
              ...meta,
              pinned: nextPinned,
            },
          },
        });
      }
    }

    await prisma.leadActivity.create({
      data: {
        leadId: access.lead.id,
        userId: access.userId,
        type: "note_pin",
        body: nextPinned
          ? `Pinned note: ${existing.body.slice(0, 120)}`
          : `Unpinned note: ${existing.body.slice(0, 120)}`,
        meta: { noteId: existing.id, pinned: nextPinned },
      },
    });

    return NextResponse.json({
      ok: true,
      note: {
        id: note.id,
        pinned: note.pinned,
        category: note.category,
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
