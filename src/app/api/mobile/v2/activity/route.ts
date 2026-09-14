/**
 * GET /api/mobile/v2/activity?category=all&take=60
 *
 * Desk activity feed (web globe drawer /api/agent/activity).
 * Same loadDeskActivityFeed + desk scope as Instant Shell.
 */

import { NextResponse } from "next/server";
import {
  isDeskActivityCategory,
  loadDeskActivityFeed,
} from "@/lib/agent/desk-activity";
import { buildMobileStatisticsContext } from "@/lib/mobile/v2/statistics-context";
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
    const categoryRaw = url.searchParams.get("category") ?? "all";
    const category = isDeskActivityCategory(categoryRaw) ? categoryRaw : "all";
    const takeRaw = Number(url.searchParams.get("take") ?? "60");
    const take = Number.isFinite(takeRaw) ? takeRaw : 60;

    const ctx = await buildMobileStatisticsContext({
      userId: access.userId,
      workspaceId: access.workspaceId,
      role: access.role,
    });

    if (!ctx) {
      return NextResponse.json({
        ok: true,
        data: { items: [], category },
      });
    }

    const items = await loadDeskActivityFeed({ ctx, category, take });
    return NextResponse.json({
      ok: true,
      data: { items, category },
    });
  } catch (err) {
    console.error("[mobile/v2/activity]", err);
    return NextResponse.json(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Failed to load activity",
      },
      { status: 500 },
    );
  }
}
