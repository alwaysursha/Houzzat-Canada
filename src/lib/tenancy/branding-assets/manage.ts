/**
 * Stage 6.11C.1 — host-bound OWNER branding asset upload / replace / remove.
 */

import { OwnerActivationError } from "@/lib/platform/activation/errors";
import { requireHostBoundOwnerOnboardingContext } from "@/lib/platform/activation/onboarding";
import type { HostBoundOwnerOnboardingContext } from "@/lib/platform/activation/onboarding";
import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  brandingAssetColumn,
  isBrandingAssetKind,
  type BrandingAssetKind,
} from "@/lib/tenancy/branding-assets/kinds";
import { buildBrandingObjectKey } from "@/lib/tenancy/branding-assets/keys";
import { evaluateBrandingStatus } from "@/lib/tenancy/branding-assets/requirements";
import {
  deleteBrandingAssetByPersistedUrl,
  putBrandingAssetObject,
  BrandingStorageNotConfiguredError,
} from "@/lib/tenancy/branding-assets/storage";
import { validateBrandingImageBytes } from "@/lib/tenancy/branding-assets/validate";
import {
  resolveTemplateIdFromThemeId,
  getTemplate,
  type TemplateCategory,
} from "@/lib/tenancy/templates";
import type { HostResolutionDeps } from "@/lib/tenancy/resolve-workspace-host";
import { ensureWorkspaceOnboardingState } from "@/lib/platform/activation/onboarding-state";
import { syncProfessionalIdentityStatus } from "@/lib/tenancy/professional-identity/manage";
import type { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

export type BrandingAssetsView = {
  agentProfilePhotoUrl: string | null;
  logoUrl: string | null;
  brokerageLogoUrl: string | null;
  faviconUrl: string | null;
  brandingStatus: string;
  templateCategory: TemplateCategory;
};

async function resolveCategoryForWorkspace(
  db: PrismaClient,
  workspaceId: string,
): Promise<TemplateCategory> {
  const row = await db.workspaceBranding.findUnique({
    where: { workspaceId },
    select: { themeId: true },
  });
  const templateId = resolveTemplateIdFromThemeId(row?.themeId);
  return getTemplate(templateId)?.category ?? "DEFAULT";
}

async function syncBrandingStatus(
  db: PrismaClient,
  workspaceId: string,
  assets: {
    agentProfilePhotoUrl: string | null;
    logoUrl: string | null;
    brokerageLogoUrl: string | null;
    faviconUrl: string | null;
  },
): Promise<"COMPLETE" | "NOT_STARTED"> {
  const category = await resolveCategoryForWorkspace(db, workspaceId);
  const status = evaluateBrandingStatus({ category, assets });
  await ensureWorkspaceOnboardingState(db, workspaceId);
  await db.workspaceOnboardingState.update({
    where: { workspaceId },
    data: { brandingStatus: status },
  });
  return status;
}

async function loadAssetsView(
  db: PrismaClient,
  workspaceId: string,
): Promise<BrandingAssetsView> {
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
  if (!branding) {
    throw new OwnerActivationError(
      "Workspace branding not found",
      "NOT_FOUND",
      404,
    );
  }
  const category = await resolveCategoryForWorkspace(db, workspaceId);
  const onboarding = await db.workspaceOnboardingState.findUnique({
    where: { workspaceId },
    select: { brandingStatus: true },
  });
  return {
    agentProfilePhotoUrl: branding.agentProfilePhotoUrl,
    logoUrl: branding.logoUrl,
    brokerageLogoUrl: branding.brokerageLogoUrl,
    faviconUrl: branding.faviconUrl,
    brandingStatus: onboarding?.brandingStatus ?? "NOT_STARTED",
    templateCategory: category,
  };
}

export async function uploadWorkspaceBrandingAsset(input: {
  request: Request;
  kind: unknown;
  file: File;
  clientWorkspaceId?: string | null;
  prisma?: PrismaClient;
  hostDeps?: HostResolutionDeps;
  userId?: string;
}): Promise<BrandingAssetsView> {
  if (!isBrandingAssetKind(input.kind)) {
    throw new OwnerActivationError(
      "Invalid branding asset kind",
      "INVALID_ASSET_KIND",
      400,
    );
  }
  const kind: BrandingAssetKind = input.kind;
  const db = input.prisma ?? defaultPrisma;

  const ctx = await requireHostBoundOwnerOnboardingContext({
    request: input.request,
    prisma: db,
    hostDeps: input.hostDeps,
    userId: input.userId,
    clientWorkspaceId: input.clientWorkspaceId,
  });

  const buffer = await input.file.arrayBuffer();
  const validated = validateBrandingImageBytes(buffer, kind);
  if ("code" in validated) {
    throw new OwnerActivationError(
      validated.message,
      validated.code,
      400,
    );
  }

  const branding = await db.workspaceBranding.findUnique({
    where: { workspaceId: ctx.workspaceId },
    select: {
      agentProfilePhotoUrl: true,
      logoUrl: true,
      brokerageLogoUrl: true,
      faviconUrl: true,
      version: true,
    },
  });
  if (!branding) {
    throw new OwnerActivationError(
      "Workspace branding not found",
      "NOT_FOUND",
      404,
    );
  }

  const column = brandingAssetColumn(kind);
  const previousUrl = branding[column];
  const uniqueId = randomBytes(12).toString("hex");
  const objectKey = buildBrandingObjectKey({
    workspaceId: ctx.workspaceId,
    kind,
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

  await db.workspaceBranding.update({
    where: { workspaceId: ctx.workspaceId },
    data: {
      [column]: put.publicUrl,
      version: { increment: 1 },
    },
  });

  // Best-effort delete previous object after successful persist.
  await deleteBrandingAssetByPersistedUrl({
    url: previousUrl,
    workspaceId: ctx.workspaceId,
  });

  const next = {
    agentProfilePhotoUrl:
      column === "agentProfilePhotoUrl"
        ? put.publicUrl
        : branding.agentProfilePhotoUrl,
    logoUrl: column === "logoUrl" ? put.publicUrl : branding.logoUrl,
    brokerageLogoUrl:
      column === "brokerageLogoUrl"
        ? put.publicUrl
        : branding.brokerageLogoUrl,
    faviconUrl: column === "faviconUrl" ? put.publicUrl : branding.faviconUrl,
  };

  await syncBrandingStatus(db, ctx.workspaceId, next);
  if (column === "brokerageLogoUrl") {
    await syncProfessionalIdentityStatus(db, ctx.workspaceId);
  }
  return loadAssetsView(db, ctx.workspaceId);
}

export async function removeWorkspaceBrandingAsset(input: {
  request: Request;
  kind: unknown;
  clientWorkspaceId?: string | null;
  prisma?: PrismaClient;
  hostDeps?: HostResolutionDeps;
  userId?: string;
}): Promise<BrandingAssetsView> {
  if (!isBrandingAssetKind(input.kind)) {
    throw new OwnerActivationError(
      "Invalid branding asset kind",
      "INVALID_ASSET_KIND",
      400,
    );
  }
  const kind: BrandingAssetKind = input.kind;
  const db = input.prisma ?? defaultPrisma;

  const ctx = await requireHostBoundOwnerOnboardingContext({
    request: input.request,
    prisma: db,
    hostDeps: input.hostDeps,
    userId: input.userId,
    clientWorkspaceId: input.clientWorkspaceId,
  });

  const branding = await db.workspaceBranding.findUnique({
    where: { workspaceId: ctx.workspaceId },
    select: {
      agentProfilePhotoUrl: true,
      logoUrl: true,
      brokerageLogoUrl: true,
      faviconUrl: true,
    },
  });
  if (!branding) {
    throw new OwnerActivationError(
      "Workspace branding not found",
      "NOT_FOUND",
      404,
    );
  }

  const column = brandingAssetColumn(kind);
  const previousUrl = branding[column];

  await db.workspaceBranding.update({
    where: { workspaceId: ctx.workspaceId },
    data: {
      [column]: null,
      version: { increment: 1 },
    },
  });

  await deleteBrandingAssetByPersistedUrl({
    url: previousUrl,
    workspaceId: ctx.workspaceId,
  });

  const next = {
    agentProfilePhotoUrl:
      column === "agentProfilePhotoUrl" ? null : branding.agentProfilePhotoUrl,
    logoUrl: column === "logoUrl" ? null : branding.logoUrl,
    brokerageLogoUrl:
      column === "brokerageLogoUrl" ? null : branding.brokerageLogoUrl,
    faviconUrl: column === "faviconUrl" ? null : branding.faviconUrl,
  };

  await syncBrandingStatus(db, ctx.workspaceId, next);
  if (column === "brokerageLogoUrl") {
    await syncProfessionalIdentityStatus(db, ctx.workspaceId);
  }
  return loadAssetsView(db, ctx.workspaceId);
}

/** Re-evaluate brandingStatus after template/theme changes (no asset mutation). */
export async function refreshWorkspaceBrandingStatus(input: {
  workspaceId: string;
  prisma?: PrismaClient;
}): Promise<"COMPLETE" | "NOT_STARTED"> {
  const db = input.prisma ?? defaultPrisma;
  const branding = await db.workspaceBranding.findUnique({
    where: { workspaceId: input.workspaceId },
    select: {
      agentProfilePhotoUrl: true,
      logoUrl: true,
      brokerageLogoUrl: true,
      faviconUrl: true,
    },
  });
  if (!branding) return "NOT_STARTED";
  return syncBrandingStatus(db, input.workspaceId, branding);
}

/**
 * CRM profile photo — caller already authorized workspace manager.
 * Does not use onboarding OWNER-only host gate (ADMIN managers can save too).
 */
export async function uploadWorkspaceAgentProfilePhoto(input: {
  workspaceId: string;
  file: File;
  prisma?: PrismaClient;
}): Promise<{ agentProfilePhotoUrl: string }> {
  const kind: BrandingAssetKind = "agent-profile";
  const db = input.prisma ?? defaultPrisma;
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) {
    throw new OwnerActivationError("Workspace required", "FORBIDDEN", 403);
  }

  const buffer = await input.file.arrayBuffer();
  const validated = validateBrandingImageBytes(buffer, kind);
  if ("code" in validated) {
    throw new OwnerActivationError(
      validated.message,
      validated.code,
      400,
    );
  }

  const branding = await db.workspaceBranding.findUnique({
    where: { workspaceId },
    select: {
      agentProfilePhotoUrl: true,
      logoUrl: true,
      brokerageLogoUrl: true,
      faviconUrl: true,
    },
  });
  if (!branding) {
    throw new OwnerActivationError(
      "Workspace branding not found",
      "NOT_FOUND",
      404,
    );
  }

  const previousUrl = branding.agentProfilePhotoUrl;
  const uniqueId = randomBytes(12).toString("hex");
  const objectKey = buildBrandingObjectKey({
    workspaceId,
    kind,
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

  await db.workspaceBranding.update({
    where: { workspaceId },
    data: {
      agentProfilePhotoUrl: put.publicUrl,
      version: { increment: 1 },
    },
  });

  await deleteBrandingAssetByPersistedUrl({
    url: previousUrl,
    workspaceId,
  });

  await syncBrandingStatus(db, workspaceId, {
    agentProfilePhotoUrl: put.publicUrl,
    logoUrl: branding.logoUrl,
    brokerageLogoUrl: branding.brokerageLogoUrl,
    faviconUrl: branding.faviconUrl,
  });

  return { agentProfilePhotoUrl: put.publicUrl };
}

export async function removeWorkspaceAgentProfilePhoto(input: {
  workspaceId: string;
  prisma?: PrismaClient;
}): Promise<{ agentProfilePhotoUrl: null }> {
  const db = input.prisma ?? defaultPrisma;
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) {
    throw new OwnerActivationError("Workspace required", "FORBIDDEN", 403);
  }

  const branding = await db.workspaceBranding.findUnique({
    where: { workspaceId },
    select: {
      agentProfilePhotoUrl: true,
      logoUrl: true,
      brokerageLogoUrl: true,
      faviconUrl: true,
    },
  });
  if (!branding) {
    throw new OwnerActivationError(
      "Workspace branding not found",
      "NOT_FOUND",
      404,
    );
  }

  const previousUrl = branding.agentProfilePhotoUrl;
  await db.workspaceBranding.update({
    where: { workspaceId },
    data: {
      agentProfilePhotoUrl: null,
      version: { increment: 1 },
    },
  });

  await deleteBrandingAssetByPersistedUrl({
    url: previousUrl,
    workspaceId,
  });

  await syncBrandingStatus(db, workspaceId, {
    agentProfilePhotoUrl: null,
    logoUrl: branding.logoUrl,
    brokerageLogoUrl: branding.brokerageLogoUrl,
    faviconUrl: branding.faviconUrl,
  });

  return { agentProfilePhotoUrl: null };
}

export type { HostBoundOwnerOnboardingContext };
