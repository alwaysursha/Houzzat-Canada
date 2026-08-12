import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildListingPanelPayload } from "@/lib/listings/build-listing-panel";
import { loadListingForDetailPage } from "@/lib/listings/load-listing-for-detail";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ mlsNumber: string }> };

/**
 * Lean authorized listing bootstrap for the in-app ListingDetailPanel.
 * Same inventory + access rules as /listing/... RSC; response is redacted JSON
 * (not a raw Prisma row). Production clicks still use the iframe sheet.
 */
export async function GET(_request: Request, { params }: Params) {
  const { mlsNumber: raw } = await params;
  const mlsNumber = decodeURIComponent(raw).trim().toUpperCase();
  if (!mlsNumber) {
    return NextResponse.json({ error: "Missing MLS number" }, { status: 400 });
  }

  const listing = await loadListingForDetailPage(mlsNumber);
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const session = await auth();
  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
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
  void prisma.listingView
    .create({
      data: { userId: user?.id, mlsNumber: listing.mlsNumber },
    })
    .catch(() => {});

  return NextResponse.json(result.payload, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
