/**
 * Stage 6.11B / 6.11D — public agent identity for Agent Signature (no invented data).
 * Prefers WorkspaceProfessionalIdentity for name/designation/cell/brokerage/photo.
 * Bio / markets / email may still come from primary agent profile when present.
 */
import { cache } from "react";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

export type PublicAgentIdentity = {
  name: string | null;
  /** Professional title / designation — only when available (never invented). */
  title: string | null;
  photoUrl: string | null;
  bio: string | null;
  brokerageName: string | null;
  /** Workspace branding asset — never invented. */
  brokerageLogoUrl: string | null;
  /** Workspace professional identity brokerage phone — never invented. */
  brokeragePhone: string | null;
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

function emptyPublicAgentIdentity(): PublicAgentIdentity {
  return {
    name: null,
    title: null,
    photoUrl: null,
    bio: null,
    brokerageName: null,
    brokerageLogoUrl: null,
    brokeragePhone: null,
    phone: null,
    email: null,
    markets: [],
  };
}

/**
 * Resolve the workspace primary/public agent for presentation.
 * This is not the customer's assigned lead agent.
 * Missing fields stay null — templates must omit gracefully.
 *
 * React.cache dedupes a second call in the same server request (marketing
 * layout already resolves this for non-default templates).
 */
export const resolvePublicAgentIdentity = cache(async function resolvePublicAgentIdentity(
  workspaceId: string,
  prisma: PrismaClient = defaultPrisma,
): Promise<PublicAgentIdentity> {
  if (!workspaceId.trim()) return emptyPublicAgentIdentity();

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
          brokeragePhone: true,
        },
      },
      branding: {
        select: {
          displayName: true,
          contactEmail: true,
          agentProfilePhotoUrl: true,
          brokerageLogoUrl: true,
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

  if (!workspace) return emptyPublicAgentIdentity();

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
    brokerageLogoUrl: firstNonEmpty(workspace.branding?.brokerageLogoUrl),
    brokeragePhone: firstNonEmpty(professional?.brokeragePhone),
    // Canonical User.phone first; professional identity is website copy/fallback.
    // never branding.contactPhone (business phone).
    phone: firstNonEmpty(
      agent?.phone,
      profile?.phone,
      professional?.agentCellPhone,
    ),
    email: firstNonEmpty(agent?.email, workspace.branding?.contactEmail),
    markets: profile?.markets ?? [],
  };
});
