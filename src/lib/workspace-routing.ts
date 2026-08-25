/**
 * Stage 3H.1 — workspace-scoped CRM routing resolution (READ-ONLY for config).
 *
 * Tenancy/configuration mutations belong in explicit scripts only:
 *   scripts/backfill-houzzat-workspace-routing.ts
 *   scripts/rollback-houzzat-workspace-routing.ts
 *
 * Runtime must never link legacy `default` → workspaceId, create settings,
 * or sync weights as a side effect of lead capture / resolution.
 */
import type { LeadIntent, SellerLeadAssignMode } from "@prisma/client";
import type { RoutableAgent } from "@/lib/agent/routing-types";
import { HOUZZAT_WORKSPACE_SLUG } from "@/lib/crm-ownership";
import { prisma } from "@/lib/prisma";
import { isWorkspaceRoutingScope } from "@/lib/workspace-scope-flags";

export async function resolveDefaultWorkspaceIdForRouting(): Promise<string | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { slug: HOUZZAT_WORKSPACE_SLUG },
    select: { id: true, status: true },
  });
  if (!workspace || workspace.status !== "ACTIVE") return null;
  return workspace.id;
}

/** ACTIVE routable members for a Workspace — never brokerage-wide. Read-only. */
export async function listWorkspaceRoutableAgents(
  workspaceId: string,
): Promise<RoutableAgent[]> {
  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      status: "ACTIVE",
      role: { in: ["AGENT", "ADMIN", "OWNER"] },
      user: {
        role: { in: ["AGENT", "ADMIN"] },
        disabledAt: null,
        agentProfile: { is: { active: true } },
      },
    },
    select: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ user: { name: "asc" } }, { user: { email: "asc" } }],
  });

  return members.map((m) => m.user);
}

/**
 * Load existing per-workspace routing settings. Never creates, updates, or
 * backfills the legacy singleton.
 */
export async function loadWorkspaceCrmRoutingSettings(workspaceId: string) {
  return prisma.crmRoutingSettings.findFirst({
    where: { workspaceId },
    include: {
      listingAgent: { select: { id: true, name: true, email: true } },
      weights: {
        include: {
          agent: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
}

/**
 * Pick assignee from workspace members + existing settings only.
 * Missing settings → safe member fallback (never another workspace's config).
 * Fair-share assignedCount increment is operational counter, not tenancy config.
 */
export async function resolveWorkspaceRoutedAssignee(
  workspaceId: string,
  intent: LeadIntent,
): Promise<string | null> {
  const agents = await listWorkspaceRoutableAgents(workspaceId);
  if (agents.length === 0) {
    console.warn("[workspace-routing] no routable agents", {
      workspaceIdPrefix: workspaceId.slice(0, 8),
    });
    return null;
  }
  if (agents.length === 1) return agents[0]!.id;

  const settings = await loadWorkspaceCrmRoutingSettings(workspaceId);
  const agentIds = new Set(agents.map((a) => a.id));

  if (!settings) {
    console.warn(
      "[workspace-routing] missing workspace routing settings — member fallback",
      { workspaceIdPrefix: workspaceId.slice(0, 8) },
    );
    return agents[0]!.id;
  }

  if (intent === "SELLER") {
    const mode: SellerLeadAssignMode = settings.sellerAssignMode;
    if (
      mode === "LISTING_AGENT" &&
      settings.listingAgentId &&
      agentIds.has(settings.listingAgentId)
    ) {
      return settings.listingAgentId;
    }
  }

  const lane = intent === "SELLER" ? "SELLER" : "BUYER";
  const weights = settings.weights.filter(
    (w) => w.lane === lane && w.percent > 0 && agentIds.has(w.agentId),
  );
  if (weights.length === 0) {
    return agents[0]!.id;
  }

  let best = weights[0]!;
  let bestScore =
    best.percent > 0
      ? best.assignedCount / best.percent
      : Number.POSITIVE_INFINITY;
  for (const weight of weights.slice(1)) {
    const score =
      weight.percent > 0
        ? weight.assignedCount / weight.percent
        : Number.POSITIVE_INFINITY;
    if (score < bestScore) {
      best = weight;
      bestScore = score;
    }
  }

  await prisma.crmRoutingWeight.update({
    where: { id: best.id },
    data: { assignedCount: { increment: 1 } },
  });

  return best.agentId;
}

export function shouldUseWorkspaceRouting(
  workspaceId?: string | null,
): workspaceId is string {
  return isWorkspaceRoutingScope() && Boolean(workspaceId);
}

/** @deprecated Use loadWorkspaceCrmRoutingSettings — never mutate from runtime. */
export async function ensureWorkspaceCrmRoutingSettings(workspaceId: string) {
  const settings = await loadWorkspaceCrmRoutingSettings(workspaceId);
  if (!settings) {
    throw new Error(
      `[workspace-routing] no CrmRoutingSettings for workspace ${workspaceId.slice(0, 8)} — run explicit backfill script`,
    );
  }
  return settings;
}
