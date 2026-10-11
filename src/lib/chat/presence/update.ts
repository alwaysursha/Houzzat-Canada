/**
 * AgentProfile presence writes. Callers authorize first (own userId only).
 * Uses updateMany with conditional where-clauses for concurrency safety.
 * Narrow Db surface so this compiles before prisma generate for new columns.
 */

import { PRESENCE_REFRESH_REMAINING_MS } from "@/lib/chat/presence/constants";
import {
  maxClearablePresenceUntil,
  nextPresenceUntil,
  shouldSkipActivePresenceRefresh,
  type AgentAvailabilityPreference,
  type AgentPresenceRow,
} from "@/lib/chat/presence/state";

export type AgentPresenceDb = {
  agentProfile: {
    findUnique: (args: {
      where: { userId: string };
      select: {
        availabilityPreference: true;
        presenceUntil: true;
      };
    }) => Promise<AgentPresenceRow | null>;
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
    create: (args: {
      data: { userId: string };
    }) => Promise<{ userId: string }>;
  };
};

export async function loadAgentPresenceState(
  db: AgentPresenceDb,
  userId: string,
): Promise<AgentPresenceRow | null> {
  return db.agentProfile.findUnique({
    where: { userId },
    select: {
      availabilityPreference: true,
      presenceUntil: true,
    },
  });
}

async function ensureAgentProfile(
  db: AgentPresenceDb,
  userId: string,
): Promise<void> {
  const existing = await db.agentProfile.findUnique({
    where: { userId },
    select: {
      availabilityPreference: true,
      presenceUntil: true,
    },
  });
  if (existing) return;
  try {
    await db.agentProfile.create({ data: { userId } });
  } catch {
    // Concurrent create — ignore.
  }
}

export async function applyAgentPresenceHeartbeat(
  db: AgentPresenceDb,
  input: { userId: string; now?: Date },
): Promise<{ updated: boolean; skipped: boolean }> {
  const now = input.now ?? new Date();
  await ensureAgentProfile(db, input.userId);
  const current = await loadAgentPresenceState(db, input.userId);
  if (!current) {
    return { updated: false, skipped: false };
  }
  if (shouldSkipActivePresenceRefresh(current.presenceUntil, now)) {
    return { updated: false, skipped: true };
  }
  const until = nextPresenceUntil(now);
  const freshCutoff = new Date(now.getTime() + PRESENCE_REFRESH_REMAINING_MS);
  /**
   * Heartbeats never change preference. Only refresh presence while AVAILABLE
   * so a delayed heartbeat cannot recreate Online presence after AWAY.
   */
  const result = await db.agentProfile.updateMany({
    where: {
      userId: input.userId,
      availabilityPreference: "AVAILABLE",
      OR: [{ presenceUntil: null }, { presenceUntil: { lte: freshCutoff } }],
    },
    data: { presenceUntil: until },
  });
  return { updated: result.count > 0, skipped: result.count === 0 };
}

export async function clearAgentPresenceHeartbeat(
  db: AgentPresenceDb,
  input: { userId: string; now?: Date },
): Promise<{ updated: boolean; skipped: boolean }> {
  const now = input.now ?? new Date();
  const maxClearable = maxClearablePresenceUntil(now);
  const result = await db.agentProfile.updateMany({
    where: {
      userId: input.userId,
      presenceUntil: { not: null, lte: maxClearable },
    },
    data: { presenceUntil: null },
  });
  return { updated: result.count > 0, skipped: result.count === 0 };
}

/**
 * Preference writes. AWAY clears presenceUntil so Offline is not masked
 * after flipping back to AVAILABLE without a new heartbeat.
 * AVAILABLE never invents presenceUntil (requires a later heartbeat).
 */
export async function setAgentAvailabilityPreference(
  db: AgentPresenceDb,
  input: {
    userId: string;
    preference: AgentAvailabilityPreference;
  },
): Promise<{ updated: boolean }> {
  await ensureAgentProfile(db, input.userId);
  if (input.preference === "AWAY") {
    const result = await db.agentProfile.updateMany({
      where: { userId: input.userId },
      data: {
        availabilityPreference: "AWAY",
        presenceUntil: null,
      },
    });
    return { updated: result.count > 0 };
  }
  const result = await db.agentProfile.updateMany({
    where: { userId: input.userId },
    data: { availabilityPreference: "AVAILABLE" },
  });
  return { updated: result.count > 0 };
}
