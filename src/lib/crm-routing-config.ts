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
  }
  const sum = weights.reduce((s, w) => s + w.percent, 0);
  if (weights.length > 0 && sum !== 100) {
    return `${label} percentages must total 100 (currently ${sum}).`;
  }
  return null;
}

/**
 * Sync weights for ONE settings row against ONE candidate pool.
 * Never touches other CrmRoutingSettings rows.
 */
export async function syncRoutingWeightsForSettings(input: {
  settingsId: string;
  agentIds: string[];
  existing: RoutingWeightRow[];
}): Promise<void> {
  const { settingsId, agentIds, existing } = input;
  const lanes = ["BUYER", "SELLER"] as const;
  const equal =
    agentIds.length === 0 ? 0 : Math.floor(100 / agentIds.length);
  const remainder =
    agentIds.length === 0 ? 0 : 100 - equal * agentIds.length;

  for (const lane of lanes) {
    const laneWeights = existing.filter((w) => w.lane === lane);
    const known = new Set(laneWeights.map((w) => w.agentId));

    for (const agentId of agentIds) {
      if (known.has(agentId)) continue;
      const index = agentIds.indexOf(agentId);
      const percent = equal + (index === 0 ? remainder : 0);
      await prisma.crmRoutingWeight.create({
        data: {
          settingsId,
          agentId,
          lane,
          percent,
        },
      });
    }

    for (const weight of laneWeights) {
      if (!agentIds.includes(weight.agentId)) {
        await prisma.crmRoutingWeight.delete({ where: { id: weight.id } });
      }
    }

    const refreshed = await prisma.crmRoutingWeight.findMany({
      where: { settingsId, lane },
    });
    const sum = refreshed.reduce((s, w) => s + w.percent, 0);
    if (refreshed.length > 0 && sum === 0) {
      for (let i = 0; i < refreshed.length; i++) {
        const row = refreshed[i]!;
        await prisma.crmRoutingWeight.update({
          where: { id: row.id },
          data: { percent: equal + (i === 0 ? remainder : 0) },
        });
      }
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
