import { NextResponse } from "next/server";
import { z } from "zod";
import {
  canAccessLead,
  markLeadFirstResponse,
  requireAgentContext,
} from "@/lib/agent";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  leadId: z.string().min(1),
  body: z.string().min(1).max(8000),
});

export async function POST(request: Request) {
  const ctx = await requireAgentContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
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

  const note = await prisma.leadNote.create({
    data: {
      organizationId: orgId,
      leadId: lead.id,
      authorId: ctx.user.id,
      body: parsed.data.body.trim(),
    },
  });

  await markLeadFirstResponse(lead.id, ctx.user.id);
  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      userId: ctx.user.id,
      type: "note",
      body: parsed.data.body.trim().slice(0, 500),
    },
  });

  // Keep legacy blob in sync for older views.
  const stamp = new Date().toLocaleString("en-CA");
  const line = `[${stamp}] ${ctx.user.name || ctx.user.email}: ${parsed.data.body.trim()}`;
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      notes: lead.notes ? `${lead.notes}\n\n${line}` : line,
      organizationId: orgId,
    },
  });

  return NextResponse.json({ ok: true, note });
}
