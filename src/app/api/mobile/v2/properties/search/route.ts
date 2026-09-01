/**
 * Stage 5.3 — GET /api/mobile/v2/properties/search
 *
 * MLS property search for native Properties module.
 * Reuses getListingProvider().search() — same canonical listings as web /agent/search.
 */

import { NextResponse } from "next/server";
import { getListingProvider } from "@/lib/listings/provider";
import { parseListingSearchQueryParams } from "@/lib/listings/parse-search-query-params";
import { authorizeMobileWorkspaceAccess } from "@/lib/mobile/v2/workspace-access";

export const runtime = "nodejs";

const MAX_LIMIT = 60;

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
    const params = parseListingSearchQueryParams(url.searchParams, {
      defaultLimit: 60,
      includeMapBounds: false,
    });

    if (params.limit != null && params.limit > MAX_LIMIT) {
      params.limit = MAX_LIMIT;
    }

    const provider = getListingProvider();
    const result = await provider.search(params);

    return NextResponse.json({
      ok: true,
      data: {
        listings: result.items,
        total: result.total ?? result.items.length,
        nextCursor: result.nextCursor ?? null,
        limit: params.limit ?? 60,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
