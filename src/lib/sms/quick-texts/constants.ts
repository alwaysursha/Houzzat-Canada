export const SMS_QUICK_TEXT_VARIABLES = [
  "firstName",
  "leadName",
  "agentName",
  "workspaceName",
  "propertyAddress",
] as const;

export type SmsQuickTextVariable = (typeof SMS_QUICK_TEXT_VARIABLES)[number];

export const SMS_QUICK_TEXT_ENTITY_TYPE = "SmsQuickText";

export const SMS_QUICK_TEXT_AUDIT = {
  seeded: "sms_quick_text.seeded",
  created: "sms_quick_text.created",
  updated: "sms_quick_text.updated",
  activated: "sms_quick_text.activated",
  deactivated: "sms_quick_text.deactivated",
  reordered: "sms_quick_text.reordered",
} as const;

export const SMS_QUICK_TEXT_PROTECTION_COPY =
  "Quick Texts fill the Agent composer only. Consent, STOP/START/HELP, suppression, tenant isolation, Twilio routing, signatures, and delivery/dead-letter behavior are not editable here.";
