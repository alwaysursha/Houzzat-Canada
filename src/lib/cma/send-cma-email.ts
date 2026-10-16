/**
 * Stage 5.12A — Email CMA to lead (CASL + LeadEmailLog + LeadActivity).
 * No LeadEmailLog.cmaReportId FK — link/token + activity provide audit trail.
 */

import { SITE_URL } from "@/lib/constants";
import { sendAndLogClientEmail } from "@/lib/email/client-send";
import {
  buildCustomerPreferenceEmailChrome,
  preferenceFooterFields,
} from "@/lib/communications/preference-email-chrome";
import {
  crmOptionalEmailDenied,
  loadCategoryEmailEnabled,
} from "@/lib/communications/category-email-gate";
import { renderCmaEmail } from "@/lib/email/templates";
import {
  resolveTenantEmailBrand,
  toEmailBrandChrome,
} from "@/lib/email/tenant-email-brand";
import { loadPublishedCmaShareOverride } from "@/lib/email/workspace-templates/agent-share-templates";
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

  const categoryEnabled = lead.customer?.id
    ? await loadCategoryEmailEnabled(lead.customer.id, "agent_communication")
    : true;
  const denied = crmOptionalEmailDenied({
    contactConsentAt: lead.contactConsentAt,
    caslConsentAt: lead.customer?.caslConsentAt ?? null,
    emailAlertsEnabled: lead.customer?.emailAlertsEnabled,
    categoryEnabled,
  });
  if (denied) {
    return {
      ok: false,
      status: 403,
      code: denied === "category_off" ? "CATEGORY_BLOCKED" : "CONSENT_REQUIRED",
      message:
        denied === "category_off"
          ? "Customer opted out of agent email"
          : "Lead does not have email consent",
    };
  }

  const brand = await resolveWorkspaceBrand(input.workspaceId);
  const tenantBrand = await resolveTenantEmailBrand({
    workspaceId: input.workspaceId,
    preferredAgentUserId: report.agent.id,
    leadId: lead.id,
    customerId: lead.customer?.id,
  });
  const cmaUrl = `${SITE_URL}/cma/${report.token}`;
  const agentName =
    report.agent.name?.trim() || report.agent.email || "Your agent";

  const chrome = lead.customer?.id
    ? await buildCustomerPreferenceEmailChrome({
        userId: lead.customer.id,
        workspaceId: input.workspaceId,
        email: toEmail,
      })
    : null;
  // Phase 2C-4 — published CMA_SHARE for verified workspace only.
  const publishedCmaShare = await loadPublishedCmaShareOverride({
    workspaceId: input.workspaceId,
  });
  const rendered = renderCmaEmail({
    recipientName: lead.customer?.name,
    agentName,
    agentEmail: report.agent.email,
    agentPhone: report.agent.agentProfile?.phone ?? null,
    tenantDisplayName:
      tenantBrand?.displayName ?? brand.displayName,
    tenantPrimaryColor:
      tenantBrand?.primaryColor ?? brand.colors.primary,
    subjectAddress: report.subjectAddress ?? report.city,
    subjectCity: report.city,
    cmaUrl,
    recommendedListPrice: report.recommendedListPrice,
    ...preferenceFooterFields(chrome),
    ...(tenantBrand ? toEmailBrandChrome(tenantBrand) : {}),
    publishedCmaShareTemplate: publishedCmaShare,
  });

  const result = await sendAndLogClientEmail({
    to: toEmail,
    rendered,
    customerId: lead.customer?.id ?? null,
    leadId: lead.id,
    sentById: input.actorUserId,
    mlsNumber: report.subjectMls ?? report.listingMls,
    organizationId: lead.organizationId,
    replyTo: report.agent.email || tenantBrand?.replyTo || null,
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
