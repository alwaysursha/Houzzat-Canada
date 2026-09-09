import { openLeadHandoffHref } from "@/lib/agent/lead-profile-query";
import { SITE_URL } from "@/lib/constants";
import { logClientEmail } from "@/lib/email/log";
import { sendRenderedEmail } from "@/lib/email/send";
import {
  renderContactUpdateRequestEmail,
  renderStaffContactUpdatedEmail,
} from "@/lib/email/templates";
import { sendNotification } from "@/lib/notifications";
import { sendPushToUser } from "@/lib/notifications/push";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import { authorizeStaffRecipientForLead } from "@/lib/workspace-notification-recipients";

function accountUrl() {
  return `${SITE_URL.replace(/\/$/, "")}/account`;
}

function leadCrmUrl(leadId: string) {
  const base = SITE_URL.replace(/\/$/, "");
  return `${base}${openLeadHandoffHref(leadId)}`;
}

/** Email + push to the customer after an agent requests a contact update. */
export function scheduleCustomerContactRequestNotice(input: {
  customerId: string;
  leadId: string;
  channel: "email" | "phone";
  actorUserId: string;
}): void {
  scheduleWorkerSideEffect(
    (async () => {
      const customer = await prisma.user.findUnique({
        where: { id: input.customerId },
        select: { id: true, email: true, name: true },
      });
      if (!customer) return;

      const rendered = renderContactUpdateRequestEmail({
        name: customer.name,
        channel: input.channel,
        accountUrl: accountUrl(),
      });

      if (customer.email) {
        const sent = await sendRenderedEmail({
          to: customer.email,
          rendered,
        });
        await logClientEmail({
          customerId: customer.id,
          leadId: input.leadId,
          toEmail: customer.email,
          rendered,
          sentById: input.actorUserId,
          providerId: sent.status === "sent" ? sent.providerId : null,
        });
      }

      sendPushToUser(customer.id, {
        type: "shortlist",
        title:
          input.channel === "phone"
            ? "Please confirm your phone number"
            : "Please confirm your email",
        body: "Your agent asked you to update your contact details.",
        href: "/account",
      });
    })().catch(() => undefined),
  );
}

/** Push + email to assigned HouzzatPRO staff after the customer saves contact info. */
export function scheduleStaffContactUpdatedNotice(input: {
  customerId: string;
  emailChanged: boolean;
  phoneChanged: boolean;
}): void {
  if (!input.emailChanged && !input.phoneChanged) return;

  scheduleWorkerSideEffect(
    (async () => {
      const customer = await prisma.user.findUnique({
        where: { id: input.customerId },
        select: { name: true, email: true, phone: true },
      });
      if (!customer) return;

      const leads = await prisma.lead.findMany({
        where: {
          customerId: input.customerId,
          assignedAgentId: { not: null },
        },
        select: {
          id: true,
          assignedAgentId: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
      });
      if (leads.length === 0) return;

      const fields: Array<"email" | "phone"> = [
        ...(input.emailChanged ? (["email"] as const) : []),
        ...(input.phoneChanged ? (["phone"] as const) : []),
      ];
      const clientLabel =
        customer.name?.trim() || customer.email || "A client";
      const fieldLabel =
        fields.length === 2
          ? "email and phone"
          : fields[0] === "phone"
            ? "phone number"
            : "email";

      const seen = new Set<string>();
      for (const lead of leads) {
        const agentId = lead.assignedAgentId;
        if (!agentId || seen.has(agentId)) continue;
        const ok = await authorizeStaffRecipientForLead({
          userId: agentId,
          leadId: lead.id,
          event: "contact_updated_by_customer",
        });
        if (!ok) continue;
        seen.add(agentId);

        sendPushToUser(agentId, {
          type: "contact_requested",
          title: "Contact details updated",
          body: `${clientLabel} updated their ${fieldLabel}`,
          href: openLeadHandoffHref(lead.id),
        });

        const agent = await prisma.user.findUnique({
          where: { id: agentId },
          select: { email: true },
        });
        if (!agent?.email) continue;

        const rendered = renderStaffContactUpdatedEmail({
          clientLabel,
          fields,
          email: customer.email,
          phone: customer.phone,
          leadUrl: leadCrmUrl(lead.id),
        });
        await sendNotification({
          toEmail: agent.email,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
        });
      }
    })().catch(() => undefined),
  );
}
