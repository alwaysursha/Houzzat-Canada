/**
 * Stage 4.6 / 4.7 / 4.8 — Workspace-safe lead tab caches (no React Native imports).
 * Used by tab components + auth-controller on workspace switch / logout.
 */

import type {
  MobileLeadAppointment,
  MobileLeadEmail,
  MobileLeadEngagement,
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
