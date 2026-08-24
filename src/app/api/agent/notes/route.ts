import { NextResponse } from "next/server";
import { z } from "zod";
import {
  canAccessLead,
  markLeadFirstResponse,
  requireAgentContext,
} from "@/lib/agent";
import { resolveChildCrmOwnership, resolveLeadCrmOwnership } from "@/lib/crm-ownership";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  leadId: z.string().min(1),
  body: z.string().min(1).max(8000),
  category: z.enum(["GENERAL", "CALL"]).optional().default("GENERAL"),
  pinned: z.boolean().optional().default(false),
});

const patchSchema = z.object({
  noteId: z.string().min(1),
  pinned: z.boolean().optional(),
  category: z.enum(["GENERAL", "CALL"]).optional(),
}).refine((v) => v.pinned !== undefined || v.category !== undefined, {
  message: "Provide pinned and/or category",
});

export async function POST(request: Request) {
  const ctx = await requireAgentContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: parsed.data.leadId },
  });
  if (!lead || !canAccessLead(ctx, lead)) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const orgId = lead.organizationId ?? ctx.organizationId;
  const body = parsed.data.body.trim();
  const category = parsed.data.category;
  const pinned = parsed.data.pinned;

  const ownership = await resolveChildCrmOwnership({
    organizationId: orgId,
    leadId: lead.id,
    leadWorkspaceId: lead.workspaceId,
  });

  const note = await prisma.leadNote.create({
    data: {
      organizationId: ownership.organizationId,
      workspaceId: ownership.workspaceId,
      leadId: lead.id,
      authorId: ctx.user.id,
      body,
      category,
      pinned,
      pinnedAt: pinned ? new Date() : null,
    },
  });

  await markLeadFirstResponse(lead.id, ctx.user.id);
  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      userId: ctx.user.id,
      type: "note",
      body: body.slice(0, 500),
      meta: {
        noteId: note.id,
        category,
        pinned,
      },
    },
  });

  // Keep legacy blob in sync for older views.
  const stamp = new Date().toLocaleString("en-CA");
  const kind = category === "CALL" ? "Call" : "General";
  const pinMark = pinned ? " · pinned" : "";
  const line = `[${stamp}] [${kind}${pinMark}] ${ctx.user.name || ctx.user.email}: ${body}`;
  const leadOwnership = await resolveLeadCrmOwnership(orgId);
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      notes: lead.notes ? `${lead.notes}\n\n${line}` : line,
      organizationId: orgId,
      workspaceId: leadOwnership.workspaceId,
    },
  });

  return NextResponse.json({ ok: true, note });
}

export async function PATCH(request: Request) {
  const ctx = await requireAgentContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const existing = await prisma.leadNote.findUnique({
    where: { id: parsed.data.noteId },
    include: {
      lead: {
        select: {
          id: true,
          organizationId: true,
          workspaceId: true,
          assignedAgentId: true,
        },
      },
    },
  });

  if (!existing || !canAccessLead(ctx, existing.lead)) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const nextPinned =
    parsed.data.pinned !== undefined ? parsed.data.pinned : existing.pinned;
  const nextCategory =
    parsed.data.category !== undefined
      ? parsed.data.category
      : existing.category;

  const note = await prisma.leadNote.update({
    where: { id: existing.id },
    data: {
      pinned: nextPinned,
      pinnedAt: nextPinned
        ? existing.pinned && existing.pinnedAt
          ? existing.pinnedAt
          : new Date()
        : null,
      category: nextCategory,
    },
  });

  if (parsed.data.pinned !== undefined && parsed.data.pinned !== existing.pinned) {
    await prisma.leadActivity.create({
      data: {
        leadId: existing.lead.id,
        userId: ctx.user.id,
        type: "note_pin",
        body: parsed.data.pinned
          ? `Pinned note: ${existing.body.slice(0, 120)}`
          : `Unpinned note: ${existing.body.slice(0, 120)}`,
        meta: { noteId: existing.id, pinned: parsed.data.pinned },
      },
    });
  }

  return NextResponse.json({
    ok: true,
    note: {
      id: note.id,
      pinned: note.pinned,
      category: note.category,
      pinnedAt: note.pinnedAt?.toISOString() ?? null,
    },
  });
}
