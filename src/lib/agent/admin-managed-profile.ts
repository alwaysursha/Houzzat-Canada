/**
 * Admin-managed Agent professional / contact identity.
 *
 * OWNER/ADMIN may edit any workspace agent. Agents may edit their own profile.
 * Canonical cellphone is User.phone + User.phoneE164 (SMS notify destination).
 * AgentProfile.phone is kept in lockstep as display copy (CMA, signatures).
 */
import type { PrismaClient } from "@prisma/client";
import type { AgentOrgContext } from "@/lib/agent";
import {
  parsePhoneColumnsForWrite,
  type PhoneColumnsForWrite,
} from "@/lib/sms/e164";
import { prisma } from "@/lib/prisma";
import { workspaceTeamCanManage } from "@/lib/workspace-team";

export const ADMIN_MANAGED_AGENT_PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "recoLicenseNumber",
  "recoLicenseExpiresAt",
] as const;

const EMAIL_MAX = 200;
const NAME_MAX = 80;
const LICENSE_MAX = 40;
const PHONE_MAX = 40;

export type ParsedAdminManagedAgentProfile = {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  phoneE164: string;
  phoneColumns: PhoneColumnsForWrite;
  recoLicenseNumber: string;
  recoLicenseExpiresAt: Date;
  recoLicenseExpiresAtInput: string;
};

export type AdminManagedAgentProfileView = {
  userId: string;
  membershipId: string;
  role: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneE164: string | null;
  recoLicenseNumber: string;
  recoLicenseExpiresAt: string;
  /** Public website designation (OWNER / workspace professional identity). */
  designation: string;
  /** Workspace branding portrait when this agent is the public site agent. */
  photoUrl: string | null;
  canEdit: boolean;
  /** OWNER branding upload — website headshot with focus crop. */
  canEditPhoto: boolean;
};

function canEditAgentProfile(ctx: AgentOrgContext, userId: string): boolean {
  return workspaceTeamCanManage(ctx) || ctx.user.id === userId;
}

type ProfileDb = Pick<
  PrismaClient,
  "user" | "agentProfile" | "workspaceMember" | "workspaceProfessionalIdentity"
>;

export function normalizeStaffEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function composeStaffDisplayName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.replace(/\s+/g, " ").trim();
}

export function splitStaffDisplayName(name: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] ?? "", lastName: "" };
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export function recoExpiryToInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") {
    const iso = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso.slice(0, 10);
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return "";
    return recoExpiryToInputValue(parsed);
  }
  return value.toISOString().slice(0, 10);
}

export function parseRecoLicenseExpiry(raw: string): Date | null {
  const iso = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== iso) return null;
  return date;
}

function requiredTrimmed(value: unknown, label: string, max: number): string | { error: string } {
  if (typeof value !== "string") return { error: `${label} is required.` };
  const trimmed = value.trim();
  if (!trimmed) return { error: `${label} is required.` };
  if (trimmed.length > max) return { error: `${label} is too long.` };
  return trimmed;
}

export function parseAdminManagedAgentProfile(
  raw: unknown,
): { ok: true; data: ParsedAdminManagedAgentProfile } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Invalid payload." };
  }
  const body = raw as Record<string, unknown>;

  const firstName = requiredTrimmed(body.firstName, "First name", NAME_MAX);
  if (typeof firstName !== "string") return { ok: false, error: firstName.error };
  const lastName = requiredTrimmed(body.lastName, "Last name", NAME_MAX);
  if (typeof lastName !== "string") return { ok: false, error: lastName.error };
  const emailRaw = requiredTrimmed(body.email, "Email", EMAIL_MAX);
  if (typeof emailRaw !== "string") return { ok: false, error: emailRaw.error };
  const email = normalizeStaffEmail(emailRaw);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  const phoneRaw = requiredTrimmed(body.phone, "Cell phone number", PHONE_MAX);
  if (typeof phoneRaw !== "string") return { ok: false, error: phoneRaw.error };
  const parsedPhone = parsePhoneColumnsForWrite(phoneRaw);
  if (!parsedPhone.ok) return { ok: false, error: parsedPhone.error };
  if (!parsedPhone.columns.phone || !parsedPhone.columns.phoneE164) {
    return { ok: false, error: "Cell phone number is required." };
  }
  const recoLicenseNumber = requiredTrimmed(
    body.recoLicenseNumber,
    "RECO license #",
    LICENSE_MAX,
  );
  if (typeof recoLicenseNumber !== "string") {
    return { ok: false, error: recoLicenseNumber.error };
  }
  const expiryRaw = requiredTrimmed(
    body.recoLicenseExpiresAt,
    "RECO license expiry date",
    32,
  );
  if (typeof expiryRaw !== "string") return { ok: false, error: expiryRaw.error };
  const recoLicenseExpiresAt = parseRecoLicenseExpiry(expiryRaw);
  if (!recoLicenseExpiresAt) {
    return { ok: false, error: "Enter a valid RECO license expiry date." };
  }

  return {
    ok: true,
    data: {
      firstName,
      lastName,
      displayName: composeStaffDisplayName(firstName, lastName),
      email,
      phone: parsedPhone.columns.phone,
      phoneE164: parsedPhone.columns.phoneE164,
      phoneColumns: parsedPhone.columns,
      recoLicenseNumber,
      recoLicenseExpiresAt,
      recoLicenseExpiresAtInput: recoExpiryToInputValue(recoLicenseExpiresAt),
    },
  };
}

export function inviteSnapshotFromProfile(profile: ParsedAdminManagedAgentProfile) {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone,
    recoLicenseNumber: profile.recoLicenseNumber,
    recoLicenseExpiresAt: profile.recoLicenseExpiresAt,
  };
}

export async function applyAdminManagedAgentProfile(
  db: ProfileDb,
  userId: string,
  profile: ParsedAdminManagedAgentProfile,
  opts?: { email?: string },
): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      name: profile.displayName,
      ...(opts?.email ? { email: opts.email } : {}),
      phone: profile.phone,
      phoneE164: profile.phoneE164,
    },
  });

  await db.agentProfile.upsert({
    where: { userId },
    create: {
      userId,
      active: true,
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone,
      recoLicenseNumber: profile.recoLicenseNumber,
      recoLicenseExpiresAt: profile.recoLicenseExpiresAt,
    },
    update: {
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone,
      recoLicenseNumber: profile.recoLicenseNumber,
      recoLicenseExpiresAt: profile.recoLicenseExpiresAt,
    },
  });
}

export function profileFromInviteSnapshot(invite: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  phone?: string | null;
  recoLicenseNumber?: string | null;
  recoLicenseExpiresAt?: Date | string | null;
}): ParsedAdminManagedAgentProfile | null {
  if (!invite.firstName?.trim() || !invite.lastName?.trim() || !invite.phone?.trim()) {
    return null;
  }
  const parsed = parseAdminManagedAgentProfile({
    firstName: invite.firstName,
    lastName: invite.lastName,
    email: invite.email,
    phone: invite.phone,
    recoLicenseNumber: invite.recoLicenseNumber ?? "",
    recoLicenseExpiresAt: recoExpiryToInputValue(invite.recoLicenseExpiresAt),
  });
  return parsed.ok ? parsed.data : null;
}

export async function loadWorkspaceAgentProfile(
  ctx: AgentOrgContext,
  userId: string,
  db: PrismaClient = prisma,
): Promise<
  | { ok: true; profile: AdminManagedAgentProfileView }
  | { ok: false; error: string; status: number }
> {
  if (!ctx.workspaceId) {
    return { ok: false, error: "Workspace required.", status: 403 };
  }

  const membership = await db.workspaceMember.findFirst({
    where: { workspaceId: ctx.workspaceId, userId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          phoneE164: true,
          agentProfile: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
              recoLicenseNumber: true,
              recoLicenseExpiresAt: true,
            },
          },
        },
      },
    },
  });
  if (!membership) {
    return { ok: false, error: "Agent not found in this Workspace.", status: 404 };
  }

  const firstName =
    membership.user.agentProfile?.firstName?.trim() ||
    splitStaffDisplayName(membership.user.name).firstName;
  const lastName =
    membership.user.agentProfile?.lastName?.trim() ||
    splitStaffDisplayName(membership.user.name).lastName;

  const isPublicSiteAgent =
    membership.role === "OWNER" ||
    (await db.workspace.findUnique({
      where: { id: ctx.workspaceId },
      select: { primaryAgentId: true },
    }))?.primaryAgentId === membership.user.id;

  let designation = "";
  let photoUrl: string | null = null;
  if (isPublicSiteAgent) {
    const [professional, branding] = await Promise.all([
      db.workspaceProfessionalIdentity.findUnique({
        where: { workspaceId: ctx.workspaceId },
        select: { agentDesignation: true },
      }),
      db.workspaceBranding.findUnique({
        where: { workspaceId: ctx.workspaceId },
        select: { agentProfilePhotoUrl: true },
      }),
    ]);
    designation = professional?.agentDesignation?.trim() ?? "";
    photoUrl = branding?.agentProfilePhotoUrl?.trim() || null;
  }

  return {
    ok: true,
    profile: {
      userId: membership.user.id,
      membershipId: membership.id,
      role: membership.role,
      firstName,
      lastName,
      email: membership.user.email,
      phone: membership.user.phone || membership.user.agentProfile?.phone || "",
      phoneE164: membership.user.phoneE164,
      recoLicenseNumber: membership.user.agentProfile?.recoLicenseNumber ?? "",
      recoLicenseExpiresAt: recoExpiryToInputValue(
        membership.user.agentProfile?.recoLicenseExpiresAt ?? null,
      ),
      designation,
      photoUrl,
      canEdit: canEditAgentProfile(ctx, userId),
      canEditPhoto: Boolean(isPublicSiteAgent && ctx.canManageWorkspace),
    },
  };
}

export async function updateWorkspaceAgentProfile(input: {
  ctx: AgentOrgContext;
  userId: string;
  raw: unknown;
  prisma?: PrismaClient;
}): Promise<
  | { ok: true; profile: AdminManagedAgentProfileView }
  | { ok: false; error: string; status: number }
> {
  if (!input.ctx.workspaceId) {
    return { ok: false, error: "Workspace required.", status: 403 };
  }
  if (!canEditAgentProfile(input.ctx, input.userId)) {
    return { ok: false, error: "Forbidden.", status: 403 };
  }

  const db = input.prisma ?? prisma;
  const parsed = parseAdminManagedAgentProfile(input.raw);
  if (!parsed.ok) return { ok: false, error: parsed.error, status: 400 };

  const loaded = await loadWorkspaceAgentProfile(input.ctx, input.userId, db);
  if (!loaded.ok) return loaded;

  const nextEmail = parsed.data.email;
  if (nextEmail !== normalizeStaffEmail(loaded.profile.email)) {
    // Phase 3: email uniqueness is per-workspace, not global.
    const conflict = await db.user.findFirst({
      where: {
        email: nextEmail,
        workspaceId: input.ctx.workspaceId,
      },
      select: { id: true },
    });
    if (conflict && conflict.id !== input.userId) {
      return {
        ok: false,
        error: "That email is already used by another account.",
        status: 409,
      };
    }
  }

  await applyAdminManagedAgentProfile(db, input.userId, parsed.data, {
    email: nextEmail,
  });
  if (loaded.profile.role === "OWNER" && input.ctx.workspaceId) {
    const websiteIdentity = await db.workspaceProfessionalIdentity.findUnique({
      where: { workspaceId: input.ctx.workspaceId },
      select: { workspaceId: true },
    });
    const designationRaw =
      input.raw &&
      typeof input.raw === "object" &&
      !Array.isArray(input.raw) &&
      "designation" in input.raw
        ? (input.raw as { designation?: unknown }).designation
        : undefined;
    const designation =
      typeof designationRaw === "string" ? designationRaw.trim().slice(0, 80) : null;
    if (websiteIdentity) {
      await db.workspaceProfessionalIdentity.update({
        where: { workspaceId: input.ctx.workspaceId },
        data: {
          agentRegisteredName: parsed.data.displayName,
          agentCellPhone: parsed.data.phone,
          ...(designation !== null ? { agentDesignation: designation || null } : {}),
        },
      });
    }
  }
  if (nextEmail !== normalizeStaffEmail(loaded.profile.email)) {
    await db.user.update({
      where: { id: input.userId },
      data: { emailVerified: new Date() },
    });
  }

  const refreshed = await loadWorkspaceAgentProfile(input.ctx, input.userId, db);
  if (!refreshed.ok) return refreshed;
  return { ok: true, profile: refreshed.profile };
}
