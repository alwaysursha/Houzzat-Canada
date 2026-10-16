import type { WorkspaceEmailTemplateType } from "@prisma/client";
import type { MasterEmailTemplateDefinition } from "@/lib/email/workspace-templates/types";

const PROTECTED_BASE = [
  "unsubscribe_link",
  "preference_manage_link",
  "casl_consent_gate",
  "email_suppression_gate",
  "mls_listing_facts",
  "property_cards",
  "legal_sender_identification",
  "powered_by_houzzatpro",
  "tenant_isolation",
] as const;

const COMMON_VARS = [
  "recipientName",
  "tenantName",
  "agentName",
] as const;

/**
 * Centralized HouzzatPRO master email template registry.
 * Defaults live in code — not duplicated as DB seed rows.
 */
export const MASTER_EMAIL_TEMPLATES: readonly MasterEmailTemplateDefinition[] =
  [
    {
      type: "PROPERTY_WATCH",
      label: "Property Watch",
      description:
        "Price reductions, status changes, and updates for watched listings.",
      rendererKinds: [
        "price_reduction",
        "sold_alert",
        "property_update",
      ],
      defaults: {
        subject: "Update on a home you’re watching",
        introText: "There’s an update on a home you’re watching.",
        ctaText: "View listing",
      },
      allowedVariables: [
        ...COMMON_VARS,
        "addressLine",
        "city",
        "mlsNumber",
      ],
      editableFields: [
        "subject",
        "introText",
        "bodySections",
        "ctaText",
        "style",
      ],
      protectedElements: PROTECTED_BASE,
    },
    {
      type: "AREA_WATCH",
      label: "Area Watch",
      description: "Just-listed and sold alerts for saved areas.",
      rendererKinds: ["just_listed", "sold_alert"],
      defaults: {
        subject: "New activity in your watched area",
        introText: "A new home matched your area alert.",
        ctaText: "View listing",
      },
      allowedVariables: [
        ...COMMON_VARS,
        "areaName",
        "addressLine",
        "city",
        "mlsNumber",
      ],
      editableFields: [
        "subject",
        "introText",
        "bodySections",
        "ctaText",
        "style",
      ],
      protectedElements: PROTECTED_BASE,
    },
    {
      type: "SAVED_SEARCH_DIGEST",
      label: "Saved Search / Buyer Digest",
      description: "Daily digest of new listings matching a saved search.",
      rendererKinds: ["saved_search_digest"],
      defaults: {
        subject: "New homes matching your search",
        introText:
          "We've found new homes that match your criteria—take a look.",
        ctaText: "Browse all matching homes →",
      },
      allowedVariables: [...COMMON_VARS, "searchName", "listingCount"],
      editableFields: [
        "subject",
        "introText",
        "bodySections",
        "ctaText",
        "style",
      ],
      protectedElements: PROTECTED_BASE,
    },
    {
      type: "SELLER_NEIGHBOURHOOD_DIGEST",
      label: "Seller Neighbourhood Digest",
      description: "Weekly neighbourhood activity near a seller’s home.",
      rendererKinds: ["neighborhood_weekly"],
      defaults: {
        subject: "Neighborhood weekly report",
        introText: "Here’s what happened near your home this week.",
        ctaText: "View seller tools",
      },
      allowedVariables: [
        ...COMMON_VARS,
        "homeLabel",
        "newCount",
        "soldCount",
      ],
      editableFields: [
        "subject",
        "introText",
        "bodySections",
        "ctaText",
        "style",
      ],
      protectedElements: PROTECTED_BASE,
    },
    {
      type: "AGENT_EMAIL",
      label: "Agent Email",
      description: "Individual and mass agent messages to leads.",
      rendererKinds: ["agent_message"],
      defaults: {
        subject: "A message from your agent",
        introText: "A message from your agent.",
        ctaText: "",
      },
      allowedVariables: [...COMMON_VARS],
      editableFields: [
        "subject",
        "introText",
        "bodySections",
        "ctaText",
        "style",
      ],
      protectedElements: PROTECTED_BASE,
    },
    {
      type: "SHORTLIST",
      label: "Shortlist",
      description: "Agent-curated shortlist share emails.",
      rendererKinds: ["shortlist"],
      defaults: {
        subject: "Homes selected for you",
        introText: "Your agent put together a shortlist for you.",
        ctaText: "View shortlist",
      },
      allowedVariables: [...COMMON_VARS, "listingCount"],
      editableFields: [
        "subject",
        "introText",
        "bodySections",
        "ctaText",
        "style",
      ],
      protectedElements: PROTECTED_BASE,
    },
    {
      type: "CMA_SHARE",
      label: "CMA Share",
      description: "Comparative Market Analysis ready emails.",
      rendererKinds: ["cma_share"],
      defaults: {
        subject: "Your Comparative Market Analysis is ready",
        introText:
          "I've prepared a Comparative Market Analysis using recent comparable sales and current competition.",
        ctaText: "View Your CMA",
      },
      allowedVariables: [
        ...COMMON_VARS,
        "subjectAddress",
        "subjectCity",
      ],
      editableFields: [
        "subject",
        "introText",
        "bodySections",
        "ctaText",
        "style",
      ],
      protectedElements: [
        ...PROTECTED_BASE,
        "cma_disclaimer_not_appraisal",
      ],
    },
    {
      type: "NEWSLETTER",
      label: "Newsletter",
      description:
        "Marketing newsletter renderer (campaign product not wired yet).",
      rendererKinds: ["newsletter"],
      defaults: {
        subject: "Market update",
        introText: "Fresh market notes from your local team.",
        ctaText: "Read more",
      },
      allowedVariables: [...COMMON_VARS, "headline"],
      editableFields: [
        "subject",
        "introText",
        "bodySections",
        "ctaText",
        "style",
      ],
      protectedElements: PROTECTED_BASE,
    },
  ] as const;

const BY_TYPE = new Map(
  MASTER_EMAIL_TEMPLATES.map((def) => [def.type, def] as const),
);

export function listMasterEmailTemplates(): readonly MasterEmailTemplateDefinition[] {
  return MASTER_EMAIL_TEMPLATES;
}

export function getMasterEmailTemplate(
  type: WorkspaceEmailTemplateType,
): MasterEmailTemplateDefinition | null {
  return BY_TYPE.get(type) ?? null;
}

export function isWorkspaceEmailTemplateType(
  value: string,
): value is WorkspaceEmailTemplateType {
  return BY_TYPE.has(value as WorkspaceEmailTemplateType);
}

export function allWorkspaceEmailTemplateTypes(): WorkspaceEmailTemplateType[] {
  return MASTER_EMAIL_TEMPLATES.map((d) => d.type);
}
