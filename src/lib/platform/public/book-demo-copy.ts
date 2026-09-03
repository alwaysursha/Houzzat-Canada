/** Client-safe Book a Demo copy and limits. Do not import Prisma from this module. */

export const BOOK_DEMO_PATH = "/book-a-demo";

export const BOOK_DEMO_DOCUMENT_TITLE = "Book a Demo | HouzzatPRO";

/** Left-rail sales story */
export const BOOK_DEMO_EYEBROW =
  "BUILT FOR MODERN REAL ESTATE PROFESSIONALS";
export const BOOK_DEMO_HERO_TITLE_LINE_1 = "Your Complete";
export const BOOK_DEMO_HERO_TITLE_LINE_2 = "Real Estate Business Platform";
export const BOOK_DEMO_HERO_LEAD =
  "Run your website, CRM, leads, team, properties, marketing and client experience from one connected platform.";
export const BOOK_DEMO_HERO_SUPPORT =
  "Book a personalized HouzzatPRO demo and see how the platform can be configured around your real estate business.";

/** Legacy exports kept for any residual imports — page uses hero constants above. */
export const BOOK_DEMO_PAGE_TITLE = "Book a Demo";
export const BOOK_DEMO_PAGE_INTRO = BOOK_DEMO_HERO_SUPPORT;

/** Form panel */
export const BOOK_DEMO_FORM_TITLE = "Book Your Private Demo";
export const BOOK_DEMO_FORM_INTRO =
  "Tell us a little about your business and we'll show you how HouzzatPRO can fit your operation.";
export const BOOK_DEMO_CTA_LABEL = "Book My Private Demo";
export const BOOK_DEMO_CTA_SUBMITTING = "Submitting…";
export const BOOK_DEMO_REASSURANCE =
  "No obligation • Personalized walkthrough • Built around your business";

export const BOOK_DEMO_SUCCESS_TITLE = "Thank You";
export const BOOK_DEMO_SUCCESS_PRIMARY =
  "Your demo request has been received.";
export const BOOK_DEMO_SUCCESS_SECONDARY =
  "Our HouzzatPRO team will review your request and contact you regarding the next steps.";

export const BOOK_DEMO_ACTIVITY_SUMMARY = "Website demo request received";

export const BOOK_DEMO_MESSAGE_MAX = 2000;
export const BOOK_DEMO_PHONE_MIN = 7;

/** Honeypot field name — must stay empty for humans. */
export const BOOK_DEMO_HONEYPOT_FIELD = "faxNumber";

export const BOOK_DEMO_VALUE_GROUPS = [
  {
    title: "Presence & Capture",
    items: [
      "Branded Real Estate Website",
      "Marketing & Lead Capture",
      "Property Search & MLS Experience",
    ],
  },
  {
    title: "Operations",
    items: [
      "Built-in CRM & Lead Management",
      "Agent & Team Management",
      "Brokerage-Level Controls",
    ],
  },
  {
    title: "Client Experience",
    items: ["CMA & Client Tools", "Native Agent App"],
  },
] as const;
