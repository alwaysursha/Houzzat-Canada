/**
 * Stage 6.11D — professional identity persistence helpers (no auth).
 * Callers must enforce host-bound OWNER authority before invoking.
 * Sequential create/update only (no $transaction / updateMany).
 */

import type { PrismaClient } from "@prisma/client";
import { ensureWorkspaceOnboardingState } from "@/lib/platform/activation/onboarding-state";
import { evaluateProfessionalIdentityStatus } from "./requirements";
import type { ProfessionalIdentitySnapshot } from "./types";

export async function syncProfessionalIdentityStatus(
  db: PrismaClient,
  workspaceId: string,
): Promise<"COMPLETE" | "NOT_STARTED"> {
  await ensureWorkspaceOnboardingState(db, workspaceId);
  const identity = await db.workspaceProfessionalIdentity.findUnique({
    where: { workspaceId },
    select: {
      agentRegisteredName: true,
      agentDesignation: true,
      agentCellPhone: true,
      brokerageRegisteredName: true,
      brokeragePhone: true,
      brokerageFax: true,
      brokerageAddress: true,
    },
  });
  const branding = await db.workspaceBranding.findUnique({
    where: { workspaceId },
    select: { brokerageLogoUrl: true },
  });

  const status = evaluateProfessionalIdentityStatus({
    identity,
    assets: { brokerageLogoUrl: branding?.brokerageLogoUrl ?? null },
  });

  await db.workspaceOnboardingState.update({
    where: { workspaceId },
    data: { professionalIdentityStatus: status },
  });
  return status;
}

/** Idempotent create-or-update for workspace professional identity fields. */
export async function upsertProfessionalIdentityFields(
  db: PrismaClient,
  workspaceId: string,
  data: ProfessionalIdentitySnapshot,
): Promise<void> {
  const existing = await db.workspaceProfessionalIdentity.findUnique({
    where: { workspaceId },
    select: { workspaceId: true },
  });

  if (existing) {
    await db.workspaceProfessionalIdentity.update({
      where: { workspaceId },
      data,
    });
    return;
  }

  try {
    await db.workspaceProfessionalIdentity.create({
      data: {
        workspaceId,
        ...data,
      },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "P2002"
    ) {
      await db.workspaceProfessionalIdentity.update({
        where: { workspaceId },
        data,
      });
      return;
    }
    throw error;
  }
}
