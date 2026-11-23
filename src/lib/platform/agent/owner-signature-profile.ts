import type { PrismaClient } from "@prisma/client";
import { ensureOwnerAgentProfile } from "@/lib/agent/ensure-owner-agent-profile";
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
  hasPhoto: boolean;
  hasAgentProfile: boolean;
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
          agentProfile: { select: { id: true, designation: true, active: true } },
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
): OwnerSignatureProfile {
  return {
    userId: target.user.id,
    role: target.role,
    name: target.user.name?.trim() || "",
    email: target.user.email?.trim() || "",
    phone: target.user.phone?.trim() || "",
    designation: target.user.agentProfile?.designation?.trim() || publicDesignation,
    brokerageName,
    hasPhoto: Boolean(target.user.image?.trim()),
    hasAgentProfile: Boolean(target.user.agentProfile?.active),
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
  );
}

export async function updateOwnerSignatureProfile(
  db: PrismaClient,
  workspaceId: string,
  patch: {
    designation?: unknown;
    brokerageName?: unknown;
    phone?: unknown;
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

  return inspectOwnerSignatureProfile(db, workspaceId);
}
