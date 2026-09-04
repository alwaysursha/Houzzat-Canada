/**
 * Stage 6.10A — authenticated OWNER onboarding foundation (non-design).
 * templateThemeStatus must remain NOT_STARTED.
 */

import type { PrismaClient } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma as defaultPrisma } from "@/lib/prisma";
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

async function requireOwnerSessionUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new OwnerActivationError("Sign in required", "UNAUTHENTICATED", 401);
  }
  return userId;
}

export async function listOwnerOnboardingWorkspaces(input?: {
  prisma?: PrismaClient;
}): Promise<OwnerOnboardingWorkspace[]> {
  const db = input?.prisma ?? defaultPrisma;
  const userId = await requireOwnerSessionUserId();

  const memberships = await db.workspaceMember.findMany({
    where: {
      userId,
      role: "OWNER",
      status: "ACTIVE",
      workspace: { status: { in: ["ACTIVE", "TRIAL"] } },
    },
    select: {
      workspace: {
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
      },
    },
  });

  const items: OwnerOnboardingWorkspace[] = [];
  for (const m of memberships) {
    await ensureWorkspaceOnboardingState(db, m.workspace.id);
    const onboarding =
      (await db.workspaceOnboardingState.findUnique({
        where: { workspaceId: m.workspace.id },
      })) ?? null;

    items.push({
      workspaceId: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      displayName: m.workspace.branding?.displayName ?? m.workspace.name,
      contactEmail:
        m.workspace.branding?.contactEmail ??
        m.workspace.emailIdentity?.contactEmail ??
        null,
      contactPhone: m.workspace.branding?.contactPhone ?? null,
      replyToEmail: m.workspace.emailIdentity?.replyToEmail ?? null,
      senderDisplayName: m.workspace.emailIdentity?.senderDisplayName ?? null,
      emailDomainStatus: m.workspace.emailIdentity?.domainStatus ?? "NONE",
      onboarding: {
        accountActivatedAt: onboarding?.accountActivatedAt?.toISOString() ?? null,
        businessProfileStatus: onboarding?.businessProfileStatus ?? "NOT_STARTED",
        brandingStatus: onboarding?.brandingStatus ?? "NOT_STARTED",
        templateThemeStatus: onboarding?.templateThemeStatus ?? "NOT_STARTED",
        emailIdentityStatus: onboarding?.emailIdentityStatus ?? "NOT_STARTED",
        completedAt: onboarding?.completedAt?.toISOString() ?? null,
      },
    });
  }

  return items;
}

export async function updateOwnerOnboardingBusinessProfile(input: {
  workspaceId: string;
  displayName: string;
  contactEmail: string;
  contactPhone?: string | null;
  replyToEmail?: string | null;
  senderDisplayName?: string | null;
  prisma?: PrismaClient;
}): Promise<OwnerOnboardingWorkspace> {
  const db = input.prisma ?? defaultPrisma;
  const userId = await requireOwnerSessionUserId();

  const membership = await db.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: input.workspaceId,
        userId,
      },
    },
    select: { role: true, status: true },
  });

  if (
    !membership ||
    membership.role !== "OWNER" ||
    membership.status !== "ACTIVE"
  ) {
    throw new OwnerActivationError(
      "Owner membership required",
      "FORBIDDEN",
      403,
    );
  }

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

  await ensureWorkspaceOnboardingState(db, input.workspaceId);

  const branding = await db.workspaceBranding.findUnique({
    where: { workspaceId: input.workspaceId },
    select: { workspaceId: true },
  });
  if (branding) {
    await db.workspaceBranding.update({
      where: { workspaceId: input.workspaceId },
      data: {
        displayName,
        contactEmail,
        contactPhone: input.contactPhone?.trim() || null,
      },
    });
  }

  await db.workspace.update({
    where: { id: input.workspaceId },
    data: { name: displayName },
  });

  const emailIdentity = await db.workspaceEmailIdentity.findUnique({
    where: { workspaceId: input.workspaceId },
    select: { workspaceId: true, domainStatus: true },
  });
  if (emailIdentity) {
    await db.workspaceEmailIdentity.update({
      where: { workspaceId: input.workspaceId },
      data: {
        contactEmail,
        replyToEmail:
          input.replyToEmail?.trim().toLowerCase() || contactEmail,
        senderDisplayName:
          input.senderDisplayName?.trim() || displayName,
        // Never invent verified custom domains.
        domainStatus: emailIdentity.domainStatus === "NONE"
          ? "NONE"
          : emailIdentity.domainStatus,
      },
    });
  }

  const onboarding = await db.workspaceOnboardingState.findUnique({
    where: { workspaceId: input.workspaceId },
  });
  if (onboarding) {
    await db.workspaceOnboardingState.update({
      where: { workspaceId: input.workspaceId },
      data: {
        businessProfileStatus: "COMPLETE",
        emailIdentityStatus: "COMPLETE",
        // Locked for Stage 6.10A — owner template design decision required later.
        templateThemeStatus: "NOT_STARTED",
        brandingStatus:
          onboarding.brandingStatus === "COMPLETE"
            ? "COMPLETE"
            : "NOT_STARTED",
      },
    });
  }

  const items = await listOwnerOnboardingWorkspaces({ prisma: db });
  const hit = items.find((i) => i.workspaceId === input.workspaceId);
  if (!hit) {
    throw new OwnerActivationError(
      "Workspace not found after update",
      "NOT_FOUND",
      404,
    );
  }
  return hit;
}
