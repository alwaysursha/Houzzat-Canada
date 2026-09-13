import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessLead, requireAgentContextFromRequest } from "@/lib/agent";
import {
  nextWritableLeadClassification,
  resolveDisplayedLeadClassification,
} from "@/lib/agent/lead-classification";
import { PURCHASE_TIMEFRAMES } from "@/lib/agent/timeframe";
import { prisma } from "@/lib/prisma";

const schema = z
  .object({
    leadId: z.string().min(1),
    isBuyer: z.boolean().optional(),
    isSeller: z.boolean().optional(),
    purchaseTimeframe: z
      .enum(PURCHASE_TIMEFRAMES)
      .nullable()
      .optional(),
  })
  .refine(
    (v) =>
      v.isBuyer !== undefined ||
      v.isSeller !== undefined ||
      v.purchaseTimeframe !== undefined,
    {
      message: "Provide isBuyer, isSeller, and/or purchaseTimeframe",
    },
  );

export async function POST(request: Request) {
  const ctx = await requireAgentContextFromRequest(request);
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
      workspaceId: true,
      assignedAgentId: true,
      customerId: true,
      isBuyer: true,
      isSeller: true,
      intent: true,
      customer: {
        select: {
          id: true,
          purchaseTimeframe: true,
        },
      },
    },
  });

  if (!lead || !canAccessLead(ctx, lead) || !lead.customer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const classificationTouched =
    parsed.data.isBuyer !== undefined || parsed.data.isSeller !== undefined;
  const next = classificationTouched
    ? nextWritableLeadClassification({
        current: lead,
        patch: parsed.data,
      })
    : resolveDisplayedLeadClassification(lead);
  const nextTimeframe =
    parsed.data.purchaseTimeframe !== undefined
      ? parsed.data.purchaseTimeframe
      : lead.customer.purchaseTimeframe;

  if (classificationTouched) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        isBuyer: next.isBuyer,
        isSeller: next.isSeller,
        intent: next.intent,
      },
    });
  }

  if (parsed.data.purchaseTimeframe !== undefined) {
    await prisma.user.update({
      where: { id: lead.customer.id },
      data: { purchaseTimeframe: nextTimeframe },
    });
  }

  const parts: string[] = [];
  if (parsed.data.isBuyer !== undefined) {
    parts.push(
      `Buyer profile ${parsed.data.isBuyer ? "activated" : "deactivated"}`,
    );
  }
  if (parsed.data.isSeller !== undefined) {
    parts.push(
      `Seller profile ${parsed.data.isSeller ? "activated" : "deactivated"}`,
    );
  }
  if (parsed.data.purchaseTimeframe !== undefined) {
    parts.push(
      parsed.data.purchaseTimeframe
        ? `Timeframe set to ${parsed.data.purchaseTimeframe}`
        : "Timeframe cleared",
    );
  }

  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      userId: ctx.user.id,
      type: "profile_flags",
      body: `${parts.join("; ")} by agent`,
      meta: {
        isBuyer: next.isBuyer,
        isSeller: next.isSeller,
        purchaseTimeframe: nextTimeframe,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    isBuyer: next.isBuyer,
    isSeller: next.isSeller,
    purchaseTimeframe: nextTimeframe,
  });
}
