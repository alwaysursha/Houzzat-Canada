/**
 * Stage 4.5.2 — POST /api/mobile/v2/leads/[leadId]/profile-flags
 *
 * Mirrors POST /api/agent/leads/profile-flags for native CRM.
 * Buyer / Seller may both be true (web parity). purchaseTimeframe accepted for
 * contract parity with the agent route; Mobile UI currently toggles Buyer/Seller only.
 * Workspace authority: token.wsId ONLY (authorizeMobileLeadAccess).
 * HTTP-mode safe: flat Prisma writes only.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { PURCHASE_TIMEFRAMES } from "@/lib/agent/timeframe";
import { authorizeMobileLeadAccess } from "@/lib/mobile/v2/lead-access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z
  .object({
    isBuyer: z.boolean().optional(),
    isSeller: z.boolean().optional(),
    purchaseTimeframe: z.enum(PURCHASE_TIMEFRAMES).nullable().optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.isBuyer !== undefined ||
      v.isSeller !== undefined ||
      v.purchaseTimeframe !== undefined,
    {
      message: "Provide isBuyer, isSeller, and/or purchaseTimeframe",
    },
  );

export async function POST(
  request: Request,
  context: { params: Promise<{ leadId: string }> },
) {
  try {
    const { leadId } = await context.params;
    const access = await authorizeMobileLeadAccess(request, leadId);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Invalid profile flags payload",
        },
        { status: 400 },
      );
    }

    const lead = await prisma.lead.findUnique({
      where: { id: access.lead.id },
      select: {
        id: true,
        customer: {
          select: {
            id: true,
            isBuyer: true,
            isSeller: true,
            purchaseTimeframe: true,
          },
        },
      },
    });

    if (!lead?.customer) {
      return NextResponse.json(
        { ok: false, code: "LEAD_NOT_FOUND", message: "Lead not found" },
        { status: 404 },
      );
    }

    const nextBuyer =
      parsed.data.isBuyer !== undefined
        ? parsed.data.isBuyer
        : lead.customer.isBuyer;
    const nextSeller =
      parsed.data.isSeller !== undefined
        ? parsed.data.isSeller
        : lead.customer.isSeller;
    const nextTimeframe =
      parsed.data.purchaseTimeframe !== undefined
        ? parsed.data.purchaseTimeframe
        : lead.customer.purchaseTimeframe;

    await prisma.user.update({
      where: { id: lead.customer.id },
      data: {
        isBuyer: nextBuyer,
        isSeller: nextSeller,
        purchaseTimeframe: nextTimeframe,
      },
    });

    const parts: string[] = [];
    if (parsed.data.isBuyer !== undefined) {
      parts.push(
        `Buyer profile ${parsed.data.isBuyer ? "activated" : "deactivated"}`,
      );
    }
    if (parsed.data.isSeller !== undefined) {
      parts.push(
        `Seller profile ${parsed.data.isSeller ? "activated" : "deactivated"}`,
      );
    }
    if (parsed.data.purchaseTimeframe !== undefined) {
      parts.push(
        parsed.data.purchaseTimeframe
          ? `Timeframe set to ${parsed.data.purchaseTimeframe}`
          : "Timeframe cleared",
      );
    }

    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: access.userId,
        type: "profile_flags",
        body: `${parts.join("; ")} by agent`,
        meta: {
          isBuyer: nextBuyer,
          isSeller: nextSeller,
          purchaseTimeframe: nextTimeframe,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      isBuyer: nextBuyer,
      isSeller: nextSeller,
      purchaseTimeframe: nextTimeframe,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
