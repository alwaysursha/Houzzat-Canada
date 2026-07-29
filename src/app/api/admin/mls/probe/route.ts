import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/owner/auth";
import {
  getPropTxIdxConfig,
  getPropTxVowConfig,
  getSiteFeedMode,
} from "@/lib/proptx/config";
import { PropTxError, proptxFetch } from "@/lib/proptx/client";
import type { PropTxConfig } from "@/lib/proptx/config";

/**
 * Admin-only: probe IDX (and optional VOW) credentials with $metadata.
 * Never returns secrets.
 */
export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idx = getPropTxIdxConfig();
  const vow = getPropTxVowConfig();
  if (!idx && !vow) {
    return NextResponse.json({
      ok: false,
      configured: false,
      siteFeed: getSiteFeedMode(),
      message:
        "Missing IDX credentials. Set PROPTX_ENDPOINT_URL + PROPTX_TOKEN_ID + PROPTX_BEARER_TOKEN (or PROPTX_IDX_*).",
    });
  }

  const probes: Record<string, unknown> = {
    siteFeed: getSiteFeedMode(),
    idxConfigured: Boolean(idx),
    vowConfigured: Boolean(vow),
  };

  if (idx) {
    probes.idx = await probeFeed(idx);
  }
  if (vow) {
    probes.vow = await probeFeed(vow);
  }

  const idxOk =
    typeof probes.idx === "object" &&
    probes.idx !== null &&
    (probes.idx as { ok?: boolean }).ok === true;
  const vowOk =
    !vow ||
    (typeof probes.vow === "object" &&
      probes.vow !== null &&
      (probes.vow as { ok?: boolean }).ok === true);

  return NextResponse.json({
    ok: idxOk && vowOk,
    configured: true,
    visitorAccess: idxOk
      ? "IDX — guests can browse active listings after deploy with PROPTX_FEED=idx"
      : "IDX credentials missing or failing — visitors are not on an IDX Token yet",
    ...probes,
  });
}

async function probeFeed(config: PropTxConfig) {
  try {
    const res = await proptxFetch(
      "$metadata",
      { headers: { Accept: "application/xml, application/json" } },
      config,
    );
    const text = await res.text();
    const contentType = res.headers.get("content-type") ?? "";
    return {
      ok: true,
      feed: config.feed,
      endpointHost: safeHost(config.endpointUrl),
      tokenIdHeader: config.tokenIdHeader,
      tokenIdSuffix: config.tokenId.slice(-4),
      metadataBytes: text.length,
      contentType,
      looksLikeEdmx: /edmx|EntityType|Property/i.test(text),
    };
  } catch (err) {
    if (err instanceof PropTxError) {
      return {
        ok: false,
        feed: config.feed,
        status: err.status,
        message: err.message,
        bodyPreview: err.body.slice(0, 500),
        hint:
          err.status === 401 || err.status === 403
            ? "Check Bearer token / Token ID (and PROPTX_TOKEN_ID_HEADER if needed)."
            : undefined,
      };
    }
    return {
      ok: false,
      feed: config.feed,
      message: err instanceof Error ? err.message : "Probe failed",
    };
  }
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "(invalid endpoint url)";
  }
}
