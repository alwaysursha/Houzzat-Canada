"use server";

import { activateItsoSourceRequest } from "@/lib/listings/itso/itso-sources";
import {
  parseItsoSourceRequest,
  readItsoLiveSourceInput,
  recordItsoSourceRequest,
} from "@/lib/listings/itso/itso-source-preference";
import { PlatformOperatorAuthError, requirePlatformOperator } from "@/lib/platform/auth/require-platform-operator";
import { prisma } from "@/lib/prisma";
import { highOctaneDevelopmentListingsEnabled } from "@/lib/tenancy/templates/high-octane-development-listings";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";

export type ItsoSourceActionState = {
  ok: boolean;
  message: string;
  blockers: string[];
};

export async function saveItsoSourceRequest(
  _previous: ItsoSourceActionState | null,
  formData: FormData,
): Promise<ItsoSourceActionState> {
  const requested = parseItsoSourceRequest(formData.get("requested"));
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

    const live = await readItsoLiveSourceInput(workspace.id);
    const activation = activateItsoSourceRequest({
      requested,
      demoEnabled: highOctaneDevelopmentListingsEnabled(),
      live,
    });
    if (!activation.accepted) {
      return {
        ok: false,
        message: "That source is not available.",
        blockers: activation.blockers,
      };
    }

    await recordItsoSourceRequest({
      workspaceId: workspace.id,
      operatorId: operator.operatorId,
      requested,
    });
    return {
      ok: true,
      message:
        requested === "disabled"
          ? "Disabled. This workspace will not serve listing inventory from ITSO."
          : requested === "demo"
            ? "ITSO Demo is selected for authorized development testing."
            : "ITSO Live is selected. Inventory follows the authorized connection.",
      blockers: [],
    };
  } catch (error) {
    if (error instanceof PlatformOperatorAuthError) {
      return { ok: false, message: error.message, blockers: [] };
    }
    throw error;
  }
}
