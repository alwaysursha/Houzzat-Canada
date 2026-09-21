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
import type { LeadIntent } from "@prisma/client";
import { pickRoutedAssignee } from "@/lib/agent/pick-routed-assignee";
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
 * Sole agent → that agent. LISTING_AGENT / PERCENTAGE as configured.
 * Multi-agent missing settings or lane weights → pond (never agents[0]).
 * Fair-share assignedCount increment is operational counter, not tenancy config.
 */
export async function resolveWorkspaceRoutedAssignee(
  workspaceId: string,
  intent: LeadIntent,
): Promise<string | null> {
  const agents = await listWorkspaceRoutableAgents(workspaceId);
  const settings = await loadWorkspaceCrmRoutingSettings(workspaceId);
  const pick = pickRoutedAssignee({
    intent,
    agentIds: agents.map((a) => a.id),
    sellerAssignMode: settings?.sellerAssignMode ?? null,
    listingAgentId: settings?.listingAgentId ?? null,
    weights: (settings?.weights ?? []).map((w) => ({
      id: w.id,
      agentId: w.agentId,
      lane: w.lane,
      percent: w.percent,
      assignedCount: w.assignedCount,
    })),
  });

  if (pick.reason === "no_agents") {
    console.warn("[workspace-routing] no routable agents", {
      workspaceIdPrefix: workspaceId.slice(0, 8),
    });
    return null;
  }
  if (pick.reason === "unconfigured_multi_agent") {
    console.warn(
      "[workspace-routing] multi-agent workspace has no eligible assignment — pond",
      { workspaceIdPrefix: workspaceId.slice(0, 8), intent },
    );
    return null;
  }

  if (pick.weightId) {
    await prisma.crmRoutingWeight.update({
      where: { id: pick.weightId },
      data: { assignedCount: { increment: 1 } },
    });
  }

  return pick.agentId;
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
