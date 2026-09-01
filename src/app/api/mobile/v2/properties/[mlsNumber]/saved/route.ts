/**
 * Stage 5.4 — POST/DELETE /api/mobile/v2/properties/[mlsNumber]/saved
 *
 * Add/remove canonical SavedListing (UI: Shortlist).
 */

import { NextResponse } from "next/server";
import {
  saveListingForUser,
  unsaveListingForUser,
} from "@/lib/mobile/v2/saved-listings";
import { authorizeMobileWorkspaceAccess } from "@/lib/mobile/v2/workspace-access";

export const runtime = "nodejs";

export async function POST(
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
    const mlsNumber = decodeURIComponent(raw).trim();
    if (!mlsNumber) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Missing MLS number" },
        { status: 400 },
      );
    }

    const result = await saveListingForUser(access.userId, mlsNumber);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", message: result.message },
        { status: result.status },
      );
    }

    return NextResponse.json({
      ok: true,
      data: { saved: true, mlsNumber: mlsNumber.toUpperCase() },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}

export async function DELETE(
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
    const mlsNumber = decodeURIComponent(raw).trim();
    if (!mlsNumber) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Missing MLS number" },
        { status: 400 },
      );
    }

    await unsaveListingForUser(access.userId, mlsNumber);

    return NextResponse.json({
      ok: true,
      data: { saved: false, mlsNumber: mlsNumber.toUpperCase() },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
