/**
 * Stage 5.12A — Email CMA to lead (CASL + LeadEmailLog + LeadActivity).
 * No LeadEmailLog.cmaReportId FK — link/token + activity provide audit trail.
 */

import { SITE_URL } from "@/lib/constants";
import { sendAndLogClientEmail } from "@/lib/email/client-send";
import { renderCmaEmail } from "@/lib/email/templates";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceBrand } from "@/lib/tenancy/resolve-workspace-brand";
import type { WorkspaceMemberRole } from "@prisma/client";

export type SendCmaEmailResult =
  | { ok: true; emailLogId?: string; stubbed: boolean }
  | { ok: false; status: number; code: string; message: string };

export async function sendCmaEmailToLead(input: {
  cmaId: string;
  workspaceId: string;
  actorUserId: string;
  role: WorkspaceMemberRole;
}): Promise<SendCmaEmailResult> {
  const report = await prisma.cmaReport.findFirst({
    where: { id: input.cmaId, workspaceId: input.workspaceId },
    include: {
      agent: {
        select: {
          id: true,
          name: true,
          email: true,
          agentProfile: { select: { phone: true } },
        },
      },
    },
  });
  if (!report || !report.workspaceId) {
    return {
      ok: false,
      status: 404,
      code: "NOT_FOUND",
      message: "CMA not found",
    };
  }
  if (report.revokedAt) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "CMA share link is revoked — restore share before emailing",
    };
  }
  if (!report.leadId) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Attach a lead before emailing the CMA",
    };
  }

  const lead = await prisma.lead.findFirst({
    where: { id: report.leadId, workspaceId: input.workspaceId },
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
  if (!lead) {
    return {
      ok: false,
      status: 404,
      code: "NOT_FOUND",
      message: "Lead not found",
    };
  }
  if (
    input.role === "AGENT" &&
    lead.assignedAgentId !== input.actorUserId
  ) {
    return {
      ok: false,
      status: 404,
      code: "NOT_FOUND",
      message: "Lead not found",
    };
  }

  const toEmail = lead.customer?.email;
  if (!toEmail) {
    return {
      ok: false,
      status: 400,
      code: "LEAD_NO_EMAIL",
      message: "Lead has no email",
    };
  }

  const consented =
    Boolean(lead.contactConsentAt) || Boolean(lead.customer?.caslConsentAt);
  if (!consented || lead.customer?.emailAlertsEnabled === false) {
    return {
      ok: false,
      status: 403,
      code: "CONSENT_REQUIRED",
      message: "Lead does not have email consent",
    };
  }

  const brand = await resolveWorkspaceBrand(input.workspaceId);
  const cmaUrl = `${SITE_URL}/cma/${report.token}`;
  const agentName =
    report.agent.name?.trim() || report.agent.email || "Your agent";

  const rendered = renderCmaEmail({
    recipientName: lead.customer?.name,
    agentName,
    agentEmail: report.agent.email,
    agentPhone: report.agent.agentProfile?.phone ?? null,
    tenantDisplayName: brand.displayName,
    tenantPrimaryColor: brand.colors.primary,
    subjectAddress: report.subjectAddress ?? report.city,
    subjectCity: report.city,
    cmaUrl,
    recommendedListPrice: report.recommendedListPrice,
  });

  const result = await sendAndLogClientEmail({
    to: toEmail,
    rendered,
    customerId: lead.customer?.id ?? null,
    leadId: lead.id,
    sentById: input.actorUserId,
    mlsNumber: report.subjectMls ?? report.listingMls,
    organizationId: lead.organizationId,
    replyTo: report.agent.email,
  });

  if (!result.ok) {
    return {
      ok: false,
      status: 502,
      code: "EMAIL_FAILED",
      message: "Could not send email",
    };
  }

  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      type: "cma_emailed",
      body: `CMA emailed: ${report.subjectAddress ?? report.city} — ${cmaUrl}`,
      userId: input.actorUserId,
    },
  });

  return {
    ok: true,
    emailLogId: result.emailLogId,
    stubbed: result.status === "skipped",
  };
}
