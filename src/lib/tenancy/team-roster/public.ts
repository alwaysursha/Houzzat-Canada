/**
 * Stage 6.11E.7 — public Team Profile + published WorkspaceTeamMember roster.
 * Presentation-only. Hostname → Workspace authority is enforced by callers
 * (resolveMarketingPresentationBrand). Never trusts client workspaceId.
 */
import { cache } from "react";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { parseServiceAreasFromDb } from "@/lib/tenancy/team-roster/validate";

export type PublicTeamMemberPresentation = {
  id: string;
  name: string;
  designation: string | null;
  photoUrl: string | null;
  bio: string | null;
  cellPhone: string | null;
  email: string | null;
  isLeader: boolean;
  sortOrder: number;
};

export type PublicTeamRosterPresentation = {
  aboutText: string | null;
  serviceAreas: string[];
  leaderMemberId: string | null;
  /** Visible members only, ordered by sortOrder then id. */
  members: PublicTeamMemberPresentation[];
};

const EMPTY_ROSTER: PublicTeamRosterPresentation = {
  aboutText: null,
  serviceAreas: [],
  leaderMemberId: null,
  members: [],
};

/**
 * Load published Team roster for a workspace.
 * Hidden members excluded. Cross-workspace impossible (scoped by workspaceId).
 */
export async function loadPublicTeamRosterPresentation(
  workspaceId: string,
  db: PrismaClient = defaultPrisma,
): Promise<PublicTeamRosterPresentation> {
  if (!workspaceId.trim()) return EMPTY_ROSTER;

  const [profile, members] = await Promise.all([
    db.workspaceTeamProfile.findUnique({
      where: { workspaceId },
      select: {
        aboutText: true,
        serviceAreas: true,
        leaderMemberId: true,
      },
    }),
    db.workspaceTeamMember.findMany({
      where: {
        workspaceId,
        isVisible: true,
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        designation: true,
        photoUrl: true,
        bio: true,
        cellPhone: true,
        email: true,
        sortOrder: true,
      },
    }),
  ]);

  const leaderMemberId = profile?.leaderMemberId ?? null;
  const visibleLeaderId =
    leaderMemberId && members.some((m) => m.id === leaderMemberId)
      ? leaderMemberId
      : null;

  return {
    aboutText: profile?.aboutText?.trim() || null,
    serviceAreas: parseServiceAreasFromDb(profile?.serviceAreas ?? null),
    leaderMemberId: visibleLeaderId,
    members: members.map((m) => ({
      id: m.id,
      name: m.name?.trim() || "Team member",
      designation: m.designation?.trim() || null,
      photoUrl: m.photoUrl?.trim() || null,
      bio: m.bio?.trim() || null,
      cellPhone: m.cellPhone?.trim() || null,
      email: m.email?.trim() || null,
      isLeader: visibleLeaderId != null && m.id === visibleLeaderId,
      sortOrder: m.sortOrder,
    })),
  };
}

/** Per-request dedupe for marketing resolve (React.cache). */
export const resolvePublicTeamRosterForWorkspace = cache(
  async (workspaceId: string): Promise<PublicTeamRosterPresentation> => {
    return loadPublicTeamRosterPresentation(workspaceId);
  },
);
