/**
 * Client-safe preview catalog (variants, sample labels, types).
 * Live HTML generation lives in preview.ts and must stay server-only —
 * it pulls production email renderers that transitively import Prisma.
 */

import type { WorkspaceEmailTemplateType } from "@/lib/email/workspace-templates/types";

/** Explicitly synthetic — never loaded from CRM / other tenants. */
export const EMAIL_TEMPLATE_PREVIEW_SAMPLE = {
  recipientName: "Alex Sample",
  agentName: "Jordan Sample",
  tenantName: "Sample Brokerage",
  addressLine: "123 Sample Street",
  city: "Toronto",
  mlsNumber: "SAMPLE123",
  areaName: "Sample Neighbourhood",
  searchName: "Sample saved search",
  listingCount: "3",
  homeLabel: "123 Sample Street",
  newCount: "2",
  soldCount: "1",
  subjectAddress: "123 Sample Street",
  subjectCity: "Toronto",
  headline: "Sample market notes",
  oldPrice: 899_000,
  newPrice: 849_000,
  listPrice: 849_000,
  recommendedListPrice: 875_000,
  /** Preview-only watermark copy (also shown outside the iframe in Admin UI). */
  notice: "Sample preview data — not a real lead or listing",
  /** Deterministic placeholder — not a real MLS photo. */
  imageUrl: "https://placehold.co/580x360/ecfdf5/064e3b?text=Sample+Listing",
  listingUrl: "https://example.com/sample/listing/SAMPLE123",
  shareUrl: "https://example.com/sample/share/homes",
  cmaUrl: "https://example.com/sample/cma/preview-token",
  searchUrl: "https://example.com/sample/search",
  ctaUrl: "https://example.com/sample/owner",
  agentEmail: "jordan.sample@example.com",
  agentPhone: "(416) 555-0100",
  agentSubject: "Sample agent subject — takes precedence",
  agentBody:
    "Hi Alex — this is a sample message composed by your agent.\n\nAgent-authored subject and body always take precedence over template defaults.",
  agentNote: "Sample personal note from your agent (always preserved).",
  preferencesManageUrl: "#sample-preferences",
  unsubscribeIntentUrl: "#sample-unsubscribe",
} as const;

export type EmailTemplatePreviewBrand = {
  displayName: string;
  logoUrl: string | null;
  primaryColor: string;
  websiteUrl: string;
  footerNote?: string | null;
};

export type EmailTemplatePreviewMode = "desktop" | "mobile";

export type EmailTemplatePreviewVariantId =
  | "price_reduction"
  | "sold"
  | "property_update"
  | "just_listed"
  | "area_sold"
  | "buyer_digest"
  | "seller_digest"
  | "agent_email"
  | "shortlist"
  | "cma_share"
  | "newsletter";

export type EmailTemplatePreviewVariant = {
  id: EmailTemplatePreviewVariantId;
  label: string;
};

const VARIANT_CATALOG: Record<
  WorkspaceEmailTemplateType,
  readonly EmailTemplatePreviewVariant[]
> = {
  PROPERTY_WATCH: [
    { id: "price_reduction", label: "Price reduction" },
    { id: "sold", label: "Sold" },
    { id: "property_update", label: "Property update" },
  ],
  AREA_WATCH: [
    { id: "just_listed", label: "Just listed" },
    { id: "area_sold", label: "Sold" },
  ],
  SAVED_SEARCH_DIGEST: [{ id: "buyer_digest", label: "Buyer digest" }],
  SELLER_NEIGHBOURHOOD_DIGEST: [
    { id: "seller_digest", label: "Seller neighbourhood digest" },
  ],
  AGENT_EMAIL: [{ id: "agent_email", label: "Agent email" }],
  SHORTLIST: [{ id: "shortlist", label: "Shortlist" }],
  CMA_SHARE: [{ id: "cma_share", label: "CMA share" }],
  NEWSLETTER: [{ id: "newsletter", label: "Newsletter (preview only)" }],
};

export function listEmailTemplatePreviewVariants(
  templateType: WorkspaceEmailTemplateType,
): readonly EmailTemplatePreviewVariant[] {
  return VARIANT_CATALOG[templateType] ?? [];
}

export function defaultEmailTemplatePreviewVariant(
  templateType: WorkspaceEmailTemplateType,
): EmailTemplatePreviewVariantId {
  const first = listEmailTemplatePreviewVariants(templateType)[0];
  return first?.id ?? "newsletter";
}

const PREVIEW_VARIANT_IDS = new Set<string>([
  "price_reduction",
  "sold",
  "property_update",
  "just_listed",
  "area_sold",
  "buyer_digest",
  "seller_digest",
  "agent_email",
  "shortlist",
  "cma_share",
  "newsletter",
]);

export function isEmailTemplatePreviewVariantId(
  value: string,
): value is EmailTemplatePreviewVariantId {
  return PREVIEW_VARIANT_IDS.has(value);
}
