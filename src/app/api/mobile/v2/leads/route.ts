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
 * - Supports server-side pagination (limit, page), status filtering, search,
 *   view (all|mine|pond), and sort (default: lastLogin desc — web CRM parity).
 */

import { NextResponse } from "next/server";
import { LeadStatus } from "@prisma/client";
import { computeHotnessMap } from "@/lib/agent/hotness";
import { displayedCrmClassification } from "@/lib/agent/lead-classification";
import { selectPrimaryLeadsByCustomer } from "@/lib/agent/select-primary-leads-by-customer";
import { prisma } from "@/lib/prisma";
import { authenticateMobileRequest } from "@/lib/mobile/v2/auth-guard";

export const runtime = "nodejs";

const VALID_LEAD_STATUSES = new Set<string>(Object.values(LeadStatus));

const SORT_KEYS = [
  "lastLogin",
  "updated",
  "created",
  "score",
  "name",
  "status",
] as const;
type LeadSortKey = (typeof SORT_KEYS)[number];

const PIPELINE_STATUS_ORDER: Record<string, number> = {
  NEW_LEAD: 0,
  ATTEMPTED_CONTACT: 1,
  CONTACTED: 2,
  APPT_SET: 3,
  APPT_MET: 4,
  ACTIVE_CLIENT: 5,
  PENDING_CLIENT: 6,
  PAST_CLIENT: 7,
};

function parseSort(raw: string | null): LeadSortKey {
  const v = (raw || "lastLogin").trim();
  return (SORT_KEYS as readonly string[]).includes(v)
    ? (v as LeadSortKey)
    : "lastLogin";
}

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

    const limitParam = parseInt(url.searchParams.get("limit") || "25", 10);
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, 100)
        : 25;
    const pageParam = parseInt(url.searchParams.get("page") || "1", 10);
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const skip = (page - 1) * limit;

    const viewParam = url.searchParams.get("view")?.trim().toLowerCase();
    const sortKey = parseSort(url.searchParams.get("sort"));
    const sortDir =
      url.searchParams.get("dir")?.trim().toLowerCase() === "asc"
        ? "asc"
        : "desc";

    const statusParam = url.searchParams.get("status")?.trim().toUpperCase();
    const statusFilter: LeadStatus | null =
      statusParam && VALID_LEAD_STATUSES.has(statusParam)
        ? (statusParam as LeadStatus)
        : null;

    const searchQuery = (
      url.searchParams.get("search") ||
      url.searchParams.get("q") ||
      ""
    ).trim();

    const whereConditions: Record<string, unknown> = {
      workspaceId,
    };

    if (role === "AGENT") {
      if (viewParam === "pond") {
        whereConditions.assignedAgentId = null;
      } else if (viewParam === "mine") {
        whereConditions.assignedAgentId = userId;
      } else {
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

    if (statusFilter) {
      whereConditions.status = statusFilter;
    }

    if (searchQuery.length > 0) {
      const searchOr = [
        { customer: { name: { contains: searchQuery, mode: "insensitive" } } },
        { customer: { email: { contains: searchQuery, mode: "insensitive" } } },
        { customer: { phone: { contains: searchQuery, mode: "insensitive" } } },
      ];

      if (whereConditions.OR) {
        whereConditions.AND = [
          { OR: whereConditions.OR },
          { OR: searchOr },
        ];
        delete whereConditions.OR;
      } else {
        whereConditions.OR = searchOr;
      }
    }

    // Collapse + memory sort share a capped cohort so pagination stays stable.
    const needsMemorySort =
      sortKey === "lastLogin" || sortKey === "name" || sortKey === "status";
    const dbOrderBy =
      sortKey === "created"
        ? [{ createdAt: sortDir as "asc" | "desc" }]
        : sortKey === "score"
          ? [
              { score: sortDir as "asc" | "desc" },
              { updatedAt: "desc" as const },
            ]
          : sortKey === "updated"
            ? [
                { updatedAt: sortDir as "asc" | "desc" },
                { createdAt: "desc" as const },
              ]
            : [
                { updatedAt: "desc" as const },
                { createdAt: "desc" as const },
              ];
    const [fetchedLeads] = await Promise.all([
      prisma.lead.findMany({
        where: whereConditions,
        orderBy: dbOrderBy,
        take: 500,
        select: {
          id: true,
          status: true,
          source: true,
          intent: true,
          isBuyer: true,
          isSeller: true,
          score: true,
          customerId: true,
          createdAt: true,
          updatedAt: true,
          statusChangedAt: true,
          firstRespondedAt: true,
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              phoneE164: true,
              createdAt: true,
              emailVerified: true,
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
    ]);

    const leads = selectPrimaryLeadsByCustomer(fetchedLeads);
    const totalCount = leads.length;

    const hotMap = await computeHotnessMap(
      leads.map((l) => ({
        id: l.id,
        customerId: l.customerId,
        status: l.status,
        score: l.score,
        createdAt: l.createdAt,
        firstRespondedAt: l.firstRespondedAt,
      })),
    );

    type Row = {
      id: string;
      status: string;
      source: string;
      intent: string;
      score: number;
      createdAt: string;
      updatedAt: string;
      statusChangedAt: string;
      lastSeenAt: string | null;
      isOnline: boolean;
      customer: {
        id: string;
        name: string | null;
        email: string | null;
        phone: string | null;
        phoneE164: string | null;
        isBuyer: boolean;
        isSeller: boolean;
        createdAt: string;
        emailVerified: boolean;
      } | null;
      assignedAgent: {
        id: string;
        name: string | null;
        email: string | null;
      } | null;
      _sortName: string;
    };

    let rows: Row[] = leads.map((lead) => {
      const hot = hotMap.get(lead.id);
      return {
        id: lead.id,
        status: lead.status,
        source: lead.source,
        intent: lead.intent,
        score: lead.score,
        createdAt: lead.createdAt.toISOString(),
        updatedAt: lead.updatedAt.toISOString(),
        statusChangedAt: lead.statusChangedAt.toISOString(),
        lastSeenAt: hot?.lastSeenAt?.toISOString() ?? null,
        isOnline: Boolean(hot?.isOnline),
        customer: lead.customer
          ? {
              id: lead.customer.id,
              name: lead.customer.name,
              email: lead.customer.email,
              phone: lead.customer.phone,
              phoneE164: lead.customer.phoneE164,
              ...displayedCrmClassification(lead),
              createdAt: lead.customer.createdAt.toISOString(),
              emailVerified: Boolean(lead.customer.emailVerified),
            }
          : null,
        assignedAgent: lead.assignedAgent
          ? {
              id: lead.assignedAgent.id,
              name: lead.assignedAgent.name,
              email: lead.assignedAgent.email,
            }
          : null,
        _sortName: (
          lead.customer?.name ||
          lead.customer?.email ||
          lead.source
        ).toLowerCase(),
      };
    });

    if (needsMemorySort) {
      rows.sort((a, b) => {
        let cmp = 0;
        if (sortKey === "lastLogin") {
          const at = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
          const bt = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
          cmp = at - bt;
        } else if (sortKey === "name") {
          cmp = a._sortName.localeCompare(b._sortName);
        } else if (sortKey === "status") {
          cmp =
            (PIPELINE_STATUS_ORDER[a.status] ?? 99) -
            (PIPELINE_STATUS_ORDER[b.status] ?? 99);
        }
        if (cmp !== 0) return sortDir === "asc" ? cmp : -cmp;
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });
    }

    rows = rows.slice(skip, skip + limit);

    const formattedLeads = rows.map(({ _sortName: _omit, ...lead }) => lead);

    return NextResponse.json({
      ok: true,
      data: {
        leads: formattedLeads,
        pagination: {
          page,
          limit,
          totalCount,
          hasMore: skip + formattedLeads.length < totalCount,
        },
        sort: { key: sortKey, dir: sortDir },
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
