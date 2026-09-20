/**
 * Platform-global SMS automation catalog. Locked V1 keys and protections.
 * Tenants cannot override.
 */

export const SMS_AUTOMATION_VARIABLES = [
  "firstName",
  "leadName",
  "agentName",
  "workspaceName",
  "propertyAddress",
  "leadProfileUrl",
] as const;

export type SmsAutomationVariable = (typeof SMS_AUTOMATION_VARIABLES)[number];

export const LEAD_RETURNED_INACTIVITY_BUCKETS_DAYS = [
  14, 30, 45, 60, 120, 180, 365,
] as const;

export type LeadReturnedInactivityBucketDays =
  (typeof LEAD_RETURNED_INACTIVITY_BUCKETS_DAYS)[number];

export const SMS_AUTOMATION_RECIPIENTS = ["LEAD", "AGENT"] as const;
export type SmsAutomationRecipient = (typeof SMS_AUTOMATION_RECIPIENTS)[number];

export const SMS_AUTOMATION_VERSION_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export type SmsAutomationVersionStatus =
  (typeof SMS_AUTOMATION_VERSION_STATUSES)[number];

export const SMS_AUTOMATION_TRIGGERS = [
  "NEW_LEAD_SIGNUP",
  "CUSTOMER_FIRST_CELLPHONE",
  "LEAD_UNSUBSCRIBED",
  "LEAD_RETURNED_AFTER_INACTIVITY",
  "VIEWING_REQUESTED",
  "LEAD_INACTIVE",
] as const;

export type SmsAutomationTrigger = (typeof SMS_AUTOMATION_TRIGGERS)[number];

export const SMS_AUTOMATION_ENTITY_TYPE = "SmsAutomationDefinition";

export const SMS_AUTOMATION_AUDIT = {
  seeded: "sms_automation.seeded",
  draftSaved: "sms_automation.draft_saved",
  published: "sms_automation.published",
  rolledBack: "sms_automation.rolled_back",
  activated: "sms_automation.activated",
  deactivated: "sms_automation.deactivated",
} as const;

export const SMS_AUTOMATION_PROTECTION_COPY =
  "Consent eligibility, STOP/START/HELP, suppression, tenant isolation, Twilio routing, signature validation, and delivery/dead-letter behavior are not editable here.";
