/**
 * Stage 3J.1 — CRM routing settings candidate resolution and weight sync.
 *
 * Workspace routing mode: candidates come from settings.workspaceId members only.
 * Legacy mode: platform-wide User.role=AGENT pool (rollback-safe).
 */
import type { SellerLeadAssignMode } from "@prisma/client";
import {
  CRM_ROUTING_SETTINGS_ID,
  type RoutableAgent,
} from "@/lib/agent/routing-types";
import { prisma } from "@/lib/prisma";
import { isWorkspaceRoutingScope } from "@/lib/workspace-scope-flags";
import { listWorkspaceRoutableAgents } from "@/lib/workspace-routing";

export type RoutingSettingsRef = {
  id: string;
  workspaceId: string | null;
  listingAgentId?: string | null;
};

type RoutingWeightRow = {
  id: string;
  agentId: string;
  lane: "BUYER" | "SELLER";
  percent: number;
};

const settingsInclude = {
  listingAgent: { select: { id: true, name: true, email: true } },
  weights: {
    include: {
      agent: { select: { id: true, name: true, email: true } },
    },
  },
} as const;

export function usesWorkspaceRoutingForSettings(
  settings: Pick<RoutingSettingsRef, "workspaceId">,
): boolean {
  return isWorkspaceRoutingScope() && Boolean(settings.workspaceId);
}

/** Legacy platform-wide pool — used only when WORKSPACE_ROUTING_SCOPE ≠ workspace. */
export async function listLegacyRoutableAgents(): Promise<RoutableAgent[]> {
  return prisma.user.findMany({
    where: {
      role: "AGENT",
      disabledAt: null,
    },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}

/**
 * Resolve routable agents for a specific CrmRoutingSettings row.
 * Never falls back from workspace settings to platform-wide list.
 */
export async function listRoutableAgentsForSettings(
  settings: Pick<RoutingSettingsRef, "workspaceId">,
): Promise<RoutableAgent[]> {
  if (usesWorkspaceRoutingForSettings(settings)) {
    return listWorkspaceRoutableAgents(settings.workspaceId!);
  }
  return listLegacyRoutableAgents();
}

export function isAgentInSettingsPool(
  agentId: string,
  agents: RoutableAgent[],
): boolean {
  return agents.some((a) => a.id === agentId);
}

export function validateListingAgentForSettings(
  listingAgentId: string | null | undefined,
  agents: RoutableAgent[],
): string | null {
  if (!listingAgentId) return null;
  if (!isAgentInSettingsPool(listingAgentId, agents)) {
    return "Listing agent must be an active routable member of the routing workspace.";
  }
  return null;
}

export function validateWeightsForSettings(
  weights: { agentId: string; percent: number }[] | undefined,
  label: string,
  agents: RoutableAgent[],
): string | null {
  if (!weights) return null;
  const pool = new Set(agents.map((a) => a.id));
  for (const row of weights) {
    if (!pool.has(row.agentId)) {
      return `${label}: agent is not a routable member of the routing workspace`;
    }
    if (row.percent < 0 || row.percent > 100) {
      return `${label}: each percentage must be between 0 and 100`;
    }
  }
  const sum = weights.reduce((s, w) => s + w.percent, 0);
  if (sum > 100) {
    return `${label} percentages cannot exceed 100 (currently ${sum}).`;
  }
  return null;
}

export type RoutingWeightSyncRow = {
  agentId: string;
  lane: "BUYER" | "SELLER";
  percent: number;
};

/**
 * Pure weight sync planner — new pool members default to 0% and never alter
 * existing configured percentages. Bootstrap: lone agent on an empty lane → 100%.
 */
export function planRoutingWeightSync(input: {
  agentIds: string[];
  existing: RoutingWeightRow[];
}): RoutingWeightSyncRow[] {
  const { agentIds, existing } = input;
  const lanes = ["BUYER", "SELLER"] as const;
  const result: RoutingWeightSyncRow[] = [];

  for (const lane of lanes) {
    const laneWeights = existing.filter((w) => w.lane === lane);
    const byAgent = new Map(laneWeights.map((w) => [w.agentId, w]));

    for (const agentId of agentIds) {
      const prev = byAgent.get(agentId);
      if (prev) {
        result.push({ agentId, lane, percent: prev.percent });
        continue;
      }
      const bootstrapPercent =
        laneWeights.length === 0 && agentIds.length === 1 ? 100 : 0;
      result.push({ agentId, lane, percent: bootstrapPercent });
    }
  }

  return healLaneOverflow(result);
}

/** When a lane exceeds 100%, keep the highest weight and zero the rest. */
function healLaneOverflow(planned: RoutingWeightSyncRow[]): RoutingWeightSyncRow[] {
  const lanes = ["BUYER", "SELLER"] as const;
  let result = planned;
  for (const lane of lanes) {
    const laneRows = result.filter((r) => r.lane === lane);
    const sum = laneRows.reduce((s, r) => s + r.percent, 0);
    if (sum <= 100) continue;
    const keeper = [...laneRows].sort((a, b) => b.percent - a.percent)[0]!
      .agentId;
    result = result.map((r) => {
      if (r.lane !== lane || r.agentId === keeper) return r;
      return { ...r, percent: 0 };
    });
  }
  return result;
}

/**
 * Sync weights for ONE settings row against ONE candidate pool.
 * New members: 0%. Existing percentages preserved. Removed members: dropped.
 */
export async function syncRoutingWeightsForSettings(input: {
  settingsId: string;
  agentIds: string[];
  existing: RoutingWeightRow[];
}): Promise<void> {
  const { settingsId, agentIds, existing } = input;
  const planned = planRoutingWeightSync({ agentIds, existing });
  const lanes = ["BUYER", "SELLER"] as const;

  for (const lane of lanes) {
    const laneExisting = existing.filter((w) => w.lane === lane);
    const lanePlanned = planned.filter((w) => w.lane === lane);
    const plannedAgents = new Set(lanePlanned.map((w) => w.agentId));

    for (const weight of laneExisting) {
      if (!plannedAgents.has(weight.agentId)) {
        await prisma.crmRoutingWeight.delete({ where: { id: weight.id } });
      }
    }

    for (const row of lanePlanned) {
      const prev = laneExisting.find((w) => w.agentId === row.agentId);
      if (prev) {
        if (prev.percent !== row.percent) {
          await prisma.crmRoutingWeight.update({
            where: { id: prev.id },
            data: { percent: row.percent },
          });
        }
        continue;
      }
      await prisma.crmRoutingWeight.create({
        data: {
          settingsId,
          agentId: row.agentId,
          lane: row.lane,
          percent: row.percent,
        },
      });
    }
  }
}

async function loadCrmRoutingSettingsById(settingsId: string) {
  return prisma.crmRoutingSettings.findUniqueOrThrow({
    where: { id: settingsId },
    include: settingsInclude,
  });
}

/**
 * Ensure Houzzat legacy singleton (id=default) exists and weights match its pool.
 * In workspace routing mode, only Houzzat WorkspaceMembers may appear in weights.
 */
export async function ensureCrmRoutingSettings() {
  let settings = await prisma.crmRoutingSettings.findUnique({
    where: { id: CRM_ROUTING_SETTINGS_ID },
    include: { weights: true },
  });

  if (!settings) {
    if (isWorkspaceRoutingScope()) {
      throw new Error(
        `[crm-routing-config] CrmRoutingSettings id="${CRM_ROUTING_SETTINGS_ID}" missing — run explicit backfill`,
      );
    }
    const agents = await listLegacyRoutableAgents();
    settings = await prisma.crmRoutingSettings.create({
      data: {
        id: CRM_ROUTING_SETTINGS_ID,
        listingAgentId: agents[0]?.id ?? null,
        sellerAssignMode: "LISTING_AGENT",
      },
      include: { weights: true },
    });
  }

  if (isWorkspaceRoutingScope() && !settings.workspaceId) {
    console.warn(
      "[crm-routing-config] WORKSPACE_ROUTING_SCOPE=workspace but default settings lack workspaceId — skip weight sync",
    );
    return loadCrmRoutingSettingsById(settings.id);
  }

  const agents = await listRoutableAgentsForSettings(settings);
  const agentIds = agents.map((a) => a.id);

  if (
    settings.listingAgentId &&
    !agentIds.includes(settings.listingAgentId)
  ) {
    settings = await prisma.crmRoutingSettings.update({
      where: { id: settings.id },
      data: { listingAgentId: agentIds[0] ?? null },
      include: { weights: true },
    });
  } else if (!settings.listingAgentId && agentIds[0]) {
    settings = await prisma.crmRoutingSettings.update({
      where: { id: settings.id },
      data: { listingAgentId: agentIds[0] ?? null },
      include: { weights: true },
    });
  }

  await syncRoutingWeightsForSettings({
    settingsId: settings.id,
    agentIds,
    existing: settings.weights,
  });

  return loadCrmRoutingSettingsById(settings.id);
}

/**
 * Sync weights for an explicit workspace settings row (provisioning / admin).
 * Never reads platform-wide agents.
 */
export async function syncCrmRoutingSettingsForWorkspace(
  workspaceId: string,
): Promise<void> {
  const settings = await prisma.crmRoutingSettings.findFirst({
    where: { workspaceId },
    include: { weights: true },
  });
  if (!settings) {
    throw new Error(
      `[crm-routing-config] no CrmRoutingSettings for workspace ${workspaceId.slice(0, 8)}`,
    );
  }

  const agents = await listWorkspaceRoutableAgents(workspaceId);
  const agentIds = agents.map((a) => a.id);

  if (
    settings.listingAgentId &&
    !agentIds.includes(settings.listingAgentId)
  ) {
    await prisma.crmRoutingSettings.update({
      where: { id: settings.id },
      data: { listingAgentId: agentIds[0] ?? null },
    });
  }

  await syncRoutingWeightsForSettings({
    settingsId: settings.id,
    agentIds,
    existing: settings.weights,
  });
}

/** @deprecated Prefer listRoutableAgentsForSettings(settings) in workspace routing mode. */
export async function listRoutableAgents(): Promise<RoutableAgent[]> {
  return listLegacyRoutableAgents();
}

export type { SellerLeadAssignMode };
