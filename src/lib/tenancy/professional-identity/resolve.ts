/**
 * Stage 6.11D / 6.11D.2 — canonical public professional identity resolver.
 * Combines WorkspaceProfessionalIdentity + WorkspaceBranding image assets.
 * No template-specific logic.
 */

import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
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

  return {
    agent: {
      name: trimOrNull(identity?.agentRegisteredName),
      designation: trimOrNull(identity?.agentDesignation),
      cellPhone: trimOrNull(identity?.agentCellPhone),
      // Portrait is branding asset only — never User.image / logoUrl.
      photoUrl: trimOrNull(branding?.agentProfilePhotoUrl),
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
