/**
 * Stage 6.2A — idempotent Houzzat grandfathering.
 *
 * Creates BillingCustomer + GRANDFATHERED Subscription + materializes
 * entitlements/seat quota when HOUZZAT_LEGACY profile is complete.
 *
 * Until owner decisions are locked, this refuses without writing.
 * Sequential writes only — no Prisma $transaction().
 */

import type { Prisma, PrismaClient, Subscription } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import { HOUZZAT_LEGACY_BILLING_CUSTOMER_EMAIL } from "@/lib/platform/activation/constants";
import { materializeEntitlementProfile } from "@/lib/platform/entitlements/materialize";
import {
  EntitlementProfileIncompleteError,
  HOUZZAT_LEGACY_ENTITLEMENT_PROFILE,
  getHouzzatLegacyOwnerDecisionsRequired,
  isHouzzatLegacyProfileReady,
  resolveHouzzatLegacyEntitlementProfile,
  type MaterializedEntitlementProfile,
} from "@/lib/platform/entitlements/profiles";

export const HOUZZAT_WORKSPACE_SLUG = "houzzat" as const;

export type GrandfatherWorkspaceResult =
  | {
      status: "created";
      workspaceId: string;
      billingCustomerId: string;
      subscriptionId: string;
      currentSubscriptionId: string;
      entitlementsMaterialized: number;
    }
  | {
      status: "already_grandfathered";
      workspaceId: string;
      billingCustomerId: string;
      subscriptionId: string;
      currentSubscriptionId: string;
      entitlementsMaterialized: number;
    };

export type GrandfatherWorkspaceInput = {
  prisma?: PrismaClient;
  workspaceSlug: string;
  /** Required BillingCustomer.email — must be provided by caller/owner. */
  billingCustomerEmail: string;
  profile: MaterializedEntitlementProfile;
  entitlementProfileCode: string;
  commercialSnapshot: Prisma.InputJsonValue;
  actorOperatorId?: string | null;
  dryRun?: boolean;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Core idempotent grandfather path for any workspace + explicit profile.
 * Used by tests with synthetic profiles; Houzzat production path uses
 * grandfatherHouzzatWorkspace which resolves HOUZZAT_LEGACY.
 */
export async function grandfatherWorkspaceWithProfile(
  input: GrandfatherWorkspaceInput,
): Promise<GrandfatherWorkspaceResult> {
  const db = input.prisma ?? defaultPrisma;
  const email = normalizeEmail(input.billingCustomerEmail);
  if (!email || !email.includes("@")) {
    throw new Error("billingCustomerEmail is required and must be a valid email");
  }

  if (input.dryRun) {
    throw new Error("dryRun requested — refusing writes");
  }

  const workspace = await db.workspace.findUnique({
    where: { slug: input.workspaceSlug },
    select: {
      id: true,
      slug: true,
      currentSubscriptionId: true,
    },
  });
  if (!workspace) {
    throw new Error(`Workspace not found for slug=${input.workspaceSlug}`);
  }

  // Idempotent: existing current GRANDFATHERED subscription with matching profile.
  if (workspace.currentSubscriptionId) {
    const current = await db.subscription.findUnique({
      where: { id: workspace.currentSubscriptionId },
    });
    if (
      current &&
      current.source === "GRANDFATHERED" &&
      current.entitlementProfileCode === input.entitlementProfileCode &&
      current.workspaceId === workspace.id
    ) {
      const materialize = await materializeEntitlementProfile({
        prisma: db,
        workspaceId: workspace.id,
        profile: input.profile,
        source: "MANUAL_GRANT",
      });
      return {
        status: "already_grandfathered",
        workspaceId: workspace.id,
        billingCustomerId: current.billingCustomerId,
        subscriptionId: current.id,
        currentSubscriptionId: current.id,
        entitlementsMaterialized: materialize.entitlementUpserts,
      };
    }
    throw new Error(
      `Workspace ${input.workspaceSlug} already has currentSubscriptionId=${workspace.currentSubscriptionId} that is not the expected grandfathered profile`,
    );
  }

  // Guard against orphan grandfathered rows without pointer (should not create duplicates).
  const existingGrandfathered = await db.subscription.findFirst({
    where: {
      workspaceId: workspace.id,
      source: "GRANDFATHERED",
      entitlementProfileCode: input.entitlementProfileCode,
      status: { not: "CANCELLED" },
    },
    orderBy: { createdAt: "asc" },
  });
  if (existingGrandfathered) {
    await db.workspace.update({
      where: { id: workspace.id },
      data: { currentSubscriptionId: existingGrandfathered.id },
    });
    const materialize = await materializeEntitlementProfile({
      prisma: db,
      workspaceId: workspace.id,
      profile: input.profile,
      source: "MANUAL_GRANT",
    });
    await writePlatformAuditEvent(
      {
        actorOperatorId: input.actorOperatorId ?? null,
        actorType: "SYSTEM",
        action: "WORKSPACE_GRANDFATHER_POINTER_REPAIRED",
        entityType: "Subscription",
        entityId: existingGrandfathered.id,
        summary: `Repaired currentSubscriptionId for ${input.workspaceSlug}`,
        metadata: {
          workspaceId: workspace.id,
          profileCode: input.entitlementProfileCode,
        },
      },
      db,
    );
    return {
      status: "already_grandfathered",
      workspaceId: workspace.id,
      billingCustomerId: existingGrandfathered.billingCustomerId,
      subscriptionId: existingGrandfathered.id,
      currentSubscriptionId: existingGrandfathered.id,
      entitlementsMaterialized: materialize.entitlementUpserts,
    };
  }

  let billingCustomer = await db.billingCustomer.findUnique({
    where: { workspaceId: workspace.id },
  });
  if (!billingCustomer) {
    billingCustomer = await db.billingCustomer.create({
      data: {
        workspaceId: workspace.id,
        email,
        source: "GRANDFATHERED",
        stripeCustomerId: null,
        prospectId: null,
      },
    });
  }

  const subscription = await db.subscription.create({
    data: {
      workspaceId: workspace.id,
      offerId: null,
      billingCustomerId: billingCustomer.id,
      source: "GRANDFATHERED",
      status: "ACTIVE",
      planCode: null,
      entitlementProfileCode: input.entitlementProfileCode,
      billingCadence: null,
      currency: "CAD",
      recurringAmountCents: null,
      setupFeeCents: null,
      includedSeats: input.profile.includedSeats,
      additionalSeats: input.profile.additionalSeats,
      stripeSubscriptionId: null,
      stripePriceId: null,
      stripeCheckoutSessionId: null,
      commercialSnapshotJson: input.commercialSnapshot,
    },
  });

  await db.workspace.update({
    where: { id: workspace.id },
    data: { currentSubscriptionId: subscription.id },
  });

  const materialize = await materializeEntitlementProfile({
    prisma: db,
    workspaceId: workspace.id,
    profile: input.profile,
    source: "MANUAL_GRANT",
  });

  await writePlatformAuditEvent(
    {
      actorOperatorId: input.actorOperatorId ?? null,
      actorType: "SYSTEM",
      action: "WORKSPACE_GRANDFATHERED",
      entityType: "Subscription",
      entityId: subscription.id,
      summary: `Grandfathered workspace ${input.workspaceSlug} with profile ${input.entitlementProfileCode}`,
      metadata: {
        workspaceId: workspace.id,
        profileCode: input.entitlementProfileCode,
        includedSeats: input.profile.includedSeats,
        seatLimit: input.profile.seatLimit,
      },
    },
    db,
  );

  return {
    status: "created",
    workspaceId: workspace.id,
    billingCustomerId: billingCustomer.id,
    subscriptionId: subscription.id,
    currentSubscriptionId: subscription.id,
    entitlementsMaterialized: materialize.entitlementUpserts,
  };
}

export type GrandfatherHouzzatInput = {
  prisma?: PrismaClient;
  /** Defaults to owner-approved HOUZZAT_LEGACY_BILLING_CUSTOMER_EMAIL when omitted. */
  billingCustomerEmail?: string;
  actorOperatorId?: string | null;
  dryRun?: boolean;
};

/**
 * Production Houzzat path. Refuses until HOUZZAT_LEGACY profile values are approved.
 */
export async function grandfatherHouzzatWorkspace(
  input: GrandfatherHouzzatInput,
): Promise<GrandfatherWorkspaceResult> {
  if (!isHouzzatLegacyProfileReady()) {
    throw new EntitlementProfileIncompleteError(
      HOUZZAT_LEGACY_ENTITLEMENT_PROFILE,
      getHouzzatLegacyOwnerDecisionsRequired(),
    );
  }

  // Unreachable until owner locks profile values in profiles.ts.
  const profile = resolveHouzzatLegacyEntitlementProfile();

  const billingCustomerEmail =
    input.billingCustomerEmail ?? HOUZZAT_LEGACY_BILLING_CUSTOMER_EMAIL;

  return grandfatherWorkspaceWithProfile({
    prisma: input.prisma,
    workspaceSlug: HOUZZAT_WORKSPACE_SLUG,
    billingCustomerEmail,
    profile,
    entitlementProfileCode: HOUZZAT_LEGACY_ENTITLEMENT_PROFILE,
    commercialSnapshot: {
      kind: "grandfathered",
      profile: HOUZZAT_LEGACY_ENTITLEMENT_PROFILE,
      note: "Internal legacy Houzzat workspace — no Stripe billing, no fake prices",
    },
    actorOperatorId: input.actorOperatorId,
    dryRun: input.dryRun,
  });
}

export function assertSubscriptionIsGrandfathered(sub: Subscription): void {
  if (sub.source !== "GRANDFATHERED") {
    throw new Error(`Expected GRANDFATHERED subscription, got ${sub.source}`);
  }
  if (sub.planCode !== null) {
    throw new Error("Grandfathered subscription must have null planCode");
  }
  if (sub.stripeSubscriptionId || sub.stripePriceId || sub.stripeCheckoutSessionId) {
    throw new Error("Grandfathered subscription must not carry Stripe IDs");
  }
}
