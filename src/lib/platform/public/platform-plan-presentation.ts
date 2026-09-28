import type { PlanCode } from "@prisma/client";
import {
  FEATURE_AGENT_APP,
  FEATURE_LIVE_CHAT,
  FEATURE_SEO_FOUNDATION,
  FEATURE_TEAM_MANAGEMENT,
} from "@/lib/platform/catalog/features";
import { getPlanDefinition } from "@/lib/platform/catalog/plans";
import { PRIVATE_OFFER_PLAN_VALUE_LABELS } from "@/lib/platform/offers/private-offer-copy";

/**
 * Public plans page. Names are the marketing labels for the catalog codes
 * SOLO, TEAM, and BROKERAGE. Marks come from the plan catalog and the
 * private-offer inclusion list. Prices stay off this module.
 */

export type PublicPlanCode = PlanCode;

export type PlanMark =
  | { kind: "included" }
  | { kind: "unavailable" }
  | { kind: "addon" }
  | { kind: "label"; text: string };

export type PublicPlanCard = {
  code: PublicPlanCode;
  name: string;
  eyebrow: string;
  description: string;
  arrangement: string;
  featured: boolean;
  exploreHref: string;
  decision: string;
};

export type PublicPlanRow = {
  id: string;
  group: string;
  label: string;
  marks: Record<PublicPlanCode, PlanMark>;
};

const CARD_COPY: Record<
  PublicPlanCode,
  Omit<PublicPlanCard, "code" | "featured"> & { featured: boolean }
> = {
  SOLO: {
    name: "Essential",
    eyebrow: "For individual professionals",
    description:
      "Build your digital presence, capture opportunities, and manage your growing client base.",
    arrangement: "Let's build the right setup for you.",
    featured: false,
    exploreHref: "/solutions/agents",
    decision: "I'm building my personal real-estate business.",
  },
  TEAM: {
    name: "Professional",
    eyebrow: "Complete platform",
    description:
      "Bring your lead generation, CRM, client engagement, properties, and mobile workflow together.",
    arrangement: "Designed around your growth.",
    featured: true,
    exploreHref: "/solutions/teams",
    decision: "I want the complete platform to grow and manage opportunities.",
  },
  BROKERAGE: {
    name: "Brokerage",
    eyebrow: "For growing organizations",
    description:
      "Create a connected digital ecosystem for your brokerage, agents, and opportunities.",
    arrangement: "Let's talk about your organization.",
    featured: false,
    exploreHref: "/solutions/brokerages",
    decision: "I need a solution across a larger organization.",
  },
};

function included(on: boolean): PlanMark {
  return on ? { kind: "included" } : { kind: "unavailable" };
}

function seatsLabel(count: number): PlanMark {
  return { kind: "label", text: count === 1 ? "1 included seat" : `${count} included seats` };
}

export const PUBLIC_PLAN_ORDER: readonly PublicPlanCode[] = ["SOLO", "TEAM", "BROKERAGE"];

export function publicPlanCards(): readonly PublicPlanCard[] {
  return PUBLIC_PLAN_ORDER.map((code) => {
    const copy = CARD_COPY[code];
    return { code, ...copy };
  });
}

export function publicPlanRows(): readonly PublicPlanRow[] {
  const solo = getPlanDefinition("SOLO");
  const team = getPlanDefinition("TEAM");
  const brokerage = getPlanDefinition("BROKERAGE");

  const shared = (label: string, group: string, id: string): PublicPlanRow => ({
    id,
    group,
    label,
    marks: {
      SOLO: { kind: "included" },
      TEAM: { kind: "included" },
      BROKERAGE: { kind: "included" },
    },
  });

  return [
    shared(PRIVATE_OFFER_PLAN_VALUE_LABELS.WEBSITE, "Platform", "website"),
    shared(PRIVATE_OFFER_PLAN_VALUE_LABELS.CRM, "Platform", "crm"),
    shared(PRIVATE_OFFER_PLAN_VALUE_LABELS.PROPERTY_SEARCH, "Platform", "search"),
    shared(PRIVATE_OFFER_PLAN_VALUE_LABELS.CMA, "Platform", "cma"),
    {
      id: "agent-app",
      group: "Platform",
      label: PRIVATE_OFFER_PLAN_VALUE_LABELS.AGENT_APP,
      marks: {
        SOLO: included(solo.features[FEATURE_AGENT_APP]),
        TEAM: included(team.features[FEATURE_AGENT_APP]),
        BROKERAGE: included(brokerage.features[FEATURE_AGENT_APP]),
      },
    },
    {
      id: "seo",
      group: "Platform",
      label: PRIVATE_OFFER_PLAN_VALUE_LABELS.SEO,
      marks: {
        SOLO: included(solo.features[FEATURE_SEO_FOUNDATION]),
        TEAM: included(team.features[FEATURE_SEO_FOUNDATION]),
        BROKERAGE: included(brokerage.features[FEATURE_SEO_FOUNDATION]),
      },
    },
    {
      id: "seats",
      group: "Workspace",
      label: "Included seats",
      marks: {
        SOLO: seatsLabel(solo.includedSeats),
        TEAM: seatsLabel(team.includedSeats),
        BROKERAGE: seatsLabel(brokerage.includedSeats),
      },
    },
    {
      id: "extra-seats",
      group: "Workspace",
      label: "Additional agent seats",
      marks: {
        SOLO: included(solo.additionalSeatsAllowed),
        TEAM: included(team.additionalSeatsAllowed),
        BROKERAGE: included(brokerage.additionalSeatsAllowed),
      },
    },
    {
      id: "live-chat",
      group: "Engagement",
      label: PRIVATE_OFFER_PLAN_VALUE_LABELS.LIVE_CHAT,
      marks: {
        SOLO: included(solo.features[FEATURE_LIVE_CHAT]),
        TEAM: included(team.features[FEATURE_LIVE_CHAT]),
        BROKERAGE: included(brokerage.features[FEATURE_LIVE_CHAT]),
      },
    },
    {
      id: "team",
      group: "Team",
      label: PRIVATE_OFFER_PLAN_VALUE_LABELS.TEAM,
      marks: {
        SOLO: included(solo.features[FEATURE_TEAM_MANAGEMENT]),
        TEAM: included(team.features[FEATURE_TEAM_MANAGEMENT]),
        BROKERAGE: included(brokerage.features[FEATURE_TEAM_MANAGEMENT]),
      },
    },
    {
      id: "brokerage",
      group: "Team",
      label: PRIVATE_OFFER_PLAN_VALUE_LABELS.BROKERAGE_CONTROLS,
      marks: {
        SOLO: { kind: "unavailable" },
        TEAM: { kind: "unavailable" },
        BROKERAGE: { kind: "included" },
      },
    },
    {
      id: "branded-app",
      group: "Add-ons",
      label: "Branded consumer app",
      marks: {
        SOLO: solo.consumerBrandedApp.available ? { kind: "addon" } : { kind: "unavailable" },
        TEAM: team.consumerBrandedApp.available ? { kind: "addon" } : { kind: "unavailable" },
        BROKERAGE: brokerage.consumerBrandedApp.available ? { kind: "addon" } : { kind: "unavailable" },
      },
    },
  ];
}

export const PUBLIC_PLAN_FAQS = [
  {
    q: "Which package is right for me?",
    a: "Essential is the single-seat package. Professional includes team management, live chat, and four seats. Brokerage includes those team tools, brokerage-level controls, and twenty seats. A demo is where the setup is matched to the business.",
  },
  {
    q: "Does HouzzatPRO include a real-estate website?",
    a: "Yes. A branded real estate website is part of every HouzzatPRO package.",
  },
  {
    q: "Can teams use HouzzatPRO?",
    a: "Agent and team management is included on Professional and Brokerage. Essential is for one professional and does not include additional agent seats.",
  },
  {
    q: "Is there a mobile app?",
    a: "The native agent app is included on every package.",
  },
  {
    q: "Can I use my own domain?",
    a: "Custom domains can be configured for your workspace. Setup steps and timing are confirmed during onboarding. They are not instant self-serve activation.",
  },
  {
    q: "How do I get started?",
    a: "Book a demo. The team prepares a private proposal for the package and setup you need.",
  },
  {
    q: "How much does HouzzatPRO cost?",
    a: "HouzzatPRO packages are configured around your business and the solution you need. Book a demo and we'll walk you through the appropriate package and pricing.",
  },
] as const;
