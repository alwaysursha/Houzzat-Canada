"use server";

import { PlatformOperatorAuthError, requirePlatformOperator } from "@/lib/platform/auth/require-platform-operator";
import { prisma } from "@/lib/prisma";
import { highOctaneDevelopmentListingsEnabled } from "@/lib/tenancy/templates/high-octane-development-listings";
import {
  readHighOctanePropTxReadiness,
  recordHighOctaneListingSourceRequest,
} from "@/lib/tenancy/templates/high-octane-listing-source-preference";
import {
  activateHighOctaneListingSourceRequest,
  parseStoredHighOctaneListingSource,
  type HighOctaneListingSourceRequest,
} from "@/lib/tenancy/templates/high-octane-proptx-source";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";

export type ItsoSourceActionState = {
  ok: boolean;
  message: string;
  blockers: string[];
};

function savedSourceMessage(requested: HighOctaneListingSourceRequest): string {
  switch (requested) {
    case "disabled":
      return "Disabled. This workspace will not serve listing inventory.";
    case "demo":
      return "Protected demo is selected for authorized development testing. Production stays empty.";
    case "proptx-idx":
      return "PropTx IDX is selected. Inventory follows this workspace's own TRREB entitlement.";
    case "proptx-vow":
      return "PropTx VOW is selected. Client-only fields follow the separate VOW authorization.";
    default: {
      const _exhaustive: never = requested;
      return _exhaustive;
    }
  }
}

export async function saveItsoSourceRequest(
  _previous: ItsoSourceActionState | null,
  formData: FormData,
): Promise<ItsoSourceActionState> {
  const stored = parseStoredHighOctaneListingSource(formData.get("requested"));
  const requested: HighOctaneListingSourceRequest | null =
    stored === "proptx-idx" ||
    stored === "proptx-vow" ||
    stored === "demo" ||
    stored === "disabled"
      ? stored
      : null;
  const workspaceId = String(formData.get("workspaceId") ?? "").trim();
  if (!requested || !workspaceId) {
    return { ok: false, message: "Choose a listing source.", blockers: [] };
  }

  try {
    const operator = await requirePlatformOperator();
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, slug: true },
    });
    if (!workspace || workspace.slug !== HIGH_OCTANE_STAGING_WORKSPACE_SLUG) {
      return {
        ok: false,
        message: "This source control belongs to the HIGH OCTANE workspace.",
        blockers: [],
      };
    }

    const readiness = await readHighOctanePropTxReadiness(workspace.id);
    const activation = activateHighOctaneListingSourceRequest({
      requested,
      demoEnabled: highOctaneDevelopmentListingsEnabled(),
      readiness,
    });
    if (!activation.accepted) {
      return {
        ok: false,
        message: "That source is not available.",
        blockers: activation.blockers,
      };
    }

    await recordHighOctaneListingSourceRequest({
      workspaceId: workspace.id,
      operatorId: operator.operatorId,
      requested,
    });
    return {
      ok: true,
      message: savedSourceMessage(requested),
      blockers: [],
    };
  } catch (error) {
    if (error instanceof PlatformOperatorAuthError) {
      return { ok: false, message: error.message, blockers: [] };
    }
    throw error;
  }
}
