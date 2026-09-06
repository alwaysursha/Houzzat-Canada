/**
 * Stage 6.11B / 6.11D — public agent identity for Agent Signature (no invented data).
 * Prefers WorkspaceProfessionalIdentity for name/designation/cell/brokerage/photo.
 * Bio / markets / email may still come from primary agent profile when present.
 */
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

export type PublicAgentIdentity = {
  name: string | null;
  /** Professional title / designation — only when available (never invented). */
  title: string | null;
  photoUrl: string | null;
  bio: string | null;
  brokerageName: string | null;
  phone: string | null;
  email: string | null;
  markets: string[];
};

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * Resolve primary agent presentation for a workspace.
 * Missing fields stay null — templates must omit gracefully.
 */
export async function resolvePublicAgentIdentity(
  workspaceId: string,
  prisma: PrismaClient = defaultPrisma,
): Promise<PublicAgentIdentity> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      brokerageAffiliation: true,
      primaryAgentId: true,
      professionalIdentity: {
        select: {
          agentRegisteredName: true,
          agentDesignation: true,
          agentCellPhone: true,
          brokerageRegisteredName: true,
        },
      },
      branding: {
        select: {
          displayName: true,
          contactEmail: true,
          agentProfilePhotoUrl: true,
        },
      },
      primaryAgent: {
        select: {
          name: true,
          email: true,
          phone: true,
          agentProfile: {
            select: {
              bio: true,
              phone: true,
              markets: true,
              active: true,
            },
          },
        },
      },
    },
  });

  if (!workspace) {
    return {
      name: null,
      title: null,
      photoUrl: null,
      bio: null,
      brokerageName: null,
      phone: null,
      email: null,
      markets: [],
    };
  }

  const agent = workspace.primaryAgent;
  const profile =
    agent?.agentProfile?.active === false ? null : agent?.agentProfile;
  const professional = workspace.professionalIdentity;

  return {
    // Stage 6.11D — registered agent name first; displayName is marketing fallback only.
    name: firstNonEmpty(
      professional?.agentRegisteredName,
      agent?.name,
      workspace.branding?.displayName,
    ),
    title: firstNonEmpty(professional?.agentDesignation),
    // Stage 6.11C.1 — canonical website portrait is workspace branding only.
    // Never User.image; never logoUrl as portrait fallback.
    photoUrl: firstNonEmpty(workspace.branding?.agentProfilePhotoUrl),
    bio: firstNonEmpty(profile?.bio),
    brokerageName: firstNonEmpty(
      professional?.brokerageRegisteredName,
      workspace.brokerageAffiliation,
    ),
    // Stage 6.11D — agent cell from professional identity; never branding.contactPhone.
    phone: firstNonEmpty(
      professional?.agentCellPhone,
      profile?.phone,
      agent?.phone,
    ),
    email: firstNonEmpty(agent?.email, workspace.branding?.contactEmail),
    markets: profile?.markets ?? [],
  };
}
