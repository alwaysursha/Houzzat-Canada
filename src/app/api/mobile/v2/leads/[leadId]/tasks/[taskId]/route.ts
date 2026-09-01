/**
 * Stage 4.6 — PATCH /api/mobile/v2/leads/[leadId]/tasks/[taskId]
 *
 * Complete / reopen / limited edit matching PATCH /api/agent/tasks.
 * Explicit fields only: status, title, body, dueAt.
 *
 * HTTP-mode safe: single flat update (no $transaction).
 * No hard delete — web uses DONE / CANCELLED status only.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMobileLeadAccess } from "@/lib/mobile/v2/lead-access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    status: z.enum(["OPEN", "DONE", "CANCELLED"]).optional(),
    title: z.string().min(1).max(200).optional(),
    body: z.string().max(5000).optional(),
    dueAt: z.string().datetime().optional(),
  })
  .refine(
    (v) =>
      v.status !== undefined ||
      v.title !== undefined ||
      v.body !== undefined ||
      v.dueAt !== undefined,
    { message: "Provide at least one mutable field" },
  );

export async function PATCH(
  request: Request,
  context: { params: Promise<{ leadId: string; taskId: string }> },
) {
  try {
    const { leadId, taskId } = await context.params;
    const access = await authorizeMobileLeadAccess(request, leadId);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    if (!taskId) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Missing taskId" },
        { status: 400 },
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

    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Invalid task patch payload",
        },
        { status: 400 },
      );
    }

    const existing = await prisma.agentTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        leadId: true,
        workspaceId: true,
        organizationId: true,
        status: true,
      },
    });

    const workspaceMatch = existing?.workspaceId === access.workspaceId;
    const legacyOrgMatch =
      !existing?.workspaceId &&
      !!access.lead.organizationId &&
      existing?.organizationId === access.lead.organizationId;

    if (
      !existing ||
      existing.leadId !== access.lead.id ||
      (!workspaceMatch && !legacyOrgMatch)
    ) {
      return NextResponse.json(
        {
          ok: false,
          code: "TASK_NOT_FOUND",
          message: "Task not found for this lead",
        },
        { status: 404 },
      );
    }

    let dueAt: Date | undefined;
    if (parsed.data.dueAt !== undefined) {
      dueAt = new Date(parsed.data.dueAt);
      if (Number.isNaN(dueAt.getTime())) {
        return NextResponse.json(
          { ok: false, code: "VALIDATION_ERROR", message: "Invalid dueAt" },
          { status: 400 },
        );
      }
    }

    const nextStatus = parsed.data.status;
    const task = await prisma.agentTask.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        title: parsed.data.title?.trim(),
        body: parsed.data.body !== undefined ? parsed.data.body.trim() || null : undefined,
        dueAt,
        completedAt:
          nextStatus === "DONE"
            ? new Date()
            : nextStatus === "OPEN"
              ? null
              : undefined,
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

    // Web PATCH does not create LeadActivity for complete/reopen — match that.

    return NextResponse.json({
      ok: true,
      task: {
        id: task.id,
        type: task.type,
        status: task.status,
        title: task.title,
        body: task.body,
        dueAt: task.dueAt.toISOString(),
        completedAt: task.completedAt ? task.completedAt.toISOString() : null,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
