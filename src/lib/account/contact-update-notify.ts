import { SITE_URL } from "@/lib/constants";
import { logClientEmail } from "@/lib/email/log";
import { sendRenderedEmail } from "@/lib/email/send";
import { renderContactUpdateRequestEmail } from "@/lib/email/templates";
import { sendPushToUser } from "@/lib/notifications/push";
import { scheduleLeadInfoUpdatedForCustomer } from "@/lib/notifications/staff-events";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";

function accountUrl() {
  return `${SITE_URL.replace(/\/$/, "")}/account`;
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

/** Compatibility wrapper — customer contact saves go through Lead Info Updated. */
export function scheduleStaffContactUpdatedNotice(input: {
  customerId: string;
  emailChanged?: boolean;
  phoneChanged?: boolean;
  changeLabels?: string[];
}): void {
  const changes = [
    ...(input.changeLabels ?? []).map((label) => ({
      kind: label.toLowerCase().includes("email")
        ? ("email" as const)
        : label.toLowerCase().includes("name")
          ? ("name" as const)
          : label.toLowerCase().includes("address")
            ? ("homeAddress" as const)
            : ("cellphone" as const),
      label,
    })),
    ...(input.emailChanged
      ? [{ kind: "email" as const, label: "Email updated" }]
      : []),
    ...(input.phoneChanged
      ? [{ kind: "cellphone" as const, label: "Cellphone updated" }]
      : []),
  ];
  scheduleLeadInfoUpdatedForCustomer({
    customerId: input.customerId,
    changes,
  });
}
