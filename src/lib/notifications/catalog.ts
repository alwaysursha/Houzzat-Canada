export const CONSUMER_PUSH_TYPES = [
  "price_drop",
  "saved_search_match",
  "sold_status",
  "just_listed",
  "viewing_reminder",
  "shortlist",
  "morning_digest",
  "property_update",
  "agent_chat",
] as const;

export const STAFF_PUSH_TYPES = [
  "new_lead",
  "contact_requested",
  "lead_online",
  "hot_pipeline",
  "task_due",
  "alert_engagement",
  "appointment",
  "lead_reassigned",
  "lead_info_updated",
  "chat_message",
] as const;

export type ConsumerPushType = (typeof CONSUMER_PUSH_TYPES)[number];
export type StaffPushType = (typeof STAFF_PUSH_TYPES)[number];
export type PushType = ConsumerPushType | StaffPushType;
export type PushAudience = "consumer" | "staff";

export type PushTypeItem = {
  id: PushType;
  label: string;
  description: string;
};

export const CONSUMER_PUSH_CATALOG: PushTypeItem[] = [
  {
    id: "price_drop",
    label: "Price drops",
    description: "A home you’re watching dropped in price",
  },
  {
    id: "saved_search_match",
    label: "New matches",
    description: "A listing matches your saved search",
  },
  {
    id: "sold_status",
    label: "Sold / status change",
    description: "A watched home sold or changed status",
  },
  {
    id: "just_listed",
    label: "Just listed nearby",
    description: "A new listing in an area you watch",
  },
  {
    id: "viewing_reminder",
    label: "Showing reminders",
    description: "Your showing or virtual viewing is confirmed or coming up",
  },
  {
    id: "shortlist",
    label: "Homes from your agent",
    description: "Your agent sent you a shortlist of homes",
  },
  {
    id: "morning_digest",
    label: "Morning digest",
    description: "Daily summary of new matches (same as the 6AM email)",
  },
  {
    id: "property_update",
    label: "Other listing updates",
    description: "Other changes on homes you watch",
  },
  {
    id: "agent_chat",
    label: "Chat messages",
    description: "Your agent sent you a new Chat message",
  },
];

export const STAFF_PUSH_CATALOG: PushTypeItem[] = [
  {
    id: "new_lead",
    label: "New leads",
    description: "A new inquiry hit your desk (Call New)",
  },
  {
    id: "contact_requested",
    label: "Contact requested",
    description: "Someone asked for a showing, viewing, or callback",
  },
  {
    id: "lead_online",
    label: "Lead is online",
    description: "A client on your desk is browsing the site now",
  },
  {
    id: "hot_pipeline",
    label: "Hot pipeline",
    description: "A lead crossed the hot-score threshold",
  },
  {
    id: "task_due",
    label: "Tasks due",
    description: "A task is due now or overdue",
  },
  {
    id: "alert_engagement",
    label: "Property alert opened",
    description: "A client opened or clicked a property alert",
  },
  {
    id: "appointment",
    label: "Appointments",
    description: "A showing was requested or is starting soon",
  },
  {
    id: "lead_reassigned",
    label: "Lead assigned to you",
    description: "A teammate assigned or handed you a lead",
  },
  {
    id: "lead_info_updated",
    label: "Lead info updated",
    description: "A client changed contact details or Buyer/Seller interest",
  },
  {
    id: "chat_message",
    label: "Chat messages",
    description: "A client sent you a new Chat message",
  },
];

export function catalogForAudience(audience: PushAudience): PushTypeItem[] {
  return audience === "staff" ? STAFF_PUSH_CATALOG : CONSUMER_PUSH_CATALOG;
}

export function isConsumerPushType(value: string): value is ConsumerPushType {
  return (CONSUMER_PUSH_TYPES as readonly string[]).includes(value);
}

export function isStaffPushType(value: string): value is StaffPushType {
  return (STAFF_PUSH_TYPES as readonly string[]).includes(value);
}

export function isPushType(value: string): value is PushType {
  return isConsumerPushType(value) || isStaffPushType(value);
}

export function audienceForPushType(type: PushType): PushAudience {
  return isStaffPushType(type) ? "staff" : "consumer";
}

export function shellForAudience(
  audience: PushAudience,
): "houzzat" | "houzzatpro" {
  return audience === "staff" ? "houzzatpro" : "houzzat";
}

/** Missing key = enabled (all types on by default). */
export function isPushTypeEnabled(
  prefs: unknown,
  type: PushType,
): boolean {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return true;
  const value = (prefs as Record<string, unknown>)[type];
  if (value === false) return false;
  return true;
}

export function parsePushPrefs(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isPushType(key)) continue;
    if (typeof value !== "boolean") continue;
    out[key] = value;
  }
  return out;
}

export function mergePushPrefs(
  existing: unknown,
  patch: Record<string, boolean>,
  audience: PushAudience,
): Record<string, boolean> {
  const next = parsePushPrefs(existing);
  const allowed = catalogForAudience(audience);
  for (const item of allowed) {
    if (item.id in patch) next[item.id] = patch[item.id]!;
  }
  return next;
}
