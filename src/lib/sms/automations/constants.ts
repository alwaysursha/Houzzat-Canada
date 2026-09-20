export const SMS_AUTOMATION_KEYS = {
  agentNewLeadSignup: "agent.new_lead_signup",
  agentLeadUnsubscribed: "agent.lead_unsubscribed",
  agentLeadReturned: "agent.lead_returned_after_inactivity",
  agentViewingRequested: "agent.viewing_requested",
  /** Display name: Customer Introduction. Key kept to preserve dispatch history. */
  leadWelcome: "lead.welcome_new_signup",
  leadInactive14: "lead.inactive_14_days",
  leadReturned: "lead.returned_after_inactivity",
} as const;

export const SMS_AUTOMATION_INACTIVE_DAYS = 14;
export const SMS_AUTOMATION_INACTIVE_BATCH = 40;
export const SMS_AUTOMATION_INACTIVE_SCAN = 400;
export const SMS_AUTOMATION_RETURN_LEAD_CAP = 8;
export const SMS_AUTOMATION_TEXT_MAX_LENGTH = 1600;

export function signupCycleKey() {
  return "signup";
}

export function unsubscribeCycleKey(at: Date) {
  return `unsub:${at.toISOString().slice(0, 16)}`;
}

export function viewingCycleKey(leadId: string) {
  return `viewing:${leadId}`;
}

export function inactiveCycleKey(lastActivityAt: Date) {
  return `inactive:14:${lastActivityAt.toISOString()}`;
}

export function returnedCycleKey(bucket: number, lastActivityAt: Date) {
  return `return:${bucket}:${lastActivityAt.toISOString()}`;
}
