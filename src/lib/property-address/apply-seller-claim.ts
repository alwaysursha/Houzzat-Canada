/**
 * Idempotent Claim Your Address → seller lead association + Area Watch.
 * Claiming signals homeowner/seller interest — not verified legal ownership.
 */

import type { Prisma } from "@prisma/client";
import { createOrReuseAreaMonitor } from "@/lib/account/area-monitor-create";
import { applyCanonicalCustomerContact } from "@/lib/agent/lead-info-change";
import { resolveLeadIntent } from "@/lib/agent/lead-intent";
import { prisma } from "@/lib/prisma";
import { isOntarioCoordinate } from "@/lib/property-address/normalize";
import { resolvePropertyAddress } from "@/lib/property-address/resolve-address";
import { resolveListingEntitlementContextForRequest } from "@/lib/tenancy/listing-entitlement";

export type ApplySellerPropertyClaimInput = {
  userId: string;
  workspaceId: string;
  homeAddress: string;
  homeUnit?: string | null;
  homeLat?: number | null;
  homeLng?: number | null;
  placeId?: string | null;
  propertyPath?: string | null;
  request?: Request | null;
  /**
   * Seller Claim Your Address: require verified canonical civic resolve.
   * Buyer funnel ownership→claim may set false to preserve Google pick soft path.
   */
  requireCanonicalResolve?: boolean;
};

export type ApplySellerPropertyClaimResult =
  | {
      ok: true;
      leadId: string | null;
      addressSaved: true;
      areaWatch: "created" | "reused" | "skipped";
      alreadyClaimed: boolean;
      assignedAgentId: string | null;
    }
  | {
      ok: false;
      error: string;
      status: 400 | 404 | 409 | 422;
      /** Seller claim: do not persist; client keeps claim context for retry. */
      retryable: boolean;
    };

function asRecord(
  value: Prisma.JsonValue | null | undefined,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

/**
 * Re-resolve address, mark seller interest on User + Lead, enroll Area Watch.
 * Safe to call repeatedly for the same property (idempotent).
 */
export async function applySellerPropertyClaim(
  input: ApplySellerPropertyClaimInput,
): Promise<ApplySellerPropertyClaimResult> {
  const query = input.homeAddress.trim();
  if (!query) {
    return {
      ok: false,
      error: "Enter a property address.",
      status: 400,
      retryable: false,
    };
  }

  const requireCanonical = input.requireCanonicalResolve !== false;
  const unitHint = input.homeUnit?.trim() || null;
  const entitlement = input.request
    ? (
        await resolveListingEntitlementContextForRequest(input.request)
      ).entitlement
    : undefined;

  const resolved = await resolvePropertyAddress(
    {
      query,
      placeId: input.placeId ?? undefined,
      unitNumber: unitHint,
    },
    { entitlement },
  );

  let formatted: string;
  let unit: string | null;
  let lat: number | null;
  let lng: number | null;
  let city: string | null;
  let province: string | null;
  let placeId: string | null;

  if (resolved.ok) {
    const address = resolved.address;
    // Seller claim requires civic identity + municipality.
    if (
      requireCanonical &&
      (!address.streetNumber?.trim() ||
        !address.streetName?.trim() ||
        !address.city?.trim())
    ) {
      return {
        ok: false,
        error:
          "Could not verify an exact residential address. Please try again.",
        status: 404,
        retryable: true,
      };
    }
    formatted = address.formattedAddress.trim();
    unit = address.unitNumber?.trim() || unitHint;
    lat = address.lat;
    lng = address.lng;
    city = address.city?.trim() || null;
    province = address.province?.trim() || null;
    placeId = address.placeId;
  } else if (
    !requireCanonical &&
    input.homeLat != null &&
    input.homeLng != null &&
    isOntarioCoordinate(input.homeLat, input.homeLng)
  ) {
    // Buyer funnel only — never used for Claim Your Address /property entry.
    formatted = query;
    unit = unitHint;
    lat = input.homeLat;
    lng = input.homeLng;
    city = guessMunicipality(query);
    province = "ON";
    placeId = input.placeId?.trim() || null;
  } else {
    const status =
      resolved.code === "OUT_OF_SCOPE"
        ? 422
        : resolved.code === "INVALID_INPUT" ||
            resolved.code === "ABUSE_REJECTED"
          ? 400
          : 404;
    return {
      ok: false,
      error: resolved.error || "Could not verify that address.",
      status,
      retryable: true,
    };
  }

  const priorUser = await prisma.user.findFirst({
    where: { id: input.userId, workspaceId: input.workspaceId },
    select: {
      homeAddress: true,
      homeUnit: true,
      isBuyer: true,
      isSeller: true,
    },
  });
  if (!priorUser) {
    return {
      ok: false,
      error: "Not found",
      status: 404,
      retryable: false,
    };
  }

  const alreadyClaimed =
    Boolean(priorUser.homeAddress?.trim()) &&
    priorUser.homeAddress!.trim().toLowerCase() === formatted.toLowerCase() &&
    (priorUser.homeUnit?.trim() || null) === (unit || null) &&
    priorUser.isSeller === true;

  const applied = await applyCanonicalCustomerContact(prisma, input.userId, {
    homeAddress: formatted,
    homeLat: lat,
    homeLng: lng,
  });
  if (!applied.ok) {
    return {
      ok: false,
      error: applied.error,
      status: applied.status,
      retryable: false,
    };
  }

  // Preserve buyer flags — customers may have both buyer and seller interest.
  await prisma.user.update({
    where: { id: input.userId },
    data: {
      ownsHome: true,
      isSeller: true,
      homeUnit: unit,
      // Never mark ownership as legally verified — field does not exist; intentional.
    },
  });

  const lead = await prisma.lead.findFirst({
    where: { customerId: input.userId, workspaceId: input.workspaceId },
    select: {
      id: true,
      isBuyer: true,
      isSeller: true,
      captureContext: true,
      assignedAgentId: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const leadId: string | null = lead?.id ?? null;
  const assignedAgentId = lead?.assignedAgentId ?? null;
  if (lead) {
    const prevCtx = asRecord(lead.captureContext);
    const nextCtx: Record<string, unknown> = {
      ...prevCtx,
      claimSource: "claim_your_address",
      claimEntry: "off_market_property_profile",
      homeAddress: formatted,
      homeUnit: unit,
      homeCity: city,
      homeProvince: province,
      homeLat: lat,
      homeLng: lng,
      homePlaceId: placeId,
      propertyPath: input.propertyPath ?? prevCtx.propertyPath ?? null,
      // Unanswered until the optional selling-timeframe step writes status.
      ...(prevCtx.sellingTimeframeStatus
        ? {}
        : {
            sellingTimeframeStatus: "unanswered",
            sellingTimeframe: null,
          }),
    };
    const intent = resolveLeadIntent({
      isBuyer: lead.isBuyer,
      isSeller: true,
    });
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        isSeller: true,
        intent,
        captureContext: nextCtx as Prisma.InputJsonValue,
      },
    });

    if (!alreadyClaimed) {
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          type: "updated",
          userId: input.userId,
          body: [
            "Claim Your Address — seller interest (not verified ownership).",
            formatted,
            unit ? `Unit ${unit}` : null,
            city ? `${city}${province ? `, ${province}` : ""}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        },
      });
    }
  }

  let areaWatch: "created" | "reused" | "skipped" = "skipped";
  if (city) {
    const criteria = {
      userId: input.userId,
      city,
      community: null as string | null,
      transactionType: "SALE" as const,
      segment: "RESIDENTIAL" as const,
    };
    const name = city;
    const { alreadyWatching } = await createOrReuseAreaMonitor(
      {
        findEquivalent: (match) => prisma.areaMonitor.findFirst({ where: match }),
        create: (row) =>
          prisma.areaMonitor.create({
            data: { ...row, name },
          }),
      },
      {
        ...criteria,
        notifyNew: true,
        notifySold: true,
        emailAlerts: true,
        lastSeenListingAt: new Date(),
      },
    );
    areaWatch = alreadyWatching ? "reused" : "created";
  }

  return {
    ok: true,
    leadId,
    addressSaved: true,
    areaWatch,
    alreadyClaimed,
    assignedAgentId,
  };
}

/** Best-effort city from "street, City, ON …" — buyer soft path only. */
function guessMunicipality(formatted: string): string | null {
  const parts = formatted
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const candidate = parts[1]!.replace(/\b[A-Z]{2}\b.*$/, "").trim();
  if (!candidate || /^\d/.test(candidate)) return null;
  return candidate.slice(0, 80);
}
