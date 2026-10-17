/**
 * Phase 1 — canonical per-agent profile photo on User.image.
 *
 * Dual-writes WorkspaceBranding.agentProfilePhotoUrl only when the target
 * user is exactly Workspace.primaryAgentId at commit time (SQL conditional).
 * Never infers OWNER as primary.
 * Never copies the workspace portrait onto unrelated agents.
 *
 * Phase 1 website still reads branding.agentProfilePhotoUrl — removing an
 * individual agent's User.image does NOT clear the public-site portrait.
 * Clearing the workspace public portrait remains an onboarding/branding action.
 */

import { OwnerActivationError } from "@/lib/platform/activation/errors";
import { ensureWorkspaceOnboardingState } from "@/lib/platform/activation/onboarding-state";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { buildAgentEmailHeadshotObjectKey } from "@/lib/tenancy/branding-assets/email-headshot-storage";
import { buildAgentUserProfileObjectKey } from "@/lib/tenancy/branding-assets/keys";
import { deleteManagedAgentProfileUrlIfUnreferenced } from "@/lib/tenancy/branding-assets/managed-profile-cdn";
import { evaluateBrandingStatus } from "@/lib/tenancy/branding-assets/requirements";
import {
  BrandingStorageNotConfiguredError,
  deleteBrandingAssetObject,
  putBrandingAssetObject,
} from "@/lib/tenancy/branding-assets/storage";
import {
  validateBrandingImageBytes,
  validateEmailHeadshotBytes,
} from "@/lib/tenancy/branding-assets/validate";
import {
  getTemplate,
  resolveTemplateIdFromThemeId,
} from "@/lib/tenancy/templates";
import type { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

export type AgentUserProfilePhotoResult = {
  /** Canonical User.image URL (also returned as agentProfilePhotoUrl for API compat). */
  image: string | null;
  agentProfilePhotoUrl: string | null;
  /** True when branding.agentProfilePhotoUrl was updated in this operation. */
  syncedBrandingPortrait: boolean;
  /** primaryAgentId was null at start — website portrait left untouched. */
  primaryAgentUnset: boolean;
  /**
   * True only after the optional email-headshot sibling R2 write succeeded.
   * Never a signature preference / never a public thumbnail URL.
   */
  emailHeadshotStored: boolean;
};

type PhotoDb = Pick<
  PrismaClient,
  | "workspace"
  | "workspaceMember"
  | "workspaceBranding"
  | "user"
  | "$transaction"
  | "$executeRaw"
>;

function trimUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() || null;
  return trimmed || null;
}

async function refreshBrandingStatusAfterPrimarySync(
  db: PrismaClient,
  workspaceId: string,
): Promise<void> {
  const branding = await db.workspaceBranding.findUnique({
    where: { workspaceId },
    select: {
      agentProfilePhotoUrl: true,
      logoUrl: true,
      brokerageLogoUrl: true,
      faviconUrl: true,
      themeId: true,
    },
  });
  if (!branding) return;
  const templateId = resolveTemplateIdFromThemeId(branding.themeId);
  const category = getTemplate(templateId)?.category ?? "DEFAULT";
  const status = evaluateBrandingStatus({
    category,
    assets: {
      agentProfilePhotoUrl: branding.agentProfilePhotoUrl,
      logoUrl: branding.logoUrl,
      brokerageLogoUrl: branding.brokerageLogoUrl,
      faviconUrl: branding.faviconUrl,
    },
  });
  await ensureWorkspaceOnboardingState(db, workspaceId);
  await db.workspaceOnboardingState.update({
    where: { workspaceId },
    data: { brandingStatus: status },
  });
}

async function assertActiveWorkspaceMember(
  db: PhotoDb,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const member = await db.workspaceMember.findFirst({
    where: {
      workspaceId,
      userId,
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN", "AGENT"] },
    },
    select: { userId: true },
  });
  if (!member) {
    throw new OwnerActivationError(
      "Agent not found in this Workspace.",
      "NOT_FOUND",
      404,
    );
  }
}

/**
 * Atomically update branding portrait only while workspace.primaryAgentId
 * still equals userId — prevents stale dual-write after reassignment.
 */
async function syncBrandingPortraitIfStillPrimary(
  tx: { $executeRaw: PrismaClient["$executeRaw"] },
  workspaceId: string,
  userId: string,
  nextUrl: string,
): Promise<boolean> {
  const updated = await tx.$executeRaw`
    UPDATE "WorkspaceBranding" AS b
    SET
      "agentProfilePhotoUrl" = ${nextUrl},
      "version" = b."version" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    FROM "Workspace" AS w
    WHERE b."workspaceId" = w.id
      AND w.id = ${workspaceId}
      AND w."primaryAgentId" = ${userId}
  `;
  return Number(updated) > 0;
}

/**
 * Phase 3D.3 — optional sibling email headshot after canonical photo is durable.
 * Never throws: original upload must succeed even if thumb validation/storage fails.
 * Object key is derived server-side from authenticated workspace/user + upload uniqueId.
 */
async function tryStoreEmailHeadshotSibling(input: {
  workspaceId: string;
  userId: string;
  uniqueId: string;
  file: File;
}): Promise<boolean> {
  try {
    const buffer = await input.file.arrayBuffer();
    const validated = validateEmailHeadshotBytes(buffer);
    if ("code" in validated) {
      console.warn("[agent-profile-photo] email headshot rejected", {
        code: validated.code,
        workspaceId: input.workspaceId,
        userId: input.userId,
      });
      return false;
    }

    const objectKey = buildAgentEmailHeadshotObjectKey({
      workspaceId: input.workspaceId,
      userId: input.userId,
      uniqueId: input.uniqueId,
    });
    if (!objectKey) {
      console.warn("[agent-profile-photo] email headshot key rejected", {
        workspaceId: input.workspaceId,
        userId: input.userId,
      });
      return false;
    }

    await putBrandingAssetObject({
      objectKey,
      bytes: validated.bytes,
      contentType: "image/png",
    });
    return true;
  } catch (error) {
    console.error("[agent-profile-photo] email headshot storage failed", {
      workspaceId: input.workspaceId,
      userId: input.userId,
      error,
    });
    return false;
  }
}

async function loadPrimaryAndBranding(
  db: PhotoDb,
  workspaceId: string,
): Promise<{
  primaryAgentId: string | null;
  branding: {
    agentProfilePhotoUrl: string | null;
    logoUrl: string | null;
    brokerageLogoUrl: string | null;
    faviconUrl: string | null;
  } | null;
}> {
  const [workspace, branding] = await Promise.all([
    db.workspace.findUnique({
      where: { id: workspaceId },
      select: { primaryAgentId: true },
    }),
    db.workspaceBranding.findUnique({
      where: { workspaceId },
      select: {
        agentProfilePhotoUrl: true,
        logoUrl: true,
        brokerageLogoUrl: true,
        faviconUrl: true,
      },
    }),
  ]);
  return {
    primaryAgentId: workspace?.primaryAgentId?.trim() || null,
    branding,
  };
}

/**
 * Upload / replace an agent's User.image. Dual-writes branding only when
 * the user is still Workspace.primaryAgentId at commit time.
 *
 * Optional `emailHeadshot` (Phase 3D.3): validated 240×240 PNG stored as a
 * derived sibling after the canonical photo DB commit. Thumb failures never
 * fail the original upload. Previous email thumbs are not deleted on replace.
 */
export async function uploadAgentUserProfilePhoto(input: {
  workspaceId: string;
  userId: string;
  file: File;
  /** Optional client-generated 240×240 circular PNG; never trusted for keys/URLs. */
  emailHeadshot?: File | null;
  prisma?: PrismaClient;
}): Promise<AgentUserProfilePhotoResult> {
  const db = (input.prisma ?? defaultPrisma) as PhotoDb & PrismaClient;
  const workspaceId = input.workspaceId.trim();
  const userId = input.userId.trim();
  if (!workspaceId || !userId) {
    throw new OwnerActivationError("Workspace required", "FORBIDDEN", 403);
  }

  await assertActiveWorkspaceMember(db, workspaceId, userId);

  const buffer = await input.file.arrayBuffer();
  const validated = validateBrandingImageBytes(buffer, "agent-profile");
  if ("code" in validated) {
    throw new OwnerActivationError(
      validated.message,
      validated.code,
      400,
    );
  }

  const { primaryAgentId, branding } = await loadPrimaryAndBranding(
    db,
    workspaceId,
  );
  if (!branding) {
    throw new OwnerActivationError(
      "Workspace branding not found",
      "NOT_FOUND",
      404,
    );
  }

  const primaryAgentUnset = !primaryAgentId;

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { image: true },
  });
  if (!target) {
    throw new OwnerActivationError("Agent not found.", "NOT_FOUND", 404);
  }

  const previousUserImage = trimUrl(target.image);
  const previousBrandingPhoto = trimUrl(branding.agentProfilePhotoUrl);

  const uniqueId = randomBytes(12).toString("hex");
  const objectKey = buildAgentUserProfileObjectKey({
    workspaceId,
    userId,
    uniqueId,
    ext: validated.ext,
  });

  const put = await putBrandingAssetObject({
    objectKey,
    bytes: validated.bytes,
    contentType: validated.mime,
  }).catch((error: unknown) => {
    if (error instanceof BrandingStorageNotConfiguredError) {
      throw new OwnerActivationError(
        error.message,
        error.code,
        error.status,
      );
    }
    throw error;
  });

  const nextUrl = put.publicUrl;
  let syncedBrandingPortrait = false;

  try {
    syncedBrandingPortrait = await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { image: nextUrl },
      });
      // Conditional: only sync branding while this user is still primary.
      return syncBrandingPortraitIfStillPrimary(
        tx,
        workspaceId,
        userId,
        nextUrl,
      );
    });
  } catch (error) {
    // Compensating: drop the orphaned object we just wrote (never in DB).
    // Email headshot is never written before this point.
    await deleteBrandingAssetObject(objectKey);
    throw error;
  }

  if (syncedBrandingPortrait) {
    await refreshBrandingStatusAfterPrimarySync(db, workspaceId);
  }

  if (previousUserImage && previousUserImage !== nextUrl) {
    await deleteManagedAgentProfileUrlIfUnreferenced({
      url: previousUserImage,
      workspaceId,
      prisma: db,
      excludeUserIds: [userId],
    });
  }
  if (
    syncedBrandingPortrait &&
    previousBrandingPhoto &&
    previousBrandingPhoto !== nextUrl &&
    previousBrandingPhoto !== previousUserImage
  ) {
    await deleteManagedAgentProfileUrlIfUnreferenced({
      url: previousBrandingPhoto,
      workspaceId,
      prisma: db,
      excludeUserIds: [userId],
    });
  }

  // After canonical photo is durable: optional sibling thumb (best-effort).
  let emailHeadshotStored = false;
  if (input.emailHeadshot instanceof File) {
    emailHeadshotStored = await tryStoreEmailHeadshotSibling({
      workspaceId,
      userId,
      uniqueId,
      file: input.emailHeadshot,
    });
  }

  return {
    image: nextUrl,
    agentProfilePhotoUrl: nextUrl,
    syncedBrandingPortrait,
    primaryAgentUnset,
    emailHeadshotStored,
  };
}

/**
 * Clear an agent's User.image only.
 *
 * Phase 1: does NOT clear WorkspaceBranding.agentProfilePhotoUrl — the public
 * website still reads the branding portrait. Removing the workspace public-site
 * portrait remains an onboarding/branding-assets action.
 */
export async function removeAgentUserProfilePhoto(input: {
  workspaceId: string;
  userId: string;
  prisma?: PrismaClient;
}): Promise<AgentUserProfilePhotoResult> {
  const db = (input.prisma ?? defaultPrisma) as PhotoDb & PrismaClient;
  const workspaceId = input.workspaceId.trim();
  const userId = input.userId.trim();
  if (!workspaceId || !userId) {
    throw new OwnerActivationError("Workspace required", "FORBIDDEN", 403);
  }

  await assertActiveWorkspaceMember(db, workspaceId, userId);

  const { primaryAgentId, branding } = await loadPrimaryAndBranding(
    db,
    workspaceId,
  );
  if (!branding) {
    throw new OwnerActivationError(
      "Workspace branding not found",
      "NOT_FOUND",
      404,
    );
  }

  const primaryAgentUnset = !primaryAgentId;

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { image: true },
  });
  if (!target) {
    throw new OwnerActivationError("Agent not found.", "NOT_FOUND", 404);
  }

  const previousUserImage = trimUrl(target.image);

  await db.user.update({
    where: { id: userId },
    data: { image: null },
  });

  if (previousUserImage) {
    await deleteManagedAgentProfileUrlIfUnreferenced({
      url: previousUserImage,
      workspaceId,
      prisma: db,
      excludeUserIds: [userId],
    });
  }

  return {
    image: null,
    agentProfilePhotoUrl: null,
    // Phase 1 never mutates the website branding portrait on personal remove.
    syncedBrandingPortrait: false,
    primaryAgentUnset,
    emailHeadshotStored: false,
  };
}

/**
 * Whether the actor may mutate the target member's User.image photo.
 * Self: always (when ACTIVE member). Managers: any ACTIVE member in workspace.
 */
export function canMutateAgentUserProfilePhoto(input: {
  actorUserId: string;
  targetUserId: string;
  canManageWorkspace: boolean;
}): boolean {
  if (input.actorUserId === input.targetUserId) return true;
  return input.canManageWorkspace;
}
