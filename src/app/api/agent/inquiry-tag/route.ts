import { NextResponse } from "next/server";
import { z } from "zod";
import {
  canAccessLead,
  markLeadFirstResponse,
  requireAgentContext,
} from "@/lib/agent";
import {
  INQUIRY_TAGS,
  INQUIRY_TAG_LABEL,
  inquiryReminderDueAt,
  inquiryReminderTitle,
} from "@/lib/agent/inquiry-tag";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  leadId: z.string().min(1),
  inquiryTag: z.enum(INQUIRY_TAGS),
});

export async function POST(request: Request) {
  try {
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

    const tag = parsed.data.inquiryTag;
    const dueAt = inquiryReminderDueAt(tag);
    const orgId = lead.organizationId ?? ctx.organizationId;
    const label = INQUIRY_TAG_LABEL[tag];

    const [updated] = await prisma.$transaction([
      prisma.lead.update({
        where: { id: lead.id },
        data: {
          inquiryTag: tag,
          organizationId: orgId,
          assignedAgentId: lead.assignedAgentId ?? ctx.user.id,
          firstRespondedAt: lead.firstRespondedAt ?? new Date(),
        },
      }),
      prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: ctx.user.id,
          type: "inquiry_tag",
          body: `Inquiry tagged: ${label}`,
          meta: {
            inquiryTag: tag,
            reminderDueAt: dueAt.toISOString(),
          },
        },
      }),
      prisma.agentTask.create({
        data: {
          organizationId: orgId,
          leadId: lead.id,
          assigneeId: ctx.user.id,
          createdById: ctx.user.id,
          type:
            tag === "VIEWING" || tag === "PROPERTY_DETAILS" ? "CALL" : "TODO",
          title: inquiryReminderTitle(tag),
          dueAt,
        },
      }),
    ]);

    await markLeadFirstResponse(lead.id, ctx.user.id);

    return NextResponse.json({
      ok: true,
      lead: updated,
      reminderDueAt: dueAt.toISOString(),
      label,
    });
  } catch (error) {
    console.error("[inquiry-tag]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not tag inquiry. Restart the dev server if Prisma is stale.",
      },
      { status: 500 },
    );
  }
}
