/**
 * Stage 6.11D — professional + brokerage identity (tenant data).
 */

export type {
  PublicProfessionalIdentity,
  PublicProfessionalAgentIdentity,
  PublicBrokerageIdentity,
  ProfessionalIdentitySnapshot,
} from "./types";
export { EMPTY_PUBLIC_PROFESSIONAL_IDENTITY } from "./types";

export {
  evaluateProfessionalIdentityStatus,
  listMissingProfessionalIdentityFields,
  listMissingWebsiteSetupFields,
  evaluateWebsiteSetupComplete,
  isWebsiteSetupIdentityComplete,
  WEBSITE_SETUP_FIELD_LABELS,
} from "./requirements";
export type { WebsiteSetupMissingFieldKey } from "./requirements";

export {
  TEMPLATE_BROKERAGE_IDENTITY_CONTRACT,
  TEMPLATE_PROFESSIONAL_IDENTITY_PRESENTATION_CONTRACT,
  REQUIRED_PUBLIC_BROKERAGE_IDENTITY_FIELDS,
  PUBLIC_AGENT_CONTACT_LABELS,
  PUBLIC_BROKERAGE_CONTACT_LABELS,
  brokerageIdentityHasAnyPublicField,
  presentRequiredBrokerageIdentityFields,
  agentCellLabelPrefix,
  agentEmailLabelPrefix,
  brokeragePhoneLabelPrefix,
  brokerageFaxLabelPrefix,
} from "./presentation";
export type { RequiredPublicBrokerageIdentityField } from "./presentation";
