import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type LogLeadActivityForCustomerResult = {
  written: number;
  workspaceId: string | null;
};

export type LeadActivityCustomerDb = {
  user: {
    findUnique(args: {
      where: { id: string };
      select: { id: true; workspaceId: true };
    }): Promise<{ id: string; workspaceId: string | null } | null>;
  };
  lead: {
    findMany(args: {
      where: { customerId: string; workspaceId: string };
      select: { id: true };
      orderBy: { updatedAt: "desc" };
      take: number;
    }): Promise<Array<{ id: string }>>;
  };
  leadActivity: {
    createMany(args: {
      data: Array<{
        leadId: string;
        userId: string | null;
        type: string;
        body: string;
        meta?: Prisma.InputJsonValue;
      }>;
    }): Promise<unknown>;
  };
};

/**
 * Resolve the workspace used for customer CRM activity writes.
 * Never resolves by email. Mismatched caller workspaceId → refuse.
 */
export function resolveCustomerActivityWorkspace(input: {
  userWorkspaceId: string | null | undefined;
  requestedWorkspaceId?: string | null;
}): { ok: true; workspaceId: string } | { ok: false; workspaceId: string | null } {
  if (!input.userWorkspaceId) {
    return { ok: false, workspaceId: null };
  }
  if (
    input.requestedWorkspaceId != null &&
    input.requestedWorkspaceId !== "" &&
    input.requestedWorkspaceId !== input.userWorkspaceId
  ) {
    return { ok: false, workspaceId: input.userWorkspaceId };
  }
  return { ok: true, workspaceId: input.userWorkspaceId };
}

/**
 * Write a LeadActivity on CRM leads for this customer within their workspace.
 *
 * Tenant safety: never fan out to Leads in another workspace. Resolve the
 * customer's home workspace (or require an explicit matching workspaceId) and
 * scope Lead lookup by `{ workspaceId, customerId }`. Never resolve by email.
 *
 * Multiple matching leads in the same workspace still receive a copy (existing
 * CRM fan-out), capped at 40 most recently updated.
 */
export async function logLeadActivityForCustomer(
  input: {
    customerId: string;
    /**
     * Optional caller-supplied workspace. When present it must match the
     * customer's home workspace or the write is refused (zero rows).
     */
    workspaceId?: string | null;
    type: string;
    body: string;
    meta?: Prisma.InputJsonValue;
    actorUserId?: string | null;
  },
  db: LeadActivityCustomerDb = prisma,
): Promise<LogLeadActivityForCustomerResult> {
  const user = await db.user.findUnique({
    where: { id: input.customerId },
    select: { id: true, workspaceId: true },
  });
  const resolved = resolveCustomerActivityWorkspace({
    userWorkspaceId: user?.workspaceId,
    requestedWorkspaceId: input.workspaceId,
  });
  if (!resolved.ok) {
    return { written: 0, workspaceId: resolved.workspaceId };
  }

  const workspaceId = resolved.workspaceId;
  const leads = await db.lead.findMany({
    where: {
      customerId: input.customerId,
      workspaceId,
    },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });
  if (!leads.length) return { written: 0, workspaceId };

  await db.leadActivity.createMany({
    data: leads.map((lead) => ({
      leadId: lead.id,
      userId: input.actorUserId ?? null,
      type: input.type,
      body: input.body,
      ...(input.meta !== undefined ? { meta: input.meta } : {}),
    })),
  });

  return { written: leads.length, workspaceId };
}

export async function logContactActivityForCustomer(
  input: {
    customerId: string;
    workspaceId?: string | null;
    type: "contact_update_request" | "contact_updated_by_customer";
    body: string;
    meta?: Prisma.InputJsonValue;
    actorUserId?: string | null;
  },
  db?: LeadActivityCustomerDb,
) {
  return logLeadActivityForCustomer(input, db);
}
