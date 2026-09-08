/**
 * V1 — HouzzatPRO platform homepage copy (sales apex only).
 * Prefer real product capabilities; do not invent unshipped features.
 */

import { BOOK_DEMO_VALUE_GROUPS } from "@/lib/platform/public/book-demo-copy";
import { HOUZZATPRO_APP_BOOTSTRAP_ORIGIN } from "@/lib/mobile/platform-bootstrap";

export const PLATFORM_HOME_DOCUMENT_TITLE =
  "HouzzatPRO — Real Estate Business Platform";

export const PLATFORM_HOME_DOCUMENT_DESCRIPTION =
  "HouzzatPRO is the real estate business platform for professional websites, MLS-powered search, leads, and workspace operations. Book a private demo to get started.";

export const PLATFORM_HOME_HERO_EYEBROW =
  "BUILT FOR MODERN REAL ESTATE PROFESSIONALS";

export const PLATFORM_HOME_HERO_TITLE =
  "Your complete real estate business platform";

export const PLATFORM_HOME_HERO_LEAD =
  "Run your branded website, property search, leads, and workspace from one connected HouzzatPRO system.";

export const PLATFORM_HOME_PRIMARY_CTA_LABEL = "Book a Demo";
export const PLATFORM_HOME_PRIMARY_CTA_HREF = "/book-a-demo";

export const PLATFORM_HOME_SECONDARY_CTA_LABEL = "Log in";
export const PLATFORM_HOME_SECONDARY_CTA_HREF = `${HOUZZATPRO_APP_BOOTSTRAP_ORIGIN}/pro/sign-in`;

export const PLATFORM_HOME_NAV = [
  { label: "Features", href: "/#features" },
  { label: "Templates", href: "/templates" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/#faq" },
] as const;

/** Flatten Book-a-Demo value groups into homepage feature bullets. */
export const PLATFORM_HOME_FEATURES = BOOK_DEMO_VALUE_GROUPS.flatMap((group) =>
  group.items.map((item) => ({
    group: group.title,
    title: item,
  })),
).slice(0, 6);

export const PLATFORM_HOME_TEMPLATES = [
  {
    name: "Default",
    blurb: "Clean brokerage-ready website foundation with professional search.",
    status: "available" as const,
  },
  {
    name: "Agent Signature",
    blurb: "Personal brand homepage designed for individual agents.",
    status: "available" as const,
  },
  {
    name: "Team Signature",
    blurb: "Team-focused presentation.",
    status: "coming_soon" as const,
  },
] as const;

export const PLATFORM_HOME_HOW_IT_WORKS = [
  {
    step: "1",
    title: "Book a Demo",
    body: "Tell us about your business and see HouzzatPRO configured around how you work.",
  },
  {
    step: "2",
    title: "Receive your private proposal",
    body: "We prepare a CommercialOffer tailored to your plan, seats, and setup needs.",
  },
  {
    step: "3",
    title: "Activate and configure",
    body: "After acceptance, activate your owner account and configure your HouzzatPRO website.",
  },
] as const;

export const PLATFORM_HOME_PRICING_TITLE = "Plans tailored to your business";
export const PLATFORM_HOME_PRICING_BODY =
  "HouzzatPRO is sold through a private proposal — not a public self-serve checkout. Book a demo and we will prepare pricing that matches your operation.";
export const PLATFORM_HOME_PRICING_CTA_LABEL = "Request a Proposal";

export const PLATFORM_HOME_FAQS = [
  {
    question: "Who is HouzzatPRO for?",
    answer:
      "Real estate agents, teams, and brokerages that need a professional website and connected business platform — not a consumer homebuyer account.",
  },
  {
    question: "How do I get started?",
    answer:
      "Book a demo on houzzatpro.com. Our team prepares a private proposal, then you accept, activate, and configure your workspace.",
  },
  {
    question: "Can I use my own branding?",
    answer:
      "Yes. Workspaces support brand colors, assets, and website templates such as Default and Agent Signature.",
  },
  {
    question: "How are listings connected?",
    answer:
      "Property search and listing experience are connected through your workspace MLS / data connection after provisioning — configured with our team, not via consumer signup.",
  },
  {
    question: "Can I use my own domain?",
    answer:
      "Custom domains can be configured for your workspace. Setup steps and timing are confirmed during onboarding — they are not instant self-serve activation at launch.",
  },
] as const;

export const PLATFORM_HOME_FINAL_CTA_TITLE =
  "Ready to see HouzzatPRO for your business?";
export const PLATFORM_HOME_FINAL_CTA_BODY =
  "Book a private demo. We will walk through the platform and prepare your proposal.";
