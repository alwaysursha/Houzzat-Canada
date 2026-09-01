/**
 * Stage 5.4 — GET /api/mobile/v2/properties/saved
 *
 * Canonical SavedListing rows for the authenticated agent user.
 * UI label: Shortlist.
 */

import { NextResponse } from "next/server";
import { listSavedMlsForUser } from "@/lib/mobile/v2/saved-listings";
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
    const mlsParam = url.searchParams.get("mlsNumber")?.trim();
    if (mlsParam) {
      const mlsNumbers = await listSavedMlsForUser(access.userId);
      const normalized = mlsParam.toUpperCase();
      return NextResponse.json({
        ok: true,
        data: { saved: mlsNumbers.includes(normalized) },
      });
    }

    const mlsNumbers = await listSavedMlsForUser(access.userId);
    return NextResponse.json({
      ok: true,
      data: { mlsNumbers },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
