/**
 * Public Ontario address resolution (no sold prices / history).
 * POST JSON: { query?, placeId?, unitNumber?, sessionToken? }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  allowPropertyAddressResolve,
  clientIpFromPublicRequest,
  resolvePropertyAddress,
} from "@/lib/property-address";
import { resolveListingEntitlementContextForRequest } from "@/lib/tenancy/listing-entitlement";

const bodySchema = z.object({
  query: z.string().trim().max(200).optional(),
  placeId: z.string().trim().max(256).optional(),
  unitNumber: z.string().trim().max(40).optional().nullable(),
  sessionToken: z.string().trim().max(128).optional().nullable(),
});

export async function POST(request: Request) {
  const clientIp = clientIpFromPublicRequest(request);
  if (!allowPropertyAddressResolve(clientIp)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Too many requests. Try again shortly.",
        code: "RATE_LIMITED",
        listingStatusClass: "UNKNOWN",
        resolution: {
          geocodeOk: false,
          mlsProbe: "skipped",
          errors: ["rate_limited"],
          warnings: [],
        },
      },
      { status: 429 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid JSON body.",
        code: "INVALID_INPUT",
        listingStatusClass: "UNKNOWN",
        resolution: {
          geocodeOk: false,
          mlsProbe: "skipped",
          errors: ["invalid_json"],
          warnings: [],
        },
      },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid request body.",
        code: "INVALID_INPUT",
        listingStatusClass: "UNKNOWN",
        resolution: {
          geocodeOk: false,
          mlsProbe: "skipped",
          errors: ["invalid_body"],
          warnings: [],
        },
      },
      { status: 400 },
    );
  }

  const { entitlement } =
    await resolveListingEntitlementContextForRequest(request);

  const result = await resolvePropertyAddress(
    {
      query: parsed.data.query,
      placeId: parsed.data.placeId,
      unitNumber: parsed.data.unitNumber,
      sessionToken: parsed.data.sessionToken,
    },
    { entitlement },
  );

  if (!result.ok) {
    const status =
      result.code === "INVALID_INPUT" || result.code === "ABUSE_REJECTED"
        ? 400
        : result.code === "OUT_OF_SCOPE"
          ? 422
          : 404;
    return NextResponse.json(result, { status });
  }

  // Explicit public contract — never leak sold/history fields.
  return NextResponse.json({
    ok: true,
    address: result.address,
    listingStatusClass: result.listingStatusClass,
    activeListing: result.activeListing,
    confidence: result.confidence,
    resolution: result.resolution,
  });
}
