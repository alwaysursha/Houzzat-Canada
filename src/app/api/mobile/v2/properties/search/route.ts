/**
 * Stage 5.3 — GET /api/mobile/v2/properties/search
 *
 * MLS property search for native Properties module.
 * Reuses getListingProvider().search() — same canonical listings as web /agent/search.
 *
 * Stage 6.11G.10B2: intentionally OUTSIDE request-boundary entitlement wiring.
 * Mobile API traffic arrives on the platform bootstrap host (app.houzzatpro.com),
 * not an authoritative tenant hostname. JWT workspaceId is membership authz only —
 * NOT MLS listing authority. Do not invent tenant entitlement from mobile workspace
 * selection. Wire in a later stage with a trustworthy tenant-host mapping.
 */

import { NextResponse } from "next/server";
import { feedCitiesForMarkets } from "@/lib/agent/service-areas";
import { loadAgentServiceAreas } from "@/lib/agent/service-areas-store";
import { getListingProvider } from "@/lib/listings/provider";
import { prisma } from "@/lib/prisma";
import { parseListingSearchQueryParams } from "@/lib/listings/parse-search-query-params";
import {
  findListingsByMlsPrefix,
  findListingsByPreciseAddress,
  normalizeExactMlsTokens,
  normalizeMlsPrefix,
} from "@/lib/listings/precise-property-search";
import { enrichListingCardForMobile } from "@/lib/mobile/v2/build-property-detail";
import { authorizeMobileWorkspaceAccess } from "@/lib/mobile/v2/workspace-access";
import { enrichTourStops } from "@/lib/route-planner/server";

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
    const mode = url.searchParams.get("mode");

    if (mode === "feed") {
      const markets = await loadAgentServiceAreas(
        prisma,
        access.userId,
        access.workspaceId,
      );
      const feed = feedCitiesForMarkets(markets);
      const params = parseListingSearchQueryParams(url.searchParams, {
        defaultLimit: 60,
        includeMapBounds: false,
      });
      params.q = undefined;
      params.cities = feed.cities;
      params.city = undefined;
      if (params.limit != null && params.limit > MAX_LIMIT) {
        params.limit = MAX_LIMIT;
      }
      const provider = getListingProvider();
      const result = await provider.search(params);
      return NextResponse.json({
        ok: true,
        data: {
          listings: result.items.map((item) => enrichListingCardForMobile(item)),
          total: result.total ?? result.items.length,
          nextCursor: result.nextCursor ?? null,
          limit: params.limit ?? 60,
          serviceAreaSource: feed.source,
        },
      });
    }

    const mlsParam = url.searchParams.get("mls");
    const qParam = url.searchParams.get("q")?.trim() ?? "";

    if (mode === "prefix") {
      const prefix = normalizeMlsPrefix(mlsParam ?? qParam);
      const cards = prefix ? await findListingsByMlsPrefix(prefix) : [];
      const listings = cards.map((card) => enrichListingCardForMobile(card));
      return NextResponse.json({
        ok: true,
        data: {
          listings,
          notFound: [],
          total: listings.length,
          nextCursor: null,
          limit: listings.length,
        },
      });
    }

    if (mode === "exact" || (mlsParam?.trim() && mode !== "address")) {
      const wanted = normalizeExactMlsTokens(mlsParam ?? "");
      const cards = await enrichTourStops(wanted);
      const byUpper = new Map(
        [...cards.entries()].map(([mls, card]) => [mls.toUpperCase(), card]),
      );
      const listings = wanted.flatMap((mls) => {
        const card = byUpper.get(mls);
        return card ? [enrichListingCardForMobile(card)] : [];
      });
      const found = new Set(listings.map((item) => item.mlsNumber.toUpperCase()));
      return NextResponse.json({
        ok: true,
        data: {
          listings,
          notFound: wanted.filter((mls) => !found.has(mls)),
          total: listings.length,
          nextCursor: null,
          limit: wanted.length,
        },
      });
    }

    if (mode === "address" || (qParam.length >= 3 && !mode)) {
      const transaction = url.searchParams.get("transactionType");
      const cards = await findListingsByPreciseAddress(
        qParam,
        transaction === "SALE" || transaction === "LEASE" ? transaction : null,
      );
      const listings = cards.map((card) => enrichListingCardForMobile(card));
      return NextResponse.json({
        ok: true,
        data: {
          listings,
          notFound: [],
          total: listings.length,
          nextCursor: null,
          limit: listings.length,
        },
      });
    }

    if (qParam.length > 0 && qParam.length < 3) {
      return NextResponse.json({
        ok: true,
        data: {
          listings: [],
          notFound: [],
          total: 0,
          nextCursor: null,
          limit: 0,
        },
      });
    }

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
        listings: result.items.map((item) => enrichListingCardForMobile(item)),
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
