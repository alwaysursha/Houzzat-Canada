/**
 * Master Admin manual onboarding.
 * Preparing a workspace does not send email, open checkout, or touch DNS.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import { notifyOfferInvitationEmail } from "@/lib/platform/offers/offer-invitation-emails";
import { sendCommercialOffer } from "@/lib/platform/offers/manage";
import { resendCommercialOfferInvitation } from "@/lib/platform/offers/resend-invitation";
import { ProvisioningActionError } from "@/lib/platform/provisioning/errors";
import {
  COMPLIMENTARY_WORKSPACE_AUTHORIZATION,
  provisionComplimentaryWorkspace,
  type ComplimentaryProvisionResult,
} from "@/lib/platform/provisioning/complimentary";
import { highOctaneSyntheticListingsAllowed } from "@/lib/tenancy/templates/high-octane-public-showcase";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";

export const PREPARE_TENANT_WORKSPACE_AUTHORIZATION =
  "PREPARE_TENANT_WORKSPACE" as const;

export type ManualOnboardingIndicator = {
  label:
    | "Workspace"
    | "Website"
    | "Demo Listings"
    | "TRREB"
    | "Custom Domain"
    | "Email Domain"
    | "Payment"
    | "Owner Invitation";
  value: string;
};

type CreateIfMissing = (input: {
  prisma: PrismaClient;
  operatorId: string;
  slug: string;
  displayName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  brokerageName: string;
  planCode: string;
  themeId?: string | null;
}) => Promise<ComplimentaryProvisionResult>;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function requireMasterAdmin(db: PrismaClient, operatorId: string): Promise<void> {
  const operator = await db.platformOperator.findUnique({
    where: { id: operatorId },
    select: { role: true, status: true },
  });
  if (!operator || operator.status !== "ACTIVE" || operator.role !== "MASTER_ADMIN") {
    throw new ProvisioningActionError(
      "Master Admin authorization required.",
      "MASTER_ADMIN_REQUIRED",
      403,
    );
  }
}

function asSnapshot(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

export async function prepareManualTenantWorkspace(input: {
  prisma: PrismaClient;
  operatorId: string;
  authorization: string;
  workspaceId?: string | null;
  slug?: string | null;
  displayName?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerPhone?: string | null;
  brokerageName?: string | null;
  planCode?: string | null;
  themeId?: string | null;
  createIfMissing?: CreateIfMissing;
}): Promise<{
  outcome: "reused" | "created";
  workspaceId: string;
  slug: string;
  emailSent: false;
  paymentInvitationSent: false;
  ownerActivationSent: false;
}> {
  if (input.authorization !== PREPARE_TENANT_WORKSPACE_AUTHORIZATION) {
    throw new ProvisioningActionError(
      "Prepare Tenant Workspace requires explicit Master Admin authorization.",
      "AUTHORIZATION_REQUIRED",
    );
  }
  const db = input.prisma;
  await requireMasterAdmin(db, input.operatorId);

  const requestedId = input.workspaceId?.trim() || null;
  const requestedSlug = input.slug?.trim().toLowerCase() || null;
  const existing = requestedId
    ? await db.workspace.findUnique({
        where: { id: requestedId },
        select: workspaceIdentitySelect,
      })
    : requestedSlug
      ? await db.workspace.findUnique({
          where: { slug: requestedSlug },
          select: workspaceIdentitySelect,
        })
      : null;

  if (!existing && !requestedSlug) {
    throw new ProvisioningActionError(
      "A workspace id or slug is required.",
      "INVALID_IDENTITY",
    );
  }

  if (existing) {
    const ownerEmail = existing.members[0]?.user.email ?? null;
    const expectedEmail = input.ownerEmail?.trim()
      ? normalizeEmail(input.ownerEmail)
      : ownerEmail;
    const expectedName = input.displayName?.trim() || existing.name;
    if (
      !ownerEmail ||
      ownerEmail !== expectedEmail ||
      existing.name !== expectedName ||
      (requestedSlug && existing.slug !== requestedSlug)
    ) {
      throw new ProvisioningActionError(
        "Workspace identity does not match the tenant being prepared.",
        "EXISTING_TENANT",
        409,
      );
    }
    await stampPrepayment(db, existing.currentSubscription);
    await writePlatformAuditEvent(
      {
        actorOperatorId: input.operatorId,
        actorType: "OPERATOR",
        action: "PREPARE_TENANT_WORKSPACE",
        entityType: "Workspace",
        entityId: existing.id,
        summary: "Reused the existing tenant workspace",
        metadata: {
          workspaceId: existing.id,
          slug: existing.slug,
          emailSent: false,
          paymentInvitationSent: false,
          ownerActivationSent: false,
        },
      },
      db,
    );
    return {
      outcome: "reused",
      workspaceId: existing.id,
      slug: existing.slug,
      emailSent: false,
      paymentInvitationSent: false,
      ownerActivationSent: false,
    };
  }

  const displayName = input.displayName?.trim() ?? "";
  const ownerName = input.ownerName?.trim() ?? "";
  const ownerEmail = normalizeEmail(input.ownerEmail ?? "");
  const ownerPhone = input.ownerPhone?.trim() ?? "";
  const brokerageName = input.brokerageName?.trim() ?? "";
  const planCode = input.planCode?.trim() ?? "";
  const create = input.createIfMissing ?? defaultCreateWorkspace;
  const created = await create({
    prisma: db,
    operatorId: input.operatorId,
    slug: requestedSlug ?? "",
    displayName,
    ownerName,
    ownerEmail,
    ownerPhone,
    brokerageName,
    planCode,
    themeId: input.themeId,
  });
  const subscription = await db.subscription.findUnique({
    where: { id: created.subscriptionId },
    select: {
      id: true,
      source: true,
      stripeSubscriptionId: true,
      stripeCheckoutSessionId: true,
      commercialSnapshotJson: true,
    },
  });
  await stampPrepayment(db, subscription);
  return {
    outcome: "created",
    workspaceId: created.workspaceId,
    slug: created.slug,
    emailSent: false,
    paymentInvitationSent: false,
    ownerActivationSent: false,
  };
}

const workspaceIdentitySelect = {
  id: true,
  slug: true,
  name: true,
  status: true,
  currentSubscription: {
    select: {
      id: true,
      source: true,
      stripeSubscriptionId: true,
      stripeCheckoutSessionId: true,
      commercialSnapshotJson: true,
    },
  },
  members: {
    where: { role: "OWNER" as const, status: "ACTIVE" as const },
    select: { user: { select: { email: true } } },
    take: 1,
  },
} satisfies Prisma.WorkspaceFindUniqueArgs["select"];

async function stampPrepayment(
  db: PrismaClient,
  subscription: {
    id: string;
    source: string;
    stripeSubscriptionId: string | null;
    stripeCheckoutSessionId: string | null;
    commercialSnapshotJson: Prisma.JsonValue;
  } | null,
): Promise<void> {
  if (!subscription) return;
  if (subscription.source !== "INTERNAL") return;
  if (subscription.stripeSubscriptionId || subscription.stripeCheckoutSessionId) return;
  const snapshot = asSnapshot(subscription.commercialSnapshotJson);
  if (snapshot.manualOnboarding === "PREPAYMENT") return;
  await db.subscription.update({
    where: { id: subscription.id },
    data: {
      commercialSnapshotJson: {
        ...snapshot,
        manualOnboarding: "PREPAYMENT",
      },
    },
  });
}

async function defaultCreateWorkspace(
  input: Parameters<CreateIfMissing>[0],
): Promise<ComplimentaryProvisionResult> {
  return provisionComplimentaryWorkspace({
    ...input,
    authorization: COMPLIMENTARY_WORKSPACE_AUTHORIZATION,
  });
}

export async function prepareCommercialOfferForWorkspace(input: {
  prisma: PrismaClient;
  operatorId: string;
  workspaceId: string;
}): Promise<
  | {
      outcome: "already_present";
      offerId: string;
      offerStatus: string;
      emailSent: false;
    }
  | {
      outcome: "terms_required";
      offerId: null;
      prospectId: string;
      workspaceId: string;
      workspaceName: string;
      workspaceSlug: string;
      emailSent: false;
    }
> {
  const db = input.prisma;
  await requireMasterAdmin(db, input.operatorId);
  const workspace = await db.workspace.findUnique({
    where: { id: input.workspaceId },
    select: {
      id: true,
      name: true,
      slug: true,
      members: {
        where: { role: "OWNER", status: "ACTIVE" },
        select: { user: { select: { email: true, name: true, phone: true } } },
        take: 1,
      },
    },
  });
  if (!workspace) {
    throw new ProvisioningActionError("Workspace not found.", "NOT_FOUND", 404);
  }
  const owner = workspace.members[0]?.user;
  if (!owner?.email) {
    throw new ProvisioningActionError(
      "Workspace has no owner email.",
      "INVALID_IDENTITY",
    );
  }

  const linked = await db.commercialOffer.findUnique({
    where: { workspaceId: workspace.id },
    select: { id: true, status: true },
  });
  if (linked && linked.status !== "CANCELLED" && linked.status !== "EXPIRED") {
    return {
      outcome: "already_present",
      offerId: linked.id,
      offerStatus: linked.status,
      emailSent: false,
    };
  }
  if (linked) {
    await db.commercialOffer.update({
      where: { id: linked.id },
      data: { workspaceId: null },
    });
  }

  const email = normalizeEmail(owner.email);
  let prospect = await db.platformProspect.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!prospect) {
    prospect = await db.platformProspect.create({
      data: {
        email,
        contactName: owner.name?.trim() || workspace.name,
        businessName: workspace.name,
        phone: owner.phone,
        source: "OTHER",
        status: "NEW",
        ownerOperatorId: input.operatorId,
      },
      select: { id: true },
    });
  }

  return {
    outcome: "terms_required",
    offerId: null,
    prospectId: prospect.id,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspaceSlug: workspace.slug,
    emailSent: false,
  };
}

export async function sendPreparedPaymentInvitation(input: {
  prisma: PrismaClient;
  operatorId: string;
  workspaceId: string;
}): Promise<{ offerId: string; outcome: string; emailSent: true }> {
  const db = input.prisma;
  await requireMasterAdmin(db, input.operatorId);
  const offer = await db.commercialOffer.findUnique({
    where: { workspaceId: input.workspaceId },
    select: { id: true, status: true },
  });
  if (!offer) {
    throw new ProvisioningActionError(
      "Prepare a commercial offer before sending a payment invitation.",
      "OFFER_MISSING",
      409,
    );
  }
  if (offer.status === "DRAFT") {
    const sent = await sendCommercialOffer({
      prisma: db,
      offerId: offer.id,
      operatorId: input.operatorId,
    });
    if (sent.outcome === "sent" && sent.privateUrl) {
      await notifyOfferInvitationEmail({
        offerId: sent.offerId,
        privateUrl: sent.privateUrl,
      });
    }
    return { offerId: offer.id, outcome: sent.outcome, emailSent: true };
  }
  if (offer.status === "SENT" || offer.status === "VIEWED") {
    const resent = await resendCommercialOfferInvitation({
      prisma: db,
      offerId: offer.id,
      operatorId: input.operatorId,
    });
    if (resent.privateUrl) {
      await notifyOfferInvitationEmail({
        offerId: resent.offerId,
        privateUrl: resent.privateUrl,
        commercialOfferTokenId: resent.newTokenId,
      });
    }
    return { offerId: offer.id, outcome: resent.outcome, emailSent: true };
  }
  throw new ProvisioningActionError(
    "This offer cannot send a payment invitation.",
    "OFFER_NOT_SENDABLE",
    409,
  );
}

export async function deriveManualOnboardingIndicators(input: {
  prisma: PrismaClient;
  workspaceId: string;
  env?: NodeJS.ProcessEnv;
}): Promise<ManualOnboardingIndicator[]> {
  const workspace = await input.prisma.workspace.findUnique({
    where: { id: input.workspaceId },
    select: {
      slug: true,
      status: true,
      domains: { select: { kind: true, status: true } },
      emailIdentity: { select: { domainStatus: true } },
      currentSubscription: {
        select: {
          source: true,
          status: true,
          stripeSubscriptionId: true,
        },
      },
      dataConnections: {
        where: { status: "ACTIVE" },
        select: {
          providerKey: true,
          capabilities: { select: { capability: true } },
        },
      },
      ownerActivations: {
        where: { sentAt: { not: null }, revokedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!workspace) {
    return [
      { label: "Workspace", value: "Missing" },
      { label: "Website", value: "Pending" },
      { label: "Demo Listings", value: "Disabled" },
      { label: "TRREB", value: "Pending" },
      { label: "Custom Domain", value: "Pending" },
      { label: "Email Domain", value: "Pending" },
      { label: "Payment", value: "Pending" },
      { label: "Owner Invitation", value: "Not Sent" },
    ];
  }

  const websiteDeployed = workspace.domains.some(
    (domain) => domain.kind === "PLATFORM" && domain.status === "ACTIVE",
  );
  const customDomainActive = workspace.domains.some(
    (domain) => domain.kind === "CUSTOM" && domain.status === "ACTIVE",
  );
  const trrebConnected = workspace.dataConnections.some(
    (connection) =>
      connection.providerKey === "proptx" &&
      connection.capabilities.some((row) => row.capability === "ACTIVE_LISTINGS"),
  );
  const demoEnabled =
    workspace.slug === HIGH_OCTANE_STAGING_WORKSPACE_SLUG &&
    highOctaneSyntheticListingsAllowed(input.env);
  const subscription = workspace.currentSubscription;
  const paid =
    subscription?.source === "STRIPE" &&
    (subscription.status === "ACTIVE" || subscription.status === "TRIALING") &&
    Boolean(subscription.stripeSubscriptionId);

  return [
    { label: "Workspace", value: workspace.status === "ACTIVE" ? "Prepared" : "Pending" },
    { label: "Website", value: websiteDeployed ? "Deployed" : "Pending" },
    { label: "Demo Listings", value: demoEnabled ? "Enabled" : "Disabled" },
    { label: "TRREB", value: trrebConnected ? "Connected" : "Pending" },
    { label: "Custom Domain", value: customDomainActive ? "Active" : "Pending" },
    {
      label: "Email Domain",
      value: workspace.emailIdentity?.domainStatus === "VERIFIED" ? "Verified" : "Pending",
    },
    { label: "Payment", value: paid ? "Paid" : "Pending" },
    {
      label: "Owner Invitation",
      value: workspace.ownerActivations.length > 0 ? "Sent" : "Not Sent",
    },
  ];
}
