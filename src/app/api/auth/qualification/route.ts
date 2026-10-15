import {
  MortgageFinancing,
  Prisma,
  PurchaseTimeframe,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import {
  formatConfirmSearchSummary,
  upsertBuyerConfirmedPreference,
} from "@/lib/auth/buyer-confirmed-preference";
import { upsertQualificationSavedSearch } from "@/lib/auth/qualification-saved-search";
import {
  isPurchaseTimeframe,
  type PurchaseTimeframeValue,
} from "@/lib/agent/timeframe";
import {
  scheduleSellerClaimPropertyNotify,
  scheduleSignupQualificationCompletedNotify,
} from "@/lib/notifications/signup-lead-notify";
import { prisma } from "@/lib/prisma";
import { applySellerPropertyClaim } from "@/lib/property-address/apply-seller-claim";
import {
  mergeSellerTimeframeIntoCapture,
  parseSellerTimeframeChoice,
  sellerTimeframeLabel,
} from "@/lib/property-address/seller-timeframe";

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
  propertyPath: z.string().trim().max(500).optional(),
});

const timeframeSchema = z.object({
  step: z.literal("timeframe"),
  purchaseTimeframe: z.string(),
});

/** Optional seller claim funnel step — allows NOW + exploring without buyer NOW reject. */
const sellingTimeframeSchema = z.object({
  step: z.literal("sellingTimeframe"),
  purchaseTimeframe: z.string().optional().nullable(),
  exploring: z.boolean().optional(),
  skip: z.boolean().optional(),
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
  minBaths: z.number().int().nonnegative().nullable().optional(),
  transactionType: z.string().nullable().optional(),
});

const completeSchema = z.object({
  step: z.literal("complete"),
});

const schema = z.discriminatedUnion("step", [
  ownershipSchema,
  claimAddressSchema,
  timeframeSchema,
  sellingTimeframeSchema,
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
      isSeller: true,
      buyerConfirmedPreference: true,
      leads: {
        where: { workspaceId: user.workspaceId },
        select: { captureContext: true, listingMls: true, intent: true },
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
    isSeller: row.isSeller,
    leadIntent: row.leads[0]?.intent ?? null,
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
      // Seller Claim Your Address always sends propertyPath → strict canonical.
      // Buyer funnel ownership→claim omits it → soft Google-pick path preserved.
      const sellerClaimEntry = Boolean(data.propertyPath?.trim());
      const claimed = await applySellerPropertyClaim({
        userId: user.id,
        workspaceId,
        homeAddress: data.homeAddress.trim(),
        homeUnit: data.homeUnit,
        homeLat: data.homeLat,
        homeLng: data.homeLng,
        placeId: data.placeId,
        propertyPath: data.propertyPath,
        request,
        requireCanonicalResolve: sellerClaimEntry,
      });
      if (!claimed.ok) {
        return NextResponse.json(
          {
            error: claimed.error,
            retryable: claimed.retryable,
          },
          { status: claimed.status },
        );
      }
      // New-lead often fires at signup before property association. Idempotent
      // claim update (separate cycle keys) — never a second new-lead event.
      if (
        sellerClaimEntry &&
        claimed.leadId &&
        !claimed.alreadyClaimed &&
        claimed.assignedAgentId
      ) {
        scheduleSellerClaimPropertyNotify({
          leadId: claimed.leadId,
          assigneeId: claimed.assignedAgentId,
        });
      }
      return NextResponse.json({
        ok: true,
        addressSaved: true,
        savedSearchTouched: false,
        monitorsCreated: claimed.areaWatch === "created",
        areaWatch: claimed.areaWatch,
        alreadyClaimed: claimed.alreadyClaimed,
        leadId: claimed.leadId,
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
    case "sellingTimeframe": {
      const lead = await prisma.lead.findFirst({
        where: { customerId: user.id, workspaceId },
        select: {
          id: true,
          assignedAgentId: true,
          captureContext: true,
        },
        orderBy: { updatedAt: "desc" },
      });

      // Never write User.purchaseTimeframe — buyer field stays untouched.
      if (data.skip) {
        if (lead) {
          const nextCtx = mergeSellerTimeframeIntoCapture(lead.captureContext, {
            kind: "skipped",
          });
          await prisma.lead.update({
            where: { id: lead.id },
            data: { captureContext: nextCtx as Prisma.InputJsonValue },
          });
          await prisma.leadActivity.create({
            data: {
              leadId: lead.id,
              type: "updated",
              userId: user.id,
              body: "Selling timeframe skipped.",
              meta: { sellingTimeframeStatus: "skipped" },
            },
          });
        }
        return NextResponse.json({ ok: true, skipped: true });
      }

      if (data.exploring || data.purchaseTimeframe === "JUST_EXPLORING") {
        if (lead) {
          const nextCtx = mergeSellerTimeframeIntoCapture(lead.captureContext, {
            kind: "exploring",
          });
          await prisma.lead.update({
            where: { id: lead.id },
            data: { captureContext: nextCtx as Prisma.InputJsonValue },
          });
          await prisma.leadActivity.create({
            data: {
              leadId: lead.id,
              type: "updated",
              userId: user.id,
              body: "Selling timeframe: Just exploring my options.",
              meta: {
                sellingTimeframeStatus: "exploring",
                sellingTimeframe: "JUST_EXPLORING",
              },
            },
          });
        }
        return NextResponse.json({ ok: true, exploring: true });
      }

      const choice = parseSellerTimeframeChoice(data.purchaseTimeframe);
      if (!choice || choice === "JUST_EXPLORING") {
        return NextResponse.json(
          { error: "Invalid selling timeframe." },
          { status: 400 },
        );
      }

      if (lead) {
        const nextCtx = mergeSellerTimeframeIntoCapture(lead.captureContext, {
          kind: "answered",
          value: choice as PurchaseTimeframeValue,
        });
        await prisma.lead.update({
          where: { id: lead.id },
          data: { captureContext: nextCtx as Prisma.InputJsonValue },
        });
        const label = sellerTimeframeLabel(choice);
        await prisma.leadActivity.create({
          data: {
            leadId: lead.id,
            type: "updated",
            userId: user.id,
            body: `Selling timeframe: ${label ?? choice}.`,
            meta: {
              sellingTimeframeStatus: "answered",
              sellingTimeframe: choice,
            },
          },
        });
      }

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
      // Also upsert the deterministic qualification SavedSearch (homepage + digests).
      const saved = await upsertQualificationSavedSearch(prisma, {
        userId: user.id,
        cities: data.cities,
        communities: data.communities,
        propertyTypes: data.propertyTypes,
        minPrice: data.minPrice,
        maxPrice: data.maxPrice,
        minBeds: data.minBeds,
        minBaths: data.minBaths,
        transactionType: data.transactionType,
      });
      return NextResponse.json({
        ok: true,
        savedSearchTouched: true,
        savedSearchId: saved.id,
        savedSearchCreated: saved.created,
      });
    }
    case "complete": {
      const prior = await prisma.user.findFirst({
        where: { id: user.id, workspaceId },
        select: {
          buyerConfirmedPreference: { select: { userId: true } },
          leads: {
            where: { workspaceId },
            select: {
              id: true,
              assignedAgentId: true,
              captureContext: true,
            },
            take: 1,
          },
        },
      });
      const lead = prior?.leads[0] ?? null;
      // Auto-save observed search when the confirm step was removed from the funnel.
      if (!prior?.buyerConfirmedPreference && lead) {
        const observed = extractObservedPreference(lead.captureContext);
        const hasCriteria =
          observed.cities.length > 0 ||
          observed.minPrice != null ||
          observed.maxPrice != null ||
          observed.propertyTypes.length > 0 ||
          observed.minBeds != null ||
          observed.minBaths != null;
        if (hasCriteria) {
          await upsertBuyerConfirmedPreference(prisma, {
            workspaceId,
            userId: user.id,
            cities: observed.cities,
            propertyTypes: observed.propertyTypes,
            minPrice: observed.minPrice,
            maxPrice: observed.maxPrice,
            minBeds: observed.minBeds,
            transactionType: observed.transactionType,
            source: "observed",
          });
          await upsertQualificationSavedSearch(prisma, {
            userId: user.id,
            cities: observed.cities,
            propertyTypes: observed.propertyTypes,
            minPrice: observed.minPrice,
            maxPrice: observed.maxPrice,
            minBeds: observed.minBeds,
            minBaths: observed.minBaths,
            transactionType: observed.transactionType,
          });
        }
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { qualificationCompletedAt: new Date() },
      });

      if (lead?.assignedAgentId) {
        scheduleSignupQualificationCompletedNotify({
          leadId: lead.id,
          assigneeId: lead.assignedAgentId,
        });
      }

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
  minBaths: number | null;
  transactionType: string | null;
  summary: string | null;
} {
  const empty = {
    cities: [] as string[],
    maxPrice: null as number | null,
    minPrice: null as number | null,
    propertyTypes: [] as string[],
    minBeds: null as number | null,
    minBaths: null as number | null,
    transactionType: null as string | null,
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
  const parseMoney = (raw: unknown): number | null => {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim()) {
      const n = Number(raw.replace(/[^\d.]/g, ""));
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const parseCount = (raw: unknown): number | null => {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim()) {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const maxPrice = parseMoney(filters?.maxPrice);
  const minPrice = parseMoney(filters?.minPrice);
  const propertyTypes: string[] = [];
  if (typeof filters?.propertyType === "string") {
    propertyTypes.push(filters.propertyType);
  }
  if (Array.isArray(filters?.propertyTypes)) {
    for (const t of filters.propertyTypes) {
      if (typeof t === "string") propertyTypes.push(t);
    }
  } else if (typeof filters?.propertyTypes === "string") {
    for (const t of filters.propertyTypes.split(",")) {
      if (t.trim()) propertyTypes.push(t.trim());
    }
  }
  const minBeds = parseCount(filters?.minBeds);
  const minBaths = parseCount(filters?.minBaths);
  const transactionType =
    filters?.transactionType === "SALE" ||
    filters?.transactionType === "LEASE" ||
    filters?.transactionType === "ALL"
      ? (filters.transactionType as string)
      : null;

  const summary = formatConfirmSearchSummary({
    cities,
    minPrice,
    maxPrice,
  });

  return {
    cities,
    maxPrice,
    minPrice,
    propertyTypes,
    minBeds,
    minBaths,
    transactionType,
    summary,
  };
}
