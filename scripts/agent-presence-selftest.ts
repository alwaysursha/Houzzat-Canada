/**
 * Chat V1 Milestone 4I — agent presence backend selftest (no DB).
 * Run: pnpm agent-presence:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRESENCE_RATE_LIMIT,
  PRESENCE_REFRESH_REMAINING_MS,
  PRESENCE_TTL_MS,
} from "../src/lib/chat/presence/constants";
import {
  allowAgentPresenceUpdate,
  clearAgentPresenceRateLimitsForTests,
} from "../src/lib/chat/presence/rate-limit";
import {
  isPresenceFresh,
  maxClearablePresenceUntil,
  nextPresenceUntil,
  parseAgentPresenceBody,
  resolveAgentAvailability,
  resolveAssignedAgentAvailability,
  shouldSkipActivePresenceRefresh,
  type AgentPresenceRow,
} from "../src/lib/chat/presence/state";
import {
  applyAgentPresenceHeartbeat,
  clearAgentPresenceHeartbeat,
  loadAgentPresenceState,
  setAgentAvailabilityPreference,
  type AgentPresenceDb,
} from "../src/lib/chat/presence/update";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testPureHelpersAndPrecedence() {
  assert.ok(PRESENCE_TTL_MS >= 80_000 && PRESENCE_TTL_MS <= 100_000);
  assert.ok(PRESENCE_REFRESH_REMAINING_MS < PRESENCE_TTL_MS);

  const now = new Date("2026-10-10T12:00:00.000Z");
  assert.equal(isPresenceFresh(null, now), false);
  assert.equal(isPresenceFresh(new Date(now.getTime() - 1), now), false);
  assert.equal(isPresenceFresh(new Date(now.getTime() + 1), now), true);
  assert.equal(
    nextPresenceUntil(now).getTime() - now.getTime(),
    PRESENCE_TTL_MS,
  );
  assert.equal(
    shouldSkipActivePresenceRefresh(
      new Date(now.getTime() + PRESENCE_REFRESH_REMAINING_MS + 1),
      now,
    ),
    true,
  );
  assert.equal(
    shouldSkipActivePresenceRefresh(
      new Date(now.getTime() + PRESENCE_REFRESH_REMAINING_MS - 1),
      now,
    ),
    false,
  );
  assert.equal(
    maxClearablePresenceUntil(now).getTime() - now.getTime(),
    PRESENCE_TTL_MS,
  );

  // Offline: missing / expired
  assert.equal(resolveAgentAvailability(null, now), "offline");
  assert.equal(
    resolveAgentAvailability(
      {
        availabilityPreference: "AVAILABLE",
        presenceUntil: null,
      },
      now,
    ),
    "offline",
  );
  assert.equal(
    resolveAgentAvailability(
      {
        availabilityPreference: "AVAILABLE",
        presenceUntil: new Date(now.getTime() - 1),
      },
      now,
    ),
    "offline",
  );

  // Online: AVAILABLE + fresh presence
  assert.equal(
    resolveAgentAvailability(
      {
        availabilityPreference: "AVAILABLE",
        presenceUntil: new Date(now.getTime() + 1),
      },
      now,
    ),
    "online",
  );

  // Manual AWAY wins over fresh presenceUntil
  assert.equal(
    resolveAgentAvailability(
      {
        availabilityPreference: "AWAY",
        presenceUntil: new Date(now.getTime() + PRESENCE_TTL_MS),
      },
      now,
    ),
    "away",
  );
  assert.equal(
    resolveAgentAvailability(
      {
        availabilityPreference: "AWAY",
        presenceUntil: null,
      },
      now,
    ),
    "away",
  );

  // Unassigned / ineligible never Online
  assert.equal(
    resolveAssignedAgentAvailability({
      assignedAgentId: null,
      assignedAgentEligible: true,
      presence: {
        availabilityPreference: "AVAILABLE",
        presenceUntil: new Date(now.getTime() + 1),
      },
      now,
    }),
    "offline",
  );
  assert.equal(
    resolveAssignedAgentAvailability({
      assignedAgentId: "agent-1",
      assignedAgentEligible: false,
      presence: {
        availabilityPreference: "AVAILABLE",
        presenceUntil: new Date(now.getTime() + 1),
      },
      now,
    }),
    "offline",
  );
}

function testBodyParserPrivacy() {
  assert.deepEqual(parseAgentPresenceBody({ active: true }), {
    ok: true,
    active: true,
  });
  assert.deepEqual(parseAgentPresenceBody({ preference: "AWAY" }), {
    ok: true,
    preference: "AWAY",
  });
  assert.deepEqual(
    parseAgentPresenceBody({ active: true, preference: "AVAILABLE" }),
    { ok: true, active: true, preference: "AVAILABLE" },
  );
  assert.equal(parseAgentPresenceBody({ active: true, userId: "x" }).ok, false);
  assert.equal(
    parseAgentPresenceBody({ active: true, workspaceId: "ws" }).ok,
    false,
  );
  assert.equal(
    parseAgentPresenceBody({ active: true, lastActiveAt: 1 }).ok,
    false,
  );
  assert.equal(parseAgentPresenceBody({ preference: "ONLINE" }).ok, false);
  assert.equal(parseAgentPresenceBody({}).ok, false);
  assert.equal(parseAgentPresenceBody(null).ok, false);
}

function testRateLimit() {
  clearAgentPresenceRateLimitsForTests();
  let blocked = false;
  for (let i = 0; i < PRESENCE_RATE_LIMIT + 5; i += 1) {
    const rate = allowAgentPresenceUpdate({ userId: "agent-a" });
    if (!rate.allowed) {
      blocked = true;
      break;
    }
  }
  assert.equal(blocked, true);
  const other = allowAgentPresenceUpdate({ userId: "agent-b" });
  assert.equal(other.allowed, true);
}

function matchPresenceWhere(
  row: AgentPresenceRow,
  where: Record<string, unknown>,
): boolean {
  if (where.availabilityPreference != null) {
    if (row.availabilityPreference !== where.availabilityPreference) {
      return false;
    }
  }
  if (where.presenceUntil && typeof where.presenceUntil === "object") {
    const cond = where.presenceUntil as {
      not?: null;
      lte?: Date;
    };
    if (cond.not === null && row.presenceUntil == null) return false;
    if (cond.lte && row.presenceUntil && row.presenceUntil > cond.lte) {
      return false;
    }
    if (cond.lte && row.presenceUntil == null && cond.not === null) {
      return false;
    }
  }
  if (Array.isArray(where.OR)) {
    return where.OR.some((clause) => {
      const c = clause as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(c, "presenceUntil")) {
        if (c.presenceUntil === null) return row.presenceUntil == null;
        if (
          c.presenceUntil &&
          typeof c.presenceUntil === "object" &&
          "lte" in (c.presenceUntil as object)
        ) {
          const lte = (c.presenceUntil as { lte: Date }).lte;
          return row.presenceUntil == null || row.presenceUntil <= lte;
        }
      }
      return false;
    });
  }
  return true;
}

function createMemoryDb(seed?: Map<string, AgentPresenceRow>): AgentPresenceDb {
  const store = seed ?? new Map<string, AgentPresenceRow>();
  return {
    agentProfile: {
      findUnique: async (args) => store.get(args.where.userId) ?? null,
      create: async (args) => {
        if (!store.has(args.data.userId)) {
          store.set(args.data.userId, {
            availabilityPreference: "AVAILABLE",
            presenceUntil: null,
          });
        }
        return { userId: args.data.userId };
      },
      updateMany: async (args) => {
        const userId = String(args.where.userId);
        const row = store.get(userId);
        if (!row) return { count: 0 };
        if (!matchPresenceWhere(row, args.where)) return { count: 0 };
        const data = args.data as Partial<AgentPresenceRow>;
        store.set(userId, {
          availabilityPreference:
            data.availabilityPreference ?? row.availabilityPreference,
          presenceUntil:
            data.presenceUntil === undefined
              ? row.presenceUntil
              : (data.presenceUntil as Date | null),
        });
        return { count: 1 };
      },
    },
  };
}

async function testConditionalUpdatesAndAwayRace() {
  const now = new Date("2026-10-10T15:00:00.000Z");
  const db = createMemoryDb();
  await db.agentProfile.create({ data: { userId: "a1" } });

  const beat1 = await applyAgentPresenceHeartbeat(db, { userId: "a1", now });
  assert.equal(beat1.updated, true);
  let row = await loadAgentPresenceState(db, "a1");
  assert.equal(resolveAgentAvailability(row, now), "online");

  const beatSkip = await applyAgentPresenceHeartbeat(db, {
    userId: "a1",
    now,
  });
  assert.equal(beatSkip.skipped, true);

  await setAgentAvailabilityPreference(db, {
    userId: "a1",
    preference: "AWAY",
  });
  row = await loadAgentPresenceState(db, "a1");
  assert.equal(row?.availabilityPreference, "AWAY");
  assert.equal(row?.presenceUntil, null);
  assert.equal(resolveAgentAvailability(row, now), "away");

  // Stale heartbeat while AWAY must not recreate presenceUntil
  const beatAway = await applyAgentPresenceHeartbeat(db, {
    userId: "a1",
    now,
  });
  assert.equal(beatAway.updated, false);
  row = await loadAgentPresenceState(db, "a1");
  assert.equal(row?.presenceUntil, null);
  assert.equal(resolveAgentAvailability(row, now), "away");

  await setAgentAvailabilityPreference(db, {
    userId: "a1",
    preference: "AVAILABLE",
  });
  row = await loadAgentPresenceState(db, "a1");
  assert.equal(resolveAgentAvailability(row, now), "offline");

  const beat2 = await applyAgentPresenceHeartbeat(db, { userId: "a1", now });
  assert.equal(beat2.updated, true);
  row = await loadAgentPresenceState(db, "a1");
  assert.equal(resolveAgentAvailability(row, now), "online");

  const clear = await clearAgentPresenceHeartbeat(db, { userId: "a1", now });
  assert.equal(clear.updated, true);
  row = await loadAgentPresenceState(db, "a1");
  assert.equal(resolveAgentAvailability(row, now), "offline");
}

async function testTtlExpiry() {
  const now = new Date("2026-10-10T16:00:00.000Z");
  const db = createMemoryDb(
    new Map([
      [
        "a2",
        {
          availabilityPreference: "AVAILABLE",
          presenceUntil: new Date(now.getTime() - 1),
        },
      ],
    ]),
  );
  const row = await loadAgentPresenceState(db, "a2");
  assert.equal(resolveAgentAvailability(row, now), "offline");
}

function testWiringAuthAndPrivacySurface() {
  const route = read("src/app/api/agent/presence/route.ts");
  assert.ok(route.includes("requireAgentContextFromRequest"));
  assert.ok(route.includes("handleAgentPresenceUpdate"));
  assert.ok(!route.includes("userId"));
  assert.ok(!route.includes("workspaceId"));

  const handler = read("src/lib/conversations/agent-presence.ts");
  assert.ok(handler.includes("ctx.user.id"));
  assert.ok(handler.includes("parseAgentPresenceBody"));
  assert.ok(!handler.includes("body.userId"));
  assert.ok(!handler.includes("body.workspaceId"));

  const customer = read("src/lib/conversations/customer-conversation.ts");
  assert.ok(customer.includes("agentAvailability"));
  assert.ok(customer.includes("resolveAssignedAgentAvailability"));
  assert.ok(customer.includes("loadAgentPresenceState"));
  assert.ok(!customer.includes("presenceUntil"));
  assert.ok(!customer.includes("availabilityPreference"));

  const update = read("src/lib/chat/presence/update.ts");
  assert.ok(update.includes('availabilityPreference: "AVAILABLE"'));
  assert.ok(update.includes("AgentPresenceDb"));

  const schema = read("prisma/schema.prisma");
  assert.ok(schema.includes("enum AgentAvailabilityPreference"));
  assert.ok(schema.includes("presenceUntil"));

  assert.ok(
    read("prisma/migrations/20261011140000_agent_availability_presence/migration.sql").includes(
      "AgentAvailabilityPreference",
    ),
  );
}

async function main() {
  testPureHelpersAndPrecedence();
  testBodyParserPrivacy();
  testRateLimit();
  await testConditionalUpdatesAndAwayRace();
  await testTtlExpiry();
  testWiringAuthAndPrivacySurface();
  console.log("agent-presence-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
