/**
 * Stage 6.11E.8 — Team Signature workspace data readiness (roster + leader).
 * Presentation roster only — no listing-feed / SaaS-member / domain coupling.
 * Catalog `selectable` is independent of data readiness evaluation.
 */

import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import type { ProfessionalIdentitySnapshot } from "@/lib/tenancy/professional-identity/types";
import {
  validateTeamMemberForPublication,
} from "@/lib/tenancy/team-roster/validate";

/** Stable keys integrated into Website Setup missing-field labels. */
export const TEAM_SIGNATURE_READINESS_FIELD_LABELS = {
  teamLogoUrl: "Team Logo",
  visibleTeamMember: "At least one visible Team member",
  teamLeader: "Team Leader",
  teamLeaderInvalid: "Valid Team Leader",
} as const;

export type TeamSignatureReadinessFieldKey =
  keyof typeof TEAM_SIGNATURE_READINESS_FIELD_LABELS;

export type TeamSignatureReadinessMember = {
  id: string;
  workspaceId: string;
  name: string | null;
  designation: string | null;
  photoUrl: string | null;
  isVisible: boolean;
};

export type TeamSignatureDataReadiness = {
  /** Server-authoritative Team Signature data readiness (not catalog selectable). */
  ready: boolean;
  missing: TeamSignatureReadinessFieldKey[];
  missingLabels: string[];
  sections: {
    business: boolean;
    branding: boolean;
    brokerage: boolean;
    roster: boolean;
    leader: boolean;
  };
};

function isPublishableVisibleMember(
  member: TeamSignatureReadinessMember,
  workspaceId: string,
): boolean {
  if (member.workspaceId !== workspaceId) return false;
  if (!member.isVisible) return false;
  return validateTeamMemberForPublication({
    id: member.id,
    workspaceId,
    name: member.name,
    designation: member.designation,
    photoUrl: member.photoUrl,
    isVisible: true,
  }).ok;
}

function brokerageComplete(input: {
  identity: ProfessionalIdentitySnapshot | null | undefined;
  brokerageLogoUrl: string | null;
}): boolean {
  const row = input.identity;
  return Boolean(
    row?.brokerageRegisteredName?.trim() &&
      row?.brokerageAddress?.trim() &&
      row?.brokeragePhone?.trim() &&
      row?.brokerageFax?.trim() &&
      input.brokerageLogoUrl?.trim(),
  );
}

/**
 * Pure Team Signature data-readiness evaluation.
 * Does not consult presentation Meet fallback (first visible member).
 */
export function evaluateTeamSignatureDataReadiness(input: {
  workspaceId: string;
  displayName: string | null | undefined;
  contactEmail: string | null | undefined;
  /** Team / primary logo used by Team Signature. */
  logoUrl: string | null | undefined;
  identity: ProfessionalIdentitySnapshot | null | undefined;
  brokerageLogoUrl: string | null | undefined;
  leaderMemberId: string | null | undefined;
  members: readonly TeamSignatureReadinessMember[];
}): TeamSignatureDataReadiness {
  const workspaceId = input.workspaceId;
  const missing: TeamSignatureReadinessFieldKey[] = [];
  const missingLabelsExtra: string[] = [];

  const business = Boolean(
    input.displayName?.trim() &&
      input.contactEmail?.trim() &&
      input.contactEmail.includes("@"),
  );
  if (!business) {
    // Reuse Website Setup “Business profile” wording (display name + email).
    missingLabelsExtra.push("Business profile");
  }

  const branding = Boolean(input.logoUrl?.trim());
  if (!branding) missing.push("teamLogoUrl");

  const brokerage = brokerageComplete({
    identity: input.identity,
    brokerageLogoUrl: input.brokerageLogoUrl ?? null,
  });
  if (!brokerage) {
    missingLabelsExtra.push("Complete brokerage information");
  }

  const sameWorkspaceMembers = input.members.filter(
    (m) => m.workspaceId === workspaceId,
  );
  const validVisible = sameWorkspaceMembers.filter((m) =>
    isPublishableVisibleMember(m, workspaceId),
  );
  const roster = validVisible.length >= 1;
  if (!roster) missing.push("visibleTeamMember");

  const leaderId = input.leaderMemberId?.trim() || null;
  let leader = false;
  if (!leaderId) {
    missing.push("teamLeader");
  } else {
    const leaderMember = sameWorkspaceMembers.find((m) => m.id === leaderId);
    if (
      !leaderMember ||
      !isPublishableVisibleMember(leaderMember, workspaceId)
    ) {
      missing.push("teamLeaderInvalid");
    } else {
      leader = true;
    }
  }

  const ready = business && branding && brokerage && roster && leader;
  const missingLabels = [
    ...missingLabelsExtra,
    ...missing.map((key) => TEAM_SIGNATURE_READINESS_FIELD_LABELS[key]),
  ];

  return {
    ready,
    missing,
    missingLabels,
    sections: {
      business,
      branding,
      brokerage,
      roster,
      leader,
    },
  };
}

/** Load Team Profile + members and evaluate data readiness (read-only). */
export async function loadTeamSignatureDataReadiness(
  workspaceId: string,
  input: {
    displayName: string | null | undefined;
    contactEmail: string | null | undefined;
    logoUrl: string | null | undefined;
    identity: ProfessionalIdentitySnapshot | null | undefined;
    brokerageLogoUrl: string | null | undefined;
    prisma?: PrismaClient;
  },
): Promise<TeamSignatureDataReadiness> {
  const db = input.prisma ?? defaultPrisma;
  const [profile, members] = await Promise.all([
    db.workspaceTeamProfile.findUnique({
      where: { workspaceId },
      select: { leaderMemberId: true },
    }),
    db.workspaceTeamMember.findMany({
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
    }),
  ]);

  return evaluateTeamSignatureDataReadiness({
    workspaceId,
    displayName: input.displayName,
    contactEmail: input.contactEmail,
    logoUrl: input.logoUrl,
    identity: input.identity,
    brokerageLogoUrl: input.brokerageLogoUrl,
    leaderMemberId: profile?.leaderMemberId ?? null,
    members,
  });
}
