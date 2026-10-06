import {
  MortgageFinancing,
  Prisma,
  PurchaseTimeframe,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { upsertBuyerConfirmedPreference } from "@/lib/auth/buyer-confirmed-preference";
import { applyCanonicalCustomerContact } from "@/lib/agent/lead-info-change";
import { isPurchaseTimeframe } from "@/lib/agent/timeframe";
import { prisma } from "@/lib/prisma";

const ownershipSchema = z.object({
  step: z.literal("ownership"),
  ownsHome: z.boolean(),
});

const claimAddressSchema = z.object({
  step: z.literal("claimAddress"),
  maybeLater: z.boolean().optional(),
  homeAddress: z.string().trim().max(500).optional(),
  homeUnit: z.string().trim().max(40).optional(),
  homeLat: z.number().min(-90).max(90).optional(),
  homeLng: z.number().min(-180).max(180).optional(),
  placeId: z.string().trim().max(256).optional(),
});

const timeframeSchema = z.object({
  step: z.literal("timeframe"),
  purchaseTimeframe: z.string(),
});

const financingSchema = z.object({
  step: z.literal("financing"),
  mortgageFinancing: z.enum(["PRE_APPROVED", "NOT_PRE_APPROVED", "CASH"]),
});

const preferenceSchema = z.object({
  step: z.literal("preference"),
  confirm: z.boolean(),
  cities: z.array(z.string()).optional(),
  communities: z.array(z.string()).optional(),
  propertyTypes: z.array(z.string()).optional(),
  minPrice: z.number().int().nonnegative().nullable().optional(),
  maxPrice: z.number().int().nonnegative().nullable().optional(),
  minBeds: z.number().int().nonnegative().nullable().optional(),
  transactionType: z.string().nullable().optional(),
});

const completeSchema = z.object({
  step: z.literal("complete"),
});

const schema = z.discriminatedUnion("step", [
  ownershipSchema,
  claimAddressSchema,
  timeframeSchema,
  financingSchema,
  preferenceSchema,
  completeSchema,
]);

export async function GET() {
  const user = await requireCustomerUser();
  if (!user?.workspaceId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const row = await prisma.user.findFirst({
    where: { id: user.id, workspaceId: user.workspaceId },
    select: {
      ownsHome: true,
      purchaseTimeframe: true,
      mortgageFinancing: true,
      qualificationCompletedAt: true,
      phoneOtpVerifiedAt: true,
      phone: true,
      phoneE164: true,
      homeAddress: true,
      homeUnit: true,
      homeLat: true,
      homeLng: true,
      buyerConfirmedPreference: true,
      leads: {
        where: { workspaceId: user.workspaceId },
        select: { captureContext: true, listingMls: true },
        take: 1,
      },
    },
  });
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const captureContext = row.leads[0]?.captureContext ?? null;
  const observed = extractObservedPreference(captureContext);

  return NextResponse.json({
    ownsHome: row.ownsHome,
    purchaseTimeframe: row.purchaseTimeframe,
    mortgageFinancing: row.mortgageFinancing,
    qualificationCompletedAt: row.qualificationCompletedAt,
    phoneOtpVerifiedAt: row.phoneOtpVerifiedAt,
    phone: row.phone,
    phoneE164: row.phoneE164,
    homeAddress: row.homeAddress,
    homeUnit: row.homeUnit,
    confirmedPreference: row.buyerConfirmedPreference,
    observedPreference: observed,
    listingMls: row.leads[0]?.listingMls ?? null,
  });
}

export async function POST(request: Request) {
  const user = await requireCustomerUser();
  if (!user?.workspaceId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid qualification step." }, { status: 400 });
  }

  const workspaceId = user.workspaceId;
  const data = parsed.data;

  switch (data.step) {
    case "ownership": {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          ownsHome: data.ownsHome,
          ...(data.ownsHome ? { isSeller: true } : {}),
        },
      });
      return NextResponse.json({ ok: true });
    }
    case "claimAddress": {
      if (data.maybeLater || !data.homeAddress?.trim()) {
        return NextResponse.json({ ok: true, skipped: true });
      }
      const applied = await applyCanonicalCustomerContact(prisma, user.id, {
        homeAddress: data.homeAddress.trim(),
        homeLat: data.homeLat ?? null,
        homeLng: data.homeLng ?? null,
      });
      if (!applied.ok) {
        return NextResponse.json(
          { error: applied.error },
          { status: applied.status },
        );
      }
      const unit = data.homeUnit?.trim() || null;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          ownsHome: true,
          isSeller: true,
          homeUnit: unit,
        },
      });
      return NextResponse.json({
        ok: true,
        addressSaved: true,
        savedSearchTouched: false,
        monitorsCreated: false,
      });
    }
    case "timeframe": {
      if (!isPurchaseTimeframe(data.purchaseTimeframe)) {
        return NextResponse.json(
          { error: "Invalid buying timeframe." },
          { status: 400 },
        );
      }
      // Reject anything outside consumer funnel set (no fabricated browsing).
      if (data.purchaseTimeframe === "NOW") {
        return NextResponse.json(
          { error: "Invalid buying timeframe." },
          { status: 400 },
        );
      }
      await prisma.user.update({
        where: { id: user.id },
        data: {
          purchaseTimeframe: data.purchaseTimeframe as PurchaseTimeframe,
        },
      });
      return NextResponse.json({ ok: true });
    }
    case "financing": {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          mortgageFinancing: data.mortgageFinancing as MortgageFinancing,
        },
      });
      return NextResponse.json({ ok: true });
    }
    case "preference": {
      await upsertBuyerConfirmedPreference(prisma, {
        workspaceId,
        userId: user.id,
        cities: data.cities,
        communities: data.communities,
        propertyTypes: data.propertyTypes,
        minPrice: data.minPrice,
        maxPrice: data.maxPrice,
        minBeds: data.minBeds,
        transactionType: data.transactionType,
        source: data.confirm ? "confirmed" : "edited",
      });
      // Explicitly do NOT create or overwrite SavedSearch.
      return NextResponse.json({ ok: true, savedSearchTouched: false });
    }
    case "complete": {
      await prisma.user.update({
        where: { id: user.id },
        data: { qualificationCompletedAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    }
    default: {
      const _exhaustive: never = data;
      return _exhaustive;
    }
  }
}

function extractObservedPreference(
  captureContext: Prisma.JsonValue | null,
): {
  cities: string[];
  maxPrice: number | null;
  minPrice: number | null;
  propertyTypes: string[];
  minBeds: number | null;
  summary: string | null;
} {
  const empty = {
    cities: [] as string[],
    maxPrice: null as number | null,
    minPrice: null as number | null,
    propertyTypes: [] as string[],
    minBeds: null as number | null,
    summary: null as string | null,
  };
  if (!captureContext || typeof captureContext !== "object" || Array.isArray(captureContext)) {
    return empty;
  }
  const ctx = captureContext as Record<string, unknown>;
  const filters =
    ctx.searchFilters && typeof ctx.searchFilters === "object"
      ? (ctx.searchFilters as Record<string, unknown>)
      : null;
  const cities: string[] = [];
  if (typeof filters?.city === "string" && filters.city.trim()) {
    cities.push(filters.city.trim());
  }
  if (Array.isArray(filters?.cities)) {
    for (const c of filters.cities) {
      if (typeof c === "string" && c.trim()) cities.push(c.trim());
    }
  }
  const maxPrice =
    typeof filters?.maxPrice === "number" && Number.isFinite(filters.maxPrice)
      ? filters.maxPrice
      : null;
  const minPrice =
    typeof filters?.minPrice === "number" && Number.isFinite(filters.minPrice)
      ? filters.minPrice
      : null;
  const propertyTypes: string[] = [];
  if (typeof filters?.propertyType === "string") {
    propertyTypes.push(filters.propertyType);
  }
  if (Array.isArray(filters?.propertyTypes)) {
    for (const t of filters.propertyTypes) {
      if (typeof t === "string") propertyTypes.push(t);
    }
  }
  const minBeds =
    typeof filters?.minBeds === "number" && Number.isFinite(filters.minBeds)
      ? filters.minBeds
      : null;

  let summary: string | null = null;
  if (cities.length || maxPrice != null) {
    const parts: string[] = [];
    if (cities[0]) parts.push(cities[0]);
    if (maxPrice != null) {
      if (maxPrice >= 1_000_000 && maxPrice % 100_000 === 0) {
        const m = maxPrice / 1_000_000;
        parts.push(
          `Homes up to $${Number.isInteger(m) ? m : m.toFixed(1)}M`,
        );
      } else {
        parts.push(`Homes up to $${maxPrice.toLocaleString("en-CA")}`);
      }
    }
    summary = parts.join(" · ");
  }

  return { cities, maxPrice, minPrice, propertyTypes, minBeds, summary };
}
