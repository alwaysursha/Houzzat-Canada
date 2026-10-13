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
  MobileCommunicationItem,
} from "../types/api";
import type { MobileListingCard, MobilePropertyDetail } from "../types/property";
import type { MobileAgentStatistics } from "./statistics-response";
import type { MobileNotificationPreferences } from "./notification-preferences-response";

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

/** Stage 5.8 — workspace-scoped global Communications (LeadEmailLog). */
export type CommunicationsCacheEntry = {
  items: MobileCommunicationItem[];
  nextCursor: string | null;
  queryKey: string;
  timestamp: number;
};

export const communicationsCache = new Map<string, CommunicationsCacheEntry>();

export const engagementCache = new Map<
  string,
  { engagement: MobileLeadEngagement; timestamp: number }
>();

/** Stage 5.3 — workspace-scoped property search results cache. */
export const propertySearchCache = new Map<
  string,
  { listings: MobileListingCard[]; queryKey: string; timestamp: number }
>();

/** Stage 5.4 — workspace-scoped saved listing MLS set (canonical SavedListing). */
export const savedListingsCache = new Map<
  string,
  { mlsNumbers: Set<string>; timestamp: number }
>();

/** Stage 5.5 — workspace-scoped shortlist list (enriched cards). */
export const shortlistListCache = new Map<
  string,
  {
    listings: MobileListingCard[];
    total: number;
    hasMore: boolean;
    offset: number;
    timestamp: number;
  }
>();

/** Stage 5.4 — property detail by workspace + MLS. */
export const propertyDetailCache = new Map<
  string,
  { detail: MobilePropertyDetail; saved: boolean; timestamp: number }
>();

/** Stage 5.9 — workspace+user+range Statistics snapshot. */
export type StatisticsCacheEntry = {
  statistics: MobileAgentStatistics;
  rangeDays: number;
  timestamp: number;
};

export const statisticsCache = new Map<string, StatisticsCacheEntry>();

export function statisticsCacheKey(
  workspaceId: string,
  userId: string,
  rangeDays: number,
): string {
  return `${workspaceId}:${userId}:statistics:${rangeDays}`;
}

export function clearStatisticsCache(workspaceId?: string) {
  if (!workspaceId) {
    statisticsCache.clear();
    return;
  }
  for (const key of statisticsCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) {
      statisticsCache.delete(key);
    }
  }
}

/** Stage 5.10 — user-global notification prefs (keyed by userId). */
export const notificationPrefsCache = new Map<
  string,
  { prefs: MobileNotificationPreferences; timestamp: number }
>();

export function notificationPrefsCacheKey(userId: string): string {
  return `user:${userId}:notification-preferences`;
}

/** Stage 5.13 — workspace-scoped Team roster. */
export type MobileTeamCachePayload = {
  workspace: { id: string; name: string; primaryAgentId: string | null };
  memberCount: number;
  capabilities: {
    canInvite: boolean;
    canManageMembers: boolean;
    canSuspend: boolean;
    canRemove: boolean;
    canSetPrimaryAgent: boolean;
    allowedInviteRoles: Array<"ADMIN" | "AGENT">;
    canOpenStatistics: boolean;
  };
  members: Array<Record<string, unknown>>;
  pendingInvites: Array<Record<string, unknown>>;
};

export const teamCache = new Map<
  string,
  { team: MobileTeamCachePayload; timestamp: number }
>();

export function teamCacheKey(workspaceId: string): string {
  return `${workspaceId}:team`;
}

export function clearTeamCache(workspaceId?: string) {
  if (!workspaceId) {
    teamCache.clear();
    return;
  }
  teamCache.delete(teamCacheKey(workspaceId));
}

export type MobileLaunchpadCachePayload = {
  workspaceId: string;
  deskView: "mine" | "team";
  dueTodayCount: number;
  overdueTaskCount: number;
  newLeadCount: number;
  contactedCount: number;
  avgResponseMins: number;
  hotCount: number;
  unreadMessageCount: number;
  unreadConversationCount: number;
  unreadMessages: Array<Record<string, unknown>>;
  callNewLeads: Array<Record<string, unknown>>;
  contactedLeads: Array<Record<string, unknown>>;
  openTasks: Array<Record<string, unknown>>;
  onlineLeads: Array<Record<string, unknown>>;
  hotLeads: Array<Record<string, unknown>>;
  contactRequested: Array<Record<string, unknown>>;
};

export const launchpadCache = new Map<
  string,
  { launchpad: MobileLaunchpadCachePayload; timestamp: number }
>();

export function launchpadCacheKey(workspaceId: string): string {
  return `${workspaceId}:launchpad`;
}

export function clearLaunchpadCache(workspaceId?: string) {
  if (!workspaceId) {
    launchpadCache.clear();
    return;
  }
  launchpadCache.delete(launchpadCacheKey(workspaceId));
}

export function clearNotificationPrefsCache(userId?: string) {
  if (!userId) {
    notificationPrefsCache.clear();
    return;
  }
  notificationPrefsCache.delete(notificationPrefsCacheKey(userId));
}

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

export function clearCommunicationsCache(workspaceId?: string) {
  if (!workspaceId) {
    communicationsCache.clear();
    return;
  }
  for (const key of communicationsCache.keys()) {
    if (key === `${workspaceId}:communications` || key.startsWith(`${workspaceId}:communications:`)) {
      communicationsCache.delete(key);
    }
  }
}

/** After send — drop global inbox + lead Conversations for that lead. */
export function invalidateCommunicationsCachesAfterSend(
  workspaceId: string | undefined,
  leadId: string | null | undefined,
) {
  if (!workspaceId) {
    communicationsCache.clear();
    conversationCache.clear();
    return;
  }
  clearCommunicationsCache(workspaceId);
  if (leadId) {
    conversationCache.delete(`${workspaceId}:${leadId}:conversations`);
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

export function clearPropertySearchCache(workspaceId?: string) {
  if (!workspaceId) {
    propertySearchCache.clear();
    return;
  }
  for (const key of propertySearchCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) {
      propertySearchCache.delete(key);
    }
  }
}

export function clearSavedListingsCache(workspaceId?: string) {
  if (!workspaceId) {
    savedListingsCache.clear();
    return;
  }
  for (const key of savedListingsCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) {
      savedListingsCache.delete(key);
    }
  }
}

export function clearShortlistListCache(workspaceId?: string) {
  if (!workspaceId) {
    shortlistListCache.clear();
    return;
  }
  for (const key of shortlistListCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) {
      shortlistListCache.delete(key);
    }
  }
}

export function clearPropertyDetailCache(workspaceId?: string) {
  if (!workspaceId) {
    propertyDetailCache.clear();
    return;
  }
  for (const key of propertyDetailCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) {
      propertyDetailCache.delete(key);
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
  clearCommunicationsCache(workspaceId);
  clearStatisticsCache(workspaceId);
  clearTeamCache(workspaceId);
  clearLaunchpadCache(workspaceId);
  // Notification prefs are user-global — clear all on logout / full wipe;
  // workspace-only switch should not wipe them (caller passes workspaceId).
  if (!workspaceId) {
    clearNotificationPrefsCache();
  }
  clearLeadEngagementCache(workspaceId);
  clearPropertySearchCache(workspaceId);
  clearSavedListingsCache(workspaceId);
  clearShortlistListCache(workspaceId);
  clearPropertyDetailCache(workspaceId);
  leadDetailCacheClearer?.(workspaceId);
}
