/**
 * Stage 3K.5.7 — shared public lead API helpers.
 */
import { NextResponse } from "next/server";
import type { LeadIntent, LeadSource } from "@prisma/client";
import { resolvePublicLeadDesk } from "@/lib/agent";
import {
  httpStatusForPublicLeadRoutingError,
  PublicLeadRoutingError,
  resolveLeadCaptureTenancy,
  resolveLeadCreateOwnership,
  resolveLeadDeskAssignmentForRequest,
} from "@/lib/agent/lead-intake";
import {
  AmbiguousLeadIdentityError,
  isAmbiguousLeadIdentityError,
} from "@/lib/agent/lead-identity";
import {
  resolveOrCreateWorkspaceLead,
  type ResolveOrCreateWorkspaceLeadResult,
  type ResolveWorkspaceLeadActivity,
} from "@/lib/agent/resolve-workspace-lead";
import type { MaterialLeadInfoChange } from "@/lib/agent/lead-info-change";
import { scheduleLeadInfoUpdatedAfterIntake } from "@/lib/notifications/staff-events";
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

/**
 * Resolve person + workspace before any Buyer/Seller routing.
 * Routing (and assignedCount increment) runs only when inserting a new Lead.
 */
export async function publicResolveOrCreateLead(input: {
  request: Request;
  intent: LeadIntent;
  isBuyer: boolean;
  isSeller: boolean;
  source: LeadSource;
  customerId?: string | null;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  notes?: string | null;
  score?: number;
  listingMls?: string | null;
  contactConsentAt?: Date | null;
  actorId?: string | null;
  upsertCustomer?: boolean;
  utm?: {
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmContent?: string | null;
    adCampaignId?: string | null;
  };
  activity?: ResolveWorkspaceLeadActivity | null;
  contactChanges?: MaterialLeadInfoChange[];
}): Promise<
  ResolveOrCreateWorkspaceLeadResult & {
    brand: Awaited<ReturnType<typeof resolveLeadNotificationBrandFromRequest>>;
    deskNotifiers: Awaited<ReturnType<typeof resolveLeadDeskNotifiers>>;
  }
> {
  const tenancy = await resolveLeadCaptureTenancy(input.request);
  if (!tenancy.workspaceId) {
    throw new PublicLeadRoutingError(
      "workspace_not_resolved",
      "Public lead routing requires a verified tenant hostname",
    );
  }

  const desk = await resolvePublicLeadDesk(input.request);
  const organizationId = tenancy.organizationId ?? desk.organizationId;

  const resolved = await resolveOrCreateWorkspaceLead({
    workspaceId: tenancy.workspaceId,
    organizationId,
    customerId: input.customerId,
    email: input.email,
    phone: input.phone,
    name: input.name,
    isBuyer: input.isBuyer,
    isSeller: input.isSeller,
    source: input.source,
    notes: input.notes,
    score: input.score,
    listingMls: input.listingMls,
    contactConsentAt: input.contactConsentAt,
    actorId: input.actorId,
    upsertCustomer: input.upsertCustomer,
    utm: input.utm,
    activity: input.activity,
    resolveCreateDesk: async () => {
      const routed = await resolveLeadDeskAssignmentForRequest(
        input.request,
        input.intent,
      );
      const ownership = await resolveLeadCreateOwnership({
        organizationId: routed.organizationId ?? organizationId,
        workspaceId: routed.workspaceId ?? tenancy.workspaceId,
      });
      return {
        assigneeId: routed.assigneeId,
        organizationId:
          ownership.organizationId ?? routed.organizationId ?? organizationId,
      };
    },
  });

  const brand = await resolveLeadNotificationBrandFromRequest(input.request);
  const deskNotifiers = await resolveLeadDeskNotifiers({
    organizationId: resolved.organizationId ?? organizationId,
    workspaceId: tenancy.workspaceId,
  });

  scheduleLeadInfoUpdatedAfterIntake({
    created: resolved.created,
    leadId: resolved.lead.id,
    assignedAgentId: resolved.assignedAgentId,
    clientLabel: input.name?.trim() || input.email || null,
    changes: [
      ...resolved.classificationChanges,
      ...(input.contactChanges ?? []),
    ],
    actorUserId: input.actorId ?? input.customerId ?? null,
  });

  return {
    ...resolved,
    brand,
    deskNotifiers,
  };
}

export function publicLeadRoutingErrorResponse(error: unknown) {
  if (isAmbiguousLeadIdentityError(error)) {
    return NextResponse.json(
      { error: error.message },
      { status: 409 },
    );
  }
  if (error instanceof PublicLeadRoutingError) {
    return NextResponse.json(
      { error: "Lead routing is not available for this hostname." },
      { status: httpStatusForPublicLeadRoutingError(error) },
    );
  }
  if (error instanceof AmbiguousLeadIdentityError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
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
