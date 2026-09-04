import type { Prisma, SubscriptionSource, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildCursorPage,
  type PlatformListParams,
} from "@/lib/platform/api/pagination";
import { evaluatePaidSubscriptionProvisioningEligibility } from "@/lib/platform/provisioning";
import {
  serializeProvisioningRunSummary,
  serializeSubscriptionSummary,
} from "@/lib/platform/read/serialize";

export async function listPlatformSubscriptionsFiltered(
  params: PlatformListParams & {
    source?: SubscriptionSource | null;
    workspaceId?: string | null;
  },
) {
  const where: Prisma.SubscriptionWhereInput = {};
  if (params.status) where.status = params.status as SubscriptionStatus;
  if (params.source) where.source = params.source;
  if (params.workspaceId) where.workspaceId = params.workspaceId;

  const rows = await prisma.subscription.findMany({
    where,
    include: {
      billingCustomer: { select: { stripeCustomerId: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: params.limit + 1,
    ...(params.cursor
      ? {
          cursor: { id: params.cursor },
          skip: 1,
        }
      : {}),
  });

  const page = buildCursorPage(rows, params.limit);
  return {
    items: page.items.map(serializeSubscriptionSummary),
    nextCursor: page.nextCursor,
  };
}

export async function getPlatformSubscriptionDetail(subscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      provisioningRun: true,
      billingCustomer: { select: { stripeCustomerId: true } },
    },
  });
  if (!subscription) return null;

  const eligibility = await evaluatePaidSubscriptionProvisioningEligibility({
    prisma,
    subscriptionId,
  });

  return {
    ...serializeSubscriptionSummary(subscription),
    provisioningRun: subscription.provisioningRun
      ? serializeProvisioningRunSummary(subscription.provisioningRun)
      : null,
    canRetryProvisioning:
      eligibility.eligible ||
      (eligibility.reason === "IN_PROGRESS" && eligibility.canRetry),
    provisioningEligibilityReason: eligibility.reason,
  };
}
