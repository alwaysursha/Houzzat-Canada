/**
 * Stage 3K.5.7 — shared public lead API helpers.
 */
import { NextResponse } from "next/server";
import type { LeadIntent } from "@prisma/client";
import { resolvePublicLeadDesk } from "@/lib/agent";
import {
  httpStatusForPublicLeadRoutingError,
  PublicLeadRoutingError,
  resolveLeadCreateOwnership,
  resolveLeadDeskAssignmentForRequest,
} from "@/lib/agent/lead-intake";
import {
  formatLeadSmsPrefix,
  formatNewLeadEmailSubject,
  formatNewLeadPushTitle,
  resolveLeadNotificationBrandFromRequest,
} from "@/lib/tenancy/lead-notification-brand";
import { resolveLeadDeskNotifiers } from "@/lib/workspace-notification-recipients";

export async function resolvePublicLeadRoutingContext(
  request: Request,
  intent: LeadIntent,
) {
  const desk = await resolvePublicLeadDesk(request);
  const routed = await resolveLeadDeskAssignmentForRequest(request, intent);
  const organizationId = routed.organizationId ?? desk.organizationId;
  const brand = await resolveLeadNotificationBrandFromRequest(request);
  const deskNotifiers = await resolveLeadDeskNotifiers({
    organizationId,
    workspaceId: routed.workspaceId ?? desk.workspaceId,
  });
  const ownership = await resolveLeadCreateOwnership({
    organizationId,
    workspaceId: routed.workspaceId ?? desk.workspaceId ?? null,
  });
  return {
    desk,
    routed,
    organizationId,
    assignedAgentId: routed.assigneeId,
    brand,
    deskNotifiers,
    ownership,
  };
}

export function publicLeadRoutingErrorResponse(error: unknown) {
  if (error instanceof PublicLeadRoutingError) {
    return NextResponse.json(
      { error: "Lead routing is not available for this hostname." },
      { status: httpStatusForPublicLeadRoutingError(error) },
    );
  }
  return null;
}

export function publicLeadNotificationCopy(
  brand: Awaited<ReturnType<typeof resolveLeadNotificationBrandFromRequest>>,
  detail: string,
) {
  return {
    emailSubject: formatNewLeadEmailSubject(brand, detail),
    pushTitle: formatNewLeadPushTitle(brand),
    smsPrefix: formatLeadSmsPrefix(brand),
  };
}
