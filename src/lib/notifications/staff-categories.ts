import {
  isPushTypeEnabled,
  parsePushPrefs,
  type StaffPushType,
} from "@/lib/notifications/catalog";

/** Nested under User.pushNotificationPrefs — avoids a new DB column. */
export const STAFF_EMAIL_PREFS_KEY = "staffEmail" as const;

export const STAFF_NOTIFICATION_CATEGORIES = [
  "new_leads",
  "lead_assignment",
  "lead_updates",
  "contact_appointments",
  "live_activity",
  "tasks",
  "engagement",
  "customer_alert_changes",
] as const;

export type StaffNotificationCategory =
  (typeof STAFF_NOTIFICATION_CATEGORIES)[number];

export type StaffCategoryChannel = "push" | "email";

export type StaffCategoryDefinition = {
  id: StaffNotificationCategory;
  label: string;
  description: string;
  /** Underlying push keys toggled together in the UI. */
  pushTypes: StaffPushType[];
  /**
   * Whether this category currently has an active staff email emitter.
   * Preference may still be stored when false — capability ≠ activation.
   */
  emailActive: boolean;
  /** Require confirm modal before turning a channel OFF. */
  highStakes: boolean;
};

/**
 * Preference UI rows. `chat_message` is a staff push type in catalog.ts
 * but has no category row in V1 (missing key defaults ON).
 */
export const STAFF_CATEGORY_CATALOG: StaffCategoryDefinition[] = [
  {
    id: "new_leads",
    label: "New Leads",
    description:
      "Get notified when a new lead is assigned to you or hits your desk.",
    pushTypes: ["new_lead"],
    emailActive: true,
    highStakes: true,
  },
  {
    id: "lead_assignment",
    label: "Lead Assignment",
    description:
      "Get notified when leads are assigned or transferred to you.",
    pushTypes: ["lead_reassigned"],
    emailActive: false,
    highStakes: true,
  },
  {
    id: "lead_updates",
    label: "Lead Info Updates",
    description:
      "When a client updates contact details or adds Buyer/Seller interest.",
    pushTypes: ["lead_info_updated"],
    emailActive: true,
    highStakes: true,
  },
  {
    id: "contact_appointments",
    label: "Contact & Appointments",
    description:
      "Showing, viewing, and callback-style alerts (when those events are sent separately).",
    pushTypes: ["contact_requested", "appointment"],
    emailActive: false,
    highStakes: false,
  },
  {
    id: "live_activity",
    label: "Live Activity",
    description: "Alerts when a client on your desk is browsing or going hot.",
    pushTypes: ["lead_online", "hot_pipeline"],
    emailActive: false,
    highStakes: false,
  },
  {
    id: "tasks",
    label: "Tasks",
    description: "Reminders when tasks are due or overdue.",
    pushTypes: ["task_due"],
    emailActive: false,
    highStakes: true,
  },
  {
    id: "engagement",
    label: "Engagement",
    description:
      "When a client opens a CRM email you sent, or opens/clicks a property alert.",
    pushTypes: ["alert_engagement", "email_engagement"],
    emailActive: false,
    highStakes: false,
  },
  {
    id: "customer_alert_changes",
    label: "Customer alert changes",
    description:
      "When an assigned customer stops a Property Watch, Area Watch, or Saved Search, or turns off their email alerts.",
    pushTypes: ["customer_alert_change"],
    emailActive: true,
    highStakes: true,
  },
];

export function isStaffNotificationCategory(
  value: string,
): value is StaffNotificationCategory {
  return (STAFF_NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

function readStaffEmailBag(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const nested = (raw as Record<string, unknown>)[STAFF_EMAIL_PREFS_KEY];
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
    return {};
  }
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(nested as Record<string, unknown>)) {
    if (!isStaffNotificationCategory(key)) continue;
    if (typeof value !== "boolean") continue;
    out[key] = value;
  }
  return out;
}

/** Missing email key = ON (preserve current desk-email behavior). */
export function isStaffEmailCategoryEnabled(
  prefs: unknown,
  category: StaffNotificationCategory,
): boolean {
  const email = readStaffEmailBag(prefs);
  if (email[category] === false) return false;
  return true;
}

/** Category push ON only when every mapped push type is enabled. */
export function isStaffCategoryPushEnabled(
  prefs: unknown,
  category: StaffNotificationCategory,
): boolean {
  const def = STAFF_CATEGORY_CATALOG.find((item) => item.id === category);
  if (!def) return true;
  return def.pushTypes.every((type) => isPushTypeEnabled(prefs, type));
}

export function staffCategoriesForUi(prefs: unknown) {
  return STAFF_CATEGORY_CATALOG.map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    highStakes: item.highStakes,
    emailActive: item.emailActive,
    pushEnabled: isStaffCategoryPushEnabled(prefs, item.id),
    emailEnabled: isStaffEmailCategoryEnabled(prefs, item.id),
  }));
}

/**
 * Merge category channel patch into the existing prefs blob.
 * Preserves flat push keys + nested staffEmail.
 */
export function mergeStaffCategoryPrefs(
  existing: unknown,
  patch: {
    category: StaffNotificationCategory;
    channel: StaffCategoryChannel;
    enabled: boolean;
  },
): Record<string, unknown> {
  const push = parsePushPrefs(existing);
  const email = readStaffEmailBag(existing);
  const def = STAFF_CATEGORY_CATALOG.find((item) => item.id === patch.category);
  if (!def) {
    return { ...push, [STAFF_EMAIL_PREFS_KEY]: email };
  }

  if (patch.channel === "push") {
    for (const type of def.pushTypes) {
      push[type] = patch.enabled;
    }
  } else {
    email[patch.category] = patch.enabled;
  }

  return {
    ...push,
    [STAFF_EMAIL_PREFS_KEY]: email,
  };
}

export function staffCategoryLabel(category: StaffNotificationCategory): string {
  return (
    STAFF_CATEGORY_CATALOG.find((item) => item.id === category)?.label ??
    category
  );
}

export function channelLabel(channel: StaffCategoryChannel): string {
  return channel === "push" ? "push" : "email";
}
