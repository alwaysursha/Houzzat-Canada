/**
 * Trusted staff lead-write ownership (CSV import + manual Add Lead).
 *
 * Hostname-resolved staff context is authoritative. Never read workspaceId
 * (or other tenant keys) from the client body.
 */
import type { Prisma } from "@prisma/client";
import { isActiveHostnameBoundReadMode } from "@/lib/crm-read-scope";
import { prisma } from "@/lib/prisma";

export type LeadImportStaffContext = {
  organizationId: string;
  workspaceId: string | null;
  isWorkspaceMember: boolean;
  isWorkspaceCrmAllowed: boolean;
  hasAmbiguousWorkspaceMembership: boolean;
};

export type LeadImportOwnershipOk = {
  ok: true;
  organizationId: string;
  /** Set in hostname-bound workspace CRM; omitted on the legacy Houzzat path. */
  workspaceId?: string;
};

export type LeadImportOwnershipDenied = {
  ok: false;
  status: 403;
  error: string;
};

export type LeadImportOwnership = LeadImportOwnershipOk | LeadImportOwnershipDenied;

/**
 * Trusted staff write target from hostname-bound CRM context.
 * Workspace CRM mode fails closed when hostname workspace is missing.
 */
export function resolveLeadImportOwnership(
  ctx: LeadImportStaffContext,
): LeadImportOwnership {
  if (isActiveHostnameBoundReadMode()) {
    if (
      ctx.hasAmbiguousWorkspaceMembership ||
      !ctx.isWorkspaceMember ||
      !ctx.isWorkspaceCrmAllowed ||
      !ctx.workspaceId
    ) {
      return {
        ok: false,
        status: 403,
        error: "Workspace required.",
      };
    }
    return {
      ok: true,
      organizationId: ctx.organizationId,
      workspaceId: ctx.workspaceId,
    };
  }

  return { ok: true, organizationId: ctx.organizationId };
}

/** Duplicate lookup: trusted workspace when present, never a foreign tenant. */
export function importLeadDuplicateWhere(input: {
  email: string;
  workspaceId?: string;
  organizationId: string;
}): Prisma.LeadWhereInput {
  const email = input.email.trim().toLowerCase();
  const customer = { customer: { email } };
  const open = { status: { not: "PAST_CLIENT" as const } };

  if (input.workspaceId) {
    return {
      workspaceId: input.workspaceId,
      ...open,
      ...customer,
    };
  }

  return {
    organizationId: input.organizationId,
    ...open,
    ...customer,
  };
}

export async function findOpenImportLeadForEmail(input: {
  email: string;
  workspaceId?: string;
  organizationId: string;
}) {
  return prisma.lead.findFirst({
    where: importLeadDuplicateWhere(input),
    select: { id: true, workspaceId: true },
  });
}
