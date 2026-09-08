/**
 * Stage 4.5 — Shared in-memory Leads list cache helpers.
 * Kept outside LeadsScreen to avoid circular imports with LeadDetailScreen.
 */

import type { LeadStatus, MobileLeadSummary } from "../types/api";

export let leadCacheStore: {
  workspaceId: string;
  leads: MobileLeadSummary[];
  totalCount: number;
  timestamp: number;
} | null = null;

export function setLeadCacheStore(
  next: {
    workspaceId: string;
    leads: MobileLeadSummary[];
    totalCount: number;
    timestamp: number;
  } | null,
) {
  leadCacheStore = next;
}

/** Stage 5.2 — clear leads list cache on workspace switch / logout. */
export function clearLeadListCache(workspaceId?: string) {
  if (!workspaceId) {
    leadCacheStore = null;
    return;
  }
  if (leadCacheStore?.workspaceId === workspaceId) {
    leadCacheStore = null;
  }
}

/** Patch a lead row after status mutation so Back reflects the new status. */
export function updateLeadStatusInListCache(
  workspaceId: string | undefined,
  leadId: string,
  status: LeadStatus,
  statusChangedAt?: string,
) {
  if (!workspaceId || !leadCacheStore || leadCacheStore.workspaceId !== workspaceId) {
    return;
  }
  const ts = statusChangedAt || new Date().toISOString();
  leadCacheStore = {
    ...leadCacheStore,
    leads: leadCacheStore.leads.map((l) =>
      l.id === leadId
        ? {
            ...l,
            status,
            statusChangedAt: ts,
            updatedAt: ts,
          }
        : l,
    ),
    timestamp: Date.now(),
  };
}

/** Patch buyer/seller badges for every list row sharing this customer. */
export function updateCustomerFlagsInListCache(
  workspaceId: string | undefined,
  customerId: string,
  flags: { isBuyer?: boolean; isSeller?: boolean },
) {
  if (!workspaceId || !leadCacheStore || leadCacheStore.workspaceId !== workspaceId) {
    return;
  }
  leadCacheStore = {
    ...leadCacheStore,
    leads: leadCacheStore.leads.map((l) => {
      if (!l.customer || l.customer.id !== customerId) return l;
      return {
        ...l,
        customer: {
          ...l.customer,
          ...(flags.isBuyer !== undefined ? { isBuyer: flags.isBuyer } : {}),
          ...(flags.isSeller !== undefined ? { isSeller: flags.isSeller } : {}),
        },
      };
    }),
    timestamp: Date.now(),
  };
}

/** Patch email verification for every list row sharing this customer. */
export function updateCustomerEmailVerifiedInListCache(
  workspaceId: string | undefined,
  customerId: string,
  emailVerified: boolean,
) {
  if (!workspaceId || !leadCacheStore || leadCacheStore.workspaceId !== workspaceId) {
    return;
  }
  leadCacheStore = {
    ...leadCacheStore,
    leads: leadCacheStore.leads.map((l) => {
      if (!l.customer || l.customer.id !== customerId) return l;
      return {
        ...l,
        customer: {
          ...l.customer,
          emailVerified,
        },
      };
    }),
    timestamp: Date.now(),
  };
}
