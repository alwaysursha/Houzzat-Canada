import type {
  AddOnGrant,
  BillingCustomer,
  CommercialOffer,
  CommercialOfferLineItem,
  CommercialOfferToken,
  OfferAcceptance,
  PlatformAuditEvent,
  PlatformProspect,
  PlatformProspectActivity,
  ProvisioningRun,
  ProvisioningStep,
  Subscription,
  WorkspaceBranding,
  WorkspaceDomain,
  WorkspaceEmailIdentity,
  WorkspaceEntitlement,
  WorkspaceSeatQuota,
  WorkspaceStatusEvent,
} from "@prisma/client";

export function serializeStripePresence(input: {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  stripeCheckoutSessionId?: string | null;
}) {
  return {
    hasStripeCustomer: Boolean(input.stripeCustomerId),
    hasStripeSubscription: Boolean(input.stripeSubscriptionId),
    hasStripePrice: Boolean(input.stripePriceId),
    hasStripeCheckoutSession: Boolean(input.stripeCheckoutSessionId),
  };
}

export function serializeSubscriptionSummary(sub: Subscription | null) {
  if (!sub) return null;
  return {
    id: sub.id,
    workspaceId: sub.workspaceId,
    offerId: sub.offerId,
    source: sub.source,
    status: sub.status,
    planCode: sub.planCode,
    entitlementProfileCode: sub.entitlementProfileCode,
    billingCadence: sub.billingCadence,
    currency: sub.currency,
    recurringAmountCents: sub.recurringAmountCents,
    setupFeeCents: sub.setupFeeCents,
    includedSeats: sub.includedSeats,
    additionalSeats: sub.additionalSeats,
    currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
    pastDueSince: sub.pastDueSince?.toISOString() ?? null,
    canceledAt: sub.canceledAt?.toISOString() ?? null,
    commercialSnapshotJson: sub.commercialSnapshotJson,
    createdAt: sub.createdAt.toISOString(),
    updatedAt: sub.updatedAt.toISOString(),
    ...serializeStripePresence(sub),
  };
}

export function serializeBillingCustomerSummary(
  customer: BillingCustomer | null,
) {
  if (!customer) return null;
  return {
    id: customer.id,
    workspaceId: customer.workspaceId,
    prospectId: customer.prospectId,
    email: customer.email,
    source: customer.source,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
    ...serializeStripePresence(customer),
  };
}

export function serializeSeatQuota(quota: WorkspaceSeatQuota | null) {
  if (!quota) return null;
  return {
    includedSeats: quota.includedSeats,
    additionalSeats: quota.additionalSeats,
    seatLimit: quota.seatLimit,
    updatedAt: quota.updatedAt.toISOString(),
  };
}

export function serializeEntitlements(rows: WorkspaceEntitlement[]) {
  return rows.map((row) => ({
    id: row.id,
    featureCode: row.featureCode,
    enabled: row.enabled,
    source: row.source,
    grantId: row.grantId,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export function serializeBranding(branding: WorkspaceBranding | null) {
  if (!branding) return null;
  return {
    tier: branding.tier,
    displayName: branding.displayName,
    tagline: branding.tagline,
    themeId: branding.themeId,
    logoUrl: branding.logoUrl,
    faviconUrl: branding.faviconUrl,
    primaryColor: branding.primaryColor,
    secondaryColor: branding.secondaryColor,
    accentColor: branding.accentColor,
    seoDescription: branding.seoDescription,
    version: branding.version,
    updatedAt: branding.updatedAt.toISOString(),
  };
}

export function serializeDomains(
  domains: Array<{
    id: string;
    hostname: string;
    kind: WorkspaceDomain["kind"];
    role: WorkspaceDomain["role"];
    status: WorkspaceDomain["status"];
    verifiedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
) {
  return domains.map((domain) => ({
    id: domain.id,
    hostname: domain.hostname,
    kind: domain.kind,
    role: domain.role,
    status: domain.status,
    verifiedAt: domain.verifiedAt?.toISOString() ?? null,
    createdAt: domain.createdAt.toISOString(),
    updatedAt: domain.updatedAt.toISOString(),
  }));
}

export function serializeAddOnGrants(rows: AddOnGrant[]) {
  return rows.map((row) => ({
    id: row.id,
    addOnCode: row.addOnCode,
    status: row.status,
    sourceOfferId: row.sourceOfferId,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    fulfillmentNotes: row.fulfillmentNotes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export function serializeEmailIdentity(
  identity: WorkspaceEmailIdentity | null,
) {
  if (!identity) return null;
  return {
    contactEmail: identity.contactEmail,
    replyToEmail: identity.replyToEmail,
    senderDisplayName: identity.senderDisplayName,
    customDomain: identity.customDomain,
    domainStatus: identity.domainStatus,
    fallbackFrom: identity.fallbackFrom,
    updatedAt: identity.updatedAt.toISOString(),
  };
}

export function serializeStatusEvents(rows: WorkspaceStatusEvent[]) {
  return rows.map((row) => ({
    id: row.id,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    reasonCode: row.reasonCode,
    reasonDetail: row.reasonDetail,
    actorType: row.actorType,
    actorOperatorId: row.actorOperatorId,
    createdAt: row.createdAt.toISOString(),
  }));
}

export function serializeProspect(
  prospect: PlatformProspect & {
    ownerOperator?: { id: string; role: string; status: string } | null;
  },
) {
  return {
    id: prospect.id,
    businessName: prospect.businessName,
    contactName: prospect.contactName,
    email: prospect.email,
    phone: prospect.phone,
    brokerageName: prospect.brokerageName,
    estimatedTeamSize: prospect.estimatedTeamSize,
    region: prospect.region,
    website: prospect.website,
    source: prospect.source,
    status: prospect.status,
    notesInternal: prospect.notesInternal,
    ownerOperator: prospect.ownerOperator
      ? {
          id: prospect.ownerOperator.id,
          role: prospect.ownerOperator.role,
          status: prospect.ownerOperator.status,
        }
      : null,
    createdAt: prospect.createdAt.toISOString(),
    updatedAt: prospect.updatedAt.toISOString(),
  };
}

export function serializeProspectActivities(
  rows: PlatformProspectActivity[],
) {
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    operatorId: row.operatorId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  }));
}

export function serializeOfferSummary(
  offer: CommercialOffer & {
    lineItems?: CommercialOfferLineItem[];
    tokens?: CommercialOfferToken[];
    acceptance?: OfferAcceptance | null;
    subscription?: Subscription | null;
    provisioningRun?: ProvisioningRun | null;
  },
) {
  return {
    id: offer.id,
    prospectId: offer.prospectId,
    createdByOperatorId: offer.createdByOperatorId,
    status: offer.status,
    planCode: offer.planCode,
    billingCadence: offer.billingCadence,
    currency: offer.currency,
    standardRecurringAmountCents: offer.standardRecurringAmountCents,
    negotiatedRecurringAmountCents: offer.negotiatedRecurringAmountCents,
    setupFeeCents: offer.setupFeeCents,
    includedSeats: offer.includedSeats,
    additionalSeats: offer.additionalSeats,
    trialDays: offer.trialDays,
    proposedStartDate: offer.proposedStartDate?.toISOString() ?? null,
    expiresAt: offer.expiresAt?.toISOString() ?? null,
    version: offer.version,
    workspaceId: offer.workspaceId,
    sentAt: offer.sentAt?.toISOString() ?? null,
    viewedAt: offer.viewedAt?.toISOString() ?? null,
    acceptedAt: offer.acceptedAt?.toISOString() ?? null,
    acceptedByEmail: offer.acceptedByEmail,
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
    lineItems: (offer.lineItems ?? []).map((item) => ({
      id: item.id,
      kind: item.kind,
      code: item.code,
      description: item.description,
      amountCents: item.amountCents,
      isRecurring: item.isRecurring,
      quantity: item.quantity,
      sortOrder: item.sortOrder,
    })),
    tokens: (offer.tokens ?? []).map((token) => ({
      id: token.id,
      expiresAt: token.expiresAt.toISOString(),
      revokedAt: token.revokedAt?.toISOString() ?? null,
      lastViewedAt: token.lastViewedAt?.toISOString() ?? null,
      createdAt: token.createdAt.toISOString(),
    })),
    acceptance: offer.acceptance
      ? {
          id: offer.acceptance.id,
          acceptedAt: offer.acceptance.acceptedAt.toISOString(),
          acceptedEmail: offer.acceptance.acceptedEmail,
          termsVersion: offer.acceptance.termsVersion,
          privacyVersion: offer.acceptance.privacyVersion,
          billingAuthorizationVersion:
            offer.acceptance.billingAuthorizationVersion,
          commercialTermsHash: offer.acceptance.commercialTermsHash,
        }
      : null,
    subscription: serializeSubscriptionSummary(offer.subscription ?? null),
    provisioning: offer.provisioningRun
      ? serializeProvisioningRunSummary(offer.provisioningRun)
      : null,
  };
}

export function serializeProvisioningRunSummary(run: ProvisioningRun) {
  return {
    id: run.id,
    offerId: run.offerId,
    subscriptionId: run.subscriptionId,
    workspaceId: run.workspaceId,
    status: run.status,
    attemptCount: run.attemptCount,
    lastError: sanitizeProvisioningError(run.lastError),
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

export function serializeProvisioningStep(step: ProvisioningStep) {
  return {
    id: step.id,
    stepKey: step.stepKey,
    status: step.status,
    attemptCount: step.attemptCount,
    lastError: sanitizeProvisioningError(step.lastError),
    outputRef: step.outputRef,
    createdAt: step.createdAt.toISOString(),
    updatedAt: step.updatedAt.toISOString(),
  };
}

export function serializeAuditEvent(event: PlatformAuditEvent) {
  return {
    id: event.id,
    actorOperatorId: event.actorOperatorId,
    actorType: event.actorType,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    summary: event.summary,
    metadata: event.metadata,
    createdAt: event.createdAt.toISOString(),
  };
}

export function sanitizeProvisioningError(error: string | null): string | null {
  if (!error) return null;
  return error
    .replace(/sk_(live|test)_[A-Za-z0-9]+/g, "[redacted-stripe-secret]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "[redacted-bearer]")
    .slice(0, 500);
}
