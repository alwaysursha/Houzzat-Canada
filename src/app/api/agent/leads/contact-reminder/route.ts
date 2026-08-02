import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessLead, requireAgentContext } from "@/lib/agent";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  leadId: z.string().min(1),
  channel: z.enum(["email", "phone"]),
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

  const stamp = new Date();
  if (parsed.data.channel === "email") {
    await prisma.user.update({
      where: { id: lead.customerId },
      data: { emailUpdateRequestedAt: stamp },
    });
  } else {
    await prisma.user.update({
      where: { id: lead.customerId },
      data: { phoneUpdateRequestedAt: stamp },
    });
  }

  const channelLabel =
    parsed.data.channel === "phone" ? "phone number" : "email";
  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      userId: ctx.user.id,
      type: "contact_update_request",
      body: `Agent requested customer to provide the correct ${channelLabel}`,
      meta: {
        channel: parsed.data.channel,
        requestedAt: stamp.toISOString(),
      },
    },
  });

  return NextResponse.json({
    ok: true,
    channel: parsed.data.channel,
    requestedAt: stamp.toISOString(),
  });
}
