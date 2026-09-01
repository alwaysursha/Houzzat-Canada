/**
 * Stage 4.6 / 4.7 — Workspace-safe lead tab caches (no React Native imports).
 * Used by tab components + auth-controller on workspace switch / logout.
 */

import type { MobileLeadAppointment, MobileLeadTask } from "../types/api";

export const taskCache = new Map<
  string,
  { tasks: MobileLeadTask[]; timestamp: number }
>();

export const appointmentCache = new Map<
  string,
  { appointments: MobileLeadAppointment[]; timestamp: number }
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
