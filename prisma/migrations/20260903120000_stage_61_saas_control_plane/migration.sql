-- Stage 6.1 — HouzzatPRO SaaS control-plane persistence (additive only)
-- Protects existing Workspace / CRM / Stage 5 models. No destructive changes.
-- WorkspaceStatus enum is unchanged (no PAST_DUE).

-- Enums
CREATE TYPE "PlatformOperatorRole" AS ENUM ('MASTER_ADMIN', 'SALES', 'BILLING');
CREATE TYPE "PlatformOperatorStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "ProspectStatus" AS ENUM ('NEW', 'CONTACTED', 'DEMO_SCHEDULED', 'DEMO_COMPLETED', 'OFFER_SENT', 'WON', 'LOST');
CREATE TYPE "ProspectActivityType" AS ENUM ('NOTE', 'DEMO_SCHEDULED', 'DEMO_COMPLETED', 'DEMO_NO_SHOW', 'DEMO_CANCELLED', 'STATUS_CHANGE', 'OFFER_LINKED');
CREATE TYPE "ProspectSource" AS ENUM ('WEBSITE_DEMO', 'REFERRAL', 'OUTBOUND', 'OTHER');
CREATE TYPE "PlanCode" AS ENUM ('SOLO', 'TEAM', 'BROKERAGE');
CREATE TYPE "BillingCadence" AS ENUM ('MONTHLY', 'ANNUAL');
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "OfferLineKind" AS ENUM ('PLAN_BASE', 'SETUP_FEE', 'ADDITIONAL_SEAT', 'ADDON', 'DISCOUNT', 'CUSTOM');
CREATE TYPE "SubscriptionSource" AS ENUM ('STRIPE', 'INTERNAL', 'GRANDFATHERED');
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING_PAYMENT', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'INCOMPLETE');
CREATE TYPE "AddOnCode" AS ENUM ('ADDITIONAL_AGENT', 'CUSTOM_CONSUMER_APP', 'GOOGLE_PPC', 'META_ADS');
CREATE TYPE "AddOnGrantStatus" AS ENUM ('PENDING_FULFILLMENT', 'ACTIVE', 'CANCELLED');
CREATE TYPE "EntitlementSource" AS ENUM ('PLAN', 'ADDON', 'MANUAL_GRANT', 'PROMOTION');
CREATE TYPE "ProvisioningRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "ProvisioningStepStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'SKIPPED');
CREATE TYPE "WorkspaceStatusReasonCode" AS ENUM ('BILLING_PAST_DUE', 'MANUAL', 'CANCELLATION', 'REACTIVATION', 'PROVISION', 'OTHER');
CREATE TYPE "WorkspaceStatusActorType" AS ENUM ('SYSTEM', 'PLATFORM_OPERATOR');
CREATE TYPE "PlatformAuditActorType" AS ENUM ('SYSTEM', 'OPERATOR', 'WEBHOOK');
CREATE TYPE "WorkspaceEmailDomainStatus" AS ENUM ('NONE', 'PENDING', 'VERIFIED', 'FAILED');

-- Existing model additive columns
ALTER TABLE "Workspace" ADD COLUMN "currentSubscriptionId" TEXT;
ALTER TABLE "WorkspaceBranding" ADD COLUMN "themeId" TEXT;

-- PlatformOperator
CREATE TABLE "PlatformOperator" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "PlatformOperatorRole" NOT NULL DEFAULT 'MASTER_ADMIN',
    "status" "PlatformOperatorStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByOperatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformOperator_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformOperator_userId_key" ON "PlatformOperator"("userId");
CREATE INDEX "PlatformOperator_status_role_idx" ON "PlatformOperator"("status", "role");

ALTER TABLE "PlatformOperator"
  ADD CONSTRAINT "PlatformOperator_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlatformOperator"
  ADD CONSTRAINT "PlatformOperator_createdByOperatorId_fkey"
  FOREIGN KEY ("createdByOperatorId") REFERENCES "PlatformOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PlatformProspect
CREATE TABLE "PlatformProspect" (
    "id" TEXT NOT NULL,
    "businessName" TEXT,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "brokerageName" TEXT,
    "estimatedTeamSize" INTEGER,
    "region" TEXT,
    "website" TEXT,
    "source" "ProspectSource" NOT NULL DEFAULT 'WEBSITE_DEMO',
    "status" "ProspectStatus" NOT NULL DEFAULT 'NEW',
    "ownerOperatorId" TEXT,
    "notesInternal" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformProspect_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformProspect_email_key" ON "PlatformProspect"("email");
CREATE INDEX "PlatformProspect_status_email_idx" ON "PlatformProspect"("status", "email");
CREATE INDEX "PlatformProspect_ownerOperatorId_idx" ON "PlatformProspect"("ownerOperatorId");

ALTER TABLE "PlatformProspect"
  ADD CONSTRAINT "PlatformProspect_ownerOperatorId_fkey"
  FOREIGN KEY ("ownerOperatorId") REFERENCES "PlatformOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PlatformProspectActivity
CREATE TABLE "PlatformProspectActivity" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "type" "ProspectActivityType" NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "operatorId" TEXT,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformProspectActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformProspectActivity_prospectId_createdAt_idx" ON "PlatformProspectActivity"("prospectId", "createdAt");

ALTER TABLE "PlatformProspectActivity"
  ADD CONSTRAINT "PlatformProspectActivity_prospectId_fkey"
  FOREIGN KEY ("prospectId") REFERENCES "PlatformProspect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlatformProspectActivity"
  ADD CONSTRAINT "PlatformProspectActivity_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "PlatformOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CommercialOffer
CREATE TABLE "CommercialOffer" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "createdByOperatorId" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "planCode" "PlanCode" NOT NULL,
    "billingCadence" "BillingCadence" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "standardRecurringAmountCents" INTEGER NOT NULL,
    "negotiatedRecurringAmountCents" INTEGER NOT NULL,
    "setupFeeCents" INTEGER NOT NULL,
    "includedSeats" INTEGER NOT NULL,
    "additionalSeats" INTEGER NOT NULL DEFAULT 0,
    "trialDays" INTEGER,
    "proposedStartDate" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "acceptedSnapshotJson" JSONB,
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "acceptedByEmail" TEXT,
    "workspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommercialOffer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommercialOffer_workspaceId_key" ON "CommercialOffer"("workspaceId");
CREATE INDEX "CommercialOffer_status_expiresAt_idx" ON "CommercialOffer"("status", "expiresAt");
CREATE INDEX "CommercialOffer_prospectId_status_idx" ON "CommercialOffer"("prospectId", "status");

ALTER TABLE "CommercialOffer"
  ADD CONSTRAINT "CommercialOffer_prospectId_fkey"
  FOREIGN KEY ("prospectId") REFERENCES "PlatformProspect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommercialOffer"
  ADD CONSTRAINT "CommercialOffer_createdByOperatorId_fkey"
  FOREIGN KEY ("createdByOperatorId") REFERENCES "PlatformOperator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommercialOffer"
  ADD CONSTRAINT "CommercialOffer_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CommercialOfferLineItem
CREATE TABLE "CommercialOfferLineItem" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "kind" "OfferLineKind" NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "isRecurring" BOOLEAN NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CommercialOfferLineItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommercialOfferLineItem_offerId_sortOrder_idx" ON "CommercialOfferLineItem"("offerId", "sortOrder");

ALTER TABLE "CommercialOfferLineItem"
  ADD CONSTRAINT "CommercialOfferLineItem_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "CommercialOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CommercialOfferToken
CREATE TABLE "CommercialOfferToken" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommercialOfferToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommercialOfferToken_tokenHash_key" ON "CommercialOfferToken"("tokenHash");
CREATE INDEX "CommercialOfferToken_offerId_idx" ON "CommercialOfferToken"("offerId");

ALTER TABLE "CommercialOfferToken"
  ADD CONSTRAINT "CommercialOfferToken_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "CommercialOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- OfferAcceptance
CREATE TABLE "OfferAcceptance" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "acceptedEmail" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "privacyVersion" TEXT NOT NULL,
    "billingAuthorizationVersion" TEXT,
    "commercialTermsHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "OfferAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfferAcceptance_offerId_key" ON "OfferAcceptance"("offerId");

ALTER TABLE "OfferAcceptance"
  ADD CONSTRAINT "OfferAcceptance_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "CommercialOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- BillingCustomer
CREATE TABLE "BillingCustomer" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT,
    "workspaceId" TEXT,
    "email" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "source" "SubscriptionSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BillingCustomer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingCustomer_workspaceId_key" ON "BillingCustomer"("workspaceId");
CREATE UNIQUE INDEX "BillingCustomer_stripeCustomerId_key" ON "BillingCustomer"("stripeCustomerId");
CREATE INDEX "BillingCustomer_email_idx" ON "BillingCustomer"("email");

ALTER TABLE "BillingCustomer"
  ADD CONSTRAINT "BillingCustomer_prospectId_fkey"
  FOREIGN KEY ("prospectId") REFERENCES "PlatformProspect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BillingCustomer"
  ADD CONSTRAINT "BillingCustomer_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Subscription (workspaceId NOT unique — historical 1→many)
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "offerId" TEXT,
    "billingCustomerId" TEXT NOT NULL,
    "source" "SubscriptionSource" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "planCode" "PlanCode",
    "entitlementProfileCode" TEXT,
    "billingCadence" "BillingCadence",
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "recurringAmountCents" INTEGER,
    "setupFeeCents" INTEGER,
    "includedSeats" INTEGER NOT NULL,
    "additionalSeats" INTEGER NOT NULL DEFAULT 0,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "trialEndsAt" TIMESTAMP(3),
    "pastDueSince" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "commercialSnapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscription_offerId_key" ON "Subscription"("offerId");
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");
CREATE UNIQUE INDEX "Subscription_stripeCheckoutSessionId_key" ON "Subscription"("stripeCheckoutSessionId");
CREATE INDEX "Subscription_status_workspaceId_idx" ON "Subscription"("status", "workspaceId");
CREATE INDEX "Subscription_workspaceId_idx" ON "Subscription"("workspaceId");

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "CommercialOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_billingCustomerId_fkey"
  FOREIGN KEY ("billingCustomerId") REFERENCES "BillingCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Workspace.currentSubscriptionId FK (after Subscription exists)
CREATE UNIQUE INDEX "Workspace_currentSubscriptionId_key" ON "Workspace"("currentSubscriptionId");

ALTER TABLE "Workspace"
  ADD CONSTRAINT "Workspace_currentSubscriptionId_fkey"
  FOREIGN KEY ("currentSubscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- WorkspaceEntitlement
CREATE TABLE "WorkspaceEntitlement" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "featureCode" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "source" "EntitlementSource" NOT NULL,
    "grantId" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceEntitlement_workspaceId_featureCode_key" ON "WorkspaceEntitlement"("workspaceId", "featureCode");
CREATE INDEX "WorkspaceEntitlement_workspaceId_idx" ON "WorkspaceEntitlement"("workspaceId");

ALTER TABLE "WorkspaceEntitlement"
  ADD CONSTRAINT "WorkspaceEntitlement_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- WorkspaceSeatQuota
CREATE TABLE "WorkspaceSeatQuota" (
    "workspaceId" TEXT NOT NULL,
    "includedSeats" INTEGER NOT NULL,
    "additionalSeats" INTEGER NOT NULL DEFAULT 0,
    "seatLimit" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceSeatQuota_pkey" PRIMARY KEY ("workspaceId")
);

ALTER TABLE "WorkspaceSeatQuota"
  ADD CONSTRAINT "WorkspaceSeatQuota_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddOnGrant
CREATE TABLE "AddOnGrant" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "addOnCode" "AddOnCode" NOT NULL,
    "status" "AddOnGrantStatus" NOT NULL DEFAULT 'PENDING_FULFILLMENT',
    "sourceOfferId" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "fulfillmentNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AddOnGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AddOnGrant_workspaceId_status_idx" ON "AddOnGrant"("workspaceId", "status");
CREATE INDEX "AddOnGrant_workspaceId_addOnCode_idx" ON "AddOnGrant"("workspaceId", "addOnCode");

ALTER TABLE "AddOnGrant"
  ADD CONSTRAINT "AddOnGrant_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AddOnGrant"
  ADD CONSTRAINT "AddOnGrant_sourceOfferId_fkey"
  FOREIGN KEY ("sourceOfferId") REFERENCES "CommercialOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ProvisioningRun
CREATE TABLE "ProvisioningRun" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "status" "ProvisioningRunStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProvisioningRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProvisioningRun_offerId_key" ON "ProvisioningRun"("offerId");
CREATE UNIQUE INDEX "ProvisioningRun_subscriptionId_key" ON "ProvisioningRun"("subscriptionId");
CREATE UNIQUE INDEX "ProvisioningRun_workspaceId_key" ON "ProvisioningRun"("workspaceId");
CREATE UNIQUE INDEX "ProvisioningRun_idempotencyKey_key" ON "ProvisioningRun"("idempotencyKey");

ALTER TABLE "ProvisioningRun"
  ADD CONSTRAINT "ProvisioningRun_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "CommercialOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProvisioningRun"
  ADD CONSTRAINT "ProvisioningRun_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProvisioningRun"
  ADD CONSTRAINT "ProvisioningRun_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ProvisioningStep
CREATE TABLE "ProvisioningStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "status" "ProvisioningStepStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "outputRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProvisioningStep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProvisioningStep_runId_stepKey_key" ON "ProvisioningStep"("runId", "stepKey");
CREATE INDEX "ProvisioningStep_runId_stepKey_idx" ON "ProvisioningStep"("runId", "stepKey");

ALTER TABLE "ProvisioningStep"
  ADD CONSTRAINT "ProvisioningStep_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "ProvisioningRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- WorkspaceStatusEvent
CREATE TABLE "WorkspaceStatusEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromStatus" "WorkspaceStatus" NOT NULL,
    "toStatus" "WorkspaceStatus" NOT NULL,
    "reasonCode" "WorkspaceStatusReasonCode" NOT NULL,
    "reasonDetail" TEXT,
    "actorType" "WorkspaceStatusActorType" NOT NULL,
    "actorOperatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkspaceStatusEvent_workspaceId_createdAt_idx" ON "WorkspaceStatusEvent"("workspaceId", "createdAt");

ALTER TABLE "WorkspaceStatusEvent"
  ADD CONSTRAINT "WorkspaceStatusEvent_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkspaceStatusEvent"
  ADD CONSTRAINT "WorkspaceStatusEvent_actorOperatorId_fkey"
  FOREIGN KEY ("actorOperatorId") REFERENCES "PlatformOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PlatformAuditEvent (never store tenant CRM PII/content)
CREATE TABLE "PlatformAuditEvent" (
    "id" TEXT NOT NULL,
    "actorOperatorId" TEXT,
    "actorType" "PlatformAuditActorType" NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformAuditEvent_entityType_entityId_idx" ON "PlatformAuditEvent"("entityType", "entityId");
CREATE INDEX "PlatformAuditEvent_createdAt_idx" ON "PlatformAuditEvent"("createdAt");
CREATE INDEX "PlatformAuditEvent_actorOperatorId_createdAt_idx" ON "PlatformAuditEvent"("actorOperatorId", "createdAt");

ALTER TABLE "PlatformAuditEvent"
  ADD CONSTRAINT "PlatformAuditEvent_actorOperatorId_fkey"
  FOREIGN KEY ("actorOperatorId") REFERENCES "PlatformOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- WorkspaceEmailIdentity
CREATE TABLE "WorkspaceEmailIdentity" (
    "workspaceId" TEXT NOT NULL,
    "contactEmail" TEXT,
    "replyToEmail" TEXT,
    "senderDisplayName" TEXT,
    "customDomain" TEXT,
    "domainStatus" "WorkspaceEmailDomainStatus" NOT NULL DEFAULT 'NONE',
    "dnsRecordsJson" JSONB,
    "fallbackFrom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceEmailIdentity_pkey" PRIMARY KEY ("workspaceId")
);

ALTER TABLE "WorkspaceEmailIdentity"
  ADD CONSTRAINT "WorkspaceEmailIdentity_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
