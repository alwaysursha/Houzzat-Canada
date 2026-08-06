import { SITE_URL } from "@/lib/constants";
import { resolveDefaultOrganizationId } from "@/lib/agent";
import type { RenderedEmail } from "@/lib/email/templates";
import { prisma } from "@/lib/prisma";

/**
 * Persist a client-facing email on the CRM lead timeline (with Preview link).
 * Finds the customer's most relevant lead in the brokerage desk.
 */
export async function logClientEmail(input: {
  customerId?: string | null;
  leadId?: string | null;
  toEmail: string;
  rendered: RenderedEmail;
  sentById?: string | null;
  mlsNumber?: string | null;
  organizationId?: string | null;
}): Promise<{ emailLogId: string; leadId: string } | null> {
  let leadId = input.leadId ?? null;
  let organizationId = input.organizationId ?? null;

  if (!leadId && input.customerId) {
    const lead = await prisma.lead.findFirst({
      where: { customerId: input.customerId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, organizationId: true },
    });
    leadId = lead?.id ?? null;
    organizationId = organizationId ?? lead?.organizationId ?? null;
  }

  if (!leadId) return null;

  if (!organizationId) {
    organizationId = await resolveDefaultOrganizationId();
  }
  if (!organizationId) return null;

  const row = await prisma.leadEmailLog.create({
    data: {
      organizationId,
      leadId,
      sentById: input.sentById ?? null,
      toEmail: input.toEmail,
      subject: input.rendered.subject,
      body: input.rendered.text,
      htmlBody: input.rendered.html,
      kind: input.rendered.kind,
      mlsNumber: input.mlsNumber ?? null,
    },
    select: { id: true },
  });

  await prisma.leadActivity.create({
    data: {
      leadId,
      userId: input.sentById ?? null,
      type: "email_sent",
      body: input.rendered.subject,
      meta: {
        emailLogId: row.id,
        kind: input.rendered.kind,
        mlsNumber: input.mlsNumber ?? null,
        previewPath: `/agent/emails/${row.id}`,
      },
    },
  });

  return { emailLogId: row.id, leadId };
}

export function emailPreviewPath(emailLogId: string) {
  return `/agent/emails/${emailLogId}`;
}

export function emailPreviewAbsoluteUrl(emailLogId: string) {
  return `${SITE_URL}${emailPreviewPath(emailLogId)}`;
}

/** Preferences / unsubscribe landing used in alert footers. */
export function emailPreferencesUrl() {
  return `${SITE_URL}/account/monitors`;
}
