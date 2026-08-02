import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessLead, requireAgentContext } from "@/lib/agent";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  leadId: z.string().min(1),
  channel: z.enum(["email", "phone"]),
  verified: z.boolean(),
});

export async function POST(request: Request) {
  const ctx = await requireAgentContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: parsed.data.leadId },
    select: {
      id: true,
      organizationId: true,
      assignedAgentId: true,
      customerId: true,
    },
  });

  if (!lead || !canAccessLead(ctx, lead) || !lead.customerId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stamp = parsed.data.verified ? new Date() : null;

  if (parsed.data.channel === "email") {
    await prisma.user.update({
      where: { id: lead.customerId },
      data: { emailVerified: stamp },
    });
  } else {
    await prisma.user.update({
      where: { id: lead.customerId },
      data: { phoneVerifiedAt: stamp },
    });
  }

  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      userId: ctx.user.id,
      type: "contact_verify",
      body: `${parsed.data.channel} ${parsed.data.verified ? "verified" : "unverified"} by agent`,
      meta: {
        channel: parsed.data.channel,
        verified: parsed.data.verified,
      },
    },
  });

  return NextResponse.json({ ok: true });
}
