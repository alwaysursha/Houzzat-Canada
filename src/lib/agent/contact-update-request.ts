import { scheduleCustomerContactRequestNotice } from "@/lib/account/contact-update-notify";
import { prisma } from "@/lib/prisma";

export type ContactUpdateChannel = "email" | "phone";

type ContactUpdateWriter = {
  user: {
    update: (args: {
      where: { id: string };
      data: {
        emailUpdateRequestedAt?: Date;
        phoneUpdateRequestedAt?: Date;
      };
    }) => Promise<unknown>;
  };
  leadActivity: {
    create: (args: {
      data: {
        leadId: string;
        userId: string;
        type: "contact_update_request";
        body: string;
        meta: { channel: ContactUpdateChannel; requestedAt: string };
      };
    }) => Promise<unknown>;
  };
};

export function contactUpdateRequestBody(channel: ContactUpdateChannel): string {
  const channelLabel = channel === "phone" ? "phone number" : "email";
  return `Agent requested customer to provide the correct ${channelLabel}`;
}

/**
 * CRM writes for an agent "request the correct contact" action.
 * Does not send email or push. Callers schedule that after the surrounding
 * database work commits.
 */
export async function recordCustomerContactUpdateRequest(
  db: ContactUpdateWriter,
  input: {
    leadId: string;
    customerId: string;
    actorUserId: string;
    channel: ContactUpdateChannel;
    requestedAt: Date;
  },
): Promise<void> {
  if (input.channel === "email") {
    await db.user.update({
      where: { id: input.customerId },
      data: { emailUpdateRequestedAt: input.requestedAt },
    });
  } else {
    await db.user.update({
      where: { id: input.customerId },
      data: { phoneUpdateRequestedAt: input.requestedAt },
    });
  }

  await db.leadActivity.create({
    data: {
      leadId: input.leadId,
      userId: input.actorUserId,
      type: "contact_update_request",
      body: contactUpdateRequestBody(input.channel),
      meta: {
        channel: input.channel,
        requestedAt: input.requestedAt.toISOString(),
      },
    },
  });
}

/**
 * Standalone reminder: write the request, then notify the customer.
 * Used by the web and mobile contact-reminder routes.
 */
export async function requestCustomerContactUpdate(input: {
  leadId: string;
  customerId: string;
  actorUserId: string;
  channel: ContactUpdateChannel;
}): Promise<{ ok: true; channel: ContactUpdateChannel; requestedAt: string }> {
  const requestedAt = new Date();
  await recordCustomerContactUpdateRequest(prisma, {
    ...input,
    requestedAt,
  });
  scheduleCustomerContactRequestNotice({
    customerId: input.customerId,
    leadId: input.leadId,
    channel: input.channel,
    actorUserId: input.actorUserId,
  });
  return {
    ok: true,
    channel: input.channel,
    requestedAt: requestedAt.toISOString(),
  };
}
