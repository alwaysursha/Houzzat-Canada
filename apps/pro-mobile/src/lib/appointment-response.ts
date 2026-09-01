/**
 * Stage 4.7 — Appointment API envelope helpers (no React Native imports).
 */

import type { MobileLeadAppointment } from "../types/lead";

export function unwrapAppointmentsList(payload: unknown): MobileLeadAppointment[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as MobileLeadAppointment[];
  if (typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.appointments)) {
    return root.appointments as MobileLeadAppointment[];
  }
  if (root.data && typeof root.data === "object") {
    const nested = root.data as Record<string, unknown>;
    if (Array.isArray(nested.appointments)) {
      return nested.appointments as MobileLeadAppointment[];
    }
  }
  return [];
}

export function unwrapAppointment(
  payload: unknown,
): MobileLeadAppointment | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  if (root.appointment && typeof root.appointment === "object") {
    return root.appointment as MobileLeadAppointment;
  }
  if (root.data && typeof root.data === "object") {
    const nested = root.data as Record<string, unknown>;
    if (nested.appointment && typeof nested.appointment === "object") {
      return nested.appointment as MobileLeadAppointment;
    }
  }
  return null;
}
