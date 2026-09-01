/**
 * Stage 5.1 — Mobile v2 global Appointment visibility (web /agent/appointments parity).
 *
 * Appointments are tenant-scoped through Lead; lead-less rows use agentId only.
 */

import type { Prisma, WorkspaceMemberRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DEFAULT_RANGE_PAST_DAYS = 30;
const DEFAULT_RANGE_FUTURE_DAYS = 90;
const MAX_RANGE_SPAN_DAYS = 365;

export type MobileAppointmentRange = {
  from: Date;
  to: Date;
};

export type MobileAppointmentRangeResult =
  | { ok: true; range: MobileAppointmentRange }
  | { ok: false; message: string };

/** Parse bounded from/to; defaults mirror a practical calendar window. */
export function parseMobileAppointmentRange(
  fromParam: string | null,
  toParam: string | null,
): MobileAppointmentRangeResult {
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - DEFAULT_RANGE_PAST_DAYS);
  defaultFrom.setHours(0, 0, 0, 0);

  const defaultTo = new Date(now);
  defaultTo.setDate(defaultTo.getDate() + DEFAULT_RANGE_FUTURE_DAYS);
  defaultTo.setHours(23, 59, 59, 999);

  const from = fromParam ? new Date(fromParam) : defaultFrom;
  const to = toParam ? new Date(toParam) : defaultTo;

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { ok: false, message: "Invalid from/to ISO datetime" };
  }
  if (from.getTime() > to.getTime()) {
    return { ok: false, message: "from must be before to" };
  }

  const spanMs = to.getTime() - from.getTime();
  const maxSpanMs = MAX_RANGE_SPAN_DAYS * 24 * 60 * 60 * 1000;
  if (spanMs > maxSpanMs) {
    return {
      ok: false,
      message: `Date range may not exceed ${MAX_RANGE_SPAN_DAYS} days`,
    };
  }

  return { ok: true, range: { from, to } };
}

/** Lead ids visible in workspace for global appointment book. */
export async function mobileTenantLeadIds(
  workspaceId: string,
  userId: string,
  role: WorkspaceMemberRole,
): Promise<string[]> {
  const where: Prisma.LeadWhereInput = { workspaceId };

  if (role === "AGENT") {
    where.OR = [{ assignedAgentId: userId }, { assignedAgentId: null }];
  } else if (role !== "OWNER" && role !== "ADMIN") {
    return [];
  }

  const leads = await prisma.lead.findMany({
    where,
    select: { id: true },
  });
  return leads.map((l) => l.id);
}

/** Web /agent/appointments visibility OR block. */
export function mobileAppointmentVisibilityWhere(
  tenantLeadIds: string[],
  userId: string,
  canSeeTeamLeads: boolean,
): Prisma.AppointmentWhereInput {
  if (canSeeTeamLeads) {
    return {
      OR: [
        { leadId: { in: tenantLeadIds } },
        { agentId: userId, leadId: null },
      ],
    };
  }

  return {
    OR: [
      { agentId: userId, leadId: { in: tenantLeadIds } },
      { agentId: userId, leadId: null },
      { agentId: null, leadId: { in: tenantLeadIds } },
    ],
  };
}

/** Bounded date filter: scheduled in range OR unscheduled but recently created. */
export function mobileAppointmentRangeWhere(
  range: MobileAppointmentRange,
): Prisma.AppointmentWhereInput {
  return {
    OR: [
      { startsAt: { gte: range.from, lte: range.to } },
      { startsAt: null, createdAt: { gte: range.from, lte: range.to } },
    ],
  };
}

/** Mirror web canMutateAppointment for mobile workspace context. */
export function canMobileMutateAppointment(
  userId: string,
  role: WorkspaceMemberRole,
  appointment: {
    agentId: string | null;
    lead: {
      workspaceId: string | null;
      assignedAgentId: string | null;
    } | null;
  },
  workspaceId: string,
): { allowed: true } | { allowed: false; reason: "lead" | "agent" } {
  if (appointment.lead) {
    if (appointment.lead.workspaceId !== workspaceId) {
      return { allowed: false, reason: "lead" };
    }
    if (role === "AGENT") {
      const isAssigned = appointment.lead.assignedAgentId === userId;
      const isPond = appointment.lead.assignedAgentId === null;
      if (!isAssigned && !isPond) {
        return { allowed: false, reason: "lead" };
      }
    } else if (role !== "OWNER" && role !== "ADMIN") {
      return { allowed: false, reason: "lead" };
    }
  }

  if (appointment.agentId && appointment.agentId !== userId) {
    return { allowed: false, reason: "agent" };
  }

  return { allowed: true };
}
