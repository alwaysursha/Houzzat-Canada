import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  resolveListingDetailAccess,
  type ListingPanelAccess,
} from "@/lib/listings/build-listing-panel";
import type { AccessUser } from "@/lib/account-access";
import { prisma } from "@/lib/prisma";
import type { ListingStatus } from "@prisma/client";

export type ListingDetailApiListing = {
  id: string;
  mlsNumber: string;
  listingKey: string | null;
  status: ListingStatus;
  dataSource: string | null;
  listPrice: number;
  soldPrice: number | null;
};

export type ListingDetailApiAccessOk = {
  ok: true;
  listing: ListingDetailApiListing;
  access: ListingPanelAccess;
  user: AccessUser | null;
};

export type ListingDetailApiAccessResult =
  | ListingDetailApiAccessOk
  | { ok: false; response: NextResponse };

/**
 * Shared VOW / client access gate for listing deferred APIs
 * (gallery, rooms, address-history) — same rules as /panel bootstrap.
 */
export async function loadListingDetailApiAccess(
  mlsNumberRaw: string,
): Promise<ListingDetailApiAccessResult> {
  const mlsNumber = mlsNumberRaw.trim().toUpperCase();
  if (!mlsNumber) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Missing MLS number" },
        { status: 400 },
      ),
    };
  }

  const listing = await prisma.listing.findUnique({
    where: { mlsNumber },
    select: {
      id: true,
      mlsNumber: true,
      listingKey: true,
      status: true,
      dataSource: true,
      listPrice: true,
      soldPrice: true,
    },
  });

  if (!listing) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Listing not found" },
        { status: 404 },
      ),
    };
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

  const access = resolveListingDetailAccess(user, listing);
  if (access.vowBlocked) {
    if (access.needsEmailVerification) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "Email verification required.",
            vowBlocked: true,
            requiresEmailVerification: true,
          },
          {
            status: 403,
            headers: { "Cache-Control": "private, no-store" },
          },
        ),
      };
    }
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "VOW access requires a Houzzat account.",
          vowBlocked: true,
          requiresAuth: true,
        },
        {
          status: 401,
          headers: { "Cache-Control": "private, no-store" },
        },
      ),
    };
  }

  return {
    ok: true,
    listing: {
      id: listing.id,
      mlsNumber: listing.mlsNumber,
      listingKey: listing.listingKey,
      status: listing.status,
      dataSource: listing.dataSource,
      listPrice: listing.listPrice,
      soldPrice: listing.soldPrice,
    },
    access,
    user,
  };
}
