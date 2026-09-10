/**
 * Client/server-safe contact-mutation → Activity refresh helpers. No Prisma.
 *
 * Server facts:
 * - PATCH /api/agent/leads/contact updates the customer row (shell). If
 *   email/phone/address actually changed, it writes leadActivity type
 *   "contact_update". It does not write rail counts, tasks, searches, or
 *   email logs.
 * - POST /api/agent/leads/contact-reminder stamps
 *   emailUpdateRequestedAt / phoneUpdateRequestedAt (shell) and always writes
 *   leadActivity type "contact_update_request". Any customer notice email is a
 *   post-response worker side effect — not an always-visible V2 resource at
 *   mutation success.
 *
 * Timeline is first-paint in V2 (always loaded). Smallest refresh is
 * reloadDefault (recent / default filters). Do not reload rail, looking-for,
 * next-reminder, tasks, appointments, emails, or engagement.
 */

export const V2_CONTACT_EDIT_ENDPOINT = "/api/agent/leads/contact";
export const V2_CONTACT_REQUEST_UPDATE_ENDPOINT =
  "/api/agent/leads/contact-reminder";

export type V2ContactMutationKind = "edit" | "request-update";

export type V2ContactActivityType =
  | "contact_update"
  | "contact_update_request";

export function v2ContactMutationActivityType(
  kind: V2ContactMutationKind,
): V2ContactActivityType {
  switch (kind) {
    case "edit":
      return "contact_update";
    case "request-update":
      return "contact_update_request";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** Edit writes activity only when email/phone/address actually changed. */
export function v2ContactEditWritesLeadActivity(input: {
  changed: boolean;
}): boolean {
  return input.changed;
}

export function v2ContactRequestUpdateWritesLeadActivity(): boolean {
  return true;
}

export function v2ContactMutationMayAffectAlwaysVisibleResource(
  resource:
    | "shell"
    | "timeline"
    | "rail"
    | "looking-for"
    | "next-reminder"
    | "tasks"
    | "appointments"
    | "emails"
    | "engagement"
    | "saved-searches",
): boolean {
  switch (resource) {
    case "shell":
      return true;
    case "timeline":
      return true;
    case "rail":
    case "looking-for":
    case "next-reminder":
    case "tasks":
    case "appointments":
    case "emails":
    case "engagement":
    case "saved-searches":
      return false;
    default: {
      const _exhaustive: never = resource;
      return _exhaustive;
    }
  }
}

export function v2ContactMutationRefreshPlan(): {
  reloadShell: true;
  reloadTimeline: true;
  reloadRail: false;
  reloadLookingFor: false;
  reloadNextReminder: false;
  reloadTasks: false;
  reloadAppointments: false;
  reloadEmails: false;
  reloadEngagement: false;
  reloadSavedSearches: false;
  wholeProfileReload: false;
} {
  return {
    reloadShell: true,
    reloadTimeline: true,
    reloadRail: false,
    reloadLookingFor: false,
    reloadNextReminder: false,
    reloadTasks: false,
    reloadAppointments: false,
    reloadEmails: false,
    reloadEngagement: false,
    reloadSavedSearches: false,
    wholeProfileReload: false,
  };
}

/**
 * Shell first, then default Activity. A failed timeline GET must not fail
 * the contact mutation. Host callers also fire-and-forget through the
 * existing session gate (one in-flight, coalescing, abort, no retries).
 */
export function applyV2ContactMutationRefresh(input: {
  reloadShell: () => void;
  reloadTimeline: () => void;
}) {
  input.reloadShell();
  try {
    input.reloadTimeline();
  } catch {
    // Activity GET failure must not fail the contact mutation.
  }
}
