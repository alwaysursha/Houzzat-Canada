import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  resolveListingDetailAccess,
  type ListingPanelAccess,
} from "@/lib/listings/build-listing-panel";
import type { AccessUser } from "@/lib/account-access";
import { prisma } from "@/lib/prisma";
import type { ListingStatus } from "@prisma/client";
import {
  evaluateWebListingDetailInventoryAccess,
  resolveListingEntitlementContextForRequest,
  type ListingDataCapability,
  type WorkspaceListingEntitlement,
} from "@/lib/tenancy/listing-entitlement";

export type ListingDetailApiListing = {
  id: string;
  mlsNumber: string;
  listingKey: string | null;
  status: ListingStatus;
  dataSource: string | null;
  listPrice: number;
  soldPrice: number | null;
  organizationId: string | null;
  providerKey: string | null;
};

export type ListingDetailApiAccessOk = {
  ok: true;
  listing: ListingDetailApiListing;
  access: ListingPanelAccess;
  user: AccessUser | null;
  /** Hostname-derived G.10A entitlement (never from body/query/JWT workspace). */
  entitlement: WorkspaceListingEntitlement;
};

export type ListingDetailApiAccessResult =
  | ListingDetailApiAccessOk
  | { ok: false; response: NextResponse };

export type LoadListingDetailApiAccessOptions = {
  /**
   * Extra capabilities beyond status-derived body
   * (MEDIA / HISTORY / OPEN_HOUSES). All must pass on the same pair.
   */
  additionalCapabilities?: readonly ListingDataCapability[];
  /**
   * Web force-enable. Default `true` for public web listing deferred APIs.
   * Pass `false` only for surfaces that must remain outside web enforcement.
   * `false` never disables enforcement when production G5 is later ON.
   */
  entitlementFilteringEnabled?: boolean;
};

const NOT_FOUND = () =>
  NextResponse.json({ error: "Listing not found" }, { status: 404 });

/**
 * Shared choke point for listing deferred APIs (gallery, rooms, history).
 *
 * Ordering (G.10C2):
 *   Request Host → G.7C/G.10A entitlement
 *   → Neon listing lookup
 *   → board provenance + required capability (fail closed → 404)
 *   → only then VOW / session access (VOW never substitutes for board)
 *
 * Does NOT derive workspace authority from body, query, cookies,
 * client workspaceId, or JWT workspaceId alone.
 */
export async function loadListingDetailApiAccess(
  mlsNumberRaw: string,
  request: Request,
  options?: LoadListingDetailApiAccessOptions,
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

  // Never trust client workspaceId / org / provider / SAK.
  const { entitlement } =
    await resolveListingEntitlementContextForRequest(request);

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
      organizationId: true,
      providerKey: true,
    },
  });

  if (!listing) {
    return { ok: false, response: NOT_FOUND() };
  }

  const board = evaluateWebListingDetailInventoryAccess({
    entitlement,
    entitlementFilteringEnabled: options?.entitlementFilteringEnabled ?? true,
    organizationId: listing.organizationId,
    providerKey: listing.providerKey,
    dataSource: listing.dataSource,
    status: listing.status,
    additionalCapabilities: options?.additionalCapabilities,
  });
  if (!board.allowed) {
    return { ok: false, response: NOT_FOUND() };
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
      organizationId: listing.organizationId,
      providerKey: listing.providerKey,
    },
    access,
    user,
    entitlement,
  };
}
