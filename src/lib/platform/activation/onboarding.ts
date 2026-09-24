/**
 * Stage 6.10A / 6.10C.1 / 6.11A — authenticated OWNER onboarding.
 * Host-bound authority: hostname → WorkspaceDomain → Workspace → OWNER membership.
 * Stage 6.11A — Default template + six themes (themeId on WorkspaceBranding).
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
import {
  getThemeById,
  listOwnerWebsiteDesignTemplateOptions,
  parseThemeId,
  requireValidOwnerPersistableThemeId,
  resolveOnboardingCategoryFromThemeId,
  resolveTemplateIdFromThemeId,
  getTemplate,
  isValidConfiguredTeamSignatureTheme,
  TEAM_SIGNATURE_TEMPLATE_ID,
  type ImplementedTemplateId,
  type OnboardingTemplateOption,
  type TemplateCategory,
} from "@/lib/tenancy/templates";
import { resolveWorkspacePlanCapabilities } from "@/lib/platform/entitlements";
import { OwnerActivationError } from "./errors";
import { ensureWorkspaceOnboardingState } from "./onboarding-state";
import { evaluateBrandingStatus } from "@/lib/tenancy/branding-assets/requirements";
import {
  evaluateProfessionalIdentityStatus,
  evaluateWebsiteSetupComplete,
  listMissingWebsiteSetupFields,
  WEBSITE_SETUP_FIELD_LABELS,
  type WebsiteSetupMissingFieldKey,
} from "@/lib/tenancy/professional-identity";
import {
  syncProfessionalIdentityStatus,
  upsertProfessionalIdentityFields,
} from "@/lib/tenancy/professional-identity/manage";
import {
  evaluateTeamSignatureDataReadiness,
  type TeamSignatureDataReadiness,
} from "@/lib/tenancy/team-roster/readiness";
import { applyOwnerCanonicalProfileFromCurrentSave } from "./sync-owner-canonical-profile";
import {
  applyOnboardingContinuityPrefill,
  type OnboardingContinuityLocks,
} from "./onboarding-continuity";

export type OwnerOnboardingThemeOption = {
  id: string;
  label: string;
  description: string;
  swatch: {
    primary: string;
    secondary: string;
    accent: string;
    surfaceTint: string;
  };
};

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
  /** Persisted WorkspaceBranding.themeId (null until owner selects). */
  themeId: string | null;
  templateCategory: TemplateCategory;
  templateId: ImplementedTemplateId;
  templateLabel: string;
  /** Full selectable catalog for Website Design UI. */
  templateOptions: OnboardingTemplateOption[];
  /** Themes for the currently selected template (compat with 6.11A clients). */
  themeOptions: OwnerOnboardingThemeOption[];
  /** Current Subscription.planCode — not a client-supplied label. */
  planCode: string | null;
  /** Provisioned TEAM_MANAGEMENT. When false, Team roster UI and readiness are omitted. */
  teamRosterEnabled: boolean;
  /** Stage 6.11C.1 — workspace brand asset URLs for Website Setup. */
  brandAssets: {
    agentProfilePhotoUrl: string | null;
    logoUrl: string | null;
    brokerageLogoUrl: string | null;
    faviconUrl: string | null;
  };
  /** Stage 6.11D — professional + brokerage identity fields. */
  professionalIdentity: {
    agentRegisteredName: string | null;
    agentDesignation: string | null;
    agentCellPhone: string | null;
    recoLicenseNumber: string | null;
    recoLicenseExpiresAt: string | null;
    brokerageRegisteredName: string | null;
    brokerageFax: string | null;
    brokeragePhone: string | null;
    brokerageAddress: string | null;
  };
  /**
   * Book Demo / User-confirmed identity locks for onboarding UI.
   * True ⇒ field is prefilled from authoritative sales data and read-only.
   */
  identityLocks: OnboardingContinuityLocks;
  /**
   * Stage 6.11E.8 — server-authoritative Team Signature data readiness.
   * Null when the plan does not include Team roster (SOLO).
   */
  teamSignatureDataReadiness: TeamSignatureDataReadiness | null;
  onboarding: {
    accountActivatedAt: string | null;
    businessProfileStatus: string;
    brandingStatus: string;
    professionalIdentityStatus: string;
    templateThemeStatus: string;
    emailIdentityStatus: string;
    completedAt: string | null;
    /** True only when business, branding, identity, and theme steps are COMPLETE. */
    websiteSetupComplete: boolean;
    /** Server-computed missing Website Setup fields (human labels). */
    websiteSetupMissingFields: string[];
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
      brokerageAffiliation: true,
      branding: {
        select: {
          displayName: true,
          contactEmail: true,
          contactPhone: true,
          themeId: true,
          agentProfilePhotoUrl: true,
          logoUrl: true,
          brokerageLogoUrl: true,
          faviconUrl: true,
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
      professionalIdentity: {
        select: {
          agentRegisteredName: true,
          agentDesignation: true,
          agentCellPhone: true,
          brokerageRegisteredName: true,
          brokerageFax: true,
          brokeragePhone: true,
          brokerageAddress: true,
        },
      },
      teamProfile: {
        select: { leaderMemberId: true },
      },
      onboardingState: true,
    },
  });
  if (!workspace) {
    throw new OwnerActivationError("Workspace not found", "NOT_FOUND", 404);
  }

  const teamMembers = await db.workspaceTeamMember.findMany({
    where: { workspaceId },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      designation: true,
      photoUrl: true,
      isVisible: true,
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  const ownerMember = await db.workspaceMember.findFirst({
    where: { workspaceId, role: "OWNER", status: "ACTIVE" },
    select: {
      user: {
        select: {
          name: true,
          phone: true,
          agentProfile: {
            select: {
              recoLicenseNumber: true,
              recoLicenseExpiresAt: true,
            },
          },
        },
      },
    },
  });

  // Linked Book Demo prospect (when this workspace came from paid offer provision).
  const linkedOffer = await db.subscription.findFirst({
    where: {
      workspaceId,
      offerId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: {
      offer: {
        select: {
          acceptance: { select: { acceptedEmail: true } },
          prospect: {
            select: {
              contactName: true,
              phone: true,
              brokerageName: true,
              email: true,
            },
          },
        },
      },
    },
  });
  const prospect = linkedOffer?.offer?.prospect ?? null;
  const acceptedEmail = linkedOffer?.offer?.acceptance?.acceptedEmail ?? null;

  const plan = await resolveWorkspacePlanCapabilities(workspaceId, db);
  const persistedThemeId = workspace.branding?.themeId ?? null;
  const templateOptions = listOwnerWebsiteDesignTemplateOptions({
    teamRosterEnabled: plan.teamRosterEnabled,
    includeTemplateId: resolveTemplateIdFromThemeId(persistedThemeId),
  });
  const validTheme = getThemeById(persistedThemeId);
  const parsed = validTheme ? parseThemeId(validTheme.id) : null;
  const catalogTemplate = parsed ? getTemplate(parsed.templateId) : null;
  const selectedTemplate =
    (catalogTemplate?.presentationReady
      ? templateOptions.find((t) => t.id === catalogTemplate.id)
      : null) ??
    templateOptions.find((t) => t.id === parsed?.templateId) ??
    templateOptions[0]!;
  // Category from persisted presentation-ready theme.
  // Null/invalid theme → DEFAULT. SOLO never evaluates as TEAM.
  const evaluationCategory: TemplateCategory =
    resolveOnboardingCategoryFromThemeId(
      persistedThemeId,
      plan.teamRosterEnabled,
    );
  const onboarding = workspace.onboardingState;

  const brandAssets = {
    agentProfilePhotoUrl: workspace.branding?.agentProfilePhotoUrl ?? null,
    logoUrl: workspace.branding?.logoUrl ?? null,
    brokerageLogoUrl: workspace.branding?.brokerageLogoUrl ?? null,
    faviconUrl: workspace.branding?.faviconUrl ?? null,
  };

  const professionalIdentityBase = {
    agentRegisteredName:
      workspace.professionalIdentity?.agentRegisteredName ?? null,
    agentDesignation: workspace.professionalIdentity?.agentDesignation ?? null,
    agentCellPhone: workspace.professionalIdentity?.agentCellPhone ?? null,
    recoLicenseNumber:
      ownerMember?.user.agentProfile?.recoLicenseNumber ?? null,
    recoLicenseExpiresAt: recoExpiryInputValue(
      ownerMember?.user.agentProfile?.recoLicenseExpiresAt ?? null,
    ),
    brokerageRegisteredName:
      workspace.professionalIdentity?.brokerageRegisteredName ?? null,
    brokerageFax:
      workspace.professionalIdentity?.brokerageFax ?? null,
    brokeragePhone: workspace.professionalIdentity?.brokeragePhone ?? null,
    brokerageAddress: workspace.professionalIdentity?.brokerageAddress ?? null,
  };

  const displayName =
    workspace.branding?.displayName ?? workspace.name;
  const contactEmailBase =
    workspace.branding?.contactEmail ??
    workspace.emailIdentity?.contactEmail ??
    null;

  const continuity = applyOnboardingContinuityPrefill({
    professionalIdentity: professionalIdentityBase,
    contactEmail: contactEmailBase,
    sources: {
      prospectContactName: prospect?.contactName ?? null,
      prospectPhone: prospect?.phone ?? null,
      prospectBrokerageName: prospect?.brokerageName ?? null,
      prospectEmail: prospect?.email ?? null,
      acceptedEmail,
      userName: ownerMember?.user.name ?? null,
      userPhone: ownerMember?.user.phone ?? null,
      workspaceBrokerageAffiliation: workspace.brokerageAffiliation ?? null,
    },
  });
  const professionalIdentity = continuity.professionalIdentity;
  const contactEmail = continuity.contactEmail;
  const identityLocks = continuity.locks;

  const teamSignatureDataReadiness = plan.teamRosterEnabled
    ? evaluateTeamSignatureDataReadiness({
        workspaceId,
        displayName,
        contactEmail,
        logoUrl: brandAssets.logoUrl,
        identity: professionalIdentity,
        brokerageLogoUrl: brandAssets.brokerageLogoUrl,
        leaderMemberId: workspace.teamProfile?.leaderMemberId ?? null,
        members: teamMembers,
      })
    : {
        ready: true,
        missing: [],
        missingLabels: [],
        sections: {
          business: true,
          branding: true,
          brokerage: true,
          roster: true,
          leader: true,
        },
      };

  // Keep brandingStatus coherent with category requirements on every load.
  const evaluatedBranding = evaluateBrandingStatus({
    category: evaluationCategory,
    assets: brandAssets,
  });
  if (
    onboarding &&
    onboarding.brandingStatus !== evaluatedBranding &&
    !(
      !plan.teamRosterEnabled &&
      onboarding.brandingStatus === "COMPLETE"
    )
  ) {
    await db.workspaceOnboardingState.update({
      where: { workspaceId },
      data: { brandingStatus: evaluatedBranding },
    });
  }

  const evaluatedIdentity = evaluateProfessionalIdentityStatus({
    identity: professionalIdentity,
    assets: { brokerageLogoUrl: brandAssets.brokerageLogoUrl },
    category: evaluationCategory,
  });
  // Never promote identity to COMPLETE on load/draft reload — only explicit
  // professional_identity save (syncProfessionalIdentityStatus) may complete.
  let professionalIdentityStatus =
    onboarding?.professionalIdentityStatus ?? "NOT_STARTED";
  if (
    evaluatedIdentity === "NOT_STARTED" &&
    !(
      !plan.teamRosterEnabled &&
      professionalIdentityStatus === "COMPLETE"
    )
  ) {
    professionalIdentityStatus = "NOT_STARTED";
  }
  if (
    onboarding &&
    onboarding.professionalIdentityStatus !== professionalIdentityStatus
  ) {
    await db.workspaceOnboardingState.update({
      where: { workspaceId },
      data: { professionalIdentityStatus },
    });
  }

  const businessProfileStatus =
    onboarding?.businessProfileStatus ?? "NOT_STARTED";
  let templateThemeStatus =
    onboarding?.templateThemeStatus ?? "NOT_STARTED";

  // Keep templateThemeStatus coherent with Team presentation-ready theme
  // configuration.
  if (evaluationCategory === "TEAM" && plan.teamRosterEnabled) {
    const teamThemeConfigured =
      isValidConfiguredTeamSignatureTheme(persistedThemeId);
    const nextStatus = teamThemeConfigured ? "COMPLETE" : "NOT_STARTED";
    if (onboarding && templateThemeStatus !== nextStatus) {
      await db.workspaceOnboardingState.update({
        where: { workspaceId },
        data: { templateThemeStatus: nextStatus },
      });
    }
    templateThemeStatus = nextStatus;
  }

  const websiteSetupMissingKeys = listMissingWebsiteSetupFields({
    category: evaluationCategory,
    businessProfileStatus,
    templateThemeStatus,
    identity: professionalIdentity,
    assets: {
      agentProfilePhotoUrl: brandAssets.agentProfilePhotoUrl,
      brokerageLogoUrl: brandAssets.brokerageLogoUrl,
      logoUrl: brandAssets.logoUrl,
    },
    teamSignatureReadiness: plan.teamRosterEnabled
      ? teamSignatureDataReadiness
      : null,
    themeId: persistedThemeId,
    teamRosterEnabled: plan.teamRosterEnabled,
  });
  const websiteSetupComplete = evaluateWebsiteSetupComplete({
    businessProfileStatus,
    brandingStatus:
      !plan.teamRosterEnabled && onboarding?.brandingStatus === "COMPLETE"
        ? "COMPLETE"
        : evaluatedBranding,
    professionalIdentityStatus,
    templateThemeStatus,
    category: evaluationCategory,
    teamSignatureDataReady: plan.teamRosterEnabled
      ? teamSignatureDataReadiness.ready
      : true,
    themeId: persistedThemeId,
    teamRosterEnabled: plan.teamRosterEnabled,
  });

  return {
    workspaceId: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    displayName,
    contactEmail,
    contactPhone: workspace.branding?.contactPhone ?? null,
    replyToEmail: workspace.emailIdentity?.replyToEmail ?? null,
    senderDisplayName: workspace.emailIdentity?.senderDisplayName ?? null,
    emailDomainStatus: workspace.emailIdentity?.domainStatus ?? "NONE",
    themeId: validTheme ? validTheme.id : null,
    templateCategory: evaluationCategory,
    templateId: (catalogTemplate?.presentationReady
      ? catalogTemplate.id
      : selectedTemplate.id) as ImplementedTemplateId,
    templateLabel: catalogTemplate?.presentationReady
      ? catalogTemplate.label
      : selectedTemplate.label,
    templateOptions,
    themeOptions: selectedTemplate.themes,
    planCode: plan.planCode,
    teamRosterEnabled: plan.teamRosterEnabled,
    brandAssets,
    professionalIdentity,
    identityLocks,
    teamSignatureDataReadiness: plan.teamRosterEnabled
      ? teamSignatureDataReadiness
      : null,
    onboarding: {
      accountActivatedAt: onboarding?.accountActivatedAt?.toISOString() ?? null,
      businessProfileStatus,
      brandingStatus:
        !plan.teamRosterEnabled && onboarding?.brandingStatus === "COMPLETE"
          ? "COMPLETE"
          : evaluatedBranding,
      professionalIdentityStatus,
      templateThemeStatus,
      emailIdentityStatus: onboarding?.emailIdentityStatus ?? "NOT_STARTED",
      completedAt: onboarding?.completedAt?.toISOString() ?? null,
      websiteSetupComplete,
      websiteSetupMissingFields: websiteSetupMissingKeys.map(
        (key: WebsiteSetupMissingFieldKey) => WEBSITE_SETUP_FIELD_LABELS[key],
      ),
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
  /**
   * Persist entered fields without marking the section COMPLETE.
   * Incomplete/invalid required fields must not block other valid values.
   */
  persistAsDraft?: boolean;
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

  const persistAsDraft = input.persistAsDraft === true;
  const displayName = input.displayName.trim().slice(0, 120);
  const contactEmail = input.contactEmail.trim().toLowerCase();
  if (!persistAsDraft) {
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
  }

  await ensureWorkspaceOnboardingState(db, ctx.workspaceId);

  const branding = await db.workspaceBranding.findUnique({
    where: { workspaceId: ctx.workspaceId },
    select: { workspaceId: true, displayName: true },
  });
  if (branding) {
    await db.workspaceBranding.update({
      where: { workspaceId: ctx.workspaceId },
      data: {
        displayName: displayName || branding.displayName,
        contactEmail: contactEmail || null,
        contactPhone: input.contactPhone?.trim() || null,
      },
    });
  }

  if (displayName) {
    await db.workspace.update({
      where: { id: ctx.workspaceId },
      data: { name: displayName },
    });
  }

  const emailIdentity = await db.workspaceEmailIdentity.findUnique({
    where: { workspaceId: ctx.workspaceId },
    select: { workspaceId: true, domainStatus: true },
  });
  if (emailIdentity) {
    const replyTo = input.replyToEmail?.trim().toLowerCase() || "";
    const sender = input.senderDisplayName?.trim() || "";
    await db.workspaceEmailIdentity.update({
      where: { workspaceId: ctx.workspaceId },
      data: persistAsDraft
        ? {
            contactEmail: contactEmail || null,
            replyToEmail: replyTo || null,
            senderDisplayName: sender || null,
            domainStatus:
              emailIdentity.domainStatus === "NONE"
                ? "NONE"
                : emailIdentity.domainStatus,
          }
        : {
            contactEmail,
            replyToEmail: replyTo || contactEmail,
            senderDisplayName: sender || displayName,
            domainStatus:
              emailIdentity.domainStatus === "NONE"
                ? "NONE"
                : emailIdentity.domainStatus,
          },
    });
  }

  if (!persistAsDraft) {
    const onboarding = await db.workspaceOnboardingState.findUnique({
      where: { workspaceId: ctx.workspaceId },
    });
    if (onboarding) {
      const brandingRow = await db.workspaceBranding.findUnique({
        where: { workspaceId: ctx.workspaceId },
        select: {
          agentProfilePhotoUrl: true,
          logoUrl: true,
          brokerageLogoUrl: true,
          faviconUrl: true,
          themeId: true,
        },
      });
      const category =
        getTemplate(resolveTemplateIdFromThemeId(brandingRow?.themeId))
          ?.category ?? "DEFAULT";
      const brandingStatus = evaluateBrandingStatus({
        category,
        assets: {
          agentProfilePhotoUrl: brandingRow?.agentProfilePhotoUrl ?? null,
          logoUrl: brandingRow?.logoUrl ?? null,
          brokerageLogoUrl: brandingRow?.brokerageLogoUrl ?? null,
          faviconUrl: brandingRow?.faviconUrl ?? null,
        },
      });
      await db.workspaceOnboardingState.update({
        where: { workspaceId: ctx.workspaceId },
        data: {
          businessProfileStatus: "COMPLETE",
          emailIdentityStatus: "COMPLETE",
          // Preserve COMPLETE theme selection; otherwise leave NOT_STARTED.
          ...(onboarding.templateThemeStatus === "COMPLETE"
            ? {}
            : { templateThemeStatus: "NOT_STARTED" }),
          brandingStatus,
        },
      });
    }
  }

  return loadOwnerOnboardingWorkspace(db, ctx.workspaceId);
}

function requireTrimmedField(
  value: string | null | undefined,
  maxLen: number,
  code: string,
  message: string,
): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    throw new OwnerActivationError(message, code, 400);
  }
  return trimmed.slice(0, maxLen);
}

function optionalDraftField(
  value: string | null | undefined,
  maxLen: number,
): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function recoExpiryInputValue(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const iso = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso.slice(0, 10);
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return null;
    return recoExpiryInputValue(parsed);
  }
  return value.toISOString().slice(0, 10);
}

/**
 * Stage 6.11D — persist professional + brokerage identity (host-bound OWNER).
 * Does not lock the live website when incomplete; status tracks Website Setup only.
 */
export async function updateOwnerOnboardingProfessionalIdentity(input: {
  request: Request;
  agentRegisteredName: string;
  agentDesignation: string;
  agentCellPhone: string;
  recoLicenseNumber?: string | null;
  recoLicenseExpiresAt?: string | null;
  brokerageRegisteredName: string;
  brokerageFax?: string | null;
  brokeragePhone: string;
  brokerageAddress: string;
  /** Persist partial identity without marking the section COMPLETE. */
  persistAsDraft?: boolean;
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

  const persistAsDraft = input.persistAsDraft === true;
  const data = persistAsDraft
    ? {
        agentRegisteredName: optionalDraftField(input.agentRegisteredName, 160),
        agentDesignation: optionalDraftField(input.agentDesignation, 80),
        agentCellPhone: optionalDraftField(input.agentCellPhone, 40),
        brokerageRegisteredName: optionalDraftField(
          input.brokerageRegisteredName,
          200,
        ),
        brokerageFax: optionalDraftField(input.brokerageFax, 80),
        brokeragePhone: optionalDraftField(input.brokeragePhone, 40),
        brokerageAddress: optionalDraftField(input.brokerageAddress, 400),
      }
    : {
        agentRegisteredName: requireTrimmedField(
          input.agentRegisteredName,
          160,
          "INVALID_AGENT_NAME",
          "Agent name is required",
        ),
        agentDesignation: requireTrimmedField(
          input.agentDesignation,
          80,
          "INVALID_AGENT_DESIGNATION",
          "Agent designation is required",
        ),
        agentCellPhone: requireTrimmedField(
          input.agentCellPhone,
          40,
          "INVALID_AGENT_CELL",
          "Agent cell number is required",
        ),
        brokerageRegisteredName: requireTrimmedField(
          input.brokerageRegisteredName,
          200,
          "INVALID_BROKERAGE_NAME",
          "Brokerage name is required",
        ),
        brokerageFax: requireTrimmedField(
          input.brokerageFax,
          80,
          "INVALID_BROKERAGE_FAX",
          "Brokerage fax is required",
        ),
        brokeragePhone: requireTrimmedField(
          input.brokeragePhone,
          40,
          "INVALID_BROKERAGE_PHONE",
          "Brokerage phone is required",
        ),
        brokerageAddress: requireTrimmedField(
          input.brokerageAddress,
          400,
          "INVALID_BROKERAGE_ADDRESS",
          "Brokerage address is required",
        ),
      };

  await ensureWorkspaceOnboardingState(db, ctx.workspaceId);
  await upsertProfessionalIdentityFields(db, ctx.workspaceId, data);
  await applyOwnerCanonicalProfileFromCurrentSave(
    db,
    ctx.userId,
    {
      agentRegisteredName: data.agentRegisteredName,
      agentCellPhone: data.agentCellPhone,
      recoLicenseNumber: optionalDraftField(input.recoLicenseNumber, 40),
      recoLicenseExpiresAt: optionalDraftField(input.recoLicenseExpiresAt, 32),
    },
    { persistAsDraft },
  );
  if (!persistAsDraft) {
    await syncProfessionalIdentityStatus(db, ctx.workspaceId);
  }
  return loadOwnerOnboardingWorkspace(db, ctx.workspaceId);
}

/**
 * Stage 6.11A/B — persist template + theme selection (host-bound OWNER).
 * Sets templateThemeStatus COMPLETE. Does NOT set completedAt.
 */
export async function updateOwnerOnboardingTemplateTheme(input: {
  request: Request;
  themeId: unknown;
  /** Persist theme without marking templateThemeStatus COMPLETE. */
  persistAsDraft?: boolean;
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

  let themeId: string;
  try {
    themeId = requireValidOwnerPersistableThemeId(input.themeId);
  } catch {
    throw new OwnerActivationError(
      "Invalid website theme",
      "INVALID_THEME_ID",
      400,
    );
  }

  const theme = getThemeById(themeId);
  if (!theme) {
    throw new OwnerActivationError(
      "Invalid website theme",
      "INVALID_THEME_ID",
      400,
    );
  }

  await ensureWorkspaceOnboardingState(db, ctx.workspaceId);

  const branding = await db.workspaceBranding.findUnique({
    where: { workspaceId: ctx.workspaceId },
    select: { workspaceId: true, version: true, themeId: true },
  });
  if (!branding) {
    throw new OwnerActivationError(
      "Workspace branding not found",
      "NOT_FOUND",
      404,
    );
  }

  const plan = await resolveWorkspacePlanCapabilities(ctx.workspaceId, db);
  const parsedTheme = parseThemeId(themeId);
  if (
    !plan.teamRosterEnabled &&
    parsedTheme?.templateId === TEAM_SIGNATURE_TEMPLATE_ID &&
    branding.themeId !== themeId
  ) {
    throw new OwnerActivationError(
      "Team website templates are not included in your plan.",
      "PLAN_THEME_NOT_AVAILABLE",
      403,
    );
  }

  await db.workspaceBranding.update({
    where: { workspaceId: ctx.workspaceId },
    data: {
      themeId,
      primaryColor: theme.palette.primary,
      secondaryColor: theme.palette.secondary,
      accentColor: theme.palette.accent,
      version: { increment: 1 },
    },
  });

  if (input.persistAsDraft !== true) {
    await db.workspaceOnboardingState.update({
      where: { workspaceId: ctx.workspaceId },
      data: {
        templateThemeStatus: "COMPLETE",
        // Never mark overall onboarding complete here.
      },
    });
  }

  return loadOwnerOnboardingWorkspace(db, ctx.workspaceId);
}
