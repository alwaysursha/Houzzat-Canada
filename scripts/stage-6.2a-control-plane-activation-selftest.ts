/**
 * Stage 6.2A — control-plane activation foundation selftest.
 * Run: node --import tsx scripts/stage-6.2a-control-plane-activation-selftest.ts
 *
 * No production writes. Uses in-memory fakes for idempotency paths.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ADDITIONAL_AGENT_ANNUAL_CENTS,
  FEATURE_AGENT_APP,
  FEATURE_CUSTOM_CONSUMER_APP,
  FEATURE_LIVE_CHAT,
  FEATURE_SEO_FOUNDATION,
  FEATURE_TEAM_MANAGEMENT,
  HOUZZAT_LEGACY_ADDITIONAL_SEATS,
  HOUZZAT_LEGACY_ADDITIONAL_SEATS_ALLOWED,
  HOUZZAT_LEGACY_BILLING_CUSTOMER_EMAIL,
  HOUZZAT_LEGACY_ENTITLEMENT_PROFILE,
  HOUZZAT_LEGACY_INCLUDED_SEATS,
  HOUZZAT_LEGACY_PROFILE_READY,
  HOUZZAT_LEGACY_SEAT_LIMIT,
  PLATFORM_MASTER_ADMIN_EMAIL,
  PLAN_DEFINITIONS,
  STANDARD_SETUP_FEE_CENTS,
  WORKSPACE_INVITE_TTL_MS,
  assertActiveMasterAdminOperator,
  assertAdditionalSeatAllowedForPlan,
  EntitlementProfileIncompleteError,
  getHouzzatLegacyOwnerDecisionsRequired,
  grandfatherHouzzatWorkspace,
  grandfatherWorkspaceWithProfile,
  isHouzzatLegacyProfileReady,
  normalizeActivationEmail,
  planAllowsSeatExpansion,
  planFeatureEnabled,
  PlatformOperatorAuthError,
  provisionPlatformMasterAdmin,
  resolveHouzzatLegacyEntitlementProfile,
  resolvePlanEntitlementProfile,
  type MaterializedEntitlementProfile,
} from "../src/lib/platform";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function listTsFiles(dir: string): string[] {
  const abs = join(root, dir);
  const out: string[] = [];
  for (const name of readdirSync(abs, { withFileTypes: true })) {
    const rel = join(dir, name.name);
    if (name.isDirectory()) out.push(...listTsFiles(rel));
    else if (name.name.endsWith(".ts") || name.name.endsWith(".tsx")) out.push(rel);
  }
  return out;
}

type FakeEntitlement = {
  workspaceId: string;
  featureCode: string;
  enabled: boolean;
  source: string;
};

type FakeSeatQuota = {
  workspaceId: string;
  includedSeats: number;
  additionalSeats: number;
  seatLimit: number;
};

type FakeSubscription = {
  id: string;
  workspaceId: string | null;
  billingCustomerId: string;
  source: string;
  status: string;
  planCode: string | null;
  entitlementProfileCode: string | null;
  includedSeats: number;
  additionalSeats: number;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  stripeCheckoutSessionId: string | null;
  commercialSnapshotJson: unknown;
  createdAt: Date;
};

type FakeState = {
  workspaces: Map<
    string,
    { id: string; slug: string; currentSubscriptionId: string | null }
  >;
  billingCustomers: Map<
    string,
    { id: string; workspaceId: string; email: string; source: string }
  >;
  subscriptions: Map<string, FakeSubscription>;
  entitlements: FakeEntitlement[];
  seatQuotas: Map<string, FakeSeatQuota>;
  auditEvents: Array<{ action: string; entityId: string }>;
  users: Map<string, { id: string; email: string; role: string }>;
  operators: Map<
    string,
    { id: string; userId: string; role: string; status: string }
  >;
  members: Array<{ userId: string; workspaceId: string }>;
  nextId: number;
};

function createFakePrisma(state: FakeState) {
  const id = (prefix: string) => `${prefix}_${state.nextId++}`;

  return {
    workspace: {
      async findUnique({ where }: { where: { id?: string; slug?: string } }) {
        if (where.id) {
          for (const w of state.workspaces.values()) {
            if (w.id === where.id) return w;
          }
          return null;
        }
        if (where.slug) return state.workspaces.get(where.slug) ?? null;
        return null;
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: { currentSubscriptionId: string };
      }) {
        for (const w of state.workspaces.values()) {
          if (w.id === where.id) {
            w.currentSubscriptionId = data.currentSubscriptionId;
            return w;
          }
        }
        throw new Error("workspace not found");
      },
    },
    billingCustomer: {
      async findUnique({ where }: { where: { workspaceId: string } }) {
        for (const c of state.billingCustomers.values()) {
          if (c.workspaceId === where.workspaceId) return c;
        }
        return null;
      },
      async create({
        data,
      }: {
        data: {
          workspaceId: string;
          email: string;
          source: string;
          stripeCustomerId: null;
          prospectId: null;
        };
      }) {
        const row = {
          id: id("bc"),
          workspaceId: data.workspaceId,
          email: data.email,
          source: data.source,
        };
        state.billingCustomers.set(row.id, row);
        return row;
      },
    },
    subscription: {
      async findUnique({ where }: { where: { id: string } }) {
        return state.subscriptions.get(where.id) ?? null;
      },
      async findFirst({
        where,
      }: {
        where: {
          workspaceId: string;
          source: string;
          entitlementProfileCode: string;
          status: { not: string };
        };
        orderBy: { createdAt: string };
      }) {
        const rows = [...state.subscriptions.values()].filter(
          (s) =>
            s.workspaceId === where.workspaceId &&
            s.source === where.source &&
            s.entitlementProfileCode === where.entitlementProfileCode &&
            s.status !== where.status.not,
        );
        rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        return rows[0] ?? null;
      },
      async create({
        data,
      }: {
        data: Omit<FakeSubscription, "id" | "createdAt"> & {
          offerId: null;
          billingCadence: null;
          currency: string;
          recurringAmountCents: null;
          setupFeeCents: null;
        };
      }) {
        const row: FakeSubscription = {
          id: id("sub"),
          workspaceId: data.workspaceId,
          billingCustomerId: data.billingCustomerId,
          source: data.source,
          status: data.status,
          planCode: data.planCode,
          entitlementProfileCode: data.entitlementProfileCode,
          includedSeats: data.includedSeats,
          additionalSeats: data.additionalSeats,
          stripeSubscriptionId: data.stripeSubscriptionId,
          stripePriceId: data.stripePriceId,
          stripeCheckoutSessionId: data.stripeCheckoutSessionId,
          commercialSnapshotJson: data.commercialSnapshotJson,
          createdAt: new Date(),
        };
        state.subscriptions.set(row.id, row);
        return row;
      },
    },
    workspaceEntitlement: {
      async upsert({
        where,
        create,
        update,
      }: {
        where: {
          workspaceId_featureCode: { workspaceId: string; featureCode: string };
        };
        create: FakeEntitlement;
        update: { enabled: boolean; source: string };
      }) {
        const key = where.workspaceId_featureCode;
        const idx = state.entitlements.findIndex(
          (e) =>
            e.workspaceId === key.workspaceId &&
            e.featureCode === key.featureCode,
        );
        if (idx >= 0) {
          state.entitlements[idx] = {
            ...state.entitlements[idx]!,
            enabled: update.enabled,
            source: update.source,
          };
          return state.entitlements[idx];
        }
        state.entitlements.push({ ...create });
        return create;
      },
    },
    workspaceSeatQuota: {
      async findUnique({ where }: { where: { workspaceId: string } }) {
        return state.seatQuotas.get(where.workspaceId) ?? null;
      },
      async upsert({
        where,
        create,
        update,
      }: {
        where: { workspaceId: string };
        create: FakeSeatQuota;
        update: Omit<FakeSeatQuota, "workspaceId">;
      }) {
        const existing = state.seatQuotas.get(where.workspaceId);
        if (existing) {
          const next = { workspaceId: where.workspaceId, ...update };
          state.seatQuotas.set(where.workspaceId, next);
          return next;
        }
        state.seatQuotas.set(where.workspaceId, create);
        return create;
      },
    },
    platformAuditEvent: {
      async create({
        data,
      }: {
        data: { action: string; entityId: string };
        select: { id: true };
      }) {
        state.auditEvents.push({
          action: data.action,
          entityId: data.entityId,
        });
        return { id: id("audit") };
      },
    },
    user: {
      async findUnique({ where }: { where: { id?: string; email?: string } }) {
        if (where.email) {
          for (const u of state.users.values()) {
            if (u.email === where.email) return u;
          }
          return null;
        }
        if (where.id) return state.users.get(where.id) ?? null;
        return null;
      },
    },
    platformOperator: {
      async findUnique({ where }: { where: { userId: string } }) {
        for (const op of state.operators.values()) {
          if (op.userId === where.userId) return op;
        }
        return null;
      },
      async create({
        data,
      }: {
        data: {
          userId: string;
          role: string;
          status: string;
          createdByOperatorId: string | null;
        };
        select: { id: true; userId: true; role: true };
      }) {
        const row = {
          id: id("op"),
          userId: data.userId,
          role: data.role,
          status: data.status,
        };
        state.operators.set(row.id, row);
        return row;
      },
    },
    workspaceMember: {
      async count({ where }: { where: { userId: string } }) {
        return state.members.filter((m) => m.userId === where.userId).length;
      },
    },
  };
}

async function main() {
console.log("\n=== STAGE 6.2A — CONTROL-PLANE ACTIVATION FOUNDATION ===\n");

// 1. Plan catalog
{
  assert.equal(PLAN_DEFINITIONS.SOLO.includedSeats, 1);
  assert.equal(PLAN_DEFINITIONS.SOLO.monthlyPriceCents, 39_900);
  assert.equal(PLAN_DEFINITIONS.SOLO.annualPriceCents, 399_000);
  assert.equal(PLAN_DEFINITIONS.SOLO.additionalSeatsAllowed, false);

  assert.equal(PLAN_DEFINITIONS.TEAM.includedSeats, 4);
  assert.equal(PLAN_DEFINITIONS.TEAM.monthlyPriceCents, 59_900);
  assert.equal(PLAN_DEFINITIONS.TEAM.annualPriceCents, 599_000);
  assert.equal(PLAN_DEFINITIONS.TEAM.additionalSeatsAllowed, true);

  assert.equal(PLAN_DEFINITIONS.BROKERAGE.includedSeats, 20);
  assert.equal(PLAN_DEFINITIONS.BROKERAGE.monthlyPriceCents, 149_900);
  assert.equal(PLAN_DEFINITIONS.BROKERAGE.annualPriceCents, 1_499_000);
  assert.equal(PLAN_DEFINITIONS.BROKERAGE.additionalSeatsAllowed, true);

  assert.equal(STANDARD_SETUP_FEE_CENTS, 49_900);
  assert.equal(ADDITIONAL_AGENT_ANNUAL_CENTS, 89_900);
  assert.equal(PLAN_DEFINITIONS.SOLO.consumerBrandedApp.available, false);
  assert.equal(PLAN_DEFINITIONS.TEAM.consumerBrandedApp.oneTimeCents, 250_000);
  assert.equal(
    PLAN_DEFINITIONS.BROKERAGE.consumerBrandedApp.oneTimeCents,
    199_900,
  );
  console.log("[1] Plan catalog commercial constants... PASS");
}

// 2. Live chat + SEO matrix
{
  assert.equal(planFeatureEnabled("SOLO", FEATURE_LIVE_CHAT), false);
  assert.equal(planFeatureEnabled("TEAM", FEATURE_LIVE_CHAT), true);
  assert.equal(planFeatureEnabled("BROKERAGE", FEATURE_LIVE_CHAT), true);
  assert.equal(planFeatureEnabled("SOLO", FEATURE_SEO_FOUNDATION), true);
  assert.equal(planFeatureEnabled("TEAM", FEATURE_SEO_FOUNDATION), true);
  assert.equal(planFeatureEnabled("BROKERAGE", FEATURE_SEO_FOUNDATION), true);
  console.log("[2] LIVE_CHAT + SEO_FOUNDATION plan matrix... PASS");
}

// 3. Seat expansion rules
{
  assert.equal(planAllowsSeatExpansion("SOLO"), false);
  assert.equal(planAllowsSeatExpansion("TEAM"), true);
  assert.equal(planAllowsSeatExpansion("BROKERAGE"), true);
  assert.throws(() => assertAdditionalSeatAllowedForPlan("SOLO"));
  assert.doesNotThrow(() => assertAdditionalSeatAllowedForPlan("TEAM"));
  assert.doesNotThrow(() => assertAdditionalSeatAllowedForPlan("BROKERAGE"));
  console.log("[3] Solo blocks / Team+Brokerage allow seat expansion... PASS");
}

// 4. HOUZZAT_LEGACY locked profile (Stage 6.2B)
{
  assert.equal(HOUZZAT_LEGACY_PROFILE_READY, true);
  assert.equal(isHouzzatLegacyProfileReady(), true);
  const profile = resolveHouzzatLegacyEntitlementProfile();
  assert.equal(profile.code, HOUZZAT_LEGACY_ENTITLEMENT_PROFILE);
  assert.equal(profile.includedSeats, 10);
  assert.equal(profile.additionalSeats, 0);
  assert.equal(profile.additionalSeatsAllowed, true);
  assert.equal(profile.seatLimit, 10);
  assert.equal(HOUZZAT_LEGACY_INCLUDED_SEATS, 10);
  assert.equal(HOUZZAT_LEGACY_ADDITIONAL_SEATS, 0);
  assert.equal(HOUZZAT_LEGACY_ADDITIONAL_SEATS_ALLOWED, true);
  assert.equal(HOUZZAT_LEGACY_SEAT_LIMIT, 10);
  for (const code of [
    FEATURE_LIVE_CHAT,
    FEATURE_SEO_FOUNDATION,
    FEATURE_AGENT_APP,
    FEATURE_TEAM_MANAGEMENT,
    FEATURE_CUSTOM_CONSUMER_APP,
  ]) {
    const row = profile.features.find((f) => f.featureCode === code);
    assert.ok(row, `missing feature ${code}`);
    assert.equal(row.enabled, true, `${code} must be enabled`);
  }
  assert.equal(
    normalizeActivationEmail("  AlisyedRealtor@Gmail.com  "),
    "alisyedrealtor@gmail.com",
  );
  assert.equal(
    HOUZZAT_LEGACY_BILLING_CUSTOMER_EMAIL,
    "alisyedrealtor@gmail.com",
  );
  assert.equal(PLATFORM_MASTER_ADMIN_EMAIL, "teamalisyed@gmail.com");
  console.log("[4] HOUZZAT_LEGACY locked profile + email normalization... PASS");
}

// 5. requirePlatformOperator decisions (no User.role / member fallback)
{
  assert.throws(
    () => assertActiveMasterAdminOperator(null, "admin@example.com"),
    (err: unknown) =>
      err instanceof PlatformOperatorAuthError &&
      err.code === "PLATFORM_OPERATOR_REQUIRED",
  );

  assert.throws(
    () =>
      assertActiveMasterAdminOperator(
        {
          id: "op1",
          userId: "u1",
          role: "MASTER_ADMIN",
          status: "DISABLED",
        },
        "admin@example.com",
      ),
    (err: unknown) =>
      err instanceof PlatformOperatorAuthError &&
      err.code === "PLATFORM_OPERATOR_DISABLED",
  );

  const ok = assertActiveMasterAdminOperator(
    {
      id: "op2",
      userId: "u2",
      role: "MASTER_ADMIN",
      status: "ACTIVE",
    },
    "owner@example.com",
  );
  assert.equal(ok.operatorId, "op2");
  assert.equal(ok.role, "MASTER_ADMIN");

  assert.throws(
    () =>
      assertActiveMasterAdminOperator(
        {
          id: "op3",
          userId: "u3",
          role: "SALES",
          status: "ACTIVE",
        },
        "sales@example.com",
      ),
    (err: unknown) =>
      err instanceof PlatformOperatorAuthError &&
      err.code === "PLATFORM_ROLE_DISABLED",
  );

  const authSrc = read("src/lib/platform/auth/require-platform-operator.ts");
  assert.ok(!/user\.role\b/.test(authSrc));
  assert.ok(!/prisma\.user\.find/.test(authSrc));
  assert.ok(!/workspaceMember/.test(authSrc));
  assert.ok(!authSrc.includes("requireAgentContext"));
  assert.ok(!authSrc.includes("crm-read-scope"));
  assert.ok(!/role:\s*["']ADMIN["']/.test(authSrc));
  console.log(
    "[5] PlatformOperator auth: ADMIN/OWNER without row denied; ACTIVE MASTER_ADMIN ok; DISABLED denied... PASS",
  );
}

// 6. CRM import boundary
{
  const forbidden = [
    /from\s+["']@\/lib\/crm-read-scope["']/,
    /from\s+["']@\/lib\/agent\/lead-summary["']/,
    /from\s+["']@\/lib\/agent["']/,
  ];
  const files = listTsFiles("src/lib/platform");
  for (const file of files) {
    const src = read(file);
    for (const re of forbidden) {
      assert.ok(!re.test(src), `${file} matches forbidden import ${re}`);
    }
  }
  console.log(`[6] Platform CRM import boundary (${files.length} files)... PASS`);
}

// 7. PlatformOperator provision does not create membership / change role
{
  const state: FakeState = {
    workspaces: new Map(),
    billingCustomers: new Map(),
    subscriptions: new Map(),
    entitlements: [],
    seatQuotas: new Map(),
    auditEvents: [],
    users: new Map([
      ["u_owner", { id: "u_owner", email: "owner@example.com", role: "ADMIN" }],
    ]),
    operators: new Map(),
    members: [{ userId: "u_owner", workspaceId: "ws_existing" }],
    nextId: 1,
  };
  const db = createFakePrisma(state) as never;
  const created = await provisionPlatformMasterAdmin({
    email: "owner@example.com",
    prisma: db,
  });
  assert.equal(created.status, "created");
  assert.equal(created.memberCreated, false);
  assert.equal(created.userRoleChanged, false);
  assert.equal(state.members.length, 1);
  assert.equal(state.users.get("u_owner")?.role, "ADMIN");

  const again = await provisionPlatformMasterAdmin({
    email: "owner@example.com",
    prisma: db,
  });
  assert.equal(again.status, "already_exists");
  assert.equal(state.operators.size, 1);
  assert.equal(state.members.length, 1);
  console.log(
    "[7] PlatformOperator provision idempotent; no WorkspaceMember; User.role untouched... PASS",
  );
}

// 8. Grandfathering idempotency with synthetic profile (not Houzzat values)
{
  const profile: MaterializedEntitlementProfile = {
    code: "TEST_SYNTHETIC_PROFILE",
    includedSeats: 8,
    additionalSeats: 0,
    additionalSeatsAllowed: true,
    seatLimit: 8,
    features: [
      { featureCode: FEATURE_LIVE_CHAT, enabled: true },
      { featureCode: FEATURE_SEO_FOUNDATION, enabled: true },
    ],
  };

  const state: FakeState = {
    workspaces: new Map([
      [
        "houzzat",
        { id: "ws_hz", slug: "houzzat", currentSubscriptionId: null },
      ],
    ]),
    billingCustomers: new Map(),
    subscriptions: new Map(),
    entitlements: [],
    seatQuotas: new Map(),
    auditEvents: [],
    users: new Map(),
    operators: new Map(),
    members: [],
    nextId: 1,
  };
  const db = createFakePrisma(state) as never;

  const first = await grandfatherWorkspaceWithProfile({
    prisma: db,
    workspaceSlug: "houzzat",
    billingCustomerEmail: "billing@example.com",
    profile,
    entitlementProfileCode: "TEST_SYNTHETIC_PROFILE",
    commercialSnapshot: {
      kind: "grandfathered",
      profile: "TEST_SYNTHETIC_PROFILE",
      note: "synthetic test only — not Houzzat production values",
    },
  });
  assert.equal(first.status, "created");
  assert.equal(state.subscriptions.size, 1);
  assert.equal(
    state.workspaces.get("houzzat")?.currentSubscriptionId,
    first.subscriptionId,
  );
  assert.equal(state.entitlements.length, 2);
  assert.equal(state.seatQuotas.get("ws_hz")?.seatLimit, 8);

  const second = await grandfatherWorkspaceWithProfile({
    prisma: db,
    workspaceSlug: "houzzat",
    billingCustomerEmail: "billing@example.com",
    profile,
    entitlementProfileCode: "TEST_SYNTHETIC_PROFILE",
    commercialSnapshot: {
      kind: "grandfathered",
      profile: "TEST_SYNTHETIC_PROFILE",
    },
  });
  assert.equal(second.status, "already_grandfathered");
  assert.equal(state.subscriptions.size, 1);
  assert.equal(second.subscriptionId, first.subscriptionId);
  assert.equal(
    state.workspaces.get("houzzat")?.currentSubscriptionId,
    first.subscriptionId,
  );
  assert.equal(state.seatQuotas.get("ws_hz")?.includedSeats, 8);
  console.log(
    "[8] Grandfathering + entitlement/seat materialization idempotent; no duplicate subscription... PASS",
  );
}

// 9. Plan profile materialization recipe
{
  const solo = resolvePlanEntitlementProfile("SOLO");
  assert.equal(solo.includedSeats, 1);
  assert.equal(solo.seatLimit, 1);
  assert.equal(solo.additionalSeatsAllowed, false);
  assert.ok(
    solo.features.some((f) => f.featureCode === FEATURE_LIVE_CHAT && !f.enabled),
  );

  const team = resolvePlanEntitlementProfile("TEAM");
  assert.equal(team.includedSeats, 4);
  assert.ok(
    team.features.some((f) => f.featureCode === FEATURE_LIVE_CHAT && f.enabled),
  );
  console.log("[9] Plan entitlement profile recipes... PASS");
}

// 10. Invite TTL authority
{
  assert.equal(WORKSPACE_INVITE_TTL_MS, 14 * 24 * 60 * 60 * 1000);
  const seatsSrc = read("src/lib/platform/seats/index.ts");
  assert.ok(seatsSrc.includes('status: "ACTIVE"'));
  assert.ok(seatsSrc.includes('status: "SUSPENDED"'));
  assert.ok(seatsSrc.includes('status: "PENDING"'));
  assert.ok(seatsSrc.includes("expiresAt"));
  assert.ok(!/prisma\.\$transaction\s*\(/.test(seatsSrc));
  const gfSrc = read("src/lib/platform/billing/grandfather-houzzat.ts");
  assert.ok(!/prisma\.\$transaction\s*\(/.test(gfSrc));
  const opSrc = read("src/lib/platform/operators/provision-master-admin.ts");
  assert.ok(!/prisma\.\$transaction\s*\(/.test(opSrc));
  assert.ok(opSrc.includes("workspaceMember.count"));
  assert.ok(gfSrc.includes(HOUZZAT_LEGACY_ENTITLEMENT_PROFILE));
  console.log("[10] Seat consumption filters + no $transaction... PASS");
}

console.log("\nSTAGE 6.2A/6.2B — ALL TESTS PASSED\n");
console.log(
  "NOTE: HOUZZAT_LEGACY profile is locked — controlled activation pending explicit --confirm-production-write.",
);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
