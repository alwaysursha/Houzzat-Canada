/**
 * Stage 6.2A — materialize WorkspaceEntitlement + WorkspaceSeatQuota
 * from a code profile. Sequential idempotent upserts (no $transaction).
 */

import type { EntitlementSource, PrismaClient } from "@prisma/client";
import type { MaterializedEntitlementProfile } from "./profiles";

export type MaterializeEntitlementsResult = {
  workspaceId: string;
  profileCode: string;
  entitlementUpserts: number;
  seatQuota: {
    includedSeats: number;
    additionalSeats: number;
    seatLimit: number;
    created: boolean;
  };
};

export async function materializeEntitlementProfile(input: {
  prisma: PrismaClient;
  workspaceId: string;
  profile: MaterializedEntitlementProfile;
  source?: EntitlementSource;
}): Promise<MaterializeEntitlementsResult> {
  const source = input.source ?? "PLAN";
  let entitlementUpserts = 0;

  for (const feature of input.profile.features) {
    await input.prisma.workspaceEntitlement.upsert({
      where: {
        workspaceId_featureCode: {
          workspaceId: input.workspaceId,
          featureCode: feature.featureCode,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        featureCode: feature.featureCode,
        enabled: feature.enabled,
        source,
      },
      update: {
        enabled: feature.enabled,
        source,
      },
    });
    entitlementUpserts += 1;
  }

  const existingQuota = await input.prisma.workspaceSeatQuota.findUnique({
    where: { workspaceId: input.workspaceId },
    select: { workspaceId: true },
  });

  await input.prisma.workspaceSeatQuota.upsert({
    where: { workspaceId: input.workspaceId },
    create: {
      workspaceId: input.workspaceId,
      includedSeats: input.profile.includedSeats,
      additionalSeats: input.profile.additionalSeats,
      seatLimit: input.profile.seatLimit,
    },
    update: {
      includedSeats: input.profile.includedSeats,
      additionalSeats: input.profile.additionalSeats,
      seatLimit: input.profile.seatLimit,
    },
  });

  return {
    workspaceId: input.workspaceId,
    profileCode: input.profile.code,
    entitlementUpserts,
    seatQuota: {
      includedSeats: input.profile.includedSeats,
      additionalSeats: input.profile.additionalSeats,
      seatLimit: input.profile.seatLimit,
      created: !existingQuota,
    },
  };
}
