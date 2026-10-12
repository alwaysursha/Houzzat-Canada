import { NextResponse } from "next/server";
import { resolveChatListingUrlPreview } from "@/lib/chat/listing-url-preview-server";

/**
 * Authorized Houzzat listing preview for chat composers / URL cards.
 * Uses listing-share snapshot (+ panel fallback). Does not scrape pages.
 * Does not record listing views.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mlsNumber = (searchParams.get("mlsNumber") ?? "").trim();
    const result = await resolveChatListingUrlPreview({
      request,
      mlsNumber,
    });
    if (!result.ok) {
      const status =
        result.reason === "UNAUTHORIZED"
          ? 401
          : result.reason === "NOT_FOUND"
            ? 404
            : result.reason === "INVALID"
              ? 400
              : 403;
      return NextResponse.json(result, {
        status,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error(
      "[chat/listing-url-preview]",
      error instanceof Error ? error.name : "Error",
    );
    return NextResponse.json(
      {
        ok: false,
        reason: "UNAVAILABLE",
        message: "Listing preview is temporarily unavailable.",
      },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
