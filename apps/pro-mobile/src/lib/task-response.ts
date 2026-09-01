/**
 * Stage 4.6.1 — Tasks API envelope helpers (no React Native imports).
 *
 * mobileApiClient returns { ok:true, data: <raw JSON> }.
 * Tasks routes return { ok:true, tasks:[...] } / { ok:true, task:{...} }.
 */

import type { MobileLeadTask } from "../types/lead";

export function unwrapTasksList(payload: unknown): MobileLeadTask[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as MobileLeadTask[];
  if (typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.tasks)) return root.tasks as MobileLeadTask[];
  if (root.data && typeof root.data === "object") {
    const nested = root.data as Record<string, unknown>;
    if (Array.isArray(nested.tasks)) return nested.tasks as MobileLeadTask[];
  }
  return [];
}

export function unwrapCreatedTask(payload: unknown): MobileLeadTask | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  if (root.task && typeof root.task === "object") {
    return root.task as MobileLeadTask;
  }
  if (root.data && typeof root.data === "object") {
    const nested = root.data as Record<string, unknown>;
    if (nested.task && typeof nested.task === "object") {
      return nested.task as MobileLeadTask;
    }
  }
  return null;
}
