/**
 * Book Demo → onboarding continuity (read-time only).
 * Prefills empty professional-identity / business fields from Prospect / User /
 * Workspace. Never overwrites customer-entered destination values. No bulk migration.
 */

export type OnboardingContinuityLocks = {
  agentRegisteredName: boolean;
  agentCellPhone: boolean;
  brokerageRegisteredName: boolean;
  contactEmail: boolean;
};

export type OnboardingContinuitySources = {
  prospectContactName: string | null;
  prospectPhone: string | null;
  prospectBrokerageName: string | null;
  prospectEmail: string | null;
  acceptedEmail: string | null;
  userName: string | null;
  userPhone: string | null;
  workspaceBrokerageAffiliation: string | null;
};

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const next = trimOrNull(value);
    if (next) return next;
  }
  return null;
}

export function emptyOnboardingContinuityLocks(): OnboardingContinuityLocks {
  return {
    agentRegisteredName: false,
    agentCellPhone: false,
    brokerageRegisteredName: false,
    contactEmail: false,
  };
}

/**
 * Merge authoritative sales/demo identity into empty professional-identity fields.
 * Destination fields that already have values are preserved unchanged.
 */
export function applyOnboardingContinuityPrefill(input: {
  professionalIdentity: {
    agentRegisteredName: string | null;
    agentDesignation: string | null;
    agentCellPhone: string | null;
    recoLicenseNumber: string | null;
    recoLicenseExpiresAt: string | null;
    brokerageRegisteredName: string | null;
    brokerageFax: string | null;
    brokeragePhone: string | null;
    brokerageAddress: string | null;
  };
  contactEmail: string | null;
  sources: OnboardingContinuitySources;
}): {
  professionalIdentity: typeof input.professionalIdentity;
  contactEmail: string | null;
  locks: OnboardingContinuityLocks;
} {
  const sources = input.sources;
  const salesAgentName = firstNonEmpty(
    sources.userName,
    sources.prospectContactName,
  );
  const salesCell = firstNonEmpty(sources.userPhone, sources.prospectPhone);
  const salesBrokerage = firstNonEmpty(
    sources.workspaceBrokerageAffiliation,
    sources.prospectBrokerageName,
  );
  const salesEmail = firstNonEmpty(
    input.contactEmail,
    sources.acceptedEmail,
    sources.prospectEmail,
  );

  const existingName = trimOrNull(
    input.professionalIdentity.agentRegisteredName,
  );
  const existingCell = trimOrNull(input.professionalIdentity.agentCellPhone);
  const existingBrokerage = trimOrNull(
    input.professionalIdentity.brokerageRegisteredName,
  );

  const agentRegisteredName = existingName ?? salesAgentName;
  const agentCellPhone = existingCell ?? salesCell;
  const brokerageRegisteredName = existingBrokerage ?? salesBrokerage;
  const contactEmail = salesEmail;

  return {
    professionalIdentity: {
      ...input.professionalIdentity,
      agentRegisteredName,
      agentCellPhone,
      brokerageRegisteredName,
    },
    contactEmail,
    locks: {
      // Read-only when sales/demo already confirmed the human identity.
      agentRegisteredName: Boolean(salesAgentName && agentRegisteredName),
      agentCellPhone: Boolean(salesCell && agentCellPhone),
      brokerageRegisteredName: Boolean(
        salesBrokerage && brokerageRegisteredName,
      ),
      contactEmail: Boolean(contactEmail),
    },
  };
}
