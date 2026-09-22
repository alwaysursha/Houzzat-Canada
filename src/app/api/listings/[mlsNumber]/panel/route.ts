import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildListingPanelPayload } from "@/lib/listings/build-listing-panel";
import { loadListingForDetailPage } from "@/lib/listings/load-listing-for-detail";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import { resolveListingEntitlementContextForRequest } from "@/lib/tenancy/listing-entitlement";

type Params = { params: Promise<{ mlsNumber: string }> };

/**
 * Lean authorized listing bootstrap for the in-app ListingDetailPanel.
 * Same inventory + access rules as /listing/... RSC; response is redacted JSON
 * (not a raw Prisma row). Production clicks still use the iframe sheet.
 *
 * G.10C1: Host → G.7C/G.10A once; web-only force-enable (G5 OFF).
 * Board entitlement before VOW redaction in buildListingPanelPayload.
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { mlsNumber: raw } = await params;
    const mlsNumber = decodeURIComponent(raw).trim().toUpperCase();
    if (!mlsNumber) {
      return NextResponse.json({ error: "Missing MLS number" }, { status: 400 });
    }

    // Never trust client workspaceId / org / provider / SAK.
    const { entitlement } =
      await resolveListingEntitlementContextForRequest(request);

    const listing = await loadListingForDetailPage(mlsNumber, {
      entitlement,
      entitlementFilteringEnabled: true,
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const session = await auth();
    const user = session?.user?.email
      ? await prisma.user.findUnique({
          where: { id: session.user.id },
          select: {
            id: true,
            emailVerified: true,
            createdAt: true,
          },
        })
      : null;

    const sessionContact = user
      ? {
          name: session?.user?.name ?? null,
          email: session?.user?.email ?? null,
          phone: null as string | null,
        }
      : null;

    const result = buildListingPanelPayload(listing, user, sessionContact);
    if (!result.ok) {
      return NextResponse.json(result.body, {
        status: result.status,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    // Match RSC: record a view when the authorized payload is returned.
    scheduleWorkerSideEffect(
      prisma.listingView.create({
        data: { userId: user?.id, mlsNumber: listing.mlsNumber },
      }),
    );

    return NextResponse.json(result.payload, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      "[listings/panel]",
      name,
      message
        .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]")
        .replace(/\S*neon\.tech\S*/gi, "[redacted]")
        .slice(0, 200),
    );
    return NextResponse.json(
      { error: "Listing unavailable" },
      { status: 500 },
    );
  }
}
