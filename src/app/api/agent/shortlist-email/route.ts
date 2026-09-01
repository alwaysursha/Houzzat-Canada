import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessLead, requireAgentContextFromRequest } from "@/lib/agent";
import { sendShortlistEmail } from "@/lib/agent/send-shortlist-email";

const schema = z.object({
  leadId: z.string().min(1),
  mlsNumbers: z.array(z.string().min(3).max(32)).min(1).max(24),
  subject: z.string().min(1).max(200).optional(),
  note: z.string().max(2000).optional(),
  title: z.string().min(1).max(120).optional(),
});

export async function POST(request: Request) {
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const result = await sendShortlistEmail({
    leadId: parsed.data.leadId,
    mlsNumbers: parsed.data.mlsNumbers,
    subject: parsed.data.subject,
    note: parsed.data.note,
    title: parsed.data.title,
    actorUserId: ctx.user.id,
    actorEmail: ctx.user.email,
    actorName: ctx.user.name,
    actorOrganizationId: ctx.organizationId,
    verifyLeadAccess: (lead) => canAccessLead(ctx, lead),
  });

  if (!result.ok) {
    const errorBody =
      result.code === "LEAD_NOT_FOUND"
        ? { error: "Lead not found" }
        : result.code === "LEAD_NO_EMAIL"
          ? { error: "Lead has no email" }
          : result.code === "CASL_BLOCKED"
            ? { error: "No CASL consent or email alerts are off" }
            : result.code === "LISTINGS_NOT_FOUND"
              ? { error: "No listings found" }
              : { error: "Send failed" };
    return NextResponse.json(errorBody, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    shareUrl: result.shareUrl,
    count: result.count,
    stubbed: result.stubbed,
  });
}
