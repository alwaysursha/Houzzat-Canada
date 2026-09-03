import type { OfferStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildCursorPage,
  type PlatformListParams,
} from "@/lib/platform/api/pagination";
import {
  serializeOfferSummary,
  serializeProspect,
} from "@/lib/platform/read/serialize";

const offerInclude = {
  lineItems: { orderBy: { sortOrder: "asc" as const } },
  tokens: { orderBy: { createdAt: "desc" as const } },
  acceptance: true,
  subscription: true,
  provisioningRun: true,
  prospect: true,
} satisfies Prisma.CommercialOfferInclude;

export async function listPlatformOffers(params: PlatformListParams) {
  const where: Prisma.CommercialOfferWhereInput = {};
  if (params.status) {
    where.status = params.status as OfferStatus;
  }

  const rows = await prisma.commercialOffer.findMany({
    where,
    include: offerInclude,
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
    items: page.items.map((row) => ({
      ...serializeOfferSummary(row),
      prospect: serializeProspect(row.prospect),
    })),
    nextCursor: page.nextCursor,
  };
}

export async function getPlatformOfferDetail(offerId: string) {
  const offer = await prisma.commercialOffer.findUnique({
    where: { id: offerId },
    include: offerInclude,
  });
  if (!offer) return null;
  return {
    ...serializeOfferSummary(offer),
    prospect: serializeProspect(offer.prospect),
  };
}
