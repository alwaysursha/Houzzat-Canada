/**
 * Stage 4.5.2 — POST /api/mobile/v2/leads/[leadId]/contact-reminder
 *
 * Mirrors POST /api/agent/leads/contact-reminder for native CRM.
 * Channels: email | phone only (no address request — neither surface offers it).
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
          message: "Invalid channel (email|phone)",
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

    const stamp = new Date();
    if (parsed.data.channel === "email") {
      await prisma.user.update({
        where: { id: lead.customerId },
        data: { emailUpdateRequestedAt: stamp },
      });
    } else {
      await prisma.user.update({
        where: { id: lead.customerId },
        data: { phoneUpdateRequestedAt: stamp },
      });
    }

    const channelLabel =
      parsed.data.channel === "phone" ? "phone number" : "email";
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: access.userId,
        type: "contact_update_request",
        body: `Agent requested customer to provide the correct ${channelLabel}`,
        meta: {
          channel: parsed.data.channel,
          requestedAt: stamp.toISOString(),
        },
      },
    });

    return NextResponse.json({
      ok: true,
      channel: parsed.data.channel,
      requestedAt: stamp.toISOString(),
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
