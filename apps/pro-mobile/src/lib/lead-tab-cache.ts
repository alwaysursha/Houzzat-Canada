/**
 * Stage 4.6 / 4.7 / 4.8 — Workspace-safe lead tab caches (no React Native imports).
 * Used by tab components + auth-controller on workspace switch / logout.
 */

import type {
  MobileLeadAppointment,
  MobileLeadEmail,
  MobileLeadTask,
} from "../types/api";

export const taskCache = new Map<
  string,
  { tasks: MobileLeadTask[]; timestamp: number }
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
