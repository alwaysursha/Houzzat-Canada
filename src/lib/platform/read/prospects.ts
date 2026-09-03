import type { Prisma, ProspectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildCursorPage,
  type PlatformListParams,
} from "@/lib/platform/api/pagination";
import {
  serializeOfferSummary,
  serializeProspect,
  serializeProspectActivities,
} from "@/lib/platform/read/serialize";

export async function listPlatformProspects(params: PlatformListParams) {
  const where: Prisma.PlatformProspectWhereInput = {};
  if (params.status) {
    where.status = params.status as ProspectStatus;
  }

  const rows = await prisma.platformProspect.findMany({
    where,
    include: {
      ownerOperator: {
        select: { id: true, role: true, status: true },
      },
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
    items: page.items.map(serializeProspect),
    nextCursor: page.nextCursor,
  };
}

export async function getPlatformProspectDetail(prospectId: string) {
  const prospect = await prisma.platformProspect.findUnique({
    where: { id: prospectId },
    include: {
      ownerOperator: {
        select: { id: true, role: true, status: true },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 100,
      },
      offers: {
        orderBy: { createdAt: "desc" },
        include: {
          subscription: true,
          provisioningRun: true,
        },
      },
    },
  });

  if (!prospect) return null;

  return {
    ...serializeProspect(prospect),
    activities: serializeProspectActivities(prospect.activities),
    offers: prospect.offers.map((offer) =>
      serializeOfferSummary({
        ...offer,
        lineItems: [],
        tokens: [],
        acceptance: null,
      }),
    ),
  };
}
