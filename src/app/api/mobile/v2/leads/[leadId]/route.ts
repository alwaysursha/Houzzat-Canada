/**
 * Stage 4.4 — GET /api/mobile/v2/leads/[leadId]
 *
 * Workspace-scoped Mobile v2 Lead Detail API for HouzzatPRO Native CRM.
 *
 * TENANCY & AUTHORIZATION RULES:
 * - Requires a valid mobile_workspace_access token.
 * - Workspace authority is derived STRICTLY from validated token claim (wsId).
 * - Never accepts workspaceId from query params, body, headers, or hostname.
 * - Server re-validates that WorkspaceMember is ACTIVE in the database.
 * - Lead access requires lead.workspaceId === token.wsId.
 * - AGENT role: Can only access leads assigned to self (assignedAgentId === userId)
 *   or unassigned leads in the workspace pond (assignedAgentId === null).
 *   Cannot access another agent's assigned lead.
 * - OWNER / ADMIN role: Full workspace-wide lead visibility.
 * - Returns a compact, performance-optimized DTO avoiding oversized payloads.
 */

import { NextResponse } from "next/server";
import { displayedCrmClassification } from "@/lib/agent/lead-classification";
import { prisma } from "@/lib/prisma";
import { authenticateMobileRequest } from "@/lib/mobile/v2/auth-guard";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ leadId: string }> },
) {
  try {
    const authResult = authenticateMobileRequest(request, "mobile_workspace_access");
    if (!authResult.ok) {
      return NextResponse.json(
        { ok: false, code: "AUTH_REQUIRED", message: authResult.error },
        { status: authResult.status },
      );
    }

    const { sub: userId, wsId: workspaceId } = authResult.payload;

    if (!workspaceId || authResult.payload.type !== "mobile_workspace_access") {
      return NextResponse.json(
        {
          ok: false,
          code: "WORKSPACE_FORBIDDEN",
          message: "A valid workspace session token is required to access lead details",
        },
        { status: 403 },
      );
    }

    const { leadId } = await context.params;
    if (!leadId) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Missing leadId parameter" },
        { status: 400 },
      );
    }

    // Validate server-authoritative ACTIVE membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      select: {
        role: true,
        status: true,
        workspace: {
          select: {
            status: true,
          },
        },
      },
    });

    if (
      !membership ||
      membership.status !== "ACTIVE" ||
      membership.workspace.status !== "ACTIVE"
    ) {
      return NextResponse.json(
        {
          ok: false,
          code: "WORKSPACE_FORBIDDEN",
          message: "Inactive or unauthorized workspace membership",
        },
        { status: 403 },
      );
    }

    const role = membership.role;

    // Single selective Prisma query with relations
    const lead = await prisma.lead.findUnique({
      where: {
        id: leadId,
      },
      select: {
        id: true,
        workspaceId: true,
        status: true,
        source: true,
        intent: true,
        isBuyer: true,
        isSeller: true,
        score: true,
        notes: true,
        listingMls: true,
        inquiryTag: true,
        assignedAgentId: true,
        firstRespondedAt: true,
        statusChangedAt: true,
        contactConsentAt: true,
        lostReason: true,
        winReason: true,
        utmSource: true,
        utmCampaign: true,
        createdAt: true,
        updatedAt: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            purchaseTimeframe: true,
            homeAddress: true,
            createdAt: true,
            caslConsentAt: true,
            emailAlertsEnabled: true,
            emailVerified: true,
            emailUpdateRequestedAt: true,
            phoneUpdateRequestedAt: true,
          },
        },
        assignedAgent: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        activities: {
          // Keep first paint light — Conversations tab loads its own emails.
          take: 40,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            type: true,
            body: true,
            createdAt: true,
            meta: true,
          },
        },
        _count: {
          select: {
            leadNotes: true,
            appointments: true,
            tasks: true,
            emailLogs: true,
          },
        },
      },
    });

    // Tenant boundary check: lead must exist and belong to the verified workspace
    if (!lead || lead.workspaceId !== workspaceId) {
      return NextResponse.json(
        {
          ok: false,
          code: "LEAD_NOT_FOUND",
          message: "Lead not found in current workspace",
        },
        { status: 404 },
      );
    }

    // Role-based visibility check
    if (role === "AGENT") {
      const isAssignedToAgent = lead.assignedAgentId === userId;
      const isPondLead = lead.assignedAgentId === null;

      if (!isAssignedToAgent && !isPondLead) {
        // Safe 404 to avoid leaking existence of other agents' private leads
        return NextResponse.json(
          {
            ok: false,
            code: "LEAD_NOT_FOUND",
            message: "Lead not found or access restricted",
          },
          { status: 404 },
        );
      }
    }

    const isPond = lead.assignedAgentId === null;

    const formattedLead = {
      id: lead.id,
      status: lead.status,
      source: lead.source,
      intent: lead.intent,
      score: lead.score,
      inquiryTag: lead.inquiryTag,
      notes: lead.notes,
      listingMls: lead.listingMls,
      firstRespondedAt: lead.firstRespondedAt ? lead.firstRespondedAt.toISOString() : null,
      statusChangedAt: lead.statusChangedAt.toISOString(),
      contactConsentAt: lead.contactConsentAt ? lead.contactConsentAt.toISOString() : null,
      lostReason: lead.lostReason,
      winReason: lead.winReason,
      utmSource: lead.utmSource,
      utmCampaign: lead.utmCampaign,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
      customer: lead.customer
        ? {
            id: lead.customer.id,
            name: lead.customer.name,
            email: lead.customer.email,
            phone: lead.customer.phone,
            ...displayedCrmClassification(lead),
            purchaseTimeframe: lead.customer.purchaseTimeframe,
            homeAddress: lead.customer.homeAddress,
            createdAt: lead.customer.createdAt.toISOString(),
            caslConsentAt: lead.customer.caslConsentAt
              ? lead.customer.caslConsentAt.toISOString()
              : null,
            emailAlertsEnabled: lead.customer.emailAlertsEnabled,
            emailVerified: Boolean(lead.customer.emailVerified),
            emailUpdateRequestedAt: lead.customer.emailUpdateRequestedAt
              ? lead.customer.emailUpdateRequestedAt.toISOString()
              : null,
            phoneUpdateRequestedAt: lead.customer.phoneUpdateRequestedAt
              ? lead.customer.phoneUpdateRequestedAt.toISOString()
              : null,
          }
        : null,
      assignedAgent: lead.assignedAgent
        ? {
            id: lead.assignedAgent.id,
            name: lead.assignedAgent.name,
            email: lead.assignedAgent.email,
          }
        : null,
      isPond,
      recentActivities: (() => {
        const mapped = lead.activities.map((act) => {
          const meta =
            act.meta && typeof act.meta === "object" && !Array.isArray(act.meta)
              ? (act.meta as Record<string, unknown>)
              : null;
          const pinned = meta?.pinned === true;
          const noteId =
            typeof meta?.noteId === "string" && meta.noteId.trim()
              ? meta.noteId.trim()
              : undefined;
          return {
            id: act.id,
            type: act.type,
            body: act.body,
            createdAt: act.createdAt.toISOString(),
            // Stage 4.5.2 — expose canonical LeadNote pin (stored on activity meta)
            ...(pinned ? { pinned: true as const } : {}),
            ...(noteId ? { noteId } : {}),
          };
        });
        // Float pinned notes to top (web CrmTimeline / customer-timeline parity)
        const pinnedItems = mapped.filter((a) => a.pinned);
        const rest = mapped.filter((a) => !a.pinned);
        return [...pinnedItems, ...rest];
      })(),
      counts: {
        notes: lead._count.leadNotes,
        appointments: lead._count.appointments,
        tasks: lead._count.tasks,
        emails: lead._count.emailLogs,
      },
      // Conversations tab fetches its own list — omit heavy email bodies here.
      emails: [],
    };

    return NextResponse.json({
      ok: true,
      lead: formattedLead,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      {
        ok: false,
        code: "SERVER_ERROR",
        message,
      },
      { status: 500 },
    );
  }
}
