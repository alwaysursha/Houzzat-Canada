/**
 * Phase 1 safety — never delete a managed agent-profile CDN object while any
 * surviving DB row still references its public URL.
 *
 * Checks globally across User.image and WorkspaceBranding.agentProfilePhotoUrl
 * (all workspaces). Prefer retaining an orphan over deleting a shared image.
 */

import { prisma as defaultPrisma } from "@/lib/prisma";
import { extractManagedProfileObjectKeyFromUrl } from "@/lib/tenancy/branding-assets/keys";
import { deleteBrandingAssetObject } from "@/lib/tenancy/branding-assets/storage";
import type { PrismaClient } from "@prisma/client";

export type ManagedProfileCdnDeleteResult =
  | "deleted"
  | "retained_referenced"
  | "skipped";

function trimUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() || null;
  return trimmed || null;
}

/**
 * True when any User.image or workspace branding portrait still points at url.
 * Optional excludes apply after the caller has already moved those rows off url.
 */
export async function isManagedAgentProfileUrlReferenced(input: {
  url: string;
  prisma?: PrismaClient;
  excludeUserIds?: string[];
  excludeBrandingWorkspaceIds?: string[];
}): Promise<boolean> {
  const url = trimUrl(input.url);
  if (!url) return false;
  const db = input.prisma ?? defaultPrisma;
  const excludeUsers = (input.excludeUserIds ?? [])
    .map((id) => id.trim())
    .filter(Boolean);
  const excludeWorkspaces = (input.excludeBrandingWorkspaceIds ?? [])
    .map((id) => id.trim())
    .filter(Boolean);

  const userHit = await db.user.findFirst({
    where: {
      image: url,
      ...(excludeUsers.length > 0 ? { id: { notIn: excludeUsers } } : {}),
    },
    select: { id: true },
  });
  if (userHit) return true;

  const brandingHit = await db.workspaceBranding.findFirst({
    where: {
      agentProfilePhotoUrl: url,
      ...(excludeWorkspaces.length > 0
        ? { workspaceId: { notIn: excludeWorkspaces } }
        : {}),
    },
    select: { workspaceId: true },
  });
  return Boolean(brandingHit);
}

/**
 * Delete a managed agent-profile / per-agent profile object only when unreferenced.
 * workspaceId scopes key extraction (tenant path must match).
 */
export async function deleteManagedAgentProfileUrlIfUnreferenced(input: {
  url: string | null | undefined;
  workspaceId: string;
  prisma?: PrismaClient;
  excludeUserIds?: string[];
  excludeBrandingWorkspaceIds?: string[];
}): Promise<ManagedProfileCdnDeleteResult> {
  const url = trimUrl(input.url);
  const workspaceId = input.workspaceId.trim();
  if (!url || !workspaceId) return "skipped";

  const key = extractManagedProfileObjectKeyFromUrl(url, workspaceId);
  if (!key) return "skipped";

  const referenced = await isManagedAgentProfileUrlReferenced({
    url,
    prisma: input.prisma,
    excludeUserIds: input.excludeUserIds,
    excludeBrandingWorkspaceIds: input.excludeBrandingWorkspaceIds,
  });
  if (referenced) return "retained_referenced";

  await deleteBrandingAssetObject(key);
  return "deleted";
}
