/**
 * Client/server-safe Partner Handoff helpers. No Prisma.
 * V2 reuses HandoffClient + GET/POST /api/agent/handoffs. No V2 resource.
 */

export const V2_HANDOFF_ENDPOINT = "/api/agent/handoffs";

/** GET referralHandoff.findMany take — existing list endpoint. */
export const V2_HANDOFF_GET_TAKE = 30;

/** Visible history rows in HandoffClient. */
export const V2_HANDOFF_HISTORY_UI_TAKE = 5;

export function v2HandoffSendPayload(input: {
  leadId: string;
  partnerId: string;
  notes: string;
}): {
  partnerId: string;
  leadId: string;
  notes: string | undefined;
} {
  return {
    partnerId: input.partnerId,
    leadId: input.leadId,
    notes: input.notes || undefined,
  };
}

export function v2HandoffSendDisabled(partnerId: string) {
  return !partnerId;
}

/** Parent V2 resources stay put; HandoffClient reloads its own GET. */
export function v2HandoffParentRefreshPlan() {
  return {
    reloadShell: false,
    reloadRail: false,
    reloadTimeline: false,
    reloadTasks: false,
    reloadLookingFor: false,
    reloadNextReminder: false,
    reloadEmails: false,
    reloadAppointments: false,
    reloadEngagement: false,
  } as const;
}
