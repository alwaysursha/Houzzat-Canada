import { NextResponse } from "next/server";
import { z } from "zod";
import { answerListingQuestion } from "@/lib/listings/grounded-qa";
import { prisma } from "@/lib/prisma";
import {
  evaluateWebListingDetailInventoryAccess,
  resolveListingEntitlementContextForRequest,
} from "@/lib/tenancy/listing-entitlement";

const schema = z.object({
  question: z.string().trim().min(3).max(400),
});

type Params = { params: Promise<{ mlsNumber: string }> };

/**
 * Grounded Q&A for a listing.
 *
 * G.10C2: Host entitlement → base listing capability before MLS-derived
 * listing context enters the ask flow. Client MLS number alone never grants
 * access. Unauthorized → 404.
 */
export async function POST(request: Request, { params }: Params) {
  const { mlsNumber: raw } = await params;
  const mlsNumber = decodeURIComponent(raw).trim().toUpperCase();
  if (!mlsNumber) {
    return NextResponse.json({ error: "Missing MLS number" }, { status: 400 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Ask a short question." }, { status: 400 });
  }

  const { entitlement } =
    await resolveListingEntitlementContextForRequest(request);

  const listing = await prisma.listing.findUnique({ where: { mlsNumber } });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const board = evaluateWebListingDetailInventoryAccess({
    entitlement,
    entitlementFilteringEnabled: true,
    organizationId: listing.organizationId,
    providerKey: listing.providerKey,
    dataSource: listing.dataSource,
    status: listing.status,
  });
  if (!board.allowed) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const result = await answerListingQuestion(listing, parsed.data.question);
  return NextResponse.json(result);
}
