import { DESK_AGENT_ALL } from "@/lib/agent/desk-constants";

export type DeskFieldAgent = {
  id: string;
  name: string | null;
  email: string;
};

export type DeskViewResolved = {
  /** null = whole team overview */
  deskAgentId: string | null;
  deskLabel: string;
};

/**
 * Pure desk resolution (no I/O).
 * Field agents always see their own desk.
 * Team leaders: missing/invalid cookie → own desk when they are a field agent;
 * explicit "all" → team overview; valid agent id → that desk.
 */
export function resolveDeskViewFromFieldAgents(input: {
  userId: string;
  canSeeTeamLeads: boolean;
  deskCookie: string | null;
  fieldAgents: DeskFieldAgent[];
}): DeskViewResolved {
  const { userId, canSeeTeamLeads, fieldAgents } = input;

  if (!canSeeTeamLeads) {
    return {
      deskAgentId: userId,
      deskLabel: "My desk",
    };
  }

  const selfAgent = fieldAgents.find((a) => a.id === userId);
  const ownLabel =
    selfAgent?.name?.trim() || selfAgent?.email?.trim() || "My desk";

  const raw = input.deskCookie?.trim() || "";

  if (raw === DESK_AGENT_ALL) {
    return {
      deskAgentId: null,
      deskLabel: "Team overview",
    };
  }

  if (!raw) {
    if (selfAgent) {
      return { deskAgentId: userId, deskLabel: ownLabel };
    }
    return { deskAgentId: null, deskLabel: "Team overview" };
  }

  const match = fieldAgents.find((a) => a.id === raw);
  if (match) {
    return {
      deskAgentId: match.id,
      deskLabel: match.name?.trim() || match.email,
    };
  }

  // Stale / cross-tenant / ineligible id — stay inside this workspace's field list.
  if (selfAgent) {
    return { deskAgentId: userId, deskLabel: ownLabel };
  }
  return { deskAgentId: null, deskLabel: "Team overview" };
}

export type LaunchpadIdentityMode = "own" | "other" | "team";

export function launchpadIdentityPresentation(input: {
  viewerUserId: string;
  deskAgentId: string | null;
  deskLabel: string;
}): { mode: LaunchpadIdentityMode; text: string } {
  if (input.deskAgentId == null) {
    return { mode: "team", text: "Team Overview" };
  }
  if (input.deskAgentId === input.viewerUserId) {
    return {
      mode: "own",
      text: `My Launchpad — ${input.deskLabel}`,
    };
  }
  return {
    mode: "other",
    text: `Viewing ${input.deskLabel}'s Launchpad`,
  };
}
