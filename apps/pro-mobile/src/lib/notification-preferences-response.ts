/**
 * Stage 5.10 — Notification preferences unwrap helpers (no RN imports).
 */

export type StaffNotificationCategoryId =
  | "new_leads"
  | "lead_assignment"
  | "contact_appointments"
  | "live_activity"
  | "tasks"
  | "engagement";

export type StaffCategoryChannel = "push" | "email";

export type MobileStaffNotificationCategory = {
  id: StaffNotificationCategoryId;
  label: string;
  description: string;
  highStakes: boolean;
  emailActive: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
};

export type MobileNotificationPreferences = {
  scope: "user_global";
  categories: MobileStaffNotificationCategory[];
  staffEmail: string | null;
  device: {
    registeredDevices: number;
    shell: "houzzatpro";
  };
  meta: {
    caslNotConfigurableHere: true;
    smsPreferenceNotCanonicalForStaff: true;
    inboundEmailCanonical: false;
  };
};

export function unwrapNotificationPreferences(
  payload: unknown,
): MobileNotificationPreferences | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;
  if (!Array.isArray(data.categories)) return null;
  return {
    scope: "user_global",
    categories: data.categories as MobileStaffNotificationCategory[],
    staffEmail: typeof data.staffEmail === "string" ? data.staffEmail : null,
    device:
      data.device && typeof data.device === "object"
        ? {
            registeredDevices: Number(
              (data.device as { registeredDevices?: number }).registeredDevices ??
                0,
            ),
            shell: "houzzatpro",
          }
        : { registeredDevices: 0, shell: "houzzatpro" },
    meta: {
      caslNotConfigurableHere: true,
      smsPreferenceNotCanonicalForStaff: true,
      inboundEmailCanonical: false,
    },
  };
}
