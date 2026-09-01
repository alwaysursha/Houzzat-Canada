/**
 * Stage 4.6 / 4.7 / 4.8 — Workspace-safe lead tab caches (no React Native imports).
 * Used by tab components + auth-controller on workspace switch / logout.
 */

import type {
  MobileLeadAppointment,
  MobileLeadEmail,
  MobileLeadEngagement,
  MobileGlobalAppointment,
  MobileGlobalTask,
  MobileLeadTask,
} from "../types/api";

export const taskCache = new Map<
  string,
  { tasks: MobileLeadTask[]; timestamp: number }
>();

/** Stage 5.0 — workspace-scoped global Tasks inbox. */
export const globalTaskCache = new Map<
  string,
  { tasks: MobileGlobalTask[]; timestamp: number }
>();

export const appointmentCache = new Map<
  string,
  { appointments: MobileLeadAppointment[]; timestamp: number }
>();

/** Stage 5.1 — workspace-scoped global Calendar / appointments book. */
export const globalAppointmentCache = new Map<
  string,
  {
    appointments: MobileGlobalAppointment[];
    from: string;
    to: string;
    timestamp: number;
  }
>();

export type ConversationCacheEntry = {
  emails: MobileLeadEmail[];
  nextCursor: string | null;
  composer: {
    toEmail: string | null;
    consented: boolean;
    alertsEnabled: boolean;
  };
  timestamp: number;
};

export const conversationCache = new Map<string, ConversationCacheEntry>();

export const engagementCache = new Map<
  string,
  { engagement: MobileLeadEngagement; timestamp: number }
>();

export function clearLeadTasksCache(workspaceId?: string) {
  if (!workspaceId) {
    taskCache.clear();
    return;
  }
  for (const key of taskCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) {
      taskCache.delete(key);
    }
  }
}

export function clearGlobalTasksCache(workspaceId?: string) {
  if (!workspaceId) {
    globalTaskCache.clear();
    return;
  }
  for (const key of globalTaskCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) {
      globalTaskCache.delete(key);
    }
  }
}

/** After global Done/create — drop lead-scoped cache so Lead Detail Tasks revalidate. */
export function invalidateLeadTasksCacheForLead(
  workspaceId: string | undefined,
  leadId: string | null | undefined,
) {
  if (!workspaceId || !leadId) return;
  taskCache.delete(`${workspaceId}:${leadId}:tasks`);
}

/** After Lead Detail task mutation — drop global inbox so it revalidates. */
export function invalidateGlobalTasksCacheForWorkspace(
  workspaceId: string | undefined,
) {
  if (!workspaceId) {
    globalTaskCache.clear();
    return;
  }
  clearGlobalTasksCache(workspaceId);
}

export function clearLeadAppointmentsCache(workspaceId?: string) {
  if (!workspaceId) {
    appointmentCache.clear();
    return;
  }
  for (const key of appointmentCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) {
      appointmentCache.delete(key);
    }
  }
}

export function clearGlobalAppointmentsCache(workspaceId?: string) {
  if (!workspaceId) {
    globalAppointmentCache.clear();
    return;
  }
  for (const key of globalAppointmentCache.keys()) {
    // Keys are `${workspaceId}:calendar` (Stage 5.1) — match prefix safely.
    if (
      key === `${workspaceId}:calendar` ||
      key.startsWith(`${workspaceId}:calendar:`)
    ) {
      globalAppointmentCache.delete(key);
    }
  }
}

/** After global appointment mutation — drop lead-scoped cache. */
export function invalidateLeadAppointmentsCacheForLead(
  workspaceId: string | undefined,
  leadId: string | null | undefined,
) {
  if (!workspaceId || !leadId) return;
  appointmentCache.delete(`${workspaceId}:${leadId}:appointments`);
}

/** After Lead Detail appointment mutation — drop global calendar cache. */
export function invalidateGlobalAppointmentsCacheForWorkspace(
  workspaceId: string | undefined,
) {
  if (!workspaceId) {
    globalAppointmentCache.clear();
    return;
  }
  clearGlobalAppointmentsCache(workspaceId);
}

export function clearLeadConversationsCache(workspaceId?: string) {
  if (!workspaceId) {
    conversationCache.clear();
    return;
  }
  for (const key of conversationCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) {
      conversationCache.delete(key);
    }
  }
}

export function clearLeadEngagementCache(workspaceId?: string) {
  if (!workspaceId) {
    engagementCache.clear();
    return;
  }
  for (const key of engagementCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) {
      engagementCache.delete(key);
    }
  }
}

/**
 * Stage 5.2 — Single path to clear every workspace-scoped native cache.
 * Used by workspace switch + logout. Pass workspaceId to scope; omit to clear all.
 *
 * Lead Detail cache is cleared via optional callback registered by LeadDetailScreen
 * to avoid circular imports — see registerLeadDetailCacheClearer.
 */
let leadDetailCacheClearer: ((workspaceId?: string) => void) | null = null;

export function registerLeadDetailCacheClearer(
  clearer: (workspaceId?: string) => void,
) {
  leadDetailCacheClearer = clearer;
}

export function clearAllWorkspaceCaches(workspaceId?: string) {
  clearLeadTasksCache(workspaceId);
  clearGlobalTasksCache(workspaceId);
  clearLeadAppointmentsCache(workspaceId);
  clearGlobalAppointmentsCache(workspaceId);
  clearLeadConversationsCache(workspaceId);
  clearLeadEngagementCache(workspaceId);
  leadDetailCacheClearer?.(workspaceId);
}
