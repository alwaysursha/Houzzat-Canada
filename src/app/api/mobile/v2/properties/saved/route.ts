/**
 * Stage 5.5 — GET /api/mobile/v2/properties/saved?enrich=cards
 *
 * Canonical SavedListing list with batch listing-card hydration.
 * UI label: Shortlist.
 */

import { NextResponse } from "next/server";
import { listSavedMlsForUser } from "@/lib/mobile/v2/saved-listings";
import { loadSavedListingCardsForUser } from "@/lib/mobile/v2/load-saved-listing-cards";
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

    const enrich = url.searchParams.get("enrich");
    if (enrich === "cards") {
      const limitRaw = url.searchParams.get("limit");
      const offsetRaw = url.searchParams.get("offset");
      const limit = limitRaw ? Number(limitRaw) : undefined;
      const offset = offsetRaw ? Number(offsetRaw) : undefined;

      const page = await loadSavedListingCardsForUser(access.userId, {
        limit: Number.isFinite(limit) ? limit : undefined,
        offset: Number.isFinite(offset) ? offset : undefined,
      });

      return NextResponse.json({
        ok: true,
        data: {
          listings: page.listings
            .filter((row) => row.card != null)
            .map((row) => row.card),
          missingMls: page.listings
            .filter((row) => row.card == null)
            .map((row) => row.mlsNumber),
          total: page.total,
          hasMore: page.hasMore,
          limit: page.limit,
          offset: page.offset,
        },
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
