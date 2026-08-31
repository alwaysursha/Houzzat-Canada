/**
 * Stage 4.3A — GET /api/mobile/v2/leads
 *
 * Workspace-scoped Mobile v2 Leads API for HouzzatPRO Native CRM.
 *
 * TENANCY & AUTHORIZATION RULES:
 * - Requires a valid mobile_workspace_access token.
 * - Workspace authority is derived STRICTLY from validated token claim (wsId).
 * - Never accepts workspaceId from query param, body, headers, or hostname.
 * - Server re-validates that WorkspaceMember is ACTIVE in the database.
 * - AGENT role: Can access leads assigned to them (assignedAgentId == userId)
 *   and unassigned leads in the workspace pond (assignedAgentId == null).
 * - OWNER / ADMIN role: Can access all leads in the workspace.
 * - Supports server-side pagination (limit, page), status filtering, and search.
 */

import { NextResponse } from "next/server";
import { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateMobileRequest } from "@/lib/mobile/v2/auth-guard";

export const runtime = "nodejs";

const VALID_LEAD_STATUSES = new Set<string>(Object.values(LeadStatus));

export async function GET(request: Request) {
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
          message: "A valid workspace session token is required to access leads",
        },
        { status: 403 },
      );
    }

    // Validate server-authoritative ACTIVE membership and workspace status
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
    const url = new URL(request.url);

    // 1. Pagination parameters
    const limitParam = parseInt(url.searchParams.get("limit") || "25", 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 25;
    const pageParam = parseInt(url.searchParams.get("page") || "1", 10);
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const skip = (page - 1) * limit;

    // 2. View filter (all | mine | pond)
    const viewParam = url.searchParams.get("view")?.trim().toLowerCase();

    // 3. Status filter
    const statusParam = url.searchParams.get("status")?.trim().toUpperCase();
    const statusFilter: LeadStatus | null =
      statusParam && VALID_LEAD_STATUSES.has(statusParam)
        ? (statusParam as LeadStatus)
        : null;

    // 4. Search query (searches customer name, email, phone)
    const searchQuery = (url.searchParams.get("search") || url.searchParams.get("q") || "").trim();

    // Construct tenant & role-scoped WHERE clause
    const whereConditions: any = {
      workspaceId,
    };

    // Role visibility rules
    if (role === "AGENT") {
      if (viewParam === "pond") {
        whereConditions.assignedAgentId = null;
      } else if (viewParam === "mine") {
        whereConditions.assignedAgentId = userId;
      } else {
        // Default agent view: Assigned to agent OR unassigned pond leads
        whereConditions.OR = [
          { assignedAgentId: userId },
          { assignedAgentId: null },
        ];
      }
    } else if (role === "OWNER" || role === "ADMIN") {
      if (viewParam === "mine") {
        whereConditions.assignedAgentId = userId;
      } else if (viewParam === "pond") {
        whereConditions.assignedAgentId = null;
      }
      // Otherwise OWNER/ADMIN sees all workspace leads
    } else {
      return NextResponse.json(
        {
          ok: false,
          code: "WORKSPACE_FORBIDDEN",
          message: "Unsupported role for leads access",
        },
        { status: 403 },
      );
    }

    // Status condition
    if (statusFilter) {
      whereConditions.status = statusFilter;
    }

    // Search condition
    if (searchQuery.length > 0) {
      const searchOr = [
        { customer: { name: { contains: searchQuery, mode: "insensitive" } } },
        { customer: { email: { contains: searchQuery, mode: "insensitive" } } },
        { customer: { phone: { contains: searchQuery, mode: "insensitive" } } },
      ];

      if (whereConditions.OR) {
        // Combine role OR and search OR with AND
        whereConditions.AND = [
          { OR: whereConditions.OR },
          { OR: searchOr },
        ];
        delete whereConditions.OR;
      } else {
        whereConditions.OR = searchOr;
      }
    }

    // Execute query with summary projection & count
    const [leads, totalCount] = await Promise.all([
      prisma.lead.findMany({
        where: whereConditions,
        orderBy: [
          { updatedAt: "desc" },
          { createdAt: "desc" },
        ],
        skip,
        take: limit,
        select: {
          id: true,
          status: true,
          source: true,
          intent: true,
          score: true,
          createdAt: true,
          updatedAt: true,
          statusChangedAt: true,
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          assignedAgent: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      prisma.lead.count({ where: whereConditions }),
    ]);

    const formattedLeads = leads.map((lead) => ({
      id: lead.id,
      status: lead.status,
      source: lead.source,
      intent: lead.intent,
      score: lead.score,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
      statusChangedAt: lead.statusChangedAt.toISOString(),
      customer: lead.customer
        ? {
            id: lead.customer.id,
            name: lead.customer.name,
            email: lead.customer.email,
            phone: lead.customer.phone,
          }
        : null,
      assignedAgent: lead.assignedAgent
        ? {
            id: lead.assignedAgent.id,
            name: lead.assignedAgent.name,
            email: lead.assignedAgent.email,
          }
        : null,
    }));

    return NextResponse.json({
      ok: true,
      data: {
        leads: formattedLeads,
        pagination: {
          page,
          limit,
          totalCount,
          hasMore: skip + leads.length < totalCount,
        },
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
