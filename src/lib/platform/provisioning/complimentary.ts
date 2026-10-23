/**
 * Master Admin complimentary workspace provisioning.
 * Creates an ACTIVE tenant with an INTERNAL subscription and no Stripe objects.
 * Paid Stripe provisioning is unchanged.
 */
import type { PlanCode, PrismaClient } from "@prisma/client";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import { ensureWorkspaceOnboardingState } from "@/lib/platform/activation/onboarding-state";
import { provisioningPhoneSeedFromProspect } from "@/lib/platform/activation/sync-owner-canonical-profile";
import { getPlanDefinition } from "@/lib/platform/catalog/plans";
import { materializeEntitlementProfile } from "@/lib/platform/entitlements/materialize";
import { resolvePlanEntitlementProfile } from "@/lib/platform/entitlements/profiles";
import { ProvisioningActionError } from "@/lib/platform/provisioning/errors";
import { ensureWorkspacePlatformDomain } from "@/lib/platform/provisioning/create-platform-domain";
import { provisionWorkspaceCrmRoutingSettingsIfAbsent } from "@/lib/platform/provisioning/crm-routing";
import { PROVISIONING_RESERVED_SLUGS } from "@/lib/platform/provisioning/constants";
import { slugifyWorkspaceName } from "@/lib/platform/provisioning/slug";
import { platformHostnameForWorkspaceSlug } from "@/lib/tenancy/platform-hostname";
import { upsertProfessionalIdentityFields } from "@/lib/tenancy/professional-identity/manage";
import { requireMasterAdminAssignableThemeId } from "@/lib/tenancy/templates";

export const COMPLIMENTARY_WORKSPACE_AUTHORIZATION =
  "APPROVE_COMPLIMENTARY_WORKSPACE" as const;

export const COMPLIMENTARY_SUBSCRIPTION_KIND = "COMPLIMENTARY" as const;

export type ComplimentaryProvisionInput = {
  prisma: PrismaClient;
  operatorId: string;
  authorization: string;
  slug: string;
  displayName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  brokerageName: string;
  planCode: string;
  themeId?: string | null;
};

export type ComplimentaryProvisionResult = {
  outcome: "created" | "already_present";
  workspaceId: string;
  slug: string;
  hostname: string;
  ownerUserId: string;
  subscriptionId: string;
  subscriptionSource: "INTERNAL";
  themeId: string | null;
  emailSent: false;
  passwordCopied: false;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertPlanCode(planCode: string): PlanCode {
  if (planCode === "SOLO" || planCode === "TEAM" || planCode === "BROKERAGE") {
    return planCode;
  }
  throw new ProvisioningActionError(
    "Plan code must be SOLO, TEAM, or BROKERAGE.",
    "INVALID_PLAN",
  );
}

async function requireMasterAdmin(db: PrismaClient, operatorId: string): Promise<void> {
  const operator = await db.platformOperator.findUnique({
    where: { id: operatorId },
    select: { id: true, role: true, status: true },
  });
  if (!operator || operator.status !== "ACTIVE" || operator.role !== "MASTER_ADMIN") {
    throw new ProvisioningActionError(
      "Master Admin authorization required.",
      "MASTER_ADMIN_REQUIRED",
      403,
    );
  }
}

export async function provisionComplimentaryWorkspace(
  input: ComplimentaryProvisionInput,
): Promise<ComplimentaryProvisionResult> {
  if (input.authorization !== COMPLIMENTARY_WORKSPACE_AUTHORIZATION) {
    throw new ProvisioningActionError(
      "Complimentary provisioning requires explicit Master Admin authorization.",
      "AUTHORIZATION_REQUIRED",
    );
  }

  const db = input.prisma;
  await requireMasterAdmin(db, input.operatorId);

  const slug = input.slug.trim().toLowerCase();
  const displayName = input.displayName.trim();
  const ownerName = input.ownerName.trim();
  const ownerEmail = normalizeEmail(input.ownerEmail);
  const brokerageName = input.brokerageName.trim();
  const planCode = assertPlanCode(input.planCode);
  const themeId = input.themeId
    ? requireMasterAdminAssignableThemeId(input.themeId)
    : null;

  if (!displayName || !ownerName || !brokerageName || !ownerEmail.includes("@")) {
    throw new ProvisioningActionError(
      "Display name, owner, brokerage, and email are required.",
      "INVALID_IDENTITY",
    );
  }
  if (slugifyWorkspaceName(displayName) !== slug) {
    throw new ProvisioningActionError(
      "Workspace slug must match the business name.",
      "SLUG_MISMATCH",
    );
  }
  if ((PROVISIONING_RESERVED_SLUGS as readonly string[]).includes(slug)) {
    throw new ProvisioningActionError(
      "This slug belongs to an existing platform tenant.",
      "RESERVED_SLUG",
      409,
    );
  }
  const hostname = platformHostnameForWorkspaceSlug(slug);
  if (!hostname.ok) {
    throw new ProvisioningActionError(hostname.error, "INVALID_HOSTNAME");
  }
  const phone = provisioningPhoneSeedFromProspect(input.ownerPhone);
  if (!phone) {
    throw new ProvisioningActionError("Owner phone is not usable.", "INVALID_PHONE");
  }

  const plan = getPlanDefinition(planCode);
  const existing = await db.workspace.findUnique({
    where: { slug },
    select: {
      id: true,
      status: true,
      name: true,
      currentSubscription: {
        select: {
          id: true,
          source: true,
          status: true,
          stripeSubscriptionId: true,
          stripeCheckoutSessionId: true,
        },
      },
      members: {
        where: { role: "OWNER", status: "ACTIVE" },
        select: { user: { select: { id: true, email: true, password: true } } },
        take: 5,
      },
    },
  });

  const owner = existing?.members[0]?.user ?? null;
  if (existing) {
    const subscription = existing.currentSubscription;
    const sameComplimentary =
      existing.status === "ACTIVE" &&
      existing.name === displayName &&
      owner?.email === ownerEmail &&
      subscription?.source === "INTERNAL" &&
      subscription.status === "ACTIVE" &&
      subscription.stripeSubscriptionId == null &&
      subscription.stripeCheckoutSessionId == null;
    if (!sameComplimentary) {
      throw new ProvisioningActionError(
        "Workspace slug already belongs to another tenant.",
        "EXISTING_TENANT",
        409,
      );
    }
  }

  const emailOwner = await db.user.findFirst({
    where: { email: ownerEmail },
    select: { id: true, workspaceId: true },
  });
  if (emailOwner && emailOwner.workspaceId !== existing?.id) {
    throw new ProvisioningActionError(
      "Owner email already belongs to another workspace.",
      "EXISTING_USER",
      409,
    );
  }

  const createdNow = !existing;
  const workspace =
    existing ??
    (await db.workspace.create({
      data: {
        slug,
        name: displayName,
        status: "ACTIVE",
        brokerageAffiliation: brokerageName,
      },
      select: { id: true },
    }));

  let user =
    owner ??
    (emailOwner
      ? await db.user.findUnique({
          where: { id: emailOwner.id },
          select: { id: true, password: true },
        })
      : null);

  if (!user) {
    user = await db.user.create({
      data: {
        email: ownerEmail,
        workspaceId: workspace.id,
        name: ownerName,
        role: "AGENT",
        password: null,
        isBuyer: false,
        isSeller: false,
        phone: phone.phone,
        phoneE164: phone.phoneE164,
      },
      select: { id: true, password: true },
    });
  }

  const membership = await db.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId: workspace.id, userId: user.id },
    },
    select: { id: true },
  });
  if (!membership) {
    await db.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: "OWNER",
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });
  }

  await db.workspace.update({
    where: { id: workspace.id },
    data: {
      billingOwnerUserId: user.id,
      primaryAgentId: user.id,
      brokerageAffiliation: brokerageName,
    },
  });

  const branding = await db.workspaceBranding.findUnique({
    where: { workspaceId: workspace.id },
    select: { workspaceId: true, themeId: true },
  });
  if (!branding) {
    await db.workspaceBranding.create({
      data: {
        workspaceId: workspace.id,
        tier: "GENERIC",
        displayName,
        themeId,
        contactEmail: ownerEmail,
        contactPhone: phone.phone,
        poweredByHouzzatPro: true,
      },
    });
  } else if (themeId && branding.themeId !== themeId) {
    await db.workspaceBranding.update({
      where: { workspaceId: workspace.id },
      data: { themeId },
    });
  }

  await upsertProfessionalIdentityFields(db, workspace.id, {
    agentRegisteredName: ownerName,
    agentDesignation: null,
    agentCellPhone: phone.phone,
    brokerageRegisteredName: brokerageName,
    brokeragePhone: null,
    brokerageFax: null,
    brokerageAddress: null,
  });
  await ensureWorkspaceOnboardingState(db, workspace.id);

  let billing = await db.billingCustomer.findUnique({
    where: { workspaceId: workspace.id },
    select: { id: true, source: true, stripeCustomerId: true },
  });
  if (!billing) {
    billing = await db.billingCustomer.create({
      data: {
        workspaceId: workspace.id,
        email: ownerEmail,
        source: "INTERNAL",
        stripeCustomerId: null,
      },
      select: { id: true, source: true, stripeCustomerId: true },
    });
  }
  if (billing.source !== "INTERNAL" || billing.stripeCustomerId) {
    throw new ProvisioningActionError(
      "Workspace billing customer is not complimentary.",
      "EXISTING_TENANT",
      409,
    );
  }

  let subscription = await db.subscription.findFirst({
    where: { workspaceId: workspace.id, source: "INTERNAL" },
    select: {
      id: true,
      stripeSubscriptionId: true,
      stripeCheckoutSessionId: true,
      stripePriceId: true,
    },
  });
  if (!subscription) {
    subscription = await db.subscription.create({
      data: {
        workspaceId: workspace.id,
        billingCustomerId: billing.id,
        offerId: null,
        source: "INTERNAL",
        status: "ACTIVE",
        planCode,
        entitlementProfileCode: planCode,
        billingCadence: null,
        currency: "CAD",
        recurringAmountCents: 0,
        setupFeeCents: 0,
        includedSeats: plan.includedSeats,
        additionalSeats: 0,
        stripeSubscriptionId: null,
        stripePriceId: null,
        stripeCheckoutSessionId: null,
        commercialSnapshotJson: {
          kind: COMPLIMENTARY_SUBSCRIPTION_KIND,
          planCode,
          stripe: false,
        },
      },
      select: {
        id: true,
        stripeSubscriptionId: true,
        stripeCheckoutSessionId: true,
        stripePriceId: true,
      },
    });
  }
  if (
    subscription.stripeSubscriptionId ||
    subscription.stripeCheckoutSessionId ||
    subscription.stripePriceId
  ) {
    throw new ProvisioningActionError(
      "Complimentary subscription must not carry Stripe ids.",
      "STRIPE_RECORD_FORBIDDEN",
    );
  }

  await db.workspace.update({
    where: { id: workspace.id },
    data: { currentSubscriptionId: subscription.id },
  });

  await materializeEntitlementProfile({
    prisma: db,
    workspaceId: workspace.id,
    profile: resolvePlanEntitlementProfile(planCode),
    source: "MANUAL_GRANT",
  });
  await provisionWorkspaceCrmRoutingSettingsIfAbsent(db, {
    workspaceId: workspace.id,
    ownerUserId: user.id,
  });

  const domain = await ensureWorkspacePlatformDomain({
    prisma: db,
    workspaceId: workspace.id,
  });
  if (domain.outcome === "failed") {
    throw new ProvisioningActionError(domain.error, "DOMAIN_FAILED");
  }

  const emailIdentity = await db.workspaceEmailIdentity.findUnique({
    where: { workspaceId: workspace.id },
    select: { workspaceId: true },
  });
  if (!emailIdentity) {
    await db.workspaceEmailIdentity.create({
      data: {
        workspaceId: workspace.id,
        contactEmail: ownerEmail,
        replyToEmail: ownerEmail,
        senderDisplayName: displayName,
        customDomain: null,
        domainStatus: "NONE",
      },
    });
  }

  if (createdNow) {
    await db.workspaceStatusEvent.create({
      data: {
        workspaceId: workspace.id,
        fromStatus: "ACTIVE",
        toStatus: "ACTIVE",
        reasonCode: "MANUAL",
        reasonDetail: "Complimentary workspace created ACTIVE without Stripe",
        actorType: "PLATFORM_OPERATOR",
        actorOperatorId: input.operatorId,
      },
    });
    await writePlatformAuditEvent(
      {
        actorOperatorId: input.operatorId,
        actorType: "OPERATOR",
        action: "COMPLIMENTARY_WORKSPACE_PROVISIONED",
        entityType: "Workspace",
        entityId: workspace.id,
        summary: "Provisioned complimentary ACTIVE workspace",
        metadata: {
          workspaceId: workspace.id,
          slug,
          subscriptionSource: "INTERNAL",
          planCode,
          themeId,
        },
      },
      db,
    );
  }

  return {
    outcome: createdNow ? "created" : "already_present",
    workspaceId: workspace.id,
    slug,
    hostname: domain.hostname,
    ownerUserId: user.id,
    subscriptionId: subscription.id,
    subscriptionSource: "INTERNAL",
    themeId,
    emailSent: false,
    passwordCopied: false,
  };
}
