import type { Prisma, ProvisioningRunStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildCursorPage,
  type PlatformListParams,
} from "@/lib/platform/api/pagination";
import { evaluatePaidSubscriptionProvisioningEligibility } from "@/lib/platform/provisioning";
import {
  sanitizeProvisioningError,
  serializeProvisioningRunSummary,
  serializeProvisioningStep,
} from "@/lib/platform/read/serialize";

export async function listPlatformProvisioningRuns(params: PlatformListParams) {
  const where: Prisma.ProvisioningRunWhereInput = {};
  if (params.status) {
    where.status = params.status as ProvisioningRunStatus;
  }

  const rows = await prisma.provisioningRun.findMany({
    where,
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
    items: page.items.map(serializeProvisioningRunSummary),
    nextCursor: page.nextCursor,
  };
}

export async function getPlatformProvisioningRunDetail(runId: string) {
  const run = await prisma.provisioningRun.findUnique({
    where: { id: runId },
    include: {
      steps: {
        orderBy: [{ stepKey: "asc" }],
      },
    },
  });
  if (!run) return null;

  const eligibility = await evaluatePaidSubscriptionProvisioningEligibility({
    prisma,
    subscriptionId: run.subscriptionId,
  });

  return {
    ...serializeProvisioningRunSummary(run),
    steps: run.steps.map(serializeProvisioningStep),
    canRetryProvisioning:
      eligibility.eligible ||
      (eligibility.reason === "IN_PROGRESS" && eligibility.canRetry),
  };
}

export { sanitizeProvisioningError };
