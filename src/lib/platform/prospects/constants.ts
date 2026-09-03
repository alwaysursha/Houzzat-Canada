/** Client-safe prospect field limits. Do not import Prisma from this module. */

export const PROSPECT_CONTACT_NAME_MIN = 1;
export const PROSPECT_CONTACT_NAME_MAX = 120;
export const PROSPECT_EMAIL_MAX = 254;
export const PROSPECT_PHONE_MAX = 40;
export const PROSPECT_BUSINESS_NAME_MAX = 200;
export const PROSPECT_BROKERAGE_NAME_MAX = 200;
export const PROSPECT_REGION_MAX = 120;
export const PROSPECT_WEBSITE_MAX = 500;
export const PROSPECT_NOTES_INTERNAL_MAX = 5000;
export const PROSPECT_NOTE_BODY_MIN = 1;
export const PROSPECT_NOTE_BODY_MAX = 2000;
export const PROSPECT_TEAM_SIZE_MIN = 1;
export const PROSPECT_TEAM_SIZE_MAX = 10_000;

export const PROSPECT_STATUSES = [
  "NEW",
  "CONTACTED",
  "DEMO_SCHEDULED",
  "DEMO_COMPLETED",
  "OFFER_SENT",
  "WON",
  "LOST",
] as const;

export const PROSPECT_SOURCES = [
  "WEBSITE_DEMO",
  "REFERRAL",
  "OUTBOUND",
  "OTHER",
] as const;

export const PROSPECT_DEMO_ACTIONS = [
  "schedule",
  "complete",
  "no_show",
  "cancel",
] as const;

export type ProspectStatusValue = (typeof PROSPECT_STATUSES)[number];
export type ProspectSourceValue = (typeof PROSPECT_SOURCES)[number];
export type ProspectDemoActionValue = (typeof PROSPECT_DEMO_ACTIONS)[number];
