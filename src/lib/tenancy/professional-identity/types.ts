/**
 * Stage 6.11D / 6.11D.2 — canonical public professional + brokerage identity DTO.
 * Tenant data only — never templated / theme-scoped.
 */

export type PublicProfessionalAgentIdentity = {
  name: string | null;
  designation: string | null;
  cellPhone: string | null;
  photoUrl: string | null;
};

export type PublicBrokerageIdentity = {
  name: string | null;
  address: string | null;
  phone: string | null;
  fax: string | null;
  logoUrl: string | null;
};

export type PublicProfessionalIdentity = {
  agent: PublicProfessionalAgentIdentity;
  brokerage: PublicBrokerageIdentity;
};

export type ProfessionalIdentitySnapshot = {
  agentRegisteredName: string | null;
  agentDesignation: string | null;
  agentCellPhone: string | null;
  brokerageRegisteredName: string | null;
  brokeragePhone: string | null;
  brokerageFax: string | null;
  brokerageAddress: string | null;
};

export const EMPTY_PUBLIC_PROFESSIONAL_IDENTITY: PublicProfessionalIdentity = {
  agent: {
    name: null,
    designation: null,
    cellPhone: null,
    photoUrl: null,
  },
  brokerage: {
    name: null,
    address: null,
    phone: null,
    fax: null,
    logoUrl: null,
  },
};
