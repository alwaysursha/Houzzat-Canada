/**
 * Stage 6.9 — idempotent provisioning step handlers.
 * Sequential Neon HTTP-safe writes only — no Prisma interactive transactions
 * and no consequential updateMany on this path.
 */

import type {
  AddOnCode,
  PlanCode,
  PlatformAuditActorType,
  Prisma,
  PrismaClient,
  ProvisioningRun,
  ProvisioningStep,
  SubscriptionStatus,
  WorkspaceStatus,
} from "@prisma/client";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import { provisioningPhoneSeedFromProspect } from "@/lib/platform/activation/sync-owner-canonical-profile";
import {
  FEATURE_CUSTOM_CONSUMER_APP,
  type PlatformFeatureCode,
} from "@/lib/platform/catalog/features";
import {
  computeSeatLimit,
  getPlanDefinition,
  planAllowsAdditionalSeats,
} from "@/lib/platform/catalog/plans";
import { resolvePlanEntitlementProfile } from "@/lib/platform/entitlements/profiles";
import { OFFER_LINE_CODES } from "@/lib/platform/offers/constants";
import {
  PROVISIONING_AUDIT,
  PROVISIONING_ENTITY_TYPE,
  PROVISIONING_STEP_KEYS,
  type ProvisioningStepKey,
} from "./constants";
import { ensureWorkspacePlatformDomain } from "./create-platform-domain";
import { evaluatePaidSubscriptionProvisioningEligibility } from "./eligibility";
import {
  allocateUniqueWorkspaceSlug,
  deriveWorkspaceDisplayName,
} from "./slug";

export type ProspectIdentity = {
  email: string;
  contactName: string;
  businessName: string | null;
  brokerageName: string | null;
  phone: string | null;
};

export type LoadedSubscription = {
  id: string;
  workspaceId: string | null;
  offerId: string | null;
  billingCustomerId: string;
  source: string;
  status: SubscriptionStatus;
  planCode: PlanCode | null;
  entitlementProfileCode: string | null;
  includedSeats: number;
  additionalSeats: number;
  commercialSnapshotJson: Prisma.JsonValue;
  billingCustomer: { id: string; email: string; workspaceId: string | null };
  offer: {
    id: string;
    status: string;
    workspaceId: string | null;
    planCode: PlanCode;
    includedSeats: number;
    additionalSeats: number;
    lineItems: Array<{
      kind: string;
      code: string;
      quantity: number;
    }>;
    acceptance: {
      id: string;
      acceptedEmail: string;
    } | null;
    prospect: ProspectIdentity;
  } | null;
  provisioningRun: ProvisioningRun | null;
};

export type StepContext = {
  db: PrismaClient;
  run: ProvisioningRun;
  subscription: LoadedSubscription;
  workspaceId: string | null;
  ownerUserId: string | null;
  actorType: PlatformAuditActorType;
  actorOperatorId: string | null;
  audited: Set<string>;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }
  return "Unknown provisioning error";
}

function parseAddOnCode(code: string): AddOnCode | null {
  switch (code) {
    case "ADDITIONAL_AGENT":
    case "CUSTOM_CONSUMER_APP":
    case "GOOGLE_PPC":
    case "META_ADS":
      return code;
    default:
      return null;
  }
}

export async function writeSafeAudit(
  ctx: StepContext,
  action: string,
  summary: string,
  metadata: Prisma.InputJsonObject,
): Promise<void> {
  const dedupe = `${action}:${ctx.run.id}`;
  if (ctx.audited.has(dedupe)) return;
  await writePlatformAuditEvent(
    {
      actorOperatorId: ctx.actorOperatorId,
      actorType: ctx.actorType,
      action,
      entityType: PROVISIONING_ENTITY_TYPE,
      entityId: ctx.run.id,
      summary,
      metadata: {
        subscriptionId: ctx.subscription.id,
        offerId: ctx.subscription.offerId,
        runId: ctx.run.id,
        workspaceId: ctx.workspaceId,
        ...metadata,
      },
    },
    ctx.db,
  );
  ctx.audited.add(dedupe);
}

export async function getOrCreateStep(
  db: PrismaClient,
  runId: string,
  stepKey: ProvisioningStepKey,
): Promise<ProvisioningStep> {
  const existing = await db.provisioningStep.findUnique({
    where: { runId_stepKey: { runId, stepKey } },
  });
  if (existing) {
    if (existing.status === "SUCCEEDED") return existing;
    return db.provisioningStep.update({
      where: { id: existing.id },
      data: {
        status: "PENDING",
        attemptCount: existing.attemptCount + 1,
        lastError: null,
      },
    });
  }
  try {
    return await db.provisioningStep.create({
      data: {
        runId,
        stepKey,
        status: "PENDING",
        attemptCount: 1,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const raced = await db.provisioningStep.findUnique({
      where: { runId_stepKey: { runId, stepKey } },
    });
    if (!raced) throw error;
    return raced;
  }
}

export async function markStepSucceeded(
  db: PrismaClient,
  step: ProvisioningStep,
  outputRef?: string | null,
): Promise<void> {
  if (step.status === "SUCCEEDED") return;
  await db.provisioningStep.update({
    where: { id: step.id },
    data: {
      status: "SUCCEEDED",
      lastError: null,
      outputRef: outputRef ?? step.outputRef,
    },
  });
}

export async function markStepFailed(
  db: PrismaClient,
  step: ProvisioningStep,
  message: string,
): Promise<void> {
  await db.provisioningStep.update({
    where: { id: step.id },
    data: {
      status: "FAILED",
      lastError: message.slice(0, 500),
    },
  });
}

async function stepValidateSubscription(ctx: StepContext): Promise<void> {
  const eligibility = await evaluatePaidSubscriptionProvisioningEligibility({
    prisma: ctx.db,
    subscriptionId: ctx.subscription.id,
  });
  if (
    !eligibility.eligible &&
    eligibility.reason !== "IN_PROGRESS" &&
    eligibility.reason !== "ALREADY_SUCCEEDED"
  ) {
    throw new Error(`Subscription not eligible: ${eligibility.reason}`);
  }
  if (!ctx.subscription.offer?.acceptance) {
    throw new Error("OfferAcceptance required");
  }
  if (!ctx.subscription.planCode) {
    throw new Error("Subscription planCode required");
  }
  if (ctx.subscription.source !== "STRIPE") {
    throw new Error("Only STRIPE subscriptions may be provisioned");
  }
  if (
    ctx.subscription.status !== "ACTIVE" &&
    ctx.subscription.status !== "TRIALING"
  ) {
    throw new Error(`Subscription status ${ctx.subscription.status} not paid`);
  }
}

async function stepCreateWorkspace(ctx: StepContext): Promise<void> {
  if (ctx.run.workspaceId) {
    const existing = await ctx.db.workspace.findUnique({
      where: { id: ctx.run.workspaceId },
      select: { id: true },
    });
    if (existing) {
      ctx.workspaceId = existing.id;
      return;
    }
  }

  if (ctx.subscription.workspaceId) {
    ctx.workspaceId = ctx.subscription.workspaceId;
    if (ctx.run.workspaceId !== ctx.workspaceId) {
      await ctx.db.provisioningRun.update({
        where: { id: ctx.run.id },
        data: { workspaceId: ctx.workspaceId },
      });
      ctx.run = { ...ctx.run, workspaceId: ctx.workspaceId };
    }
    return;
  }

  const prospect = ctx.subscription.offer!.prospect;
  const displayName = deriveWorkspaceDisplayName({
    planCode: ctx.subscription.offer!.planCode,
    contactName: prospect.contactName,
    businessName: prospect.businessName,
    brokerageName: prospect.brokerageName,
  });
  const slug = await allocateUniqueWorkspaceSlug(ctx.db, displayName);
  const brokerageAffiliation = prospect.brokerageName?.trim() || null;

  const workspace = await ctx.db.workspace.create({
    data: {
      slug,
      name: displayName,
      status: "TRIAL",
      brokerageAffiliation,
    },
    select: { id: true },
  });

  ctx.workspaceId = workspace.id;
  await ctx.db.provisioningRun.update({
    where: { id: ctx.run.id },
    data: { workspaceId: workspace.id },
  });
  ctx.run = { ...ctx.run, workspaceId: workspace.id };

  await writeSafeAudit(
    ctx,
    PROVISIONING_AUDIT.WORKSPACE_CREATED,
    "Workspace created during paid provisioning",
    { workspaceId: workspace.id, status: "TRIAL" },
  );
}

async function stepLinkSubscription(ctx: StepContext): Promise<void> {
  if (!ctx.workspaceId) throw new Error("workspaceId required before link");

  const sub = await ctx.db.subscription.findUnique({
    where: { id: ctx.subscription.id },
    select: { id: true, workspaceId: true },
  });
  if (!sub) throw new Error("Subscription missing");

  if (sub.workspaceId && sub.workspaceId !== ctx.workspaceId) {
    throw new Error("Subscription already linked to a different workspace");
  }

  if (!sub.workspaceId) {
    await ctx.db.subscription.update({
      where: { id: sub.id },
      data: { workspaceId: ctx.workspaceId },
    });
  }

  const workspace = await ctx.db.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: { id: true, currentSubscriptionId: true },
  });
  if (!workspace) throw new Error("Workspace missing");

  if (
    workspace.currentSubscriptionId &&
    workspace.currentSubscriptionId !== ctx.subscription.id
  ) {
    throw new Error("Workspace already has a different currentSubscriptionId");
  }

  if (!workspace.currentSubscriptionId) {
    await ctx.db.workspace.update({
      where: { id: workspace.id },
      data: { currentSubscriptionId: ctx.subscription.id },
    });
  }

  const offer = ctx.subscription.offer;
  if (offer && !offer.workspaceId) {
    await ctx.db.commercialOffer.update({
      where: { id: offer.id },
      data: { workspaceId: ctx.workspaceId },
    });
  } else if (offer?.workspaceId && offer.workspaceId !== ctx.workspaceId) {
    throw new Error("CommercialOffer already linked to a different workspace");
  }

  const billing = ctx.subscription.billingCustomer;
  if (!billing.workspaceId) {
    await ctx.db.billingCustomer.update({
      where: { id: billing.id },
      data: { workspaceId: ctx.workspaceId },
    });
  } else if (billing.workspaceId !== ctx.workspaceId) {
    throw new Error("BillingCustomer already linked to a different workspace");
  }

  ctx.subscription = {
    ...ctx.subscription,
    workspaceId: ctx.workspaceId,
  };
}

async function stepCreateOwnerMembership(ctx: StepContext): Promise<void> {
  if (!ctx.workspaceId) throw new Error("workspaceId required");

  const acceptedEmail = normalizeEmail(
    ctx.subscription.offer!.acceptance!.acceptedEmail ||
      ctx.subscription.offer!.prospect.email,
  );
  if (!acceptedEmail.includes("@")) {
    throw new Error("Owner email invalid");
  }

  const contactName =
    ctx.subscription.offer!.prospect.contactName?.trim() || null;

  let user = await ctx.db.user.findUnique({
    where: { email: acceptedEmail },
    select: {
      id: true,
      role: true,
      password: true,
      name: true,
      phone: true,
      platformOperator: { select: { id: true } },
    },
  });

  const prospectPhoneSeed = provisioningPhoneSeedFromProspect(
    ctx.subscription.offer!.prospect.phone,
  );

  if (!user) {
    user = await ctx.db.user.create({
      data: {
        email: acceptedEmail,
        name: contactName,
        role: "AGENT",
        password: null,
        isBuyer: false,
        isSeller: false,
        ...(prospectPhoneSeed
          ? {
              phone: prospectPhoneSeed.phone,
              phoneE164: prospectPhoneSeed.phoneE164,
            }
          : {}),
      },
      select: {
        id: true,
        role: true,
        password: true,
        name: true,
        phone: true,
        platformOperator: { select: { id: true } },
      },
    });
  } else if (prospectPhoneSeed && !user.phone?.trim()) {
    // Provisioning-time seed only when canonical phone is empty.
    // Never overwrite a newer authenticated profile value.
    user = await ctx.db.user.update({
      where: { id: user.id },
      data: {
        phone: prospectPhoneSeed.phone,
        phoneE164: prospectPhoneSeed.phoneE164,
      },
      select: {
        id: true,
        role: true,
        password: true,
        name: true,
        phone: true,
        platformOperator: { select: { id: true } },
      },
    });
  }

  // Never promote User.role to ADMIN. PlatformOperator is not tenant authority.
  const existingMember = await ctx.db.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: ctx.workspaceId,
        userId: user.id,
      },
    },
  });

  if (!existingMember) {
    await ctx.db.workspaceMember.create({
      data: {
        workspaceId: ctx.workspaceId,
        userId: user.id,
        role: "OWNER",
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });
  } else if (
    existingMember.role !== "OWNER" ||
    existingMember.status !== "ACTIVE"
  ) {
    await ctx.db.workspaceMember.update({
      where: { id: existingMember.id },
      data: {
        role: "OWNER",
        status: "ACTIVE",
        joinedAt: existingMember.joinedAt ?? new Date(),
      },
    });
  }

  const workspace = await ctx.db.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: { billingOwnerUserId: true },
  });
  if (workspace && workspace.billingOwnerUserId !== user.id) {
    await ctx.db.workspace.update({
      where: { id: ctx.workspaceId },
      data: { billingOwnerUserId: user.id },
    });
  }

  ctx.ownerUserId = user.id;

  await writeSafeAudit(
    ctx,
    PROVISIONING_AUDIT.WORKSPACE_OWNER_CREATED,
    "Workspace OWNER membership ensured",
    {
      workspaceId: ctx.workspaceId,
      ownerUserId: user.id,
      userRole: user.role,
      passwordSet: Boolean(user.password),
    },
  );
}

async function stepCreateBrandingFoundation(ctx: StepContext): Promise<void> {
  if (!ctx.workspaceId) throw new Error("workspaceId required");

  const workspace = await ctx.db.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: { name: true },
  });
  if (!workspace) throw new Error("Workspace missing");

  const existing = await ctx.db.workspaceBranding.findUnique({
    where: { workspaceId: ctx.workspaceId },
    select: { workspaceId: true },
  });
  if (existing) return;

  const prospect = ctx.subscription.offer!.prospect;
  await ctx.db.workspaceBranding.create({
    data: {
      workspaceId: ctx.workspaceId,
      tier: "GENERIC",
      displayName: workspace.name,
      themeId: null,
      contactEmail: normalizeEmail(prospect.email),
      contactPhone: prospect.phone?.trim() || null,
      poweredByHouzzatPro: true,
    },
  });
}

async function stepCreatePlatformDomain(ctx: StepContext): Promise<void> {
  if (!ctx.workspaceId) throw new Error("workspaceId required");

  const result = await ensureWorkspacePlatformDomain({
    prisma: ctx.db,
    workspaceId: ctx.workspaceId,
  });

  if (result.outcome === "failed") {
    throw new Error(result.error);
  }

  if (result.outcome === "created") {
    await writeSafeAudit(
      ctx,
      PROVISIONING_AUDIT.WORKSPACE_PLATFORM_DOMAIN_CREATED,
      "Platform WorkspaceDomain created during paid provisioning",
      {
        workspaceId: ctx.workspaceId,
        hostname: result.hostname,
        domainId: result.domainId,
        kind: "PLATFORM",
        role: "PRIMARY",
        status: "ACTIVE",
      },
    );
  }
}

async function stepCreateEmailIdentity(ctx: StepContext): Promise<void> {
  if (!ctx.workspaceId) throw new Error("workspaceId required");

  const existing = await ctx.db.workspaceEmailIdentity.findUnique({
    where: { workspaceId: ctx.workspaceId },
    select: { workspaceId: true },
  });
  if (existing) return;

  const prospect = ctx.subscription.offer!.prospect;
  const email = normalizeEmail(
    ctx.subscription.offer!.acceptance!.acceptedEmail || prospect.email,
  );
  const workspace = await ctx.db.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: { name: true },
  });

  await ctx.db.workspaceEmailIdentity.create({
    data: {
      workspaceId: ctx.workspaceId,
      contactEmail: email,
      replyToEmail: email,
      senderDisplayName: workspace?.name ?? null,
      customDomain: null,
      domainStatus: "NONE",
      fallbackFrom: null,
    },
  });
}

async function stepMaterializeEntitlements(ctx: StepContext): Promise<void> {
  if (!ctx.workspaceId) throw new Error("workspaceId required");
  const planCode = ctx.subscription.planCode!;
  const profile = resolvePlanEntitlementProfile(planCode);

  const hasCustomAppAddOn = ctx.subscription.offer!.lineItems.some(
    (line) =>
      line.code === OFFER_LINE_CODES.CUSTOM_CONSUMER_APP ||
      line.code === "CUSTOM_CONSUMER_APP",
  );

  for (const feature of profile.features) {
    let enabled = feature.enabled;
    let source: "PLAN" | "ADDON" = "PLAN";
    if (
      feature.featureCode === FEATURE_CUSTOM_CONSUMER_APP &&
      hasCustomAppAddOn
    ) {
      enabled = true;
      source = "ADDON";
    }

    await ctx.db.workspaceEntitlement.upsert({
      where: {
        workspaceId_featureCode: {
          workspaceId: ctx.workspaceId,
          featureCode: feature.featureCode,
        },
      },
      create: {
        workspaceId: ctx.workspaceId,
        featureCode: feature.featureCode,
        enabled,
        source,
      },
      update: {
        enabled,
        source,
      },
    });
  }

  if (ctx.subscription.entitlementProfileCode !== planCode) {
    await ctx.db.subscription.update({
      where: { id: ctx.subscription.id },
      data: { entitlementProfileCode: planCode },
    });
  }

  await writeSafeAudit(
    ctx,
    PROVISIONING_AUDIT.WORKSPACE_ENTITLEMENTS_MATERIALIZED,
    "Plan entitlements materialized",
    {
      workspaceId: ctx.workspaceId,
      planCode,
      featureCount: profile.features.length,
    },
  );
}

export function resolveAcceptedSeats(subscription: LoadedSubscription): {
  includedSeats: number;
  additionalSeats: number;
  seatLimit: number;
} {
  const planCode = subscription.planCode!;
  const plan = getPlanDefinition(planCode);
  const includedSeats = subscription.includedSeats || plan.includedSeats;
  let additionalSeats = subscription.additionalSeats ?? 0;

  if (!planAllowsAdditionalSeats(planCode)) {
    additionalSeats = 0;
  }
  if (additionalSeats < 0) {
    throw new Error("additionalSeats cannot be negative");
  }

  const offerCap = subscription.offer?.additionalSeats ?? additionalSeats;
  if (additionalSeats > offerCap) {
    throw new Error("Subscription additionalSeats exceed accepted offer terms");
  }

  return {
    includedSeats,
    additionalSeats,
    seatLimit: computeSeatLimit(includedSeats, additionalSeats),
  };
}

async function stepMaterializeSeatQuota(ctx: StepContext): Promise<void> {
  if (!ctx.workspaceId) throw new Error("workspaceId required");
  const seats = resolveAcceptedSeats(ctx.subscription);

  await ctx.db.workspaceSeatQuota.upsert({
    where: { workspaceId: ctx.workspaceId },
    create: {
      workspaceId: ctx.workspaceId,
      includedSeats: seats.includedSeats,
      additionalSeats: seats.additionalSeats,
      seatLimit: seats.seatLimit,
    },
    update: {
      includedSeats: seats.includedSeats,
      additionalSeats: seats.additionalSeats,
      seatLimit: seats.seatLimit,
    },
  });

  await writeSafeAudit(
    ctx,
    PROVISIONING_AUDIT.WORKSPACE_SEAT_QUOTA_MATERIALIZED,
    "Seat quota materialized from accepted terms",
    {
      workspaceId: ctx.workspaceId,
      includedSeats: seats.includedSeats,
      additionalSeats: seats.additionalSeats,
      seatLimit: seats.seatLimit,
    },
  );
}

async function ensureAddOnGrant(input: {
  db: PrismaClient;
  workspaceId: string;
  addOnCode: AddOnCode;
  sourceOfferId: string;
  status: "ACTIVE" | "PENDING_FULFILLMENT";
}): Promise<void> {
  const existing = await input.db.addOnGrant.findFirst({
    where: {
      workspaceId: input.workspaceId,
      addOnCode: input.addOnCode,
      sourceOfferId: input.sourceOfferId,
    },
    select: { id: true, status: true },
  });
  if (existing) {
    if (existing.status === "CANCELLED") {
      await input.db.addOnGrant.update({
        where: { id: existing.id },
        data: { status: input.status },
      });
    }
    return;
  }

  await input.db.addOnGrant.create({
    data: {
      workspaceId: input.workspaceId,
      addOnCode: input.addOnCode,
      status: input.status,
      sourceOfferId: input.sourceOfferId,
      startsAt: new Date(),
    },
  });
}

async function stepMaterializeAddOns(ctx: StepContext): Promise<void> {
  if (!ctx.workspaceId) throw new Error("workspaceId required");
  const offerId = ctx.subscription.offer!.id;
  const seats = resolveAcceptedSeats(ctx.subscription);

  if (seats.additionalSeats > 0) {
    await ensureAddOnGrant({
      db: ctx.db,
      workspaceId: ctx.workspaceId,
      addOnCode: "ADDITIONAL_AGENT",
      sourceOfferId: offerId,
      status: "ACTIVE",
    });
  }

  for (const line of ctx.subscription.offer!.lineItems) {
    if (
      line.kind === "ADDITIONAL_SEAT" ||
      line.code === OFFER_LINE_CODES.ADDITIONAL_SEAT
    ) {
      continue;
    }

    const code = parseAddOnCode(line.code);
    if (!code || code === "ADDITIONAL_AGENT") continue;

    const status =
      code === "GOOGLE_PPC" || code === "META_ADS"
        ? "PENDING_FULFILLMENT"
        : "ACTIVE";

    await ensureAddOnGrant({
      db: ctx.db,
      workspaceId: ctx.workspaceId,
      addOnCode: code,
      sourceOfferId: offerId,
      status,
    });

    if (code === "CUSTOM_CONSUMER_APP") {
      await ctx.db.workspaceEntitlement.upsert({
        where: {
          workspaceId_featureCode: {
            workspaceId: ctx.workspaceId,
            featureCode:
              FEATURE_CUSTOM_CONSUMER_APP satisfies PlatformFeatureCode,
          },
        },
        create: {
          workspaceId: ctx.workspaceId,
          featureCode: FEATURE_CUSTOM_CONSUMER_APP,
          enabled: true,
          source: "ADDON",
        },
        update: {
          enabled: true,
          source: "ADDON",
        },
      });
    }
  }
}

async function stepMarkWorkspaceActive(ctx: StepContext): Promise<void> {
  if (!ctx.workspaceId) throw new Error("workspaceId required");

  const targetStatus: WorkspaceStatus =
    ctx.subscription.status === "TRIALING" ? "TRIAL" : "ACTIVE";

  const workspace = await ctx.db.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: { id: true, status: true },
  });
  if (!workspace) throw new Error("Workspace missing");

  if (workspace.status === targetStatus) return;

  const fromStatus = workspace.status;
  await ctx.db.workspace.update({
    where: { id: workspace.id },
    data: { status: targetStatus },
  });

  await ctx.db.workspaceStatusEvent.create({
    data: {
      workspaceId: workspace.id,
      fromStatus,
      toStatus: targetStatus,
      reasonCode: "PROVISION",
      reasonDetail: "Paid subscription provisioning completed",
      actorType: "SYSTEM",
      actorOperatorId: null,
    },
  });
}

async function stepCompleteProvisioning(ctx: StepContext): Promise<void> {
  await ctx.db.provisioningRun.update({
    where: { id: ctx.run.id },
    data: {
      status: "SUCCEEDED",
      lastError: null,
      completedAt: new Date(),
      workspaceId: ctx.workspaceId,
    },
  });

  await writeSafeAudit(
    ctx,
    PROVISIONING_AUDIT.WORKSPACE_PROVISIONED,
    "Paid subscription workspace provisioning succeeded",
    {
      workspaceId: ctx.workspaceId,
      subscriptionStatus: ctx.subscription.status,
      planCode: ctx.subscription.planCode,
    },
  );
}

export const STEP_HANDLERS: Record<
  ProvisioningStepKey,
  (ctx: StepContext) => Promise<void>
> = {
  VALIDATE_SUBSCRIPTION: stepValidateSubscription,
  CREATE_WORKSPACE: stepCreateWorkspace,
  LINK_SUBSCRIPTION: stepLinkSubscription,
  CREATE_OWNER_MEMBERSHIP: stepCreateOwnerMembership,
  CREATE_BRANDING_FOUNDATION: stepCreateBrandingFoundation,
  CREATE_PLATFORM_DOMAIN: stepCreatePlatformDomain,
  CREATE_EMAIL_IDENTITY: stepCreateEmailIdentity,
  MATERIALIZE_ENTITLEMENTS: stepMaterializeEntitlements,
  MATERIALIZE_SEAT_QUOTA: stepMaterializeSeatQuota,
  MATERIALIZE_ADDONS: stepMaterializeAddOns,
  MARK_WORKSPACE_ACTIVE: stepMarkWorkspaceActive,
  COMPLETE_PROVISIONING: stepCompleteProvisioning,
};

export { PROVISIONING_STEP_KEYS, isUniqueConstraintError };
