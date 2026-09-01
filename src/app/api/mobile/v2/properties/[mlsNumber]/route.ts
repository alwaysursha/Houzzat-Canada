/**
 * Stage 5.4 — GET /api/mobile/v2/properties/[mlsNumber]
 *
 * Native property detail for HouzzatPRO agents.
 * Reuses loadListingForDetailPage — same inventory as consumer /listing/...
 */

import { NextResponse } from "next/server";
import {
  buildMobilePropertyDetailDto,
} from "@/lib/mobile/v2/build-property-detail";
import { authorizeMobileWorkspaceAccess } from "@/lib/mobile/v2/workspace-access";
import { isListingSavedByUser } from "@/lib/mobile/v2/saved-listings";
import { loadListingForDetailPage } from "@/lib/listings/load-listing-for-detail";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ mlsNumber: string }> },
) {
  try {
    const access = await authorizeMobileWorkspaceAccess(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    const { mlsNumber: raw } = await context.params;
    const mlsNumber = decodeURIComponent(raw).trim().toUpperCase();
    if (!mlsNumber) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Missing MLS number" },
        { status: 400 },
      );
    }

    const listing = await loadListingForDetailPage(mlsNumber);
    if (!listing) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", message: "Listing not found" },
        { status: 404 },
      );
    }

    const detail = buildMobilePropertyDetailDto(listing);
    const saved = await isListingSavedByUser(access.userId, mlsNumber);

    return NextResponse.json({
      ok: true,
      data: {
        detail,
        saved,
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
