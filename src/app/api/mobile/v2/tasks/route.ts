/**
 * Stage 5.0 — GET/POST /api/mobile/v2/tasks
 *
 * Global Agent Tasks (web /agent/tasks + Instant Shell Tasks tab).
 * Same AgentTask records as Stage 4.6 / web — OPEN-only list, optional lead-less create.
 *
 * HTTP-mode safe: flat sequential Prisma writes (no $transaction).
 */

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { resolveChildCrmOwnership } from "@/lib/crm-ownership";
import { authorizeMobileLeadAccess } from "@/lib/mobile/v2/lead-access";
import { markLeadFirstResponseHttpSafe } from "@/lib/mobile/v2/lead-write-effects";
import {
  authorizeMobileWorkspaceAccess,
  resolveOrganizationIdForWorkspace,
} from "@/lib/mobile/v2/workspace-access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const PAGE_SIZE = 100;

const createSchema = z.object({
  leadId: z.string().min(1).optional(),
  type: z.enum(["CALL", "EMAIL", "TODO"]).optional().default("TODO"),
  title: z.string().min(1).max(200),
  body: z.string().max(5000).optional(),
  dueAt: z.string().datetime(),
});

function formatGlobalTask(task: {
  id: string;
  type: string;
  status: string;
  title: string;
  body: string | null;
  dueAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  leadId: string | null;
  lead: {
    id: string;
    customer: { name: string | null; email: string | null } | null;
  } | null;
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
    leadId: task.leadId,
    lead: task.lead
      ? {
          id: task.lead.id,
          customer: {
            name: task.lead.customer?.name ?? null,
            email: task.lead.customer?.email ?? null,
          },
        }
      : null,
  };
}

export async function GET(request: Request) {
  try {
    const access = await authorizeMobileWorkspaceAccess(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    const url = new URL(request.url);
    const scope = url.searchParams.get("scope"); // overdue | due | omit=all OPEN

    const now = new Date();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const where: Prisma.AgentTaskWhereInput = {
      workspaceId: access.workspaceId,
      status: "OPEN",
    };

    // Match web GET /api/agent/tasks: agents see own; OWNER/ADMIN see workspace.
    if (access.role === "AGENT") {
      where.assigneeId = access.userId;
    }

    if (scope === "overdue") where.dueAt = { lt: now };
    if (scope === "due") where.dueAt = { lte: endOfDay };

    const tasks = await prisma.agentTask.findMany({
      where,
      orderBy: [{ dueAt: "asc" }],
      take: PAGE_SIZE,
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
        leadId: true,
        lead: {
          select: {
            id: true,
            customer: { select: { name: true, email: true } },
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      tasks: tasks.map(formatGlobalTask),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const access = await authorizeMobileWorkspaceAccess(request);
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

    let organizationId: string | null = null;
    let leadWorkspaceId: string | null = access.workspaceId;
    let leadStatus: string | null = null;
    let leadFirstRespondedAt: Date | null = null;

    if (parsed.data.leadId) {
      // Reuse Stage 4.6 lead visibility for linked create.
      const leadAccess = await authorizeMobileLeadAccess(
        request,
        parsed.data.leadId,
      );
      if (!leadAccess.ok) {
        return NextResponse.json(
          { ok: false, code: leadAccess.code, message: leadAccess.message },
          { status: leadAccess.status },
        );
      }
      organizationId = leadAccess.lead.organizationId;
      leadWorkspaceId = leadAccess.lead.workspaceId;
      leadStatus = leadAccess.lead.status;
      leadFirstRespondedAt = leadAccess.lead.firstRespondedAt;
    } else {
      organizationId = await resolveOrganizationIdForWorkspace(access.workspaceId);
    }

    if (!organizationId) {
      return NextResponse.json(
        {
          ok: false,
          code: "SERVER_ERROR",
          message: "Could not resolve organization for workspace task create",
        },
        { status: 500 },
      );
    }

    const ownership = await resolveChildCrmOwnership({
      organizationId,
      leadId: parsed.data.leadId ?? null,
      leadWorkspaceId,
    });

    const created = await prisma.agentTask.create({
      data: {
        organizationId: ownership.organizationId,
        workspaceId: ownership.workspaceId ?? access.workspaceId,
        leadId: parsed.data.leadId ?? null,
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
        leadId: true,
        lead: {
          select: {
            id: true,
            customer: { select: { name: true, email: true } },
          },
        },
      },
    });

    if (parsed.data.leadId) {
      await markLeadFirstResponseHttpSafe(parsed.data.leadId, {
        status: leadStatus ?? "NEW_LEAD",
        firstRespondedAt: leadFirstRespondedAt,
      });
      await prisma.leadActivity.create({
        data: {
          leadId: parsed.data.leadId,
          userId: access.userId,
          type: "reminder_set",
          body: `${parsed.data.type}: ${title}`,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      task: formatGlobalTask(created),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
