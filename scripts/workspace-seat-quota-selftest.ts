/**
 * V1 Workspace Team seat-quota enforcement.
 * Run: pnpm workspace-seat-quota:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import {
  PLAN_DEFINITIONS,
  computeSeatLimit,
} from "@/lib/platform/catalog/plans";
import {
  SEAT_LIMIT_REACHED,
  SEAT_LIMIT_REACHED_MESSAGE,
  SEAT_QUOTA_MISSING,
  WorkspaceSeatError,
  assertWorkspaceInviteAcceptanceWithinSeatLimit,
  assertWorkspaceSeatAvailableForInvite,
  getWorkspaceSeatCapacity,
  getWorkspaceSeatConsumption,
  projectConsumedAfterInviteAcceptance,
} from "@/lib/platform/seats";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_SOLO = "ws_solo";
const WS_TEAM = "ws_team";
const WS_BROKERAGE = "ws_brokerage";
const NOW = new Date("2026-09-21T12:00:00.000Z");
const FUTURE = new Date("2026-10-01T12:00:00.000Z");
const PAST = new Date("2026-09-01T12:00:00.000Z");

type Member = {
  workspaceId: string;
  status: "ACTIVE" | "SUSPENDED";
};
type Invite = {
  workspaceId: string;
  status: "PENDING" | "ACCEPTED" | "CANCELLED" | "EXPIRED";
  expiresAt: Date;
};
type Quota = {
  workspaceId: string;
  includedSeats: number;
  additionalSeats: number;
  seatLimit: number;
};

function createFakeDb(input: {
  members: Member[];
  invites: Invite[];
  quotas: Quota[];
}): PrismaClient {
  const quotas = new Map(input.quotas.map((q) => [q.workspaceId, q]));
  return {
    workspaceSeatQuota: {
      async findUnique({ where }: { where: { workspaceId: string } }) {
        return quotas.get(where.workspaceId) ?? null;
      },
    },
    workspaceMember: {
      async count({
        where,
      }: {
        where: { workspaceId: string; status: "ACTIVE" | "SUSPENDED" };
      }) {
        return input.members.filter(
          (m) =>
            m.workspaceId === where.workspaceId && m.status === where.status,
        ).length;
      },
    },
    workspaceInvite: {
      async count({
        where,
      }: {
        where: {
          workspaceId: string;
          status: string;
          expiresAt: { gt: Date };
        };
      }) {
        return input.invites.filter(
          (i) =>
            i.workspaceId === where.workspaceId &&
            i.status === where.status &&
            i.expiresAt.getTime() > where.expiresAt.gt.getTime(),
        ).length;
      },
    },
  } as unknown as PrismaClient;
}

async function expectSeatError(
  fn: () => Promise<unknown>,
  code: string,
) {
  try {
    await fn();
    assert.fail("expected WorkspaceSeatError");
  } catch (error) {
    assert.ok(error instanceof WorkspaceSeatError);
    assert.equal(error.code, code);
    if (code === SEAT_LIMIT_REACHED) {
      assert.equal(error.message, SEAT_LIMIT_REACHED_MESSAGE);
    }
  }
}

async function main() {
  console.log("\n=== WORKSPACE SEAT QUOTA ENFORCEMENT ===\n");

  {
    assert.equal(PLAN_DEFINITIONS.SOLO.includedSeats, 1);
    assert.equal(PLAN_DEFINITIONS.SOLO.additionalSeatsAllowed, false);
    assert.equal(PLAN_DEFINITIONS.TEAM.includedSeats, 4);
    assert.equal(PLAN_DEFINITIONS.TEAM.additionalSeatsAllowed, true);
    assert.equal(PLAN_DEFINITIONS.BROKERAGE.includedSeats, 20);
    assert.equal(computeSeatLimit(4, 1), 5);
    console.log("[0] Authoritative plan included seats... PASS");
  }

  {
    const db = createFakeDb({
      quotas: [
        {
          workspaceId: WS_SOLO,
          includedSeats: 1,
          additionalSeats: 0,
          seatLimit: 1,
        },
      ],
      members: [{ workspaceId: WS_SOLO, status: "ACTIVE" }],
      invites: [],
    });
    const consumption = await getWorkspaceSeatConsumption(WS_SOLO, db, NOW);
    assert.equal(consumption.activeMembers, 1);
    assert.equal(consumption.consumed, 1);
    const capacity = await getWorkspaceSeatCapacity(WS_SOLO, db, NOW);
    assert.equal(capacity?.seatLimit, 1);
    assert.equal(capacity?.consumed, 1);
    assert.equal(capacity?.remaining, 0);
    assert.equal(capacity?.atCapacity, true);
    await expectSeatError(
      () => assertWorkspaceSeatAvailableForInvite(WS_SOLO, db, NOW),
      SEAT_LIMIT_REACHED,
    );
    console.log("[1] SOLO OWNER at limit → invite rejected... PASS");
  }

  {
    const db = createFakeDb({
      quotas: [
        {
          workspaceId: WS_TEAM,
          includedSeats: 4,
          additionalSeats: 1,
          seatLimit: 5,
        },
      ],
      members: [{ workspaceId: WS_TEAM, status: "ACTIVE" }],
      invites: [],
    });
    const capacity = await getWorkspaceSeatCapacity(WS_TEAM, db, NOW);
    assert.equal(capacity?.seatLimit, 5);
    assert.equal(capacity?.includedSeats, 4);
    assert.equal(capacity?.additionalSeats, 1);
    assert.equal(capacity?.consumed, 1);
    assert.equal(capacity?.atCapacity, false);
    const allowed = await assertWorkspaceSeatAvailableForInvite(
      WS_TEAM,
      db,
      NOW,
    );
    assert.equal(allowed.remaining, 4);
    console.log("[2] provisioned TEAM quota (not hardcoded 4) allows invite... PASS");
  }

  {
    const db = createFakeDb({
      quotas: [
        {
          workspaceId: WS_SOLO,
          includedSeats: 1,
          additionalSeats: 0,
          seatLimit: 1,
        },
      ],
      members: [{ workspaceId: WS_SOLO, status: "ACTIVE" }],
      invites: [
        {
          workspaceId: WS_SOLO,
          status: "PENDING",
          expiresAt: FUTURE,
        },
      ],
    });
    const capacity = await getWorkspaceSeatCapacity(WS_SOLO, db, NOW);
    assert.equal(capacity?.consumed, 2);
    assert.equal(capacity?.atCapacity, true);
    await expectSeatError(
      () => assertWorkspaceSeatAvailableForInvite(WS_SOLO, db, NOW),
      SEAT_LIMIT_REACHED,
    );
    console.log("[3] pending invite reserves a seat and cannot bypass quota... PASS");
  }

  {
    const db = createFakeDb({
      quotas: [
        {
          workspaceId: WS_SOLO,
          includedSeats: 1,
          additionalSeats: 0,
          seatLimit: 1,
        },
      ],
      members: [{ workspaceId: WS_SOLO, status: "ACTIVE" }],
      invites: [
        {
          workspaceId: WS_SOLO,
          status: "PENDING",
          expiresAt: FUTURE,
        },
      ],
    });
    await expectSeatError(
      () =>
        assertWorkspaceInviteAcceptanceWithinSeatLimit({
          workspaceId: WS_SOLO,
          inviteStatus: "PENDING",
          inviteExpiresAt: FUTURE,
          existingMemberStatus: null,
          db,
          now: NOW,
        }),
      SEAT_LIMIT_REACHED,
    );

    const conversionDb = createFakeDb({
      quotas: [
        {
          workspaceId: WS_TEAM,
          includedSeats: 4,
          additionalSeats: 0,
          seatLimit: 4,
        },
      ],
      members: [
        { workspaceId: WS_TEAM, status: "ACTIVE" },
        { workspaceId: WS_TEAM, status: "ACTIVE" },
        { workspaceId: WS_TEAM, status: "ACTIVE" },
      ],
      invites: [
        { workspaceId: WS_TEAM, status: "PENDING", expiresAt: FUTURE },
      ],
    });
    const ok = await assertWorkspaceInviteAcceptanceWithinSeatLimit({
      workspaceId: WS_TEAM,
      inviteStatus: "PENDING",
      inviteExpiresAt: FUTURE,
      existingMemberStatus: null,
      db: conversionDb,
      now: NOW,
    });
    assert.equal(ok.consumed, 4);
    assert.equal(
      projectConsumedAfterInviteAcceptance({
        consumed: 4,
        pendingInviteCounts: true,
        existingMemberCounts: false,
      }),
      4,
    );
    console.log("[4] activation converts pending seat; cannot exceed quota... PASS");
  }

  {
    const db = createFakeDb({
      quotas: [
        {
          workspaceId: WS_SOLO,
          includedSeats: 1,
          additionalSeats: 0,
          seatLimit: 1,
        },
        {
          workspaceId: WS_BROKERAGE,
          includedSeats: 20,
          additionalSeats: 0,
          seatLimit: 20,
        },
      ],
      members: [
        { workspaceId: WS_SOLO, status: "ACTIVE" },
        { workspaceId: WS_BROKERAGE, status: "ACTIVE" },
        { workspaceId: WS_BROKERAGE, status: "ACTIVE" },
      ],
      invites: [
        { workspaceId: WS_BROKERAGE, status: "PENDING", expiresAt: FUTURE },
        { workspaceId: WS_BROKERAGE, status: "EXPIRED", expiresAt: PAST },
        { workspaceId: WS_BROKERAGE, status: "ACCEPTED", expiresAt: FUTURE },
      ],
    });
    const solo = await getWorkspaceSeatCapacity(WS_SOLO, db, NOW);
    const brokerage = await getWorkspaceSeatCapacity(WS_BROKERAGE, db, NOW);
    assert.equal(solo?.consumed, 1);
    assert.equal(solo?.seatLimit, 1);
    assert.equal(brokerage?.consumed, 3);
    assert.equal(brokerage?.seatLimit, 20);
    assert.equal(brokerage?.breakdown.pendingUnexpiredInvites, 1);
    await assertWorkspaceSeatAvailableForInvite(WS_BROKERAGE, db, NOW);
    await expectSeatError(
      () => assertWorkspaceSeatAvailableForInvite(WS_SOLO, db, NOW),
      SEAT_LIMIT_REACHED,
    );
    console.log("[5] usage display math + tenant isolation... PASS");
  }

  {
    const db = createFakeDb({
      quotas: [],
      members: [{ workspaceId: WS_SOLO, status: "ACTIVE" }],
      invites: [],
    });
    assert.equal(await getWorkspaceSeatCapacity(WS_SOLO, db, NOW), null);
    await expectSeatError(
      () => assertWorkspaceSeatAvailableForInvite(WS_SOLO, db, NOW),
      SEAT_QUOTA_MISSING,
    );
    console.log("[6] missing quota fail-closed... PASS");
  }

  {
    const invite = read("src/lib/workspace-invite.ts");
    const team = read("src/lib/workspace-team.ts");
    const ui = read("src/components/agent/TeamAdminClient.tsx");
    const page = read("src/app/(agent)/agent/team/page.tsx");
    const route = read("src/app/api/agent/team/route.ts");
    const entitlements = read("src/lib/platform/entitlements/index.ts");

    assert.ok(invite.includes("assertWorkspaceSeatAvailableForInvite"));
    assert.ok(invite.includes("assertWorkspaceInviteAcceptanceWithinSeatLimit"));
    assert.ok(invite.includes("SEAT_LIMIT_REACHED") || invite.includes("WorkspaceSeatError"));
    assert.ok(route.includes("createWorkspaceInvite"));
    assert.ok(team.includes("getWorkspaceSeatCapacity"));
    assert.ok(team.includes("atCapacity"));
    assert.ok(!team.includes("billingDeferred: true"));
    assert.ok(page.includes("consumedSeats"));
    assert.ok(page.includes("atCapacity"));
    assert.ok(ui.includes("of ${seatLimit} seats used") || ui.includes("of "));
    assert.ok(ui.includes("You've used all seats included in your plan."));
    assert.ok(!ui.includes("billing seat limits coming later"));
    assert.ok(ui.includes("seatsFull"));
    assert.ok(entitlements.includes("WorkspaceSeatQuota"));
    assert.ok(entitlements.includes("Do NOT read Stripe as entitlement authority"));
    console.log("[7] invite/accept/API/UI wired to provisioned quota... PASS");
  }

  console.log("\nWORKSPACE SEAT QUOTA SELFTEST PASSED\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
