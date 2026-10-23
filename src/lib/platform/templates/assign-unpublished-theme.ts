/**
 * Master Admin assignment of an unpublished template theme.
 * Owners continue to use the selectable catalog only.
 */
import type { PrismaClient } from "@prisma/client";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import { ProvisioningActionError } from "@/lib/platform/provisioning/errors";
import { PROVISIONING_RESERVED_SLUGS } from "@/lib/platform/provisioning/constants";
import { requireMasterAdminAssignableThemeId } from "@/lib/tenancy/templates";

export type AssignUnpublishedThemeResult = {
  outcome: "assigned" | "already_assigned";
  workspaceId: string;
  themeId: string;
};

export async function assignUnpublishedWorkspaceTheme(input: {
  prisma: PrismaClient;
  operatorId: string;
  workspaceId: string;
  themeId: unknown;
}): Promise<AssignUnpublishedThemeResult> {
  const db = input.prisma;
  const operator = await db.platformOperator.findUnique({
    where: { id: input.operatorId },
    select: { role: true, status: true },
  });
  if (!operator || operator.status !== "ACTIVE" || operator.role !== "MASTER_ADMIN") {
    throw new ProvisioningActionError(
      "Master Admin authorization required.",
      "MASTER_ADMIN_REQUIRED",
      403,
    );
  }

  const themeId = requireMasterAdminAssignableThemeId(input.themeId);
  const workspace = await db.workspace.findUnique({
    where: { id: input.workspaceId },
    select: { id: true, slug: true, name: true },
  });
  if (!workspace) {
    throw new ProvisioningActionError("Workspace not found.", "WORKSPACE_NOT_FOUND", 404);
  }
  if ((PROVISIONING_RESERVED_SLUGS as readonly string[]).includes(workspace.slug)) {
    throw new ProvisioningActionError(
      "Reserved platform workspaces cannot receive this assignment.",
      "RESERVED_SLUG",
      409,
    );
  }

  const branding = await db.workspaceBranding.findUnique({
    where: { workspaceId: workspace.id },
    select: { themeId: true },
  });
  if (branding?.themeId === themeId) {
    return { outcome: "already_assigned", workspaceId: workspace.id, themeId };
  }

  if (!branding) {
    await db.workspaceBranding.create({
      data: {
        workspaceId: workspace.id,
        tier: "GENERIC",
        displayName: workspace.name,
        themeId,
        poweredByHouzzatPro: true,
      },
    });
  } else {
    await db.workspaceBranding.update({
      where: { workspaceId: workspace.id },
      data: { themeId },
    });
  }

  await writePlatformAuditEvent(
    {
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: "UNPUBLISHED_THEME_ASSIGNED",
      entityType: "WorkspaceBranding",
      entityId: workspace.id,
      summary: "Assigned unpublished workspace theme",
      metadata: { workspaceId: workspace.id, themeId },
    },
    db,
  );

  return { outcome: "assigned", workspaceId: workspace.id, themeId };
}
