/**
 * Stage 6.10A / 6.10C.1 — authenticated OWNER onboarding (non-design).
 * Host-bound authority: hostname → WorkspaceDomain → Workspace → OWNER membership.
 * templateThemeStatus must remain NOT_STARTED.
 */

import type { PrismaClient } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { isPlatformMobileBootstrapHost } from "@/lib/mobile/platform-bootstrap";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/reserved-domains";
import {
  resolveWorkspaceFromHostname,
  type HostResolutionDeps,
} from "@/lib/tenancy/resolve-workspace-host";
import { OwnerActivationError } from "./errors";
import { ensureWorkspaceOnboardingState } from "./onboarding-state";

export type OwnerOnboardingWorkspace = {
  workspaceId: string;
  name: string;
  slug: string;
  displayName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  replyToEmail: string | null;
  senderDisplayName: string | null;
  emailDomainStatus: string;
  onboarding: {
    accountActivatedAt: string | null;
    businessProfileStatus: string;
    brandingStatus: string;
    templateThemeStatus: string;
    emailIdentityStatus: string;
    completedAt: string | null;
  };
};

export type HostBoundOwnerOnboardingContext = {
  userId: string;
  workspaceId: string;
  workspaceSlug: string;
  hostname: string;
};

async function requireSessionUserId(input?: {
  userId?: string;
}): Promise<string> {
  if (input?.userId) return input.userId;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new OwnerActivationError("Sign in required", "UNAUTHENTICATED", 401);
  }
  return userId;
}

/**
 * Resolve onboarding authority from the request hostname only.
 * Client workspaceId is never authoritative.
 */
export async function requireHostBoundOwnerOnboardingContext(input: {
  request: Request;
  prisma?: PrismaClient;
  hostDeps?: HostResolutionDeps;
  /** Test injection — production always uses session auth(). */
  userId?: string;
  /** Optional client-supplied id; mismatch fails. Never used as authority. */
  clientWorkspaceId?: string | null;
}): Promise<HostBoundOwnerOnboardingContext> {
  const db = input.prisma ?? defaultPrisma;
  const userId = await requireSessionUserId({ userId: input.userId });

  const hostname = extractTrustedRequestHostname(input.request);
  if (!hostname) {
    throw new OwnerActivationError(
      "Tenant hostname required",
      "MALFORMED_HOSTNAME",
      400,
    );
  }

  if (
    isPlatformMobileBootstrapHost(hostname) ||
    isHouzzatProPlatformRoot(hostname)
  ) {
    throw new OwnerActivationError(
      "Owner onboarding requires a tenant hostname",
      "PLATFORM_HOST_NO_TENANT_AUTHORITY",
      403,
    );
  }

  const hostResult = await resolveWorkspaceFromHostname(
    hostname,
    input.hostDeps,
  );
  if (!hostResult.ok) {
    const code =
      hostResult.reason === "workspace_inactive" ||
      hostResult.reason === "workspace_suspended"
        ? "WORKSPACE_INACTIVE"
        : hostResult.reason === "domain_inactive"
          ? "DOMAIN_INACTIVE"
          : "TENANCY_DENIED";
    throw new OwnerActivationError(
      "Unable to resolve tenant workspace for this hostname",
      code,
      403,
    );
  }

  // Stage 6.10C.1 — onboarding requires ACTIVE workspace (not TRIAL-only).
  const workspace = await db.workspace.findUnique({
    where: { id: hostResult.workspaceId },
    select: { id: true, slug: true, status: true },
  });
  if (!workspace || workspace.status !== "ACTIVE") {
    throw new OwnerActivationError(
      "Workspace is not ACTIVE",
      "WORKSPACE_INACTIVE",
      403,
    );
  }

  const membership = await db.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId,
      },
    },
    select: { role: true, status: true },
  });

  // Membership role OWNER only — never User.role / PlatformOperator.
  if (
    !membership ||
    membership.status !== "ACTIVE" ||
    membership.role !== "OWNER"
  ) {
    throw new OwnerActivationError(
      "Owner membership required for this tenant",
      "FORBIDDEN",
      403,
    );
  }

  if (
    input.clientWorkspaceId &&
    input.clientWorkspaceId.trim() &&
    input.clientWorkspaceId !== workspace.id
  ) {
    throw new OwnerActivationError(
      "workspaceId does not match request hostname workspace",
      "WORKSPACE_HOST_MISMATCH",
      403,
    );
  }

  return {
    userId,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    hostname: hostResult.normalizedHostname,
  };
}

async function loadOwnerOnboardingWorkspace(
  db: PrismaClient,
  workspaceId: string,
): Promise<OwnerOnboardingWorkspace> {
  await ensureWorkspaceOnboardingState(db, workspaceId);

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      slug: true,
      branding: {
        select: {
          displayName: true,
          contactEmail: true,
          contactPhone: true,
        },
      },
      emailIdentity: {
        select: {
          contactEmail: true,
          replyToEmail: true,
          senderDisplayName: true,
          domainStatus: true,
        },
      },
      onboardingState: true,
    },
  });
  if (!workspace) {
    throw new OwnerActivationError("Workspace not found", "NOT_FOUND", 404);
  }

  const onboarding = workspace.onboardingState;
  return {
    workspaceId: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    displayName: workspace.branding?.displayName ?? workspace.name,
    contactEmail:
      workspace.branding?.contactEmail ??
      workspace.emailIdentity?.contactEmail ??
      null,
    contactPhone: workspace.branding?.contactPhone ?? null,
    replyToEmail: workspace.emailIdentity?.replyToEmail ?? null,
    senderDisplayName: workspace.emailIdentity?.senderDisplayName ?? null,
    emailDomainStatus: workspace.emailIdentity?.domainStatus ?? "NONE",
    onboarding: {
      accountActivatedAt: onboarding?.accountActivatedAt?.toISOString() ?? null,
      businessProfileStatus: onboarding?.businessProfileStatus ?? "NOT_STARTED",
      brandingStatus: onboarding?.brandingStatus ?? "NOT_STARTED",
      templateThemeStatus: onboarding?.templateThemeStatus ?? "NOT_STARTED",
      emailIdentityStatus: onboarding?.emailIdentityStatus ?? "NOT_STARTED",
      completedAt: onboarding?.completedAt?.toISOString() ?? null,
    },
  };
}

/** Host-bound read — returns the hostname workspace only (0–1 items). */
export async function listOwnerOnboardingWorkspaces(input: {
  request: Request;
  prisma?: PrismaClient;
  hostDeps?: HostResolutionDeps;
  userId?: string;
}): Promise<OwnerOnboardingWorkspace[]> {
  const db = input.prisma ?? defaultPrisma;
  const ctx = await requireHostBoundOwnerOnboardingContext({
    request: input.request,
    prisma: db,
    hostDeps: input.hostDeps,
    userId: input.userId,
  });
  const item = await loadOwnerOnboardingWorkspace(db, ctx.workspaceId);
  return [item];
}

export async function updateOwnerOnboardingBusinessProfile(input: {
  request: Request;
  displayName: string;
  contactEmail: string;
  contactPhone?: string | null;
  replyToEmail?: string | null;
  senderDisplayName?: string | null;
  /** Ignored as authority; mismatch fails. */
  clientWorkspaceId?: string | null;
  prisma?: PrismaClient;
  hostDeps?: HostResolutionDeps;
  userId?: string;
}): Promise<OwnerOnboardingWorkspace> {
  const db = input.prisma ?? defaultPrisma;
  const ctx = await requireHostBoundOwnerOnboardingContext({
    request: input.request,
    prisma: db,
    hostDeps: input.hostDeps,
    userId: input.userId,
    clientWorkspaceId: input.clientWorkspaceId,
  });

  const displayName = input.displayName.trim().slice(0, 120);
  const contactEmail = input.contactEmail.trim().toLowerCase();
  if (!displayName) {
    throw new OwnerActivationError(
      "Display name is required",
      "INVALID_DISPLAY_NAME",
      400,
    );
  }
  if (!contactEmail.includes("@")) {
    throw new OwnerActivationError(
      "Contact email is required",
      "INVALID_EMAIL",
      400,
    );
  }

  await ensureWorkspaceOnboardingState(db, ctx.workspaceId);

  const branding = await db.workspaceBranding.findUnique({
    where: { workspaceId: ctx.workspaceId },
    select: { workspaceId: true },
  });
  if (branding) {
    await db.workspaceBranding.update({
      where: { workspaceId: ctx.workspaceId },
      data: {
        displayName,
        contactEmail,
        contactPhone: input.contactPhone?.trim() || null,
      },
    });
  }

  await db.workspace.update({
    where: { id: ctx.workspaceId },
    data: { name: displayName },
  });

  const emailIdentity = await db.workspaceEmailIdentity.findUnique({
    where: { workspaceId: ctx.workspaceId },
    select: { workspaceId: true, domainStatus: true },
  });
  if (emailIdentity) {
    await db.workspaceEmailIdentity.update({
      where: { workspaceId: ctx.workspaceId },
      data: {
        contactEmail,
        replyToEmail:
          input.replyToEmail?.trim().toLowerCase() || contactEmail,
        senderDisplayName: input.senderDisplayName?.trim() || displayName,
        domainStatus:
          emailIdentity.domainStatus === "NONE"
            ? "NONE"
            : emailIdentity.domainStatus,
      },
    });
  }

  const onboarding = await db.workspaceOnboardingState.findUnique({
    where: { workspaceId: ctx.workspaceId },
  });
  if (onboarding) {
    await db.workspaceOnboardingState.update({
      where: { workspaceId: ctx.workspaceId },
      data: {
        businessProfileStatus: "COMPLETE",
        emailIdentityStatus: "COMPLETE",
        // Locked — owner template design decision required later.
        templateThemeStatus: "NOT_STARTED",
        brandingStatus:
          onboarding.brandingStatus === "COMPLETE"
            ? "COMPLETE"
            : "NOT_STARTED",
      },
    });
  }

  return loadOwnerOnboardingWorkspace(db, ctx.workspaceId);
}
