import { NextResponse } from "next/server";
import { z } from "zod";
import type { LeadStatus } from "@prisma/client";
import {
  canAccessLead,
  markLeadFirstResponse,
  requireAgentContext,
} from "@/lib/agent";
import { LEAD_STATUS_ZOD } from "@/lib/agent/pipeline";
import { prisma } from "@/lib/prisma";

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
  const ctx = await requireAgentContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  let customer = await prisma.user.findUnique({ where: { email } });
  if (!customer) {
    customer = await prisma.user.create({
      data: {
        email,
        name: parsed.data.name,
        phone: parsed.data.phone || null,
        role: "BUYER",
        isBuyer: true,
        caslConsentAt: new Date(),
      },
    });
  } else {
    customer = await prisma.user.update({
      where: { id: customer.id },
      data: {
        name: customer.name || parsed.data.name,
        phone: customer.phone || parsed.data.phone || null,
      },
    });
  }

  const lead = await prisma.lead.create({
    data: {
      status: "NEW_LEAD",
      source: "OTHER",
      score: 10,
      customerId: customer.id,
      assignedAgentId: ctx.user.id,
      organizationId: ctx.organizationId,
      contactConsentAt: new Date(),
      statusChangedAt: new Date(),
      activities: {
        create: {
          type: "created",
          userId: ctx.user.id,
          body: "Manual lead created",
        },
      },
    },
  });

  return NextResponse.json({ ok: true, leadId: lead.id });
}

export async function PATCH(request: Request) {
  const ctx = await requireAgentContext();
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

  const isTouch =
    Boolean(parsed.data.claim) ||
    Boolean(parsed.data.notes) ||
    Boolean(parsed.data.status);

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      ...data,
      ...(isTouch && !lead.firstRespondedAt
        ? { firstRespondedAt: new Date() }
        : {}),
      activities: {
        create: {
          type: parsed.data.claim
            ? "claimed"
            : parsed.data.assignedAgentId !== undefined
              ? "reassigned"
              : parsed.data.status
                ? "status_change"
                : "note",
          userId: ctx.user.id,
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
      },
    },
  });

  if (isTouch) {
    await markLeadFirstResponse(lead.id, ctx.user.id);
  }

  return NextResponse.json({ ok: true, lead: updated });
}
