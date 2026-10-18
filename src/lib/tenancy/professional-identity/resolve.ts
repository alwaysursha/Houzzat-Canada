/**
 * Stage 6.11D / 6.11D.2 — canonical public professional identity resolver.
 * Combines WorkspaceProfessionalIdentity + portrait from User.image
 * (primary, ACTIVE) with legacy branding only when no trusted personal channel.
 * No template-specific logic.
 */

import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  resolvePublicPrimaryAgentPhoto,
  verifiedActiveMembership,
} from "@/lib/tenancy/agent-photo";
import {
  EMPTY_PUBLIC_PROFESSIONAL_IDENTITY,
  type PublicProfessionalIdentity,
} from "./types";

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Resolve workspace professional + brokerage identity for public presentation.
 * Missing fields stay null — templates must not invent values.
 */
export async function resolvePublicProfessionalIdentity(
  workspaceId: string,
  prisma: PrismaClient = defaultPrisma,
): Promise<PublicProfessionalIdentity> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      primaryAgentId: true,
      primaryAgent: {
        select: { image: true },
      },
      professionalIdentity: {
        select: {
          agentRegisteredName: true,
          agentDesignation: true,
          agentCellPhone: true,
          brokerageRegisteredName: true,
          brokeragePhone: true,
          brokerageFax: true,
          brokerageAddress: true,
        },
      },
      branding: {
        select: {
          agentProfilePhotoUrl: true,
          brokerageLogoUrl: true,
        },
      },
    },
  });

  if (!workspace) {
    return EMPTY_PUBLIC_PROFESSIONAL_IDENTITY;
  }

  const identity = workspace.professionalIdentity;
  const branding = workspace.branding;
  const primaryAgentId = workspace.primaryAgentId?.trim() || null;

  let primaryMembership = null;
  if (primaryAgentId) {
    const memberRow = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: primaryAgentId,
        status: "ACTIVE",
      },
      select: {
        workspaceId: true,
        userId: true,
        status: true,
      },
    });
    primaryMembership = verifiedActiveMembership(memberRow, {
      workspaceId,
      userId: primaryAgentId,
    });
  }

  const photoUrl = resolvePublicPrimaryAgentPhoto({
    workspaceId,
    primaryAgentId,
    primaryUserImage: workspace.primaryAgent?.image ?? null,
    primaryMembership,
    brandingAgentProfilePhotoUrl: branding?.agentProfilePhotoUrl ?? null,
  });

  return {
    agent: {
      name: trimOrNull(identity?.agentRegisteredName),
      designation: trimOrNull(identity?.agentDesignation),
      cellPhone: trimOrNull(identity?.agentCellPhone),
      photoUrl,
    },
    brokerage: {
      name: trimOrNull(identity?.brokerageRegisteredName),
      address: trimOrNull(identity?.brokerageAddress),
      phone: trimOrNull(identity?.brokeragePhone),
      fax: trimOrNull(identity?.brokerageFax),
      logoUrl: trimOrNull(branding?.brokerageLogoUrl),
    },
  };
}
