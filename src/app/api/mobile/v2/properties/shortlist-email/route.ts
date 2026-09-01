/**
 * Stage 5.3 — POST /api/mobile/v2/properties/shortlist-email
 *
 * Email selected MLS listings to a lead from native Properties search.
 * Same pipeline as web POST /api/agent/shortlist-email.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { sendShortlistEmail } from "@/lib/agent/send-shortlist-email";
import { authorizeMobileLeadAccess } from "@/lib/mobile/v2/lead-access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({
  leadId: z.string().min(1),
  mlsNumbers: z.array(z.string().min(3).max(32)).min(1).max(24),
  subject: z.string().min(1).max(200).optional(),
  note: z.string().max(2000).optional(),
  title: z.string().min(1).max(120).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid payload" },
        { status: 400 },
      );
    }

    const access = await authorizeMobileLeadAccess(request, parsed.data.leadId);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    const actor = await prisma.user.findUnique({
      where: { id: access.userId },
      select: { id: true, email: true, name: true },
    });

    const result = await sendShortlistEmail({
      leadId: parsed.data.leadId,
      mlsNumbers: parsed.data.mlsNumbers,
      subject: parsed.data.subject,
      note: parsed.data.note,
      title: parsed.data.title,
      actorUserId: access.userId,
      actorEmail: actor?.email ?? null,
      actorName: actor?.name ?? null,
      actorOrganizationId: access.lead.organizationId,
      verifyLeadAccess: (lead) =>
        lead.id === access.lead.id && lead.workspaceId === access.workspaceId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: result.code, message: result.message },
        { status: result.status },
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        shareUrl: result.shareUrl,
        count: result.count,
        stubbed: result.stubbed,
        leadId: result.leadId,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
