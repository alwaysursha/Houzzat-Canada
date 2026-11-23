import type { PrismaClient } from "@prisma/client";
import { splitStaffDisplayName } from "@/lib/agent/admin-managed-profile";
import { ensureOwnerAgentProfile } from "@/lib/agent/ensure-owner-agent-profile";
import {
  evaluateProfessionalAgentProfile,
  isProfessionalJurisdictionId,
  parseProfessionalExpiry,
  type ProfessionalProfileCompletion,
} from "@/lib/agent/professional-profile";
import { parsePhoneColumnsForWrite } from "@/lib/sms/e164";
import { PlatformApiError } from "@/lib/platform/api/handler";

export type OwnerSignatureProfile = {
  userId: string;
  role: string;
  name: string;
  email: string;
  phone: string;
  designation: string;
  brokerageName: string;
  jurisdiction: string;
  recoLicenseNumber: string;
  recoLicenseExpiresAt: string;
  registrationNumber: string;
  hasPhoto: boolean;
  hasAgentProfile: boolean;
  completion: ProfessionalProfileCompletion;
};

async function resolveOwnerAgent(
  db: PrismaClient,
  workspaceId: string,
) {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      primaryAgentId: true,
      professionalIdentity: {
        select: { brokerageRegisteredName: true, agentDesignation: true },
      },
    },
  });
  if (!workspace) {
    throw new PlatformApiError("Workspace not found.", 404, "WORKSPACE_NOT_FOUND");
  }
  const owners = await db.workspaceMember.findMany({
    where: { workspaceId, role: "OWNER", status: "ACTIVE" },
    select: {
      role: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          image: true,
          agentProfile: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              designation: true,
              active: true,
              registrationJurisdiction: true,
              registrationNumber: true,
              recoLicenseNumber: true,
              recoLicenseExpiresAt: true,
            },
          },
        },
      },
    },
  });
  const primaryOwner = owners.find((member) => member.user.id === workspace.primaryAgentId);
  const target = primaryOwner ?? (owners.length === 1 ? owners[0] : null);
  if (!target) {
    throw new PlatformApiError(
      owners.length === 0
        ? "This workspace has no active owner."
        : "Choose the primary agent before editing an owner profile.",
      409,
      "OWNER_PROFILE_AMBIGUOUS",
    );
  }
  return { workspace, target };
}

function toView(
  target: Awaited<ReturnType<typeof resolveOwnerAgent>>["target"],
  brokerageName: string,
  publicDesignation: string,
  isPrimary: boolean,
): OwnerSignatureProfile {
  const names = splitStaffDisplayName(target.user.name);
  const profile = target.user.agentProfile;
  const designation = profile?.designation?.trim() || (isPrimary ? publicDesignation : "");
  const expiry = profile?.recoLicenseExpiresAt
    ? profile.recoLicenseExpiresAt.toISOString().slice(0, 10)
    : "";
  const completion = evaluateProfessionalAgentProfile({
    firstName: profile?.firstName?.trim() || names.firstName,
    lastName: profile?.lastName?.trim() || names.lastName,
    email: target.user.email,
    phone: target.user.phone,
    designation,
    brokerageName,
    jurisdiction: profile?.registrationJurisdiction ?? null,
    recoLicenseNumber: profile?.recoLicenseNumber ?? null,
    recoLicenseExpiresAt: expiry,
    registrationNumber: profile?.registrationNumber ?? null,
  });
  return {
    userId: target.user.id,
    role: target.role,
    name: target.user.name?.trim() || "",
    email: target.user.email?.trim() || "",
    phone: target.user.phone?.trim() || "",
    designation,
    brokerageName,
    jurisdiction: profile?.registrationJurisdiction?.trim() || "",
    recoLicenseNumber: profile?.recoLicenseNumber?.trim() || "",
    recoLicenseExpiresAt: expiry,
    registrationNumber: profile?.registrationNumber?.trim() || "",
    hasPhoto: Boolean(target.user.image?.trim()),
    hasAgentProfile: Boolean(profile?.active),
    completion,
  };
}

export async function inspectOwnerSignatureProfile(
  db: PrismaClient,
  workspaceId: string,
): Promise<OwnerSignatureProfile> {
  const { workspace, target } = await resolveOwnerAgent(db, workspaceId);
  return toView(
    target,
    workspace.professionalIdentity?.brokerageRegisteredName?.trim() || "",
    workspace.professionalIdentity?.agentDesignation?.trim() || "",
    workspace.primaryAgentId === target.user.id,
  );
}

export async function updateOwnerSignatureProfile(
  db: PrismaClient,
  workspaceId: string,
  patch: {
    designation?: unknown;
    brokerageName?: unknown;
    phone?: unknown;
    jurisdiction?: unknown;
    registrationNumber?: unknown;
    recoLicenseNumber?: unknown;
    recoLicenseExpiresAt?: unknown;
  },
): Promise<OwnerSignatureProfile> {
  const { workspace, target } = await resolveOwnerAgent(db, workspaceId);
  await ensureOwnerAgentProfile(db, { workspaceId, userId: target.user.id });

  if (typeof patch.designation === "string") {
    const designation = patch.designation.trim().slice(0, 80) || null;
    await db.agentProfile.updateMany({
      where: { userId: target.user.id },
      data: { designation },
    });
    if (workspace.primaryAgentId === target.user.id && workspace.professionalIdentity) {
      await db.workspaceProfessionalIdentity.update({
        where: { workspaceId },
        data: { agentDesignation: designation },
      });
    }
  }

  if (typeof patch.brokerageName === "string" && patch.brokerageName.trim()) {
    const brokerageRegisteredName = patch.brokerageName.trim().slice(0, 160);
    if (workspace.professionalIdentity) {
      await db.workspaceProfessionalIdentity.update({
        where: { workspaceId },
        data: { brokerageRegisteredName },
      });
    }
  }

  if (typeof patch.phone === "string" && patch.phone.trim()) {
    const parsed = parsePhoneColumnsForWrite(patch.phone);
    if (!parsed.ok || !parsed.columns.phone || !parsed.columns.phoneE164) {
      throw new PlatformApiError(
        parsed.ok ? "Enter a valid cell phone number." : parsed.error,
        400,
        "INVALID_PHONE",
      );
    }
    await db.user.update({
      where: { id: target.user.id },
      data: { phone: parsed.columns.phone, phoneE164: parsed.columns.phoneE164 },
    });
    await db.agentProfile.updateMany({
      where: { userId: target.user.id },
      data: { phone: parsed.columns.phone },
    });
  }

  if (typeof patch.jurisdiction === "string") {
    const jurisdiction = patch.jurisdiction.trim();
    if (jurisdiction && !isProfessionalJurisdictionId(jurisdiction)) {
      throw new PlatformApiError("Choose a licensing jurisdiction.", 400, "INVALID_JURISDICTION");
    }
    await db.agentProfile.updateMany({
      where: { userId: target.user.id },
      data: { registrationJurisdiction: jurisdiction || null },
    });
  }

  if (typeof patch.registrationNumber === "string" && patch.registrationNumber.trim()) {
    await db.agentProfile.updateMany({
      where: { userId: target.user.id },
      data: { registrationNumber: patch.registrationNumber.trim().slice(0, 40) },
    });
  }

  const recoNumber = typeof patch.recoLicenseNumber === "string" ? patch.recoLicenseNumber.trim() : "";
  const recoExpiry = typeof patch.recoLicenseExpiresAt === "string" ? patch.recoLicenseExpiresAt.trim() : "";
  if (recoNumber || recoExpiry) {
    const expiry = parseProfessionalExpiry(recoExpiry);
    if (!recoNumber || !expiry) {
      throw new PlatformApiError(
        "Enter the RECO registration number and a valid expiry together.",
        400,
        "INVALID_RECO",
      );
    }
    await db.agentProfile.updateMany({
      where: { userId: target.user.id },
      data: {
        recoLicenseNumber: recoNumber.slice(0, 40),
        recoLicenseExpiresAt: new Date(`${expiry}T12:00:00.000Z`),
      },
    });
  }

  return inspectOwnerSignatureProfile(db, workspaceId);
}
