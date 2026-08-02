import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessLead, requireAgentContext } from "@/lib/agent";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  leadId: z.string().min(1),
  searchId: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  emailAlerts: z.boolean().optional(),
  smsAlerts: z.boolean().optional(),
  query: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(request: Request) {
  const ctx = await requireAgentContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: parsed.data.leadId },
  });
  if (!lead?.customerId || !canAccessLead(ctx, lead)) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const search = await prisma.savedSearch.findFirst({
    where: { id: parsed.data.searchId, userId: lead.customerId },
  });
  if (!search) {
    return NextResponse.json({ error: "Search not found" }, { status: 404 });
  }

  const updated = await prisma.savedSearch.update({
    where: { id: search.id },
    data: {
      name: parsed.data.name,
      emailAlerts: parsed.data.emailAlerts,
      smsAlerts: parsed.data.smsAlerts,
      query: parsed.data.query as object | undefined,
    },
  });

  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      userId: ctx.user.id,
      type: "search_criteria_updated",
      body: `Updated saved search “${updated.name}”`,
    },
  });

  return NextResponse.json({ ok: true, search: updated });
}
