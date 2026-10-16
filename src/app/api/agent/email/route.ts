import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessLead, requireAgentContextFromRequest } from "@/lib/agent";
import { sendAndLogClientEmail } from "@/lib/email/client-send";
import {
  crmOptionalEmailDenied,
  loadCategoryEmailEnabled,
} from "@/lib/communications/category-email-gate";
import {
  buildCustomerPreferenceEmailChrome,
  preferenceFooterFields,
} from "@/lib/communications/preference-email-chrome";
import { renderAgentMessageEmail } from "@/lib/email/templates";
import {
  resolveTenantEmailBrand,
  toEmailBrandChrome,
} from "@/lib/email/tenant-email-brand";
import { prisma } from "@/lib/prisma";

const singleSchema = z.object({
  mode: z.literal("single").default("single"),
  leadId: z.string().min(1),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
});

const massSchema = z.object({
  mode: z.literal("mass"),
  leadIds: z.array(z.string().min(1)).min(1).max(50),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
});

const schema = z.union([singleSchema, massSchema]);

export async function POST(request: Request) {
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const leadIds =
    parsed.data.mode === "mass"
      ? parsed.data.leadIds
      : [parsed.data.leadId];

  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds } },
    include: {
      customer: {
        select: {
          id: true,
          email: true,
          name: true,
          emailAlertsEnabled: true,
          caslConsentAt: true,
        },
      },
    },
  });

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const lead of leads) {
    if (!canAccessLead(ctx, lead)) {
      skipped += 1;
      continue;
    }

    const toEmail = lead.customer?.email;
    if (!toEmail) {
      skipped += 1;
      errors.push(`${lead.id}: no customer email`);
      continue;
    }

    const categoryEnabled = lead.customer?.id
      ? await loadCategoryEmailEnabled(
          lead.customer.id,
          "agent_communication",
        )
      : true;
    const denied = crmOptionalEmailDenied({
      contactConsentAt: lead.contactConsentAt,
      caslConsentAt: lead.customer?.caslConsentAt ?? null,
      emailAlertsEnabled: lead.customer?.emailAlertsEnabled,
      categoryEnabled,
    });
    if (denied) {
      skipped += 1;
      errors.push(
        denied === "category_off"
          ? `${toEmail}: agent email category off`
          : `${toEmail}: no CASL consent / alerts off`,
      );
      continue;
    }

    const chrome =
      lead.customer?.id && lead.workspaceId
        ? await buildCustomerPreferenceEmailChrome({
            userId: lead.customer.id,
            workspaceId: lead.workspaceId,
            email: toEmail,
          })
        : null;
    const tenantBrand = lead.workspaceId
      ? await resolveTenantEmailBrand({
          workspaceId: lead.workspaceId,
          preferredAgentUserId: ctx.user.id,
          leadId: lead.id,
          customerId: lead.customer?.id,
        })
      : null;
    const rendered = renderAgentMessageEmail({
      name: lead.customer?.name,
      subject: parsed.data.subject,
      body: parsed.data.body,
      ...preferenceFooterFields(chrome),
      ...(tenantBrand ? toEmailBrandChrome(tenantBrand) : {}),
    });

    const result = await sendAndLogClientEmail({
      to: toEmail,
      rendered,
      stream: "notify",
      customerId: lead.customer?.id,
      leadId: lead.id,
      sentById: ctx.user.id,
      organizationId: lead.organizationId ?? ctx.organizationId,
      // Prefer sending agent; fall back to tenant-configured reply-to only.
      replyTo: ctx.user.email || tenantBrand?.replyTo || null,
    });

    if (!result.ok) {
      errors.push(`${toEmail}: send failed`);
      continue;
    }

    sent += 1;
  }

  return NextResponse.json({ ok: true, sent, skipped, errors });
}
