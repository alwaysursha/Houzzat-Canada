/**
 * V1 — thin HouzzatPRO /pricing and /templates page copy (platform root only).
 * Sales-assisted commercial model — no public dollar amounts.
 */

import {
  PLATFORM_HOME_PRIMARY_CTA_HREF,
  PLATFORM_HOME_PRIMARY_CTA_LABEL,
  PLATFORM_HOME_SECONDARY_CTA_HREF,
  PLATFORM_HOME_SECONDARY_CTA_LABEL,
  PLATFORM_HOME_TEMPLATES,
} from "@/lib/platform/public/platform-home-copy";

export const PLATFORM_PRICING_PATH = "/pricing" as const;
export const PLATFORM_TEMPLATES_PATH = "/templates" as const;

export const PLATFORM_PRICING_DOCUMENT_TITLE = "Pricing | HouzzatPRO";
export const PLATFORM_PRICING_DOCUMENT_DESCRIPTION =
  "HouzzatPRO plans are tailored to your real estate business through a private proposal. Book a demo to request pricing.";

export const PLATFORM_PRICING_EYEBROW = "COMMERCIAL";
export const PLATFORM_PRICING_TITLE = "Plans tailored to your business";
export const PLATFORM_PRICING_LEAD =
  "Flexible options for individual agents and growing teams — prepared as a private proposal, not a public self-serve checkout.";
export const PLATFORM_PRICING_BODY =
  "Pricing depends on your setup needs, included capabilities, and how your team will use HouzzatPRO. After a short demo, we prepare a CommercialOffer that matches your operation.";
export const PLATFORM_PRICING_POINTS = [
  "Private proposal after a personalized demo",
  "Options sized for solo agents and growing teams",
  "Proposal reflects setup, seats, and the capabilities you need",
] as const;

export const PLATFORM_TEMPLATES_DOCUMENT_TITLE = "Website Templates | HouzzatPRO";
export const PLATFORM_TEMPLATES_DOCUMENT_DESCRIPTION =
  "HouzzatPRO website presentations available at launch: Default and Agent Signature. Team Signature is coming soon.";

export const PLATFORM_TEMPLATES_EYEBROW = "PRESENTATION";
export const PLATFORM_TEMPLATES_TITLE = "Website templates for your brand";
export const PLATFORM_TEMPLATES_LEAD =
  "Choose a professional presentation for your brokerage or personal brand. Only commercially ready options are offered at launch.";

/** Reuse homepage template inventory — keep Team Signature coming soon. */
export const PLATFORM_TEMPLATES_CATALOG = PLATFORM_HOME_TEMPLATES;

export const PLATFORM_PAGE_PRIMARY_CTA_HREF = PLATFORM_HOME_PRIMARY_CTA_HREF;
export const PLATFORM_PAGE_PRIMARY_CTA_LABEL = PLATFORM_HOME_PRIMARY_CTA_LABEL;
export const PLATFORM_PAGE_SECONDARY_CTA_HREF = PLATFORM_HOME_SECONDARY_CTA_HREF;
export const PLATFORM_PAGE_SECONDARY_CTA_LABEL = PLATFORM_HOME_SECONDARY_CTA_LABEL;
