import type { InquiryTag, LeadSource } from "@prisma/client";

export const INQUIRY_TAGS = [
  "VIEWING",
  "HOME_VALUE",
  "PROPERTY_DETAILS",
  "GENERAL",
] as const satisfies readonly InquiryTag[];

export type InquiryTagValue = (typeof INQUIRY_TAGS)[number];

export const INQUIRY_TAG_LABEL: Record<InquiryTagValue, string> = {
  VIEWING: "Viewing",
  HOME_VALUE: "Home Value",
  PROPERTY_DETAILS: "Property details",
  GENERAL: "General",
};

/** Distinct chip colors per inquiry tag (idle / active). */
export const INQUIRY_TAG_STYLE: Record<
  InquiryTagValue,
  { idle: string; active: string; soft: string }
> = {
  VIEWING: {
    idle: "border-violet-300 bg-violet-50 text-violet-800 hover:border-violet-500",
    active: "border-violet-600 bg-violet-600 text-white",
    soft: "bg-violet-100 text-violet-800",
  },
  HOME_VALUE: {
    idle: "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-500",
    active: "border-amber-600 bg-amber-600 text-white",
    soft: "bg-amber-100 text-amber-900",
  },
  PROPERTY_DETAILS: {
    idle: "border-sky-300 bg-sky-50 text-sky-900 hover:border-sky-500",
    active: "border-sky-600 bg-sky-600 text-white",
    soft: "bg-sky-100 text-sky-900",
  },
  GENERAL: {
    idle: "border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-500",
    active: "border-slate-700 bg-slate-700 text-white",
    soft: "bg-slate-200 text-slate-800",
  },
};

/** Reminder offsets when an agent tags a contact request. */
export function inquiryReminderDueAt(
  tag: InquiryTagValue,
  from = new Date(),
): Date {
  const due = new Date(from);
  switch (tag) {
    case "VIEWING":
    case "PROPERTY_DETAILS": {
      // 4 hours, same day — cap at 9:00 PM local if it would spill past.
      due.setHours(due.getHours() + 4);
      const cap = new Date(from);
      cap.setHours(21, 0, 0, 0);
      if (due > cap && from < cap) return cap;
      return due;
    }
    case "HOME_VALUE":
    case "GENERAL": {
      // 24 hours → next-day follow-up
      due.setTime(due.getTime() + 24 * 60 * 60 * 1000);
      return due;
    }
    default: {
      const _exhaustive: never = tag;
      return _exhaustive;
    }
  }
}

export function inquiryReminderTitle(tag: InquiryTagValue): string {
  switch (tag) {
    case "VIEWING":
      return "Follow up · Viewing inquiry";
    case "HOME_VALUE":
      return "Follow up · Home Value inquiry";
    case "PROPERTY_DETAILS":
      return "Follow up · Property details inquiry";
    case "GENERAL":
      return "Follow up · General inquiry";
    default: {
      const _exhaustive: never = tag;
      return _exhaustive;
    }
  }
}

/** Map MLS lead sources → default filter buckets when inquiryTag is unset. */
export function inferInquiryTag(source: LeadSource): InquiryTagValue {
  switch (source) {
    case "SHOWING_REQUEST":
    case "VIRTUAL_VIEWING":
    case "OPEN_HOUSE":
      return "VIEWING";
    case "HOME_VALUATION":
    case "SELLER_READINESS":
      return "HOME_VALUE";
    case "PROPERTY_INQUIRY":
      return "PROPERTY_DETAILS";
    case "BUYER_SESSION":
    case "SAVED_SEARCH":
    case "LANDING_PAGE":
    case "PAID_AD":
    case "AFFORDABILITY":
    case "OTHER":
      return "GENERAL";
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

export function resolveInquiryTag(input: {
  inquiryTag: InquiryTag | null;
  source: LeadSource;
}): InquiryTagValue {
  return input.inquiryTag ?? inferInquiryTag(input.source);
}
