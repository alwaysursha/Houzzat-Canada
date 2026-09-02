/**
 * Stage 5.12A — Safe legacy CmaReport.workspaceId backfill.
 *
 * Rule: only when agent has exactly ONE ACTIVE WorkspaceMember.
 * Never invent Houzzat fallback. Ambiguous → leave NULL.
 */

import { prisma } from "@/lib/prisma";

export type CmaLegacyBackfillResult = {
  totalLegacy: number;
  safelyBackfilled: number;
  remainingNull: number;
  rule: string;
};

export async function backfillLegacyCmaWorkspaces(): Promise<CmaLegacyBackfillResult> {
  const rule =
    "Set workspaceId only when CmaReport.workspaceId IS NULL and agent has exactly one ACTIVE WorkspaceMember; otherwise leave NULL.";

  const legacy = await prisma.cmaReport.findMany({
    where: { workspaceId: null },
    select: { id: true, agentId: true },
  });

  let safelyBackfilled = 0;

  for (const row of legacy) {
    const memberships = await prisma.workspaceMember.findMany({
      where: {
        userId: row.agentId,
        status: "ACTIVE",
        workspace: { status: "ACTIVE" },
      },
      select: { workspaceId: true },
      take: 3,
    });
    if (memberships.length !== 1) continue;
    const workspaceId = memberships[0]!.workspaceId;
    await prisma.cmaReport.update({
      where: { id: row.id },
      data: { workspaceId },
    });
    safelyBackfilled += 1;
  }

  const remainingNull = await prisma.cmaReport.count({
    where: { workspaceId: null },
  });

  return {
    totalLegacy: legacy.length,
    safelyBackfilled,
    remainingNull,
    rule,
  };
}
