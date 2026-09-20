/**
 * Follow Up Boss–style activity filter taxonomy for the lead Activity tab.
 * Maps UI filter keys → TimelineItem.type values (case-insensitive match).
 */

export type ActivityFilterGroupId =
  | "communications"
  | "lead_activity"
  | "team_activity"
  | "updates";

export type ActivityFilterItem = {
  id: string;
  label: string;
  /** TimelineItem.type values that belong to this filter. */
  types: string[];
};

export type ActivityFilterGroup = {
  id: ActivityFilterGroupId;
  label: string;
  items: ActivityFilterItem[];
};

export const ACTIVITY_FILTER_GROUPS: ActivityFilterGroup[] = [
  {
    id: "communications",
    label: "Communications",
    items: [
      { id: "ai", label: "Artificial Intelligence (AI)", types: ["ai", "ai_message"] },
      {
        id: "autotracks",
        label: "AutoTracks",
        types: ["PAGE_VIEW", "LANDING_VIEW", "AUTOTRACK"],
      },
      {
        id: "behavioral",
        label: "Behavioral Communication",
        types: ["BEHAVIORAL", "behavioral"],
      },
      { id: "calls", label: "Calls", types: ["CALL_NOTE", "CALL"] },
      {
        id: "direct_mailers",
        label: "Direct Mailers",
        types: ["DIRECT_MAIL", "direct_mail"],
      },
      {
        id: "emails",
        label: "Emails",
        types: [
          "EMAIL",
          "email_sent",
          "shortlist_emailed",
          "SHORTLIST_EMAILED",
          "AGENT_MESSAGE",
          "EMAIL_OPENED",
          "EMAIL_CLICKED",
          "email_opened",
          "email_clicked",
        ],
      },
      {
        id: "property_alerts",
        label: "Property Alerts",
        types: [
          "WATCH_PROPERTY",
          "WATCH_AREA",
          "property_alert",
          "PROPERTY_ALERT",
          "PROPERTY_ALERT_EMAIL",
          "DIGEST_EMAIL",
          "PROPERTY_ALERT_OPENED",
          "PROPERTY_ALERT_CLICKED",
          "PROPERTY_ALERT_VIEW",
        ],
      },
      {
        id: "text",
        label: "Text Conversations",
        types: ["SMS", "sms", "text", "whatsapp", "TEXT"],
      },
    ],
  },
  {
    id: "lead_activity",
    label: "Lead Activity",
    items: [
      {
        id: "favorites",
        label: "Favorites",
        types: ["SAVE_LISTING", "UNSAVE_LISTING"],
      },
      {
        id: "inquiries",
        label: "Inquiries",
        types: [
          "inquiry",
          "showing_request",
          "virtual_viewing_request",
          "home_valuation",
          "precon_inquiry",
          "seller_readiness",
          "affordability_calc",
          "route_planner_request",
          "ROUTE_PLANNER",
          "LEAD",
          "referral_handoff",
        ],
      },
      { id: "logins", label: "Logins", types: ["SIGN_IN", "SIGN_UP"] },
      {
        id: "property_views",
        label: "Property Views",
        types: ["LISTING_VIEW"],
      },
      {
        id: "registration",
        label: "Registration Date",
        types: ["created", "REGISTRATION"],
      },
      {
        id: "searches",
        label: "Searches",
        types: ["SEARCH", "search_criteria_created", "search_criteria_updated"],
      },
      {
        id: "unsubscribes",
        label: "Unsubscribes",
        types: ["unsubscribe", "alerts_disabled", "UNSUBSCRIBE"],
      },
    ],
  },
  {
    id: "team_activity",
    label: "Team Activity",
    items: [
      {
        id: "appointments",
        label: "Appointments",
        types: [
          "APPOINTMENT",
          "viewing_plan_created",
          "viewing_plan_updated",
          "viewing_appointment_scheduled",
          "viewing_plan_shared",
        ],
      },
      {
        id: "assigned_agent",
        label: "Assigned Agent",
        types: ["assigned", "unassigned", "reassigned", "claimed"],
      },
      { id: "label", label: "Label", types: ["inquiry_tag"] },
      {
        id: "notes",
        label: "Notes",
        types: ["NOTE", "CALL_NOTE", "note_pin", "note"],
      },
      { id: "pipeline", label: "Pipeline", types: ["status_change"] },
      {
        id: "reminders",
        label: "Reminders",
        types: ["reminder_set", "TODO"],
      },
    ],
  },
  {
    id: "updates",
    label: "Updates",
    items: [
      {
        id: "lead_info",
        label: "Lead Info Updates",
        types: [
          "contact_update",
          "contact_update_request",
          "contact_updated_by_customer",
          "contact_verify",
          "profile_flags",
          "email_verification_requested",
        ],
      },
      {
        id: "saved_search",
        label: "Saved Search",
        types: [
          "SAVE_SEARCH",
          "search_criteria_created",
          "search_criteria_updated",
        ],
      },
      {
        id: "status_history",
        label: "Status History",
        types: ["status_change"],
      },
    ],
  },
];

export const ALL_ACTIVITY_FILTER_IDS: string[] =
  ACTIVITY_FILTER_GROUPS.flatMap((g) => g.items.map((i) => i.id));

/** Default mirrors FUB: Calls, Emails, Property Alerts, Texts — plus core lead signals. */
export const DEFAULT_ACTIVITY_FILTER_IDS: string[] = [
  "calls",
  "emails",
  "property_alerts",
  "text",
  "favorites",
  "inquiries",
  "property_views",
  "searches",
  "appointments",
  "notes",
  "pipeline",
  "reminders",
  "assigned_agent",
  "lead_info",
  "saved_search",
  "status_history",
  "registration",
  "logins",
  "label",
  "unsubscribes",
];

export type TimelineScope = "recent" | "history";

export function isDefaultActivityFilters(selected: Iterable<string>) {
  const selectedSet = selected instanceof Set ? selected : new Set(selected);
  return (
    selectedSet.size === DEFAULT_ACTIVITY_FILTER_IDS.length &&
    DEFAULT_ACTIVITY_FILTER_IDS.every((id) => selectedSet.has(id))
  );
}

const TYPE_TO_FILTER_IDS = new Map<string, string[]>();

for (const group of ACTIVITY_FILTER_GROUPS) {
  for (const item of group.items) {
    for (const type of item.types) {
      const key = type.toUpperCase();
      const existing = TYPE_TO_FILTER_IDS.get(key) ?? [];
      if (!existing.includes(item.id)) existing.push(item.id);
      TYPE_TO_FILTER_IDS.set(key, existing);
    }
  }
}

export function filterIdsForTimelineType(type: string): string[] {
  return TYPE_TO_FILTER_IDS.get(type.toUpperCase()) ?? [];
}

export function timelineItemMatchesFilters(
  type: string,
  selectedFilterIds: Set<string>,
): boolean {
  if (selectedFilterIds.size === 0) return false;
  if (selectedFilterIds.size === ALL_ACTIVITY_FILTER_IDS.length) return true;
  const ids = filterIdsForTimelineType(type);
  if (ids.length === 0) {
    // Unknown types still show when "everything" isn't selected? Hide unless select-all.
    return false;
  }
  return ids.some((id) => selectedFilterIds.has(id));
}

export function friendlyActivityTypeLabel(type: string): string {
  const t = type.toUpperCase();
  switch (t) {
    case "LISTING_VIEW":
      return "Property view";
    case "SAVE_LISTING":
      return "Favorite";
    case "UNSAVE_LISTING":
      return "Unfavorite";
    case "SAVE_SEARCH":
      return "Saved search";
    case "SEARCH":
      return "Search";
    case "WATCH_PROPERTY":
      return "Property alert";
    case "WATCH_AREA":
      return "Area alert";
    case "EMAIL":
    case "EMAIL_SENT":
      return "Email";
    case "EMAIL_OPENED":
    case "PROPERTY_ALERT_OPENED":
      return "Email opened";
    case "EMAIL_CLICKED":
    case "PROPERTY_ALERT_CLICKED":
      return "Link clicked";
    case "PROPERTY_ALERT_EMAIL":
    case "PROPERTY_ALERT_VIEW":
      return "Property alert";
    case "DIGEST_EMAIL":
      return "Morning digest";
    case "SHORTLIST_EMAILED":
      return "Shortlist email";
    case "AGENT_MESSAGE":
      return "Agent email";
    case "CALL_NOTE":
      return "Call";
    case "CALL":
      return "Call / task";
    case "APPOINTMENT":
      return "Appointment";
    case "STATUS_CHANGE":
      return "Pipeline";
    case "SIGN_IN":
      return "Login";
    case "SIGN_UP":
      return "Registration";
    case "CREATED":
      return "Registration";
    case "UNSUBSCRIBE":
    case "ALERTS_DISABLED":
      return "Unsubscribe";
    case "INQUIRY_TAG":
      return "Label";
    case "REMINDER_SET":
      return "Reminder";
    case "TODO":
      return "Task";
    case "SMS":
    case "TEXT":
      return "Text";
    default:
      return type.replaceAll("_", " ");
  }
}
