/**
 * Stage 6.10A — ensure WorkspaceOnboardingState exists (sequential, no $transaction).
 */

import type { PrismaClient } from "@prisma/client";

export async function ensureWorkspaceOnboardingState(
  db: PrismaClient,
  workspaceId: string,
): Promise<void> {
  const existing = await db.workspaceOnboardingState.findUnique({
    where: { workspaceId },
    select: { workspaceId: true },
  });
  if (existing) return;

  try {
    await db.workspaceOnboardingState.create({
      data: {
        workspaceId,
        templateThemeStatus: "NOT_STARTED",
      },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "P2002"
    ) {
      return;
    }
    throw error;
  }
}

export async function markAccountActivatedOnboarding(
  db: PrismaClient,
  workspaceId: string,
): Promise<void> {
  await ensureWorkspaceOnboardingState(db, workspaceId);
  const row = await db.workspaceOnboardingState.findUnique({
    where: { workspaceId },
    select: { accountActivatedAt: true, templateThemeStatus: true },
  });
  if (!row) return;
  if (row.accountActivatedAt) {
    // Never invent template progress.
    if (row.templateThemeStatus !== "NOT_STARTED") {
      await db.workspaceOnboardingState.update({
        where: { workspaceId },
        data: { templateThemeStatus: "NOT_STARTED" },
      });
    }
    return;
  }
  await db.workspaceOnboardingState.update({
    where: { workspaceId },
    data: {
      accountActivatedAt: new Date(),
      templateThemeStatus: "NOT_STARTED",
    },
  });
}
