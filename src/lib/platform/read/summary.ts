import type {
  AddOnCode,
  AddOnGrantStatus,
  PlanCode,
  ProspectStatus,
  ProvisioningRunStatus,
  SubscriptionSource,
  SubscriptionStatus,
  WorkspaceStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getWorkspaceSeatConsumption } from "@/lib/platform/seats";

export async function getPlatformSummary() {
  const [
    totalWorkspaces,
    workspaceStatusRows,
    totalSubscriptions,
    subscriptionSourceRows,
    subscriptionStatusRows,
    subscriptionPlanRows,
    totalProspects,
    prospectStatusRows,
    seatQuotaAgg,
    addOnGrantStatusRows,
    addOnGrantCodeRows,
    provisioningStatusRows,
    workspaceIds,
  ] = await Promise.all([
    prisma.workspace.count(),
    prisma.workspace.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.subscription.count(),
    prisma.subscription.groupBy({
      by: ["source"],
      _count: { _all: true },
    }),
    prisma.subscription.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.subscription.groupBy({
      by: ["planCode"],
      _count: { _all: true },
    }),
    prisma.platformProspect.count(),
    prisma.platformProspect.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.workspaceSeatQuota.aggregate({
      _sum: {
        seatLimit: true,
        includedSeats: true,
        additionalSeats: true,
      },
    }),
    prisma.addOnGrant.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.addOnGrant.groupBy({
      by: ["addOnCode"],
      _count: { _all: true },
    }),
    prisma.provisioningRun.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.workspace.findMany({ select: { id: true } }),
  ]);

  let totalSeatsConsumed = 0;
  for (const workspace of workspaceIds) {
    const consumption = await getWorkspaceSeatConsumption(workspace.id);
    totalSeatsConsumed += consumption.consumed;
  }

  const workspaceCountsByStatus = Object.fromEntries(
    workspaceStatusRows.map((row) => [row.status, row._count._all]),
  ) as Record<WorkspaceStatus, number>;

  const subscriptionCountsBySource = Object.fromEntries(
    subscriptionSourceRows.map((row) => [row.source, row._count._all]),
  ) as Record<SubscriptionSource, number>;

  const subscriptionCountsByStatus = Object.fromEntries(
    subscriptionStatusRows.map((row) => [row.status, row._count._all]),
  ) as Record<SubscriptionStatus, number>;

  const subscriptionCountsByPlan = Object.fromEntries(
    subscriptionPlanRows.map((row) => [
      row.planCode ?? "NULL",
      row._count._all,
    ]),
  ) as Record<PlanCode | "NULL", number>;

  const prospectCountsByStatus = Object.fromEntries(
    prospectStatusRows.map((row) => [row.status, row._count._all]),
  ) as Record<ProspectStatus, number>;

  const addOnGrantCountsByStatus = Object.fromEntries(
    addOnGrantStatusRows.map((row) => [row.status, row._count._all]),
  ) as Record<AddOnGrantStatus, number>;

  const addOnGrantCountsByCode = Object.fromEntries(
    addOnGrantCodeRows.map((row) => [row.addOnCode, row._count._all]),
  ) as Record<AddOnCode, number>;

  const provisioningCountsByStatus = Object.fromEntries(
    provisioningStatusRows.map((row) => [row.status, row._count._all]),
  ) as Record<ProvisioningRunStatus, number>;

  return {
    workspaces: {
      total: totalWorkspaces,
      byStatus: workspaceCountsByStatus,
    },
    subscriptions: {
      total: totalSubscriptions,
      active: subscriptionCountsByStatus.ACTIVE ?? 0,
      bySource: subscriptionCountsBySource,
      byStatus: subscriptionCountsByStatus,
      byPlanCode: subscriptionCountsByPlan,
    },
    prospects: {
      total: totalProspects,
      byStatus: prospectCountsByStatus,
    },
    seats: {
      totalProvisioned: seatQuotaAgg._sum.seatLimit ?? 0,
      totalIncludedSeats: seatQuotaAgg._sum.includedSeats ?? 0,
      totalAdditionalSeats: seatQuotaAgg._sum.additionalSeats ?? 0,
      totalConsumed: totalSeatsConsumed,
    },
    addOnGrants: {
      byStatus: addOnGrantCountsByStatus,
      byCode: addOnGrantCountsByCode,
    },
    provisioning: {
      byStatus: provisioningCountsByStatus,
    },
  };
}
