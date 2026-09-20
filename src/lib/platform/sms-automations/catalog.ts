import {
  LEAD_RETURNED_INACTIVITY_BUCKETS_DAYS,
  type SmsAutomationRecipient,
  type SmsAutomationTrigger,
  type SmsAutomationVariable,
} from "./constants";

export type SmsAutomationCatalogSpec = {
  key: string;
  name: string;
  recipient: SmsAutomationRecipient;
  triggerKey: SmsAutomationTrigger;
  description: string;
  replyEnabled: boolean;
  delayMinutes: number | null;
  delayEditable: boolean;
  inactivityDays: number | null;
  inactivityBuckets: number[] | null;
  allowedVariables: SmsAutomationVariable[];
  body: string;
};

const RETURN_BUCKETS = [...LEAD_RETURNED_INACTIVITY_BUCKETS_DAYS];

export const SMS_AUTOMATION_CATALOG: readonly SmsAutomationCatalogSpec[] = [
  {
    key: "agent.new_lead_signup",
    name: "New Lead Signup",
    recipient: "AGENT",
    triggerKey: "NEW_LEAD_SIGNUP",
    description: "Notify the assigned Agent when a new Lead signs up.",
    replyEnabled: false,
    delayMinutes: null,
    delayEditable: false,
    inactivityDays: null,
    inactivityBuckets: null,
    allowedVariables: ["leadName", "agentName", "workspaceName", "leadProfileUrl"],
    body: "{{leadName}} just signed up at {{workspaceName}}. Open: {{leadProfileUrl}}",
  },
  {
    key: "agent.lead_unsubscribed",
    name: "Lead Unsubscribed",
    recipient: "AGENT",
    triggerKey: "LEAD_UNSUBSCRIBED",
    description: "Notify the assigned Agent when a Lead opts out of SMS.",
    replyEnabled: false,
    delayMinutes: null,
    delayEditable: false,
    inactivityDays: null,
    inactivityBuckets: null,
    allowedVariables: ["leadName", "workspaceName", "leadProfileUrl"],
    body: "{{leadName}} unsubscribed from SMS. Open: {{leadProfileUrl}}",
  },
  {
    key: "agent.lead_returned_after_inactivity",
    name: "Lead Returned after inactivity",
    recipient: "AGENT",
    triggerKey: "LEAD_RETURNED_AFTER_INACTIVITY",
    description:
      "Notify the assigned Agent when a Lead returns. Uses one inactivity bucket (14–365 days), not every threshold crossed.",
    replyEnabled: false,
    delayMinutes: null,
    delayEditable: false,
    inactivityDays: null,
    inactivityBuckets: RETURN_BUCKETS,
    allowedVariables: ["leadName", "workspaceName", "leadProfileUrl"],
    body: "{{leadName}} is active again at {{workspaceName}}. Open: {{leadProfileUrl}}",
  },
  {
    key: "agent.viewing_requested",
    name: "Viewing Requested",
    recipient: "AGENT",
    triggerKey: "VIEWING_REQUESTED",
    description: "Notify the assigned Agent when a Lead requests a viewing.",
    replyEnabled: false,
    delayMinutes: null,
    delayEditable: false,
    inactivityDays: null,
    inactivityBuckets: null,
    allowedVariables: [
      "leadName",
      "propertyAddress",
      "workspaceName",
      "leadProfileUrl",
    ],
    body: "{{leadName}} requested a viewing at {{propertyAddress}}. Open: {{leadProfileUrl}}",
  },
  {
    // Key retained: production dispatches/versions already use this key.
    key: "lead.welcome_new_signup",
    name: "Customer Introduction",
    recipient: "LEAD",
    triggerKey: "CUSTOMER_FIRST_CELLPHONE",
    description:
      "One SMS when this Lead/Customer first has a valid cellphone. Reply-enabled. Not tied to signup date; later number edits do not resend.",
    replyEnabled: true,
    delayMinutes: null,
    delayEditable: false,
    inactivityDays: null,
    inactivityBuckets: null,
    allowedVariables: ["firstName", "agentName", "workspaceName"],
    body: "Hi {{firstName}}, {{agentName}} here from {{workspaceName}}. Just a quick hello! Whenever you need help with a property, viewing, or your home search, I’m only a message away.",
  },
  {
    key: "lead.inactive_14_days",
    name: "Inactive for 14 Days",
    recipient: "LEAD",
    triggerKey: "LEAD_INACTIVE",
    description: "Follow up after 14 days of Lead inactivity. Reply-enabled.",
    replyEnabled: true,
    delayMinutes: null,
    delayEditable: false,
    inactivityDays: 14,
    inactivityBuckets: null,
    allowedVariables: ["firstName", "agentName", "workspaceName", "leadProfileUrl"],
    body: "Hi {{firstName}}, it's {{agentName}} at {{workspaceName}} — still here if you want to look. Reply or open {{leadProfileUrl}}",
  },
  {
    key: "lead.returned_after_inactivity",
    name: "Lead Returned after inactivity",
    recipient: "LEAD",
    triggerKey: "LEAD_RETURNED_AFTER_INACTIVITY",
    description:
      "Message the Lead when they return. Uses one inactivity bucket (14–365 days), not every threshold crossed. Reply-enabled.",
    replyEnabled: true,
    delayMinutes: null,
    delayEditable: false,
    inactivityDays: null,
    inactivityBuckets: RETURN_BUCKETS,
    allowedVariables: ["firstName", "agentName", "workspaceName"],
    body: "Welcome back {{firstName}} — {{agentName}} at {{workspaceName}} is here if you want to pick up where you left off.",
  },
];

export function smsAutomationCatalogByKey(
  key: string,
): SmsAutomationCatalogSpec | null {
  return SMS_AUTOMATION_CATALOG.find((row) => row.key === key) ?? null;
}

export function smsAutomationDisplayName(
  automationKey: string | null | undefined,
): string | null {
  const key = automationKey?.trim();
  if (!key) return null;
  return smsAutomationCatalogByKey(key)?.name ?? null;
}

export function smsAutomationKeyFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const key = (payload as { automationKey?: unknown }).automationKey;
  if (typeof key !== "string") return null;
  const trimmed = key.trim();
  return trimmed || null;
}

export function smsAutomationTranscriptLabel(
  payload: unknown,
): string | null {
  const key = smsAutomationKeyFromPayload(payload);
  if (!key) return null;
  const name = smsAutomationDisplayName(key);
  return name ? `Automated · ${name}` : "Automated";
}
