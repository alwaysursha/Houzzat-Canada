/**
 * HouzzatPRO-controlled V1 Mass SMS caps. Not tenant-editable.
 * Conservative so Cloudflare request + waitUntil ticks stay bounded.
 */
export const SMS_MASS_V1_MAX_RECIPIENTS = 25;
export const SMS_MASS_TICK_SIZE = 5;

export const SMS_MASS_VARIABLES = [
  "firstName",
  "leadName",
  "agentName",
  "workspaceName",
] as const;

export type SmsMassVariable = (typeof SMS_MASS_VARIABLES)[number];

export const SMS_MASS_EXCLUDE_REASONS = [
  "NOT_FOUND",
  "CROSS_TENANT",
  "NOT_ASSIGNED",
  "NO_CUSTOMER_E164",
  "NO_WORKSPACE_NUMBER",
  "SUPPRESSED",
  "INVALID_BODY",
] as const;

export type SmsMassExcludeReason = (typeof SMS_MASS_EXCLUDE_REASONS)[number];
