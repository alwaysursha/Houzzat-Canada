/**
 * Stage 5.0 — PATCH /api/mobile/v2/tasks/[taskId]
 *
 * Global task complete (web global Tasks Done) + reopen/edit (API parity with web PATCH).
 * Same AgentTask row as Stage 4.6 lead-scoped PATCH.
 *
 * HTTP-mode safe: single flat update (no $transaction).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMobileWorkspaceAccess } from "@/lib/mobile/v2/workspace-access";
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
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const access = await authorizeMobileWorkspaceAccess(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    const { taskId } = await context.params;
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
        workspaceId: true,
        assigneeId: true,
        leadId: true,
        status: true,
      },
    });

    if (!existing || existing.workspaceId !== access.workspaceId) {
      return NextResponse.json(
        { ok: false, code: "TASK_NOT_FOUND", message: "Task not found" },
        { status: 404 },
      );
    }

    // Match web PATCH: agents may only mutate own tasks; OWNER/ADMIN any in tenant.
    if (access.role === "AGENT" && existing.assigneeId !== access.userId) {
      return NextResponse.json(
        { ok: false, code: "TASK_NOT_FOUND", message: "Task not found" },
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
        body:
          parsed.data.body !== undefined
            ? parsed.data.body.trim() || null
            : undefined,
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
