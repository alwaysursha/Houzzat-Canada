/**
 * Stage 4.6 — GET/POST /api/mobile/v2/leads/[leadId]/tasks
 *
 * Lead-scoped AgentTask list + create, matching /api/agent/tasks semantics
 * for a single lead (TaskForm + CustomerProfile Task & Reminders tab).
 *
 * HTTP-mode safe: flat sequential Prisma writes only (no $transaction).
 * Workspace authority: token.wsId ONLY via authorizeMobileLeadAccess.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveChildCrmOwnership } from "@/lib/crm-ownership";
import { authorizeMobileLeadAccess } from "@/lib/mobile/v2/lead-access";
import { markLeadFirstResponseHttpSafe } from "@/lib/mobile/v2/lead-write-effects";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const createSchema = z.object({
  type: z.enum(["CALL", "EMAIL", "TODO"]).optional().default("TODO"),
  title: z.string().min(1).max(200),
  body: z.string().max(5000).optional(),
  dueAt: z.string().datetime(),
});

function formatTask(task: {
  id: string;
  type: string;
  status: string;
  title: string;
  body: string | null;
  dueAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    title: task.title,
    body: task.body,
    dueAt: task.dueAt.toISOString(),
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export async function GET(
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

    // Canonical web CustomerProfile loads tasks via Lead.tasks (leadId only)
    // after the lead itself is authorized. Do not over-filter by workspaceId —
    // that can hide legitimate lead-scoped tasks. Tenant safety is from
    // authorizeMobileLeadAccess (lead.workspaceId === token.wsId).
    const tasks = await prisma.agentTask.findMany({
      where: {
        leadId: access.lead.id,
      },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      take: 40,
      select: {
        id: true,
        type: true,
        status: true,
        title: true,
        body: true,
        dueAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      tasks: tasks.map(formatTask),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}

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
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Invalid task payload (title + dueAt ISO datetime required)",
        },
        { status: 400 },
      );
    }

    const orgId = access.lead.organizationId;
    if (!orgId) {
      return NextResponse.json(
        {
          ok: false,
          code: "SERVER_ERROR",
          message: "Lead is missing organization ownership required for tasks",
        },
        { status: 500 },
      );
    }

    const title = parsed.data.title.trim();
    if (!title) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Title is required" },
        { status: 400 },
      );
    }

    const dueAt = new Date(parsed.data.dueAt);
    if (Number.isNaN(dueAt.getTime())) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid dueAt" },
        { status: 400 },
      );
    }

    const ownership = await resolveChildCrmOwnership({
      organizationId: orgId,
      leadId: access.lead.id,
      leadWorkspaceId: access.lead.workspaceId,
    });

    // 1) Create AgentTask — flat create
    const task = await prisma.agentTask.create({
      data: {
        organizationId: ownership.organizationId,
        workspaceId: ownership.workspaceId ?? access.workspaceId,
        leadId: access.lead.id,
        assigneeId: access.userId,
        createdById: access.userId,
        type: parsed.data.type,
        title,
        body: parsed.data.body?.trim() || null,
        dueAt,
      },
      select: {
        id: true,
        type: true,
        status: true,
        title: true,
        body: true,
        dueAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // 2) Response SLA helper — flat when applicable
    await markLeadFirstResponseHttpSafe(access.lead.id, {
      status: access.lead.status,
      firstRespondedAt: access.lead.firstRespondedAt,
    });

    // 3) Activity — single reminder_set (canonical web create side effect)
    await prisma.leadActivity.create({
      data: {
        leadId: access.lead.id,
        userId: access.userId,
        type: "reminder_set",
        body: `${parsed.data.type}: ${title}`,
      },
    });

    return NextResponse.json({
      ok: true,
      task: formatTask(task),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
