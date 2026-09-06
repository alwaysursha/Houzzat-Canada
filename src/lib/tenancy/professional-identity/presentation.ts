/**
 * Stage 6.11D / 6.11D.6 — shared presentation contract for professional + brokerage identity.
 * Templates may style differently; semantic separation is platform-wide
 * (DEFAULT, AGENT, and future TEAM / BROKERAGE).
 */

import type { PublicBrokerageIdentity } from "./types";

/** Fields that must be directly visible on public sites (footer / lower identity). */
export const REQUIRED_PUBLIC_BROKERAGE_IDENTITY_FIELDS = [
  "name",
  "address",
  "phone",
  "logoUrl",
] as const;

export type RequiredPublicBrokerageIdentityField =
  (typeof REQUIRED_PUBLIC_BROKERAGE_IDENTITY_FIELDS)[number];

/** Explicit public labels for agent contact lines (not brokerage phone). */
export const PUBLIC_AGENT_CONTACT_LABELS = {
  cell: "Cell",
  email: "Email",
} as const;

/** Explicit public labels for brokerage contact lines. */
export const PUBLIC_BROKERAGE_CONTACT_LABELS = {
  phone: "Phone",
  fax: "Fax",
} as const;

/**
 * Lightweight brokerage surface contract — not a rules engine.
 * Templates present via shared BrokeragePublicIdentity (or equivalent).
 */
export const TEMPLATE_BROKERAGE_IDENTITY_CONTRACT = {
  requiredVisibleFields: REQUIRED_PUBLIC_BROKERAGE_IDENTITY_FIELDS,
  /** Must be directly visible — not Terms/Privacy/modal/accordion/hover-only. */
  allowedPresentationSurfaces: ["footer", "lower_site_identity"] as const,
  forbiddenSilentOmit: true,
  /** Logo must be recognizable — not icon-tiny. */
  brokerageLogoMinCssHeightPx: 48,
  contactLabels: PUBLIC_BROKERAGE_CONTACT_LABELS,
} as const;

/**
 * Platform-wide agent vs brokerage presentation rules.
 * Future TEAM / BROKERAGE templates inherit the same semantics.
 */
export const TEMPLATE_PROFESSIONAL_IDENTITY_PRESENTATION_CONTRACT = {
  /** Categories that must follow this semantic separation. */
  appliesToTemplateCategories: [
    "DEFAULT",
    "AGENT",
    "TEAM",
    "BROKERAGE",
  ] as const,
  agentIdentityBlock: {
    /** Order / membership of the agent identity surface. */
    fields: ["name", "designation", "cellPhone", "email"] as const,
    contactLabels: PUBLIC_AGENT_CONTACT_LABELS,
    /**
     * Brokerage name belongs only in the dedicated brokerage identity area.
     * Do not repeat it between designation and agent contact lines.
     */
    forbidBrokerageName: true,
  },
  brokerageIdentityBlock: {
    fields: ["logoUrl", "name", "address", "phone", "fax"] as const,
    contactLabels: PUBLIC_BROKERAGE_CONTACT_LABELS,
    surfaces: TEMPLATE_BROKERAGE_IDENTITY_CONTRACT.allowedPresentationSurfaces,
    logoMinCssHeightPx:
      TEMPLATE_BROKERAGE_IDENTITY_CONTRACT.brokerageLogoMinCssHeightPx,
  },
  /** Agent cell is never presented as brokerage "Phone:". */
  cellVsBrokeragePhone: {
    agentLabel: PUBLIC_AGENT_CONTACT_LABELS.cell,
    brokerageLabel: PUBLIC_BROKERAGE_CONTACT_LABELS.phone,
    distinct: true as const,
  },
} as const;

export function brokerageIdentityHasAnyPublicField(
  brokerage: PublicBrokerageIdentity,
): boolean {
  return Boolean(
    brokerage.name?.trim() ||
      brokerage.address?.trim() ||
      brokerage.phone?.trim() ||
      brokerage.logoUrl?.trim() ||
      brokerage.fax?.trim(),
  );
}

/**
 * Which required public brokerage fields are present (for tests / setup UI).
 * Does not invent missing values.
 */
export function presentRequiredBrokerageIdentityFields(
  brokerage: PublicBrokerageIdentity,
): RequiredPublicBrokerageIdentityField[] {
  const present: RequiredPublicBrokerageIdentityField[] = [];
  for (const field of REQUIRED_PUBLIC_BROKERAGE_IDENTITY_FIELDS) {
    const value = brokerage[field];
    if (typeof value === "string" && value.trim()) {
      present.push(field);
    }
  }
  return present;
}

/** Prefix for agent cell lines: `Cell:`. */
export function agentCellLabelPrefix(): string {
  return `${PUBLIC_AGENT_CONTACT_LABELS.cell}:`;
}

/** Prefix for agent email lines: `Email:`. */
export function agentEmailLabelPrefix(): string {
  return `${PUBLIC_AGENT_CONTACT_LABELS.email}:`;
}

/** Prefix for brokerage phone lines: `Phone:`. */
export function brokeragePhoneLabelPrefix(): string {
  return `${PUBLIC_BROKERAGE_CONTACT_LABELS.phone}:`;
}

/** Prefix for brokerage fax lines: `Fax:`. */
export function brokerageFaxLabelPrefix(): string {
  return `${PUBLIC_BROKERAGE_CONTACT_LABELS.fax}:`;
}
