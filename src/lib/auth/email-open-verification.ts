import { normalizeIdentityEmail } from "@/lib/auth/workspace-identity";
import { prisma } from "@/lib/prisma";
import { isConsumerRole } from "@/lib/roles";

export const EMAIL_VERIFIED_BY_SYSTEM_BODY = "Email Verified by the System";

export type EmailOpenAutoVerifyReason =
  | "ok"
  | "missing_customer"
  | "not_consumer"
  | "disabled"
  | "already_verified"
  | "recipient_mismatch"
  | "workspace_mismatch";

export type EmailOpenAutoVerifyCustomer = {
  id: string;
  email: string;
  emailVerified: Date | null;
  role: string;
  disabledAt: Date | null;
  workspaceId: string | null;
};

export type EmailOpenAutoVerifyLog = {
  id: string;
  leadId: string;
  toEmail: string;
  workspaceId: string | null;
  leadWorkspaceId: string | null;
  customerId: string | null;
};

export function emailsMatchForVerification(a: string, b: string): boolean {
  return normalizeIdentityEmail(a) === normalizeIdentityEmail(b);
}

export function evaluateEmailOpenAutoVerify(input: {
  log: EmailOpenAutoVerifyLog;
  customer: EmailOpenAutoVerifyCustomer | null;
}): { ok: true } | { ok: false; reason: EmailOpenAutoVerifyReason } {
  const customer = input.customer;
  if (!input.log.customerId || !customer) {
    return { ok: false, reason: "missing_customer" };
  }
  if (customer.id !== input.log.customerId) {
    return { ok: false, reason: "missing_customer" };
  }
  if (customer.disabledAt) {
    return { ok: false, reason: "disabled" };
  }
  if (!isConsumerRole(customer.role)) {
    return { ok: false, reason: "not_consumer" };
  }
  if (customer.emailVerified) {
    return { ok: false, reason: "already_verified" };
  }
  if (!emailsMatchForVerification(input.log.toEmail, customer.email)) {
    return { ok: false, reason: "recipient_mismatch" };
  }

  const workspaces = [
    input.log.workspaceId,
    input.log.leadWorkspaceId,
    customer.workspaceId,
  ].filter((id): id is string => Boolean(id));
  if (workspaces.length > 0 && workspaces.some((id) => id !== workspaces[0])) {
    return { ok: false, reason: "workspace_mismatch" };
  }

  return { ok: true };
}

export type EmailOpenVerifyStore = {
  stampEmailVerifiedIfUnverified(input: {
    userId: string;
    at: Date;
  }): Promise<boolean>;
  createSystemVerificationActivity(input: {
    leadId: string;
    emailLogId: string;
    providerId: string;
    at: Date;
  }): Promise<void>;
};

export async function applyEmailOpenAutoVerify(
  store: EmailOpenVerifyStore,
  input: {
    log: EmailOpenAutoVerifyLog;
    customer: EmailOpenAutoVerifyCustomer | null;
    providerId: string;
    at: Date;
  },
): Promise<"verified" | "skipped"> {
  const decision = evaluateEmailOpenAutoVerify(input);
  if (!decision.ok || !input.customer) return "skipped";

  const stamped = await store.stampEmailVerifiedIfUnverified({
    userId: input.customer.id,
    at: input.at,
  });
  if (!stamped) return "skipped";

  await store.createSystemVerificationActivity({
    leadId: input.log.leadId,
    emailLogId: input.log.id,
    providerId: input.providerId,
    at: input.at,
  });
  return "verified";
}

export const prismaEmailOpenVerifyStore: EmailOpenVerifyStore = {
  async stampEmailVerifiedIfUnverified(input) {
    const result = await prisma.user.updateMany({
      where: {
        id: input.userId,
        emailVerified: null,
        disabledAt: null,
      },
      data: { emailVerified: input.at },
    });
    return result.count === 1;
  },
  async createSystemVerificationActivity(input) {
    await prisma.leadActivity.create({
      data: {
        leadId: input.leadId,
        userId: null,
        type: "contact_verify",
        body: EMAIL_VERIFIED_BY_SYSTEM_BODY,
        meta: {
          channel: "email",
          verified: true,
          accountLock: true,
          source: "email_open",
          emailLogId: input.emailLogId,
          providerId: input.providerId,
          at: input.at.toISOString(),
        },
      },
    });
  },
};

/**
 * After a qualifying Resend open (or click-implied open), verify the lead's
 * current customer email when safety checks pass. Idempotent under retries.
 */
export async function verifyCustomerEmailFromLeadEmailOpen(input: {
  providerId: string;
  at: Date;
}): Promise<"verified" | "skipped"> {
  const log = await prisma.leadEmailLog.findUnique({
    where: { providerId: input.providerId },
    select: {
      id: true,
      leadId: true,
      workspaceId: true,
      toEmail: true,
      lead: {
        select: {
          workspaceId: true,
          customerId: true,
        },
      },
    },
  });
  if (!log?.lead.customerId) return "skipped";

  const customer = await prisma.user.findUnique({
    where: { id: log.lead.customerId },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      role: true,
      disabledAt: true,
      workspaceId: true,
    },
  });

  return applyEmailOpenAutoVerify(prismaEmailOpenVerifyStore, {
    log: {
      id: log.id,
      leadId: log.leadId,
      toEmail: log.toEmail,
      workspaceId: log.workspaceId,
      leadWorkspaceId: log.lead.workspaceId,
      customerId: log.lead.customerId,
    },
    customer,
    providerId: input.providerId,
    at: input.at,
  });
}
