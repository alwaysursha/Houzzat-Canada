/**
 * Stage 4.5.3 — POST /api/mobile/v2/leads/[leadId]/verify-contact
 *
 * Mirrors POST /api/agent/leads/verify-contact for native CRM.
 * Workspace authority: token.wsId ONLY (authorizeMobileLeadAccess).
 * HTTP-mode safe: flat Prisma writes only.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMobileLeadAccess } from "@/lib/mobile/v2/lead-access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z
  .object({
    channel: z.enum(["email", "phone"]),
    verified: z.boolean(),
  })
  .strict();

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
          message: "Invalid verify-contact payload",
        },
        { status: 400 },
      );
    }

    const lead = await prisma.lead.findUnique({
      where: { id: access.lead.id },
      select: { id: true, customerId: true },
    });

    if (!lead?.customerId) {
      return NextResponse.json(
        { ok: false, code: "LEAD_NOT_FOUND", message: "Lead not found" },
        { status: 404 },
      );
    }

    const stamp = parsed.data.verified ? new Date() : null;

    if (parsed.data.channel === "email") {
      await prisma.user.update({
        where: { id: lead.customerId },
        data: { emailVerified: stamp },
      });
    } else {
      await prisma.user.update({
        where: { id: lead.customerId },
        data: { phoneVerifiedAt: stamp },
      });
    }

    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: access.userId,
        type: "contact_verify",
        body:
          parsed.data.channel === "email"
            ? parsed.data.verified
              ? "Account set to Verified Unlocked by agent"
              : "Account set to Unverified by agent"
            : `phone ${parsed.data.verified ? "verified" : "unverified"} by agent`,
        meta: {
          channel: parsed.data.channel,
          verified: parsed.data.verified,
          accountLock: parsed.data.channel === "email",
        },
      },
    });

    return NextResponse.json({
      ok: true,
      channel: parsed.data.channel,
      verified: parsed.data.verified,
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
