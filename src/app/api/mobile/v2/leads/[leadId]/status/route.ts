/**
 * Stage 4.5 / 4.5.1 — PATCH /api/mobile/v2/leads/[leadId]/status
 *
 * Updates pipeline status using the same canonical LeadStatus enum and
 * side effects as PATCH /api/agent/leads (statusChangedAt, activity,
 * firstRespondedAt, Attempted Contact reminders, Call New task cancel).
 *
 * HTTP-mode safe: flat sequential Prisma writes only.
 * Nested `activities: { create }` is intentionally avoided — Prisma wraps
 * nested writes in an internal transaction that PrismaNeonHttp rejects with
 * "Transactions are not supported in HTTP mode".
 *
 * Authorization: same Stage 4.3A / 4.4 mobile lead visibility rules.
 * Workspace authority: token.wsId ONLY.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import type { LeadStatus } from "@prisma/client";
import { CALL_NEW_LEAD_TASK_TITLE } from "@/lib/agent/lead-intake";
import { LEAD_STATUS_ZOD } from "@/lib/agent/pipeline";
import { authorizeMobileLeadAccess } from "@/lib/mobile/v2/lead-access";
import {
  cancelOpenAgentTasksByTitleHttpSafe,
  onLeadAttemptedContactHttpSafe,
} from "@/lib/mobile/v2/lead-write-effects";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const statusSchema = z.object({
  status: z.enum(LEAD_STATUS_ZOD),
});

export async function PATCH(
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

    const parsed = statusSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Invalid or unsupported LeadStatus value",
        },
        { status: 400 },
      );
    }

    const { userId, lead } = access;
    const nextStatus = parsed.data.status as LeadStatus;
    const prevStatus = lead.status as LeadStatus;

    if (nextStatus === prevStatus) {
      return NextResponse.json({
        ok: true,
        lead: {
          id: lead.id,
          status: prevStatus,
          statusChangedAt: null,
          firstRespondedAt: lead.firstRespondedAt
            ? lead.firstRespondedAt.toISOString()
            : null,
          unchanged: true,
        },
      });
    }

    const statusChangedAt = new Date();
    const data: {
      status: LeadStatus;
      statusChangedAt: Date;
      firstRespondedAt?: Date;
    } = {
      status: nextStatus,
      statusChangedAt,
    };

    // Response SLA: NEW_LEAD → ATTEMPTED_CONTACT only.
    const movedToAttempted =
      nextStatus === "ATTEMPTED_CONTACT" &&
      prevStatus === "NEW_LEAD" &&
      !lead.firstRespondedAt;
    if (movedToAttempted) {
      data.firstRespondedAt = new Date();
    }

    // 1) Lead status — flat update (no nested activities.create)
    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data,
      select: {
        id: true,
        status: true,
        statusChangedAt: true,
        firstRespondedAt: true,
        assignedAgentId: true,
      },
    });

    // 2) Status activity — separate flat create (single activity; no duplicate)
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId,
        type: "status_change",
        body: nextStatus,
        meta: {
          status: nextStatus,
          previousStatus: prevStatus,
        },
      },
    });

    const organizationId = lead.organizationId;
    const nextAssignee = updated.assignedAgentId ?? userId;

    // Attempted Contact → leave Call New Leads, create 24h follow-up reminder.
    if (nextStatus === "ATTEMPTED_CONTACT" && prevStatus !== "ATTEMPTED_CONTACT") {
      if (nextAssignee && organizationId) {
        await onLeadAttemptedContactHttpSafe({
          leadId: lead.id,
          assigneeId: nextAssignee,
          organizationId,
          createdById: userId,
        });
        // Keep ownership on the agent who attempted contact.
        if (!lead.assignedAgentId) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { assignedAgentId: nextAssignee },
          });
        }
      }
    } else if (nextStatus !== "NEW_LEAD" && prevStatus === "NEW_LEAD") {
      // Any other exit from New Lead cancels the call-new task.
      await cancelOpenAgentTasksByTitleHttpSafe(
        lead.id,
        CALL_NEW_LEAD_TASK_TITLE,
      );
    }

    return NextResponse.json({
      ok: true,
      lead: {
        id: updated.id,
        status: updated.status,
        statusChangedAt: updated.statusChangedAt.toISOString(),
        firstRespondedAt: updated.firstRespondedAt
          ? updated.firstRespondedAt.toISOString()
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
