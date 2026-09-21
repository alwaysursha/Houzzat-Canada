/**
 * New-workspace CRM routing initialization (paid provisioning).
 *
 * Sequential Neon HTTP-safe writes. Never mutates existing settings —
 * Houzzat production PERCENTAGE config is left untouched.
 *
 * Initializes both supported Seller modes:
 *   LISTING_AGENT — default for a new tenant (owner as listing agent)
 *   PERCENTAGE    — 100% owner weights on BUYER and SELLER lanes so the
 *                   workspace can switch modes without a silent first-agent
 *                   fallback.
 */
import type { PrismaClient } from "@prisma/client";

const HOUZZAT_LEGACY_ROUTING_SETTINGS_ID = "default";

export type ProvisionedWorkspaceCrmRouting = {
  id: string;
  workspaceId: string;
  listingAgentId: string | null;
  sellerAssignMode: "PERCENTAGE" | "LISTING_AGENT";
  created: boolean;
};

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

export async function provisionWorkspaceCrmRoutingSettingsIfAbsent(
  db: PrismaClient,
  input: {
    workspaceId: string;
    ownerUserId: string;
  },
): Promise<ProvisionedWorkspaceCrmRouting | null> {
  const workspaceId = input.workspaceId.trim();
  const ownerUserId = input.ownerUserId.trim();
  if (!workspaceId || !ownerUserId) return null;

  const existing = await db.crmRoutingSettings.findFirst({
    where: { workspaceId },
    select: {
      id: true,
      workspaceId: true,
      listingAgentId: true,
      sellerAssignMode: true,
    },
  });
  if (existing?.workspaceId) {
    return {
      id: existing.id,
      workspaceId: existing.workspaceId,
      listingAgentId: existing.listingAgentId,
      sellerAssignMode: existing.sellerAssignMode,
      created: false,
    };
  }

  const settingsId = `crs_${workspaceId}`;
  if (settingsId === HOUZZAT_LEGACY_ROUTING_SETTINGS_ID) {
    return null;
  }

  try {
    const created = await db.crmRoutingSettings.create({
      data: {
        id: settingsId,
        workspaceId,
        listingAgentId: ownerUserId,
        sellerAssignMode: "LISTING_AGENT",
      },
      select: {
        id: true,
        workspaceId: true,
        listingAgentId: true,
        sellerAssignMode: true,
      },
    });

    for (const lane of ["BUYER", "SELLER"] as const) {
      try {
        await db.crmRoutingWeight.create({
          data: {
            settingsId: created.id,
            agentId: ownerUserId,
            lane,
            percent: 100,
          },
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
      }
    }

    return {
      id: created.id,
      workspaceId: created.workspaceId ?? workspaceId,
      listingAgentId: created.listingAgentId,
      sellerAssignMode: created.sellerAssignMode,
      created: true,
    };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const raced = await db.crmRoutingSettings.findFirst({
      where: { workspaceId },
      select: {
        id: true,
        workspaceId: true,
        listingAgentId: true,
        sellerAssignMode: true,
      },
    });
    if (!raced?.workspaceId) throw error;
    return {
      id: raced.id,
      workspaceId: raced.workspaceId,
      listingAgentId: raced.listingAgentId,
      sellerAssignMode: raced.sellerAssignMode,
      created: false,
    };
  }
}
