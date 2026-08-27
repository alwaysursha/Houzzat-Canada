import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import {
  canAccessLead,
  markLeadFirstResponse,
  requireAgentContextFromRequest,
} from "@/lib/agent";
import { resolveChildCrmOwnership } from "@/lib/crm-ownership";
import { agentTaskTenantWhere, isActiveHostnameBoundReadMode } from "@/lib/crm-read-scope";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  leadId: z.string().optional(),
  type: z.enum(["CALL", "EMAIL", "TODO"]).default("TODO"),
  title: z.string().min(1).max(200),
  body: z.string().max(5000).optional(),
  dueAt: z.string().datetime(),
  assigneeId: z.string().optional(),
});

const patchSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(["OPEN", "DONE", "CANCELLED"]).optional(),
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(5000).optional(),
  dueAt: z.string().datetime().optional(),
});

export async function GET(request: Request) {
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const leadId = url.searchParams.get("leadId");
  const scope = url.searchParams.get("scope"); // due | overdue | all

  const now = new Date();
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const where: Prisma.AgentTaskWhereInput = {
    ...agentTaskTenantWhere(ctx),
    status: "OPEN",
  };

  if (!ctx.canSeeTeamLeads) {
    where.assigneeId = ctx.user.id;
  }
  if (leadId) where.leadId = leadId;
  if (scope === "overdue") where.dueAt = { lt: now };
  if (scope === "due") where.dueAt = { lte: endOfDay };

  const tasks = await prisma.agentTask.findMany({
    where,
    orderBy: [{ dueAt: "asc" }],
    take: 100,
    include: {
      lead: {
        select: {
          id: true,
          source: true,
          customer: { select: { name: true, email: true } },
        },
      },
    },
  });

  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: parsed.data.leadId },
    });
    if (!lead || !canAccessLead(ctx, lead)) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
  }

  const ownership = await resolveChildCrmOwnership({
    organizationId: ctx.organizationId,
    leadId: parsed.data.leadId,
  });

  const task = await prisma.agentTask.create({
    data: {
      organizationId: ownership.organizationId,
      workspaceId: ownership.workspaceId,
      leadId: parsed.data.leadId,
      assigneeId: parsed.data.assigneeId ?? ctx.user.id,
      createdById: ctx.user.id,
      type: parsed.data.type,
      title: parsed.data.title,
      body: parsed.data.body,
      dueAt: new Date(parsed.data.dueAt),
    },
  });

  if (parsed.data.leadId) {
    await markLeadFirstResponse(parsed.data.leadId, ctx.user.id);
    await prisma.leadActivity.create({
      data: {
        leadId: parsed.data.leadId,
        userId: ctx.user.id,
        type: "reminder_set",
        body: `${parsed.data.type}: ${parsed.data.title}`,
      },
    });
  }

  return NextResponse.json({ ok: true, task });
}

export async function PATCH(request: Request) {
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const existing = await prisma.agentTask.findUnique({
    where: { id: parsed.data.taskId },
  });
  const tenantMatch = isActiveHostnameBoundReadMode()
    ? existing?.workspaceId === ctx.workspaceId
    : existing?.organizationId === ctx.organizationId;
  if (
    !existing ||
    !tenantMatch ||
    (!ctx.canSeeTeamLeads && existing.assigneeId !== ctx.user.id)
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const task = await prisma.agentTask.update({
    where: { id: existing.id },
    data: {
      status: parsed.data.status,
      title: parsed.data.title,
      body: parsed.data.body,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : undefined,
      completedAt:
        parsed.data.status === "DONE"
          ? new Date()
          : parsed.data.status === "OPEN"
            ? null
            : undefined,
    },
  });

  return NextResponse.json({ ok: true, task });
}
