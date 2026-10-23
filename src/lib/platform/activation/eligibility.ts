/**
 * Stage 6.10A — eligibility for owner password activation.
 * Never trusts client-supplied workspace/role/subscription authority.
 */

import type { PrismaClient } from "@prisma/client";

export type OwnerActivationEligibilityReason =
  | "ELIGIBLE"
  | "WORKSPACE_NOT_FOUND"
  | "WORKSPACE_NOT_OPERATIONAL"
  | "NO_OWNER_MEMBER"
  | "OWNER_PASSWORD_SET"
  | "NO_CURRENT_SUBSCRIPTION"
  | "PROVISIONING_NOT_SUCCEEDED"
  | "USER_DISABLED";

export type OwnerActivationEligibility = {
  eligible: boolean;
  reason: OwnerActivationEligibilityReason;
  workspaceId: string;
  workspaceName: string | null;
  userId: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  passwordSet: boolean;
};

export async function evaluateOwnerActivationEligibility(input: {
  prisma: PrismaClient;
  workspaceId: string;
}): Promise<OwnerActivationEligibility> {
  const workspace = await input.prisma.workspace.findUnique({
    where: { id: input.workspaceId },
    select: {
      id: true,
      name: true,
      status: true,
      currentSubscriptionId: true,
      currentSubscription: {
        select: {
          source: true,
          status: true,
          stripeSubscriptionId: true,
        },
      },
      billingOwnerUserId: true,
      members: {
        where: { role: "OWNER", status: "ACTIVE" },
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              password: true,
              disabledAt: true,
            },
          },
        },
        take: 5,
      },
      provisioningRuns: {
        where: { status: "SUCCEEDED" },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!workspace) {
    return {
      eligible: false,
      reason: "WORKSPACE_NOT_FOUND",
      workspaceId: input.workspaceId,
      workspaceName: null,
      userId: null,
      ownerEmail: null,
      ownerName: null,
      passwordSet: false,
    };
  }

  if (workspace.status !== "ACTIVE" && workspace.status !== "TRIAL") {
    return {
      eligible: false,
      reason: "WORKSPACE_NOT_OPERATIONAL",
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      userId: null,
      ownerEmail: null,
      ownerName: null,
      passwordSet: false,
    };
  }

  if (!workspace.currentSubscriptionId) {
    return {
      eligible: false,
      reason: "NO_CURRENT_SUBSCRIPTION",
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      userId: null,
      ownerEmail: null,
      ownerName: null,
      passwordSet: false,
    };
  }

  const subscription = workspace.currentSubscription;
  const complimentary =
    subscription?.source === "INTERNAL" &&
    subscription.status === "ACTIVE" &&
    subscription.stripeSubscriptionId == null;

  if (!complimentary && workspace.provisioningRuns.length === 0) {
    return {
      eligible: false,
      reason: "PROVISIONING_NOT_SUCCEEDED",
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      userId: null,
      ownerEmail: null,
      ownerName: null,
      passwordSet: false,
    };
  }

  const ownerMember =
    workspace.members.find((m) => m.userId === workspace.billingOwnerUserId) ??
    workspace.members[0] ??
    null;

  if (!ownerMember) {
    return {
      eligible: false,
      reason: "NO_OWNER_MEMBER",
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      userId: null,
      ownerEmail: null,
      ownerName: null,
      passwordSet: false,
    };
  }

  if (ownerMember.user.disabledAt) {
    return {
      eligible: false,
      reason: "USER_DISABLED",
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      userId: ownerMember.user.id,
      ownerEmail: ownerMember.user.email,
      ownerName: ownerMember.user.name,
      passwordSet: Boolean(ownerMember.user.password),
    };
  }

  if (ownerMember.user.password) {
    return {
      eligible: false,
      reason: "OWNER_PASSWORD_SET",
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      userId: ownerMember.user.id,
      ownerEmail: ownerMember.user.email,
      ownerName: ownerMember.user.name,
      passwordSet: true,
    };
  }

  return {
    eligible: true,
    reason: "ELIGIBLE",
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    userId: ownerMember.user.id,
    ownerEmail: ownerMember.user.email,
    ownerName: ownerMember.user.name,
    passwordSet: false,
  };
}
