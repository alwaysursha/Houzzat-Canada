/**
 * Stage 5.9 — GET /api/mobile/v2/statistics?range=7|30|90
 *
 * Canonical agent Statistics (web /agent/statistics).
 * Reuses loadAgentStatistics — same KPI / pipeline / source definitions.
 *
 * No conversion rates invented. No inbound email metrics.
 * Desk cookie forced null (My desk / Team overview).
 */

import { NextResponse } from "next/server";
import { loadAgentStatistics } from "@/lib/agent/statistics";
import {
  buildMobileStatisticsContext,
  parseMobileStatisticsRange,
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

    const url = new URL(request.url);
    const range = parseMobileStatisticsRange(url.searchParams.get("range"));
    if (range === "invalid") {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Invalid range. Use 7, 30, or 90.",
        },
        { status: 400 },
      );
    }

    const ctx = await buildMobileStatisticsContext({
      userId: access.userId,
      workspaceId: access.workspaceId,
      role: access.role,
    });

    const scopeFallback =
      access.role === "OWNER" || access.role === "ADMIN"
        ? "Team overview"
        : "My desk";

    if (!ctx) {
      return NextResponse.json({
        ok: true,
        data: {
          statistics: {
            scopeLabel: scopeFallback,
            rangeDays: range,
            kpis: {
              leadsTotal: 0,
              leadsPeriod: 0,
              leadsToday: 0,
              newWaiting: 0,
              responseRate: 0,
              avgResponseMins: null,
              medianResponseMins: null,
              listingViewsPeriod: 0,
              searchesPeriod: 0,
              emailsPeriod: 0,
              tasksCompletedPeriod: 0,
              appointmentsPeriod: 0,
              hotLeads: 0,
              savesPeriod: 0,
            },
            leadsByDay: [],
            pipeline: [],
            sources: [],
            inquiryTags: [],
            intentMix: [],
            activityByType: [],
            funnel: [],
            responseBuckets: [
              { label: "< 15m", count: 0 },
              { label: "15–60m", count: 0 },
              { label: "1–4h", count: 0 },
              { label: "4–24h", count: 0 },
              { label: "> 24h", count: 0 },
            ],
          },
          meta: {
            responseRateDefinition: "non_new_lead_share_all_time",
            funnelDefinition: "stage_concentration_not_conversion",
            inboundEmailCanonical: false,
            ranges: [7, 30, 90] as const,
          },
        },
      });
    }

    // Force no web desk cookie — mobile has no Admin HQ desk picker yet.
    const statistics = await loadAgentStatistics(ctx, range, {
      deskCookie: null,
    });

    return NextResponse.json({
      ok: true,
      data: {
        statistics,
        meta: {
          responseRateDefinition: "non_new_lead_share_all_time",
          funnelDefinition: "stage_concentration_not_conversion",
          inboundEmailCanonical: false,
          ranges: [7, 30, 90] as const,
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
