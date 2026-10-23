/**
 * Dry plan for a production HIGH OCTANE tenant.
 * Building this plan does not open a database, copy a secret, or create a record.
 */
import { STANDARD_SETUP_FEE_CENTS } from "@/lib/platform/catalog/plans";
import { platformHostnameForWorkspaceSlug } from "@/lib/tenancy/platform-hostname";
import { HIGH_OCTANE_PREVIEW_FIXTURE } from "@/lib/tenancy/templates/high-octane-preview-fixture";
import { HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME } from "@/lib/tenancy/templates/high-octane-staging-preview";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";
import {
  ROYAL_COLLECTION_ONE_TEMPLATE_ID,
  buildThemeId,
} from "@/lib/tenancy/templates/types";

const fixture = HIGH_OCTANE_PREVIEW_FIXTURE;

export const HIGH_OCTANE_PRODUCTION_THEME_ID = buildThemeId(
  ROYAL_COLLECTION_ONE_TEMPLATE_ID,
  "signature",
);

export type HighOctaneProductionProvisionPlan = {
  writes: false;
  billingActivated: false;
  passwordCopied: false;
  listingSource: "none";
  templateSelectable: false;
  themeId: typeof HIGH_OCTANE_PRODUCTION_THEME_ID;
  workspaceSlug: typeof HIGH_OCTANE_STAGING_WORKSPACE_SLUG;
  displayName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  brokerageName: string;
  platformHostname: string;
  customDomain: null;
  forbiddenHostnames: readonly string[];
  activation: "existing_owner_activation";
  authorization: "APPROVE_COMPLIMENTARY_WORKSPACE";
  planCode: "TEAM";
  businessName: string;
  contactName: string;
  subscriptionSource: "INTERNAL";
  /** Public hostname resolution accepts this workspace status only. */
  hostnameWorkspaceStatus: "ACTIVE";
  /** A TRIALING subscription provisions a TRIAL workspace, which does not resolve. */
  trialPublishesHostname: false;
  /** Complimentary billing records zero. The paid catalog setup fee is not charged. */
  setupFeeCents: 0;
  standardSetupFeeCents: typeof STANDARD_SETUP_FEE_CENTS;
  steps: readonly string[];
};

export function buildHighOctaneProductionProvisionPlan(): HighOctaneProductionProvisionPlan {
  const platform = platformHostnameForWorkspaceSlug(HIGH_OCTANE_STAGING_WORKSPACE_SLUG);
  if (!platform.ok) {
    throw new Error("HIGH OCTANE production platform hostname is not claimable");
  }
  return {
    writes: false,
    billingActivated: false,
    passwordCopied: false,
    listingSource: "none",
    templateSelectable: false,
    themeId: HIGH_OCTANE_PRODUCTION_THEME_ID,
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    displayName: fixture.brandName,
    ownerName: fixture.agentName,
    ownerEmail: fixture.email,
    ownerPhone: fixture.phone,
    brokerageName: fixture.brokerageName,
    platformHostname: platform.hostname,
    customDomain: null,
    forbiddenHostnames: ["localhost", HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME],
    activation: "existing_owner_activation",
    authorization: "APPROVE_COMPLIMENTARY_WORKSPACE",
    planCode: "TEAM",
    businessName: fixture.brandName,
    contactName: fixture.agentName,
    subscriptionSource: "INTERNAL",
    hostnameWorkspaceStatus: "ACTIVE",
    trialPublishesHostname: false,
    setupFeeCents: 0,
    standardSetupFeeCents: STANDARD_SETUP_FEE_CENTS,
    steps: [
      "Master Admin calls complimentary provisioning with authorization APPROVE_COMPLIMENTARY_WORKSPACE.",
      "The workspace slug is high-octane-real-estate and the business name is HIGH OCTANE Real Estate.",
      "Create an INTERNAL ACTIVE subscription with no Stripe customer, subscription, price, or checkout id.",
      "Create the OWNER with a null password. Send the existing single-use activation email later. Do not copy the staging password.",
      "Assign WorkspaceBranding.themeId to royal-collection-one:signature through the Master Admin unpublished-theme assignment.",
      "The platform hostname is high-octane-real-estate.houzzatpro.com from the existing domain step.",
      "Leave MLS disconnected until this workspace receives its own listing entitlement.",
    ],
  };
}
