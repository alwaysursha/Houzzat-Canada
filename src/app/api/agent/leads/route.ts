import { NextResponse } from "next/server";
import { z } from "zod";
import type { LeadStatus } from "@prisma/client";
import { canAccessLead, requireAgentContextFromRequest } from "@/lib/agent";
import { createManualLead } from "@/lib/agent/create-manual-lead";
import { resolveLeadImportOwnership } from "@/lib/agent/lead-import-ownership";
import { CALL_NEW_LEAD_TASK_TITLE } from "@/lib/agent/lead-intake";
import { LEAD_STATUS_ZOD } from "@/lib/agent/pipeline";
import {
  cancelOpenAgentTasksByTitleHttpSafe,
  createCallNewLeadTaskHttpSafe,
  onLeadAttemptedContactHttpSafe,
} from "@/lib/mobile/v2/lead-write-effects";
import { notifyLeadAssignedToAgent } from "@/lib/notifications/staff-events";
import { prisma } from "@/lib/prisma";
import { isInvalidContactPhoneError } from "@/lib/sms/e164";
import { isAmbiguousLeadIdentityError } from "@/lib/agent/lead-identity";
import { detectClientWorkspaceOverride } from "@/lib/tenancy/public-lead-workspace";

const patchSchema = z.object({
  leadId: z.string().min(1),
  status: z.enum(LEAD_STATUS_ZOD).optional(),
  claim: z.boolean().optional(),
  notes: z.string().max(5000).optional(),
  lostReason: z.string().max(500).optional(),
  winReason: z.string().max(500).optional(),
  assignedAgentId: z.string().nullable().optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
});

export async function POST(request: Request) {
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  if (json && typeof json === "object" && !Array.isArray(json)) {
    const spoof = detectClientWorkspaceOverride(
      json as Record<string, unknown>,
    );
    if (spoof) {
      return NextResponse.json(
        { error: "Do not send workspace or tenant fields." },
        { status: 400 },
      );
    }
  }

  const ownership = resolveLeadImportOwnership(ctx);
  if (!ownership.ok) {
    return NextResponse.json(
      { error: ownership.error },
      { status: ownership.status },
    );
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const { leadId } = await createManualLead({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      organizationId: ownership.organizationId,
      workspaceId: ownership.workspaceId,
      agentId: ctx.user.id,
    });

    return NextResponse.json({ ok: true, leadId });
  } catch (error) {
    if (isInvalidContactPhoneError(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (isAmbiguousLeadIdentityError(error)) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

export async function PATCH(request: Request) {
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: parsed.data.leadId },
  });
  if (!lead || !canAccessLead(ctx, lead)) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const data: {
    status?: LeadStatus;
    statusChangedAt?: Date;
    assignedAgentId?: string | null;
    notes?: string;
    lostReason?: string | null;
    winReason?: string | null;
    organizationId?: string;
    firstRespondedAt?: Date;
  } = {};

  if (parsed.data.status && parsed.data.status !== lead.status) {
    data.status = parsed.data.status;
    data.statusChangedAt = new Date();
  }
  if (parsed.data.claim) {
    data.assignedAgentId = ctx.user.id;
    data.organizationId = lead.organizationId ?? ctx.organizationId;
  }
  if (parsed.data.assignedAgentId !== undefined) {
    if (!ctx.canSeeTeamLeads) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    data.assignedAgentId = parsed.data.assignedAgentId;
  }
  if (parsed.data.notes != null) data.notes = parsed.data.notes;
  if (parsed.data.lostReason) data.lostReason = parsed.data.lostReason;
  if (parsed.data.winReason) data.winReason = parsed.data.winReason;

  // Response time = NEW_LEAD → ATTEMPTED_CONTACT only (not claim/note/other status).
  const movedToAttempted =
    parsed.data.status === "ATTEMPTED_CONTACT" &&
    lead.status === "NEW_LEAD" &&
    !lead.firstRespondedAt;
  if (movedToAttempted) {
    data.firstRespondedAt = new Date();
  }

  try {
    // HTTP-mode safe: flat lead update, then a separate activity create.
    // Nested activities.create wraps an internal transaction PrismaNeonHttp rejects.
    const updated =
      Object.keys(data).length > 0
        ? await prisma.lead.update({
            where: { id: lead.id },
            data,
          })
        : lead;

    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: ctx.user.id,
        type: parsed.data.claim
          ? "claimed"
          : parsed.data.assignedAgentId !== undefined
            ? "reassigned"
            : parsed.data.status
              ? "status_change"
              : "note",
        body:
          parsed.data.notes ??
          parsed.data.lostReason ??
          parsed.data.winReason ??
          parsed.data.status ??
          "updated",
        meta: {
          status: parsed.data.status,
          claim: parsed.data.claim,
          lostReason: parsed.data.lostReason,
          winReason: parsed.data.winReason,
        },
      },
    });

    const nextAssignee =
      data.assignedAgentId !== undefined
        ? data.assignedAgentId
        : lead.assignedAgentId;
    const organizationId =
      data.organizationId ?? lead.organizationId ?? ctx.organizationId;

    if (
      nextAssignee &&
      (parsed.data.claim || parsed.data.assignedAgentId !== undefined) &&
      nextAssignee !== lead.assignedAgentId
    ) {
      await createCallNewLeadTaskHttpSafe({
        leadId: lead.id,
        assigneeId: nextAssignee,
        organizationId,
        createdById: ctx.user.id,
      });
      if (nextAssignee !== ctx.user.id) {
        notifyLeadAssignedToAgent(nextAssignee, {
          leadId: lead.id,
          label: lead.listingMls
            ? `MLS® ${lead.listingMls}`
            : "A lead was assigned to you",
        });
      }
    }

    // Attempted Contact → leave Call New Leads, create 24h follow-up reminder.
    if (
      parsed.data.status === "ATTEMPTED_CONTACT" &&
      lead.status !== "ATTEMPTED_CONTACT"
    ) {
      const reminderAssignee = nextAssignee ?? ctx.user.id;
      if (reminderAssignee && organizationId) {
        await onLeadAttemptedContactHttpSafe({
          leadId: lead.id,
          assigneeId: reminderAssignee,
          organizationId,
          createdById: ctx.user.id,
        });
        // Keep ownership on the agent who attempted contact.
        if (!lead.assignedAgentId && !data.assignedAgentId) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { assignedAgentId: reminderAssignee },
          });
        }
      }
    } else if (
      parsed.data.status &&
      parsed.data.status !== "NEW_LEAD" &&
      lead.status === "NEW_LEAD"
    ) {
      await cancelOpenAgentTasksByTitleHttpSafe(
        lead.id,
        CALL_NEW_LEAD_TASK_TITLE,
      );
    }

    return NextResponse.json({ ok: true, lead: updated });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Could not update lead";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
