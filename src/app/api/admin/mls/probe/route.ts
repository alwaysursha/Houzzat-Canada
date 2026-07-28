import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/owner/auth";
import { getPropTxConfig } from "@/lib/proptx/config";
import { PropTxError, proptxFetch } from "@/lib/proptx/client";

/**
 * Admin-only: probe PropTx credentials with $metadata (no secrets returned).
 */
export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = getPropTxConfig();
  if (!config) {
    return NextResponse.json({
      ok: false,
      configured: false,
      message:
        "Missing PROPTX_ENDPOINT_URL, PROPTX_BEARER_TOKEN, or PROPTX_TOKEN_ID.",
    });
  }

  try {
    const res = await proptxFetch("$metadata", {
      headers: { Accept: "application/xml, application/json" },
    });
    const text = await res.text();
    const contentType = res.headers.get("content-type") ?? "";
    return NextResponse.json({
      ok: true,
      configured: true,
      feed: config.feed,
      endpointHost: safeHost(config.endpointUrl),
      tokenIdHeader: config.tokenIdHeader,
      metadataBytes: text.length,
      contentType,
      looksLikeEdmx: /edmx|EntityType|Property/i.test(text),
    });
  } catch (err) {
    if (err instanceof PropTxError) {
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          status: err.status,
          message: err.message,
          bodyPreview: err.body.slice(0, 500),
          hint:
            err.status === 401 || err.status === 403
              ? "Check Bearer token / Token ID header name (PROPTX_TOKEN_ID_HEADER)."
              : undefined,
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        message: err instanceof Error ? err.message : "Probe failed",
      },
      { status: 502 },
    );
  }
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "(invalid endpoint url)";
  }
}
