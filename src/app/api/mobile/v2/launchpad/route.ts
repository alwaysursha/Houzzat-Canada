/**
 * Mobile v2 Launchpad — same desk snapshot as web Instant Shell /api/agent/launchpad.
 * Desk cookie forced null (My desk / Team overview by WorkspaceMember.role).
 */

import { NextResponse } from "next/server";
import { loadLaunchpadPayload } from "@/lib/agent/launchpad-payload";
import {
  buildMobileStatisticsContext,
  isLaunchpadDeskContextResolved,
} from "@/lib/mobile/v2/statistics-context";
import { authorizeMobileWorkspaceAccess } from "@/lib/mobile/v2/workspace-access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const access = await authorizeMobileWorkspaceAccess(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    const ctx = await buildMobileStatisticsContext({
      userId: access.userId,
      workspaceId: access.workspaceId,
      role: access.role,
    });

    if (!isLaunchpadDeskContextResolved(ctx)) {
      return NextResponse.json(
        {
          ok: false,
          code: "WORKSPACE_FORBIDDEN",
          message: "Unable to resolve workspace desk context",
        },
        { status: 403 },
      );
    }

    const payload = await loadLaunchpadPayload(ctx, { deskCookie: null });

    return NextResponse.json({
      ok: true,
      data: {
        workspaceId: access.workspaceId,
        deskView: payload.deskView,
        dueTodayCount: payload.dueTodayCount,
        overdueTaskCount: payload.overdueTaskCount,
        newLeadCount: payload.newLeadCount,
        contactedCount: payload.contactedCount,
        avgResponseMins: payload.avgResponseMins,
        hotCount: payload.hotCount,
        callNewLeads: payload.callNewLeads,
        contactedLeads: payload.contactedLeads,
        openTasks: payload.openTasks,
        onlineLeads: payload.onlineLeads,
        hotLeads: payload.hotLeads,
        contactRequested: payload.contactRequested.map((l) => ({
          id: l.id,
          source: l.source,
          status: l.status,
          listingMls: l.listingMls,
          inquiryTag: l.inquiryTag,
          createdAt: l.createdAt,
          customer: l.customer
            ? {
                name: l.customer.name,
                email: l.customer.email,
                isBuyer: l.customer.isBuyer,
                isSeller: l.customer.isSeller,
              }
            : null,
          isOnline: l.isOnline ?? false,
        })),
      },
    });
  } catch (error) {
    console.error("[mobile/v2/launchpad]", error);
    return NextResponse.json(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Failed to load launchpad",
      },
      { status: 500 },
    );
  }
}
