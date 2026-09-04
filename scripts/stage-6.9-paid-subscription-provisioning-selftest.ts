/**
 * Stage 6.9 — paid subscription → workspace provisioning selftest.
 * Run: pnpm stage-6.9-paid-subscription-provisioning:selftest
 *
 * No real DB. No Stripe. In-memory Fake Prisma only.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import {
  FEATURE_AGENT_APP,
  FEATURE_CUSTOM_CONSUMER_APP,
  FEATURE_LIVE_CHAT,
  FEATURE_SEO_FOUNDATION,
  FEATURE_TEAM_MANAGEMENT,
} from "../src/lib/platform/catalog/features";
import {
  PLAN_DEFINITIONS,
  computeSeatLimit,
} from "../src/lib/platform/catalog/plans";
import {
  PROVISIONING_AUDIT,
  PROVISIONING_STEP_KEYS,
  deriveWorkspaceDisplayName,
  evaluatePaidSubscriptionProvisioningEligibility,
  provisionPaidSubscription,
} from "../src/lib/platform/provisioning";

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

type FakeLine = {
  id: string;
  offerId: string;
  kind: string;
  code: string;
  quantity: number;
  sortOrder: number;
};

type FakeWorkspace = {
  id: string;
  slug: string;
  name: string;
  status: string;
  currentSubscriptionId: string | null;
  billingOwnerUserId: string | null;
  protected?: boolean;
  fingerprint?: string;
};

type FakeUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  password: string | null;
  isBuyer: boolean;
  isSeller: boolean;
  platformOperatorId: string | null;
};

type FakeMember = {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
  status: string;
  joinedAt: Date | null;
};

type FakeRun = {
  id: string;
  offerId: string;
  subscriptionId: string;
  workspaceId: string | null;
  status: string;
  idempotencyKey: string;
  attemptCount: number;
  lastError: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
};

type FakeStep = {
  id: string;
  runId: string;
  stepKey: string;
  status: string;
  attemptCount: number;
  lastError: string | null;
  outputRef: string | null;
};

type FakeState = {
  prospects: Map<string, Record<string, unknown>>;
  offers: Map<string, Record<string, unknown>>;
  lines: FakeLine[];
  acceptances: Map<string, Record<string, unknown>>;
  billingCustomers: Map<string, Record<string, unknown>>;
  subscriptions: Map<string, Record<string, unknown>>;
  provisioningRuns: Map<string, FakeRun>;
  provisioningSteps: FakeStep[];
  workspaces: Map<string, FakeWorkspace>;
  users: Map<string, FakeUser>;
  members: FakeMember[];
  brandings: Map<string, Record<string, unknown>>;
  emailIdentities: Map<string, Record<string, unknown>>;
  entitlements: Array<{
    id: string;
    workspaceId: string;
    featureCode: string;
    enabled: boolean;
    source: string;
  }>;
  seatQuotas: Map<
    string,
    {
      workspaceId: string;
      includedSeats: number;
      additionalSeats: number;
      seatLimit: number;
    }
  >;
  addOnGrants: Array<{
    id: string;
    workspaceId: string;
    addOnCode: string;
    status: string;
    sourceOfferId: string;
    startsAt: Date;
  }>;
  statusEvents: Array<Record<string, unknown>>;
  audits: Array<{ action: string; entityId: string; metadata: unknown }>;
  nextId: number;
  /** Throw once from workspaceEntitlement.upsert when > 0. */
  failEntitlementUpserts: number;
};

function emptyState(): FakeState {
  return {
    prospects: new Map(),
    offers: new Map(),
    lines: [],
    acceptances: new Map(),
    billingCustomers: new Map(),
    subscriptions: new Map(),
    provisioningRuns: new Map(),
    provisioningSteps: [],
    workspaces: new Map(),
    users: new Map(),
    members: [],
    brandings: new Map(),
    emailIdentities: new Map(),
    entitlements: [],
    seatQuotas: new Map(),
    addOnGrants: [],
    statusEvents: [],
    audits: [],
    nextId: 1,
    failEntitlementUpserts: 0,
  };
}

function seedProtectedWorkspaces(state: FakeState) {
  const houzzat: FakeWorkspace = {
    id: "ws_houzzat_protected",
    slug: "houzzat",
    name: "Houzzat",
    status: "ACTIVE",
    currentSubscriptionId: "sub_houzzat_legacy_protected",
    billingOwnerUserId: "user_houzzat_owner",
    protected: true,
    fingerprint: "houzzat-v1",
  };
  const canary: FakeWorkspace = {
    id: "ws_tenant_canary_protected",
    slug: "tenant-canary",
    name: "Tenant Canary",
    status: "ACTIVE",
    currentSubscriptionId: "sub_canary_protected",
    billingOwnerUserId: "user_canary_owner",
    protected: true,
    fingerprint: "canary-v1",
  };
  state.workspaces.set(houzzat.id, houzzat);
  state.workspaces.set(canary.id, canary);
  return { houzzat, canary };
}

function snapshotProtected(state: FakeState) {
  const houzzat = [...state.workspaces.values()].find((w) => w.slug === "houzzat");
  const canary = [...state.workspaces.values()].find(
    (w) => w.slug === "tenant-canary",
  );
  assert.ok(houzzat && canary);
  return {
    houzzat: { ...houzzat },
    canary: { ...canary },
  };
}

function assertProtectedUnchanged(
  state: FakeState,
  before: ReturnType<typeof snapshotProtected>,
) {
  const after = snapshotProtected(state);
  assert.deepEqual(after.houzzat, before.houzzat);
  assert.deepEqual(after.canary, before.canary);
}

type SeedOpts = {
  status?: "PENDING_PAYMENT" | "ACTIVE" | "TRIALING" | "CANCELLED";
  planCode?: "SOLO" | "TEAM" | "BROKERAGE";
  includedSeats?: number;
  additionalSeats?: number;
  addOns?: Array<"CUSTOM_CONSUMER_APP" | "GOOGLE_PPC" | "META_ADS">;
  acceptedEmail?: string;
  contactName?: string;
  businessName?: string | null;
  brokerageName?: string | null;
  phone?: string | null;
  source?: "STRIPE" | "MANUAL";
  withAcceptance?: boolean;
};

function seedPaidSubscription(state: FakeState, opts?: SeedOpts) {
  const planCode = opts?.planCode ?? "TEAM";
  const plan = PLAN_DEFINITIONS[planCode];
  const includedSeats = opts?.includedSeats ?? plan.includedSeats;
  const additionalSeats = opts?.additionalSeats ?? 0;
  const status = opts?.status ?? "ACTIVE";
  const acceptedEmail = (
    opts?.acceptedEmail ?? "alex@brokerage.test"
  ).toLowerCase();
  const contactName = opts?.contactName ?? "Alex Rivera";
  const businessName =
    opts?.businessName === undefined ? "Rivera Realty" : opts.businessName;
  const brokerageName =
    opts?.brokerageName === undefined
      ? "Rivera Brokerage"
      : opts.brokerageName;
  const phone = opts?.phone === undefined ? "+1-416-555-0100" : opts.phone;

  const prospectId = `pros_${state.nextId++}`;
  const offerId = `off_${state.nextId++}`;
  const billingCustomerId = `bc_${state.nextId++}`;
  const subscriptionId = `sub_test_${state.nextId++}`;

  state.prospects.set(prospectId, {
    id: prospectId,
    email: acceptedEmail,
    contactName,
    businessName,
    brokerageName,
    phone,
    status: "WON",
  });

  state.offers.set(offerId, {
    id: offerId,
    prospectId,
    status: "ACCEPTED",
    workspaceId: null,
    planCode,
    includedSeats,
    additionalSeats,
    billingCadence: "MONTHLY",
  });

  let sortOrder = 0;
  state.lines.push({
    id: `li_${state.nextId++}`,
    offerId,
    kind: "PLAN",
    code: "PLAN_BASE",
    quantity: 1,
    sortOrder: sortOrder++,
  });
  if (additionalSeats > 0) {
    state.lines.push({
      id: `li_${state.nextId++}`,
      offerId,
      kind: "ADDITIONAL_SEAT",
      code: "ADDITIONAL_AGENT",
      quantity: additionalSeats,
      sortOrder: sortOrder++,
    });
  }
  for (const code of opts?.addOns ?? []) {
    state.lines.push({
      id: `li_${state.nextId++}`,
      offerId,
      kind: "ADD_ON",
      code,
      quantity: 1,
      sortOrder: sortOrder++,
    });
  }

  if (opts?.withAcceptance !== false) {
    state.acceptances.set(offerId, {
      id: `acc_${state.nextId++}`,
      offerId,
      acceptedEmail,
    });
  }

  state.billingCustomers.set(billingCustomerId, {
    id: billingCustomerId,
    email: acceptedEmail,
    workspaceId: null,
    prospectId,
  });

  const commercialSnapshotJson = {
    planCode,
    includedSeats,
    additionalSeats,
    source: "accepted_offer",
  };

  state.subscriptions.set(subscriptionId, {
    id: subscriptionId,
    workspaceId: null,
    offerId,
    billingCustomerId,
    source: opts?.source ?? "STRIPE",
    status,
    planCode,
    entitlementProfileCode: null,
    includedSeats,
    additionalSeats,
    commercialSnapshotJson,
    stripeSubscriptionId: `stripe_sub_fake_${state.nextId++}`,
  });

  return {
    subscriptionId,
    offerId,
    prospectId,
    billingCustomerId,
    acceptedEmail,
    planCode,
    includedSeats,
    additionalSeats,
  };
}

function createFakePrisma(state: FakeState): PrismaClient {
  const id = (prefix: string) => `${prefix}_${state.nextId++}`;

  const rejectUnsafe = (name: string) => {
    throw new Error(`${name} must not be used in Stage 6.9 provisioning`);
  };

  const findRunBySubscription = (subscriptionId: string) => {
    for (const run of state.provisioningRuns.values()) {
      if (run.subscriptionId === subscriptionId) return { ...run };
    }
    return null;
  };

  const enrichSubscription = (row: Record<string, unknown> | undefined) => {
    if (!row) return null;
    const offerId = row.offerId ? String(row.offerId) : null;
    const offer = offerId ? state.offers.get(offerId) : null;
    const prospect = offer
      ? state.prospects.get(String(offer.prospectId))
      : null;
    const acceptance = offerId ? state.acceptances.get(offerId) : null;
    const billing = state.billingCustomers.get(String(row.billingCustomerId));

    return {
      ...row,
      billingCustomer: billing
        ? {
            id: String(billing.id),
            email: String(billing.email),
            workspaceId: (billing.workspaceId as string | null) ?? null,
          }
        : null,
      offer: offer
        ? {
            id: String(offer.id),
            status: String(offer.status),
            workspaceId: (offer.workspaceId as string | null) ?? null,
            planCode: offer.planCode,
            includedSeats: Number(offer.includedSeats),
            additionalSeats: Number(offer.additionalSeats),
            lineItems: state.lines
              .filter((l) => l.offerId === offerId)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((l) => ({
                kind: l.kind,
                code: l.code,
                quantity: l.quantity,
              })),
            acceptance: acceptance
              ? {
                  id: String(acceptance.id),
                  acceptedEmail: String(acceptance.acceptedEmail),
                }
              : null,
            prospect: prospect
              ? {
                  email: String(prospect.email),
                  contactName: String(prospect.contactName ?? ""),
                  businessName: (prospect.businessName as string | null) ?? null,
                  brokerageName:
                    (prospect.brokerageName as string | null) ?? null,
                  phone: (prospect.phone as string | null) ?? null,
                }
              : {
                  email: "",
                  contactName: "",
                  businessName: null,
                  brokerageName: null,
                  phone: null,
                },
          }
        : null,
      provisioningRun: findRunBySubscription(String(row.id)),
    };
  };

  const findWorkspace = (where: { id?: string; slug?: string }) => {
    if (where.id) {
      for (const w of state.workspaces.values()) {
        if (w.id === where.id) return { ...w };
      }
      return null;
    }
    if (where.slug) {
      for (const w of state.workspaces.values()) {
        if (w.slug === where.slug) return { ...w };
      }
      return null;
    }
    return null;
  };

  return {
    $transaction: async () => rejectUnsafe("$transaction"),
    subscription: {
      async findUnique({ where }: { where: { id?: string } }) {
        if (!where.id) return null;
        return enrichSubscription(state.subscriptions.get(where.id));
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        const row = state.subscriptions.get(where.id);
        if (!row) throw new Error("subscription missing");
        Object.assign(row, data);
        return { ...row };
      },
    },
    provisioningRun: {
      async findUnique({
        where,
      }: {
        where: { id?: string; subscriptionId?: string };
      }) {
        if (where.id) {
          const run = state.provisioningRuns.get(where.id);
          return run ? { ...run } : null;
        }
        if (where.subscriptionId) {
          return findRunBySubscription(where.subscriptionId);
        }
        return null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const subscriptionId = String(data.subscriptionId);
        if (findRunBySubscription(subscriptionId)) {
          const err = new Error("Unique") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const run: FakeRun = {
          id: id("run"),
          offerId: String(data.offerId),
          subscriptionId,
          workspaceId: (data.workspaceId as string | null) ?? null,
          status: String(data.status),
          idempotencyKey: String(data.idempotencyKey),
          attemptCount: Number(data.attemptCount ?? 1),
          lastError: (data.lastError as string | null) ?? null,
          startedAt: (data.startedAt as Date | null) ?? new Date(),
          completedAt: (data.completedAt as Date | null) ?? null,
        };
        state.provisioningRuns.set(run.id, run);
        return { ...run };
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        const run = state.provisioningRuns.get(where.id);
        if (!run) throw new Error("run missing");
        Object.assign(run, data);
        return { ...run };
      },
      async updateMany() {
        rejectUnsafe("updateMany");
      },
    },
    provisioningStep: {
      async findUnique({
        where,
      }: {
        where: {
          id?: string;
          runId_stepKey?: { runId: string; stepKey: string };
        };
      }) {
        if (where.id) {
          const hit = state.provisioningSteps.find((s) => s.id === where.id);
          return hit ? { ...hit } : null;
        }
        if (where.runId_stepKey) {
          const hit = state.provisioningSteps.find(
            (s) =>
              s.runId === where.runId_stepKey!.runId &&
              s.stepKey === where.runId_stepKey!.stepKey,
          );
          return hit ? { ...hit } : null;
        }
        return null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const runId = String(data.runId);
        const stepKey = String(data.stepKey);
        if (
          state.provisioningSteps.some(
            (s) => s.runId === runId && s.stepKey === stepKey,
          )
        ) {
          const err = new Error("Unique") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const step: FakeStep = {
          id: id("step"),
          runId,
          stepKey,
          status: String(data.status ?? "PENDING"),
          attemptCount: Number(data.attemptCount ?? 1),
          lastError: (data.lastError as string | null) ?? null,
          outputRef: (data.outputRef as string | null) ?? null,
        };
        state.provisioningSteps.push(step);
        return { ...step };
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        const step = state.provisioningSteps.find((s) => s.id === where.id);
        if (!step) throw new Error("step missing");
        Object.assign(step, data);
        return { ...step };
      },
      async updateMany() {
        rejectUnsafe("updateMany");
      },
    },
    workspace: {
      async findUnique({
        where,
        select,
      }: {
        where: { id?: string; slug?: string };
        select?: Record<string, boolean>;
      }) {
        const w = findWorkspace(where);
        if (!w) return null;
        if (!select) return { ...w };
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (select[key]) out[key] = (w as Record<string, unknown>)[key];
        }
        return out;
      },
      async create({
        data,
        select,
      }: {
        data: Record<string, unknown>;
        select?: Record<string, boolean>;
      }) {
        const slug = String(data.slug);
        if ([...state.workspaces.values()].some((w) => w.slug === slug)) {
          const err = new Error("Unique") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const ws: FakeWorkspace = {
          id: id("ws"),
          slug,
          name: String(data.name),
          status: String(data.status ?? "TRIAL"),
          currentSubscriptionId: null,
          billingOwnerUserId: null,
        };
        state.workspaces.set(ws.id, ws);
        if (!select) return { ...ws };
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (select[key]) out[key] = (ws as Record<string, unknown>)[key];
        }
        return out;
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        const ws = state.workspaces.get(where.id);
        if (!ws) throw new Error("workspace missing");
        Object.assign(ws, data);
        return { ...ws };
      },
      async updateMany() {
        rejectUnsafe("updateMany");
      },
    },
    workspaceMember: {
      async findUnique({
        where,
      }: {
        where: {
          id?: string;
          workspaceId_userId?: { workspaceId: string; userId: string };
        };
      }) {
        if (where.id) {
          const hit = state.members.find((m) => m.id === where.id);
          return hit ? { ...hit } : null;
        }
        if (where.workspaceId_userId) {
          const { workspaceId, userId } = where.workspaceId_userId;
          const hit = state.members.find(
            (m) => m.workspaceId === workspaceId && m.userId === userId,
          );
          return hit ? { ...hit } : null;
        }
        return null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const member: FakeMember = {
          id: id("mem"),
          workspaceId: String(data.workspaceId),
          userId: String(data.userId),
          role: String(data.role),
          status: String(data.status),
          joinedAt: (data.joinedAt as Date | null) ?? new Date(),
        };
        state.members.push(member);
        return { ...member };
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        const member = state.members.find((m) => m.id === where.id);
        if (!member) throw new Error("member missing");
        Object.assign(member, data);
        return { ...member };
      },
    },
    user: {
      async findUnique({
        where,
        select,
      }: {
        where: { email?: string; id?: string };
        select?: Record<string, unknown>;
      }) {
        let user: FakeUser | undefined;
        if (where.email) {
          const email = where.email.trim().toLowerCase();
          user = [...state.users.values()].find((u) => u.email === email);
        } else if (where.id) {
          user = state.users.get(where.id);
        }
        if (!user) return null;
        if (!select) return { ...user };
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (key === "platformOperator") {
            out.platformOperator = user.platformOperatorId
              ? { id: user.platformOperatorId }
              : null;
          } else if (select[key]) {
            out[key] = (user as Record<string, unknown>)[key];
          }
        }
        return out;
      },
      async create({
        data,
        select,
      }: {
        data: Record<string, unknown>;
        select?: Record<string, unknown>;
      }) {
        const email = String(data.email).trim().toLowerCase();
        if ([...state.users.values()].some((u) => u.email === email)) {
          const err = new Error("Unique") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const user: FakeUser = {
          id: id("user"),
          email,
          name: (data.name as string | null) ?? null,
          role: String(data.role ?? "AGENT"),
          password: (data.password as string | null) ?? null,
          isBuyer: Boolean(data.isBuyer ?? false),
          isSeller: Boolean(data.isSeller ?? false),
          platformOperatorId: null,
        };
        state.users.set(user.id, user);
        if (!select) return { ...user };
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (key === "platformOperator") {
            out.platformOperator = null;
          } else if (select[key]) {
            out[key] = (user as Record<string, unknown>)[key];
          }
        }
        return out;
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        const user = state.users.get(where.id);
        if (!user) throw new Error("user missing");
        Object.assign(user, data);
        return { ...user };
      },
    },
    workspaceBranding: {
      async findUnique({
        where,
      }: {
        where: { workspaceId: string };
      }) {
        const row = state.brandings.get(where.workspaceId);
        return row ? { ...row } : null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const workspaceId = String(data.workspaceId);
        if (state.brandings.has(workspaceId)) {
          const err = new Error("Unique") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const row = { id: id("brand"), ...data };
        state.brandings.set(workspaceId, row);
        return { ...row };
      },
    },
    workspaceEmailIdentity: {
      async findUnique({
        where,
      }: {
        where: { workspaceId: string };
      }) {
        const row = state.emailIdentities.get(where.workspaceId);
        return row ? { ...row } : null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const workspaceId = String(data.workspaceId);
        if (state.emailIdentities.has(workspaceId)) {
          const err = new Error("Unique") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const row = { id: id("email"), ...data };
        state.emailIdentities.set(workspaceId, row);
        return { ...row };
      },
    },
    workspaceEntitlement: {
      async upsert({
        where,
        create,
        update,
      }: {
        where: {
          workspaceId_featureCode: {
            workspaceId: string;
            featureCode: string;
          };
        };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) {
        if (state.failEntitlementUpserts > 0) {
          state.failEntitlementUpserts -= 1;
          throw new Error("simulated entitlement failure");
        }
        const { workspaceId, featureCode } = where.workspaceId_featureCode;
        const existing = state.entitlements.find(
          (e) =>
            e.workspaceId === workspaceId && e.featureCode === featureCode,
        );
        if (existing) {
          Object.assign(existing, update);
          return { ...existing };
        }
        const row = {
          id: id("ent"),
          workspaceId,
          featureCode,
          enabled: Boolean(create.enabled),
          source: String(create.source),
        };
        state.entitlements.push(row);
        return { ...row };
      },
      async updateMany() {
        rejectUnsafe("updateMany");
      },
    },
    workspaceSeatQuota: {
      async upsert({
        where,
        create,
        update,
      }: {
        where: { workspaceId: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) {
        const existing = state.seatQuotas.get(where.workspaceId);
        if (existing) {
          Object.assign(existing, update);
          return { ...existing };
        }
        const row = {
          workspaceId: where.workspaceId,
          includedSeats: Number(create.includedSeats),
          additionalSeats: Number(create.additionalSeats),
          seatLimit: Number(create.seatLimit),
        };
        state.seatQuotas.set(where.workspaceId, row);
        return { ...row };
      },
    },
    addOnGrant: {
      async findFirst({
        where,
      }: {
        where: {
          workspaceId?: string;
          addOnCode?: string;
          sourceOfferId?: string;
        };
      }) {
        const hit = state.addOnGrants.find(
          (g) =>
            (!where.workspaceId || g.workspaceId === where.workspaceId) &&
            (!where.addOnCode || g.addOnCode === where.addOnCode) &&
            (!where.sourceOfferId || g.sourceOfferId === where.sourceOfferId),
        );
        return hit ? { ...hit } : null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const row = {
          id: id("aog"),
          workspaceId: String(data.workspaceId),
          addOnCode: String(data.addOnCode),
          status: String(data.status),
          sourceOfferId: String(data.sourceOfferId),
          startsAt: (data.startsAt as Date) ?? new Date(),
        };
        state.addOnGrants.push(row);
        return { ...row };
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        const row = state.addOnGrants.find((g) => g.id === where.id);
        if (!row) throw new Error("addon missing");
        Object.assign(row, data);
        return { ...row };
      },
    },
    commercialOffer: {
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        const offer = state.offers.get(where.id);
        if (!offer) throw new Error("offer missing");
        Object.assign(offer, data);
        return { ...offer };
      },
    },
    billingCustomer: {
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        const row = state.billingCustomers.get(where.id);
        if (!row) throw new Error("billing customer missing");
        Object.assign(row, data);
        return { ...row };
      },
    },
    workspaceStatusEvent: {
      async create({ data }: { data: Record<string, unknown> }) {
        const row = { id: id("wse"), ...data };
        state.statusEvents.push(row);
        return { ...row };
      },
    },
    platformAuditEvent: {
      async create({
        data,
      }: {
        data: {
          action: string;
          entityId: string;
          metadata?: unknown;
        };
      }) {
        state.audits.push({
          action: data.action,
          entityId: data.entityId,
          metadata: data.metadata ?? null,
        });
        return { id: id("aud") };
      },
    },
  } as unknown as PrismaClient;
}

function tenantWorkspaces(state: FakeState) {
  return [...state.workspaces.values()].filter((w) => !w.protected);
}

function auditActions(state: FakeState) {
  return state.audits.map((a) => a.action);
}

async function main() {
  console.log("\n=== STAGE 6.9 — PAID SUBSCRIPTION → WORKSPACE PROVISIONING ===\n");

  // 0. Source guards
  {
    const provisioningFiles = listTsFiles("src/lib/platform/provisioning");
    const provisioningSrc = provisioningFiles.map(read).join("\n");
    const webhook = read("src/lib/platform/billing/webhook.ts");
    const steps = read("src/lib/platform/provisioning/steps.ts");

    assert.ok(!/\.\$transaction\s*\(/.test(provisioningSrc));
    assert.ok(!/\.updateMany\s*\(/.test(provisioningSrc));
    assert.ok(!/\.\$transaction\s*\(/.test(webhook));
    assert.ok(!/\.updateMany\s*\(/.test(webhook));
    assert.ok(webhook.includes("tryProvisionAfterBillingActivation"));
    assert.equal(PROVISIONING_STEP_KEYS.length, 11);
    assert.ok(steps.includes("themeId: null"));
    assert.ok(!/templateCard|tenantTemplate|homepageLayout|themePreview/i.test(provisioningSrc));
    assert.ok(
      !/OWNER TENANT TEMPLATE DESIGN DECISION REQUIRED/.test(provisioningSrc),
    );
    assert.equal(
      deriveWorkspaceDisplayName({
        brokerageName: "Acme Brokerage",
        businessName: "Acme Biz",
        contactName: "Pat",
      }),
      "Acme Brokerage",
    );
    const subscriptionsList = read(
      "src/app/platform/(shell)/subscriptions/page.tsx",
    );
    assert.ok(
      subscriptionsList.includes("/platform/subscriptions/"),
      "subscriptions list must link to subscription detail",
    );
    assert.ok(
      subscriptionsList.includes("Subscription"),
      "subscriptions list must expose a Subscription column",
    );
    const serializeSrc = read("src/lib/platform/read/serialize.ts");
    assert.ok(
      serializeSrc.includes("billingCustomer?.stripeCustomerId"),
      "subscription Stripe customer presence must read BillingCustomer.stripeCustomerId",
    );
    console.log("[0] Source guards (Neon HTTP + webhook + steps)... PASS");
  }

  // 1. PENDING_PAYMENT does not provision
  {
    const state = emptyState();
    seedProtectedWorkspaces(state);
    const before = snapshotProtected(state);
    const seeded = seedPaidSubscription(state, { status: "PENDING_PAYMENT" });
    const prisma = createFakePrisma(state);

    const eligibility = await evaluatePaidSubscriptionProvisioningEligibility({
      prisma,
      subscriptionId: seeded.subscriptionId,
    });
    assert.equal(eligibility.eligible, false);
    assert.equal(eligibility.reason, "STATUS_NOT_PAID");

    const result = await provisionPaidSubscription({
      subscriptionId: seeded.subscriptionId,
      prisma,
    });
    assert.equal(result.outcome, "not_eligible");
    assert.equal(result.reason, "STATUS_NOT_PAID");
    assert.equal(tenantWorkspaces(state).length, 0);
    assert.equal(state.provisioningRuns.size, 0);
    assertProtectedUnchanged(state, before);
    console.log("[1] PENDING_PAYMENT does not provision... PASS");
  }

  // 2. ACTIVE TEAM provisions correctly
  {
    const state = emptyState();
    seedProtectedWorkspaces(state);
    const before = snapshotProtected(state);
    const seeded = seedPaidSubscription(state, {
      status: "ACTIVE",
      planCode: "TEAM",
      additionalSeats: 1,
    });
    const prisma = createFakePrisma(state);

    const result = await provisionPaidSubscription({
      subscriptionId: seeded.subscriptionId,
      prisma,
    });
    assert.equal(result.outcome, "succeeded");
    assert.ok(result.workspaceId);
    assert.ok(result.runId);

    const tenants = tenantWorkspaces(state);
    assert.equal(tenants.length, 1);
    const ws = tenants[0]!;
    assert.equal(ws.status, "ACTIVE");
    assert.equal(
      ws.name,
      deriveWorkspaceDisplayName({
        brokerageName: "Rivera Brokerage",
        businessName: "Rivera Realty",
        contactName: "Alex Rivera",
      }),
    );

    const sub = state.subscriptions.get(seeded.subscriptionId)!;
    assert.equal(sub.workspaceId, ws.id);
    assert.equal(ws.currentSubscriptionId, seeded.subscriptionId);
    assert.equal(state.offers.get(seeded.offerId)!.workspaceId, ws.id);
    assert.equal(
      state.billingCustomers.get(seeded.billingCustomerId)!.workspaceId,
      ws.id,
    );

    const owners = state.members.filter(
      (m) => m.workspaceId === ws.id && m.role === "OWNER",
    );
    assert.equal(owners.length, 1);
    assert.equal(owners[0]!.status, "ACTIVE");

    const teamFeatures = PLAN_DEFINITIONS.TEAM.features;
    for (const [featureCode, enabled] of Object.entries(teamFeatures)) {
      const ent = state.entitlements.find(
        (e) => e.workspaceId === ws.id && e.featureCode === featureCode,
      );
      assert.ok(ent, `missing entitlement ${featureCode}`);
      assert.equal(ent.enabled, enabled);
      if (featureCode === FEATURE_CUSTOM_CONSUMER_APP) {
        assert.equal(ent.enabled, false);
      }
    }
    assert.equal(
      state.entitlements.find(
        (e) =>
          e.workspaceId === ws.id && e.featureCode === FEATURE_TEAM_MANAGEMENT,
      )?.enabled,
      true,
    );
    assert.equal(
      state.entitlements.find(
        (e) => e.workspaceId === ws.id && e.featureCode === FEATURE_LIVE_CHAT,
      )?.enabled,
      true,
    );
    assert.equal(
      state.entitlements.find(
        (e) =>
          e.workspaceId === ws.id && e.featureCode === FEATURE_SEO_FOUNDATION,
      )?.enabled,
      true,
    );
    assert.equal(
      state.entitlements.find(
        (e) => e.workspaceId === ws.id && e.featureCode === FEATURE_AGENT_APP,
      )?.enabled,
      true,
    );

    const seats = state.seatQuotas.get(ws.id)!;
    assert.equal(seats.includedSeats, 4);
    assert.equal(seats.additionalSeats, 1);
    assert.ok(seats.seatLimit >= 4);
    assert.equal(seats.seatLimit, computeSeatLimit(4, 1));

    const branding = state.brandings.get(ws.id)!;
    assert.equal(branding.themeId, null);
    assert.equal(branding.tier, "GENERIC");

    const email = state.emailIdentities.get(ws.id)!;
    assert.equal(email.domainStatus, "NONE");
    assert.equal(email.customDomain, null);

    const actions = auditActions(state);
    assert.ok(actions.includes(PROVISIONING_AUDIT.STARTED));
    assert.ok(actions.includes(PROVISIONING_AUDIT.WORKSPACE_CREATED));
    assert.ok(actions.includes(PROVISIONING_AUDIT.WORKSPACE_OWNER_CREATED));
    assert.ok(
      actions.includes(PROVISIONING_AUDIT.WORKSPACE_ENTITLEMENTS_MATERIALIZED),
    );
    assert.ok(
      actions.includes(PROVISIONING_AUDIT.WORKSPACE_SEAT_QUOTA_MATERIALIZED),
    );
    assert.ok(actions.includes(PROVISIONING_AUDIT.WORKSPACE_PROVISIONED));

    const run = state.provisioningRuns.get(result.runId!)!;
    assert.equal(run.status, "SUCCEEDED");
    assert.equal(
      state.provisioningSteps.filter((s) => s.status === "SUCCEEDED").length,
      11,
    );

    // Idempotent second call
    const again = await provisionPaidSubscription({
      subscriptionId: seeded.subscriptionId,
      prisma,
    });
    assert.equal(again.outcome, "already_succeeded");
    assert.equal(tenantWorkspaces(state).length, 1);
    assert.equal(
      state.members.filter((m) => m.workspaceId === ws.id && m.role === "OWNER")
        .length,
      1,
    );

    assertProtectedUnchanged(state, before);
    console.log("[2] ACTIVE TEAM provisions correctly... PASS");
  }

  // 3. TRIALING → workspace TRIAL
  {
    const state = emptyState();
    seedProtectedWorkspaces(state);
    const before = snapshotProtected(state);
    const seeded = seedPaidSubscription(state, {
      status: "TRIALING",
      planCode: "TEAM",
    });
    const prisma = createFakePrisma(state);

    const result = await provisionPaidSubscription({
      subscriptionId: seeded.subscriptionId,
      prisma,
    });
    assert.equal(result.outcome, "succeeded");
    const ws = tenantWorkspaces(state)[0]!;
    // Created as TRIAL and left TRIAL when Subscription is TRIALING (no spurious event).
    assert.equal(ws.status, "TRIAL");
    assert.equal(
      state.statusEvents.filter((e) => e.workspaceId === ws.id).length,
      0,
    );
    assertProtectedUnchanged(state, before);
    console.log("[3] TRIALING → workspace TRIAL... PASS");
  }

  // 4. Retry after failure — no duplicates
  {
    const state = emptyState();
    seedProtectedWorkspaces(state);
    const before = snapshotProtected(state);
    const seeded = seedPaidSubscription(state, {
      status: "ACTIVE",
      planCode: "TEAM",
      additionalSeats: 2,
      addOns: ["CUSTOM_CONSUMER_APP"],
    });
    const prisma = createFakePrisma(state);

    state.failEntitlementUpserts = 1;
    const failed = await provisionPaidSubscription({
      subscriptionId: seeded.subscriptionId,
      prisma,
    });
    assert.equal(failed.outcome, "failed");
    assert.ok(failed.runId);
    assert.equal(tenantWorkspaces(state).length, 1);
    const wsId = tenantWorkspaces(state)[0]!.id;
    const run = state.provisioningRuns.get(failed.runId!)!;
    assert.equal(run.status, "FAILED");
    assert.ok(auditActions(state).includes(PROVISIONING_AUDIT.FAILED));

    const workspaceCountAfterFail = state.workspaces.size;
    const memberCountAfterFail = state.members.length;
    const entitlementCountAfterFail = state.entitlements.length;
    const grantCountAfterFail = state.addOnGrants.length;

    const retried = await provisionPaidSubscription({
      subscriptionId: seeded.subscriptionId,
      prisma,
      allowInProgressRetry: true,
    });
    assert.equal(retried.outcome, "succeeded");
    assert.equal(retried.workspaceId, wsId);
    assert.equal(tenantWorkspaces(state).length, 1);
    assert.equal(state.workspaces.size, workspaceCountAfterFail);
    assert.equal(
      state.members.filter((m) => m.workspaceId === wsId && m.role === "OWNER")
        .length,
      1,
    );
    assert.ok(state.members.length <= memberCountAfterFail + 1);
    assert.ok(state.entitlements.length >= entitlementCountAfterFail);
    assert.equal(
      new Set(
        state.entitlements
          .filter((e) => e.workspaceId === wsId)
          .map((e) => e.featureCode),
      ).size,
      state.entitlements.filter((e) => e.workspaceId === wsId).length,
    );
    assert.equal(state.seatQuotas.size, 1);
    assert.ok(state.addOnGrants.length >= grantCountAfterFail);
    assert.equal(
      state.addOnGrants.filter(
        (g) =>
          g.workspaceId === wsId && g.addOnCode === "CUSTOM_CONSUMER_APP",
      ).length,
      1,
    );
    assert.equal(state.provisioningRuns.size, 1);
    assert.equal(state.provisioningRuns.get(failed.runId!)!.status, "SUCCEEDED");
    assertProtectedUnchanged(state, before);
    console.log("[4] Retry after failure — no duplicates... PASS");
  }

  // 5. Solo forces additionalSeats 0
  {
    const state = emptyState();
    seedProtectedWorkspaces(state);
    const before = snapshotProtected(state);
    const seeded = seedPaidSubscription(state, {
      status: "ACTIVE",
      planCode: "SOLO",
      includedSeats: 1,
      additionalSeats: 3,
    });
    // Force subscription snapshot to claim extra seats (Solo must clamp).
    const sub = state.subscriptions.get(seeded.subscriptionId)!;
    sub.additionalSeats = 3;
    state.offers.get(seeded.offerId)!.additionalSeats = 3;

    const prisma = createFakePrisma(state);
    const result = await provisionPaidSubscription({
      subscriptionId: seeded.subscriptionId,
      prisma,
    });
    assert.equal(result.outcome, "succeeded");
    const ws = tenantWorkspaces(state)[0]!;
    const seats = state.seatQuotas.get(ws.id)!;
    assert.equal(seats.includedSeats, 1);
    assert.equal(seats.additionalSeats, 0);
    assert.equal(seats.seatLimit, 1);
    assert.equal(
      state.addOnGrants.filter((g) => g.addOnCode === "ADDITIONAL_AGENT")
        .length,
      0,
    );
    assert.equal(
      state.entitlements.find(
        (e) =>
          e.workspaceId === ws.id && e.featureCode === FEATURE_TEAM_MANAGEMENT,
      )?.enabled,
      false,
    );
    assertProtectedUnchanged(state, before);
    console.log("[5] Solo forces additionalSeats 0... PASS");
  }

  // 6. CUSTOM_CONSUMER_APP add-on
  {
    const state = emptyState();
    seedProtectedWorkspaces(state);
    const before = snapshotProtected(state);
    const seeded = seedPaidSubscription(state, {
      status: "ACTIVE",
      planCode: "TEAM",
      addOns: ["CUSTOM_CONSUMER_APP"],
    });
    const prisma = createFakePrisma(state);
    const result = await provisionPaidSubscription({
      subscriptionId: seeded.subscriptionId,
      prisma,
    });
    assert.equal(result.outcome, "succeeded");
    const ws = tenantWorkspaces(state)[0]!;
    const ent = state.entitlements.find(
      (e) =>
        e.workspaceId === ws.id &&
        e.featureCode === FEATURE_CUSTOM_CONSUMER_APP,
    );
    assert.ok(ent);
    assert.equal(ent.enabled, true);
    assert.equal(ent.source, "ADDON");
    const grant = state.addOnGrants.find(
      (g) =>
        g.workspaceId === ws.id && g.addOnCode === "CUSTOM_CONSUMER_APP",
    );
    assert.ok(grant);
    assert.equal(grant.status, "ACTIVE");
    assert.equal(grant.sourceOfferId, seeded.offerId);
    assertProtectedUnchanged(state, before);
    console.log("[6] CUSTOM_CONSUMER_APP add-on... PASS");
  }

  // 7. Existing BUYER user reused without promoting to ADMIN
  {
    const state = emptyState();
    seedProtectedWorkspaces(state);
    const before = snapshotProtected(state);
    const email = "buyer.existing@example.test";
    const existingUserId = `user_existing_${state.nextId++}`;
    state.users.set(existingUserId, {
      id: existingUserId,
      email,
      name: "Existing Buyer",
      role: "BUYER",
      password: "hashed-not-plaintext",
      isBuyer: true,
      isSeller: false,
      platformOperatorId: null,
    });

    const seeded = seedPaidSubscription(state, {
      status: "ACTIVE",
      planCode: "TEAM",
      acceptedEmail: email,
      contactName: "Existing Buyer",
    });
    const prisma = createFakePrisma(state);
    const userCountBefore = state.users.size;

    const result = await provisionPaidSubscription({
      subscriptionId: seeded.subscriptionId,
      prisma,
    });
    assert.equal(result.outcome, "succeeded");
    assert.equal(state.users.size, userCountBefore);

    const user = state.users.get(existingUserId)!;
    assert.equal(user.role, "BUYER");
    assert.notEqual(user.role, "ADMIN");

    const ws = tenantWorkspaces(state)[0]!;
    const owners = state.members.filter(
      (m) => m.workspaceId === ws.id && m.userId === existingUserId,
    );
    assert.equal(owners.length, 1);
    assert.equal(owners[0]!.role, "OWNER");
    assert.equal(ws.billingOwnerUserId, existingUserId);
    assertProtectedUnchanged(state, before);
    console.log("[7] Existing BUYER reused; not promoted to ADMIN... PASS");
  }

  // 8. Houzzat + tenant-canary unchanged across multi-tenant provision
  {
    const state = emptyState();
    seedProtectedWorkspaces(state);
    const before = snapshotProtected(state);
    const a = seedPaidSubscription(state, {
      status: "ACTIVE",
      planCode: "TEAM",
      acceptedEmail: "a@tenant.test",
      brokerageName: "Tenant A Co",
    });
    const b = seedPaidSubscription(state, {
      status: "ACTIVE",
      planCode: "BROKERAGE",
      acceptedEmail: "b@tenant.test",
      brokerageName: "Tenant B Co",
    });
    const prisma = createFakePrisma(state);

    assert.equal(
      (
        await provisionPaidSubscription({
          subscriptionId: a.subscriptionId,
          prisma,
        })
      ).outcome,
      "succeeded",
    );
    assert.equal(
      (
        await provisionPaidSubscription({
          subscriptionId: b.subscriptionId,
          prisma,
        })
      ).outcome,
      "succeeded",
    );

    assert.equal(tenantWorkspaces(state).length, 2);
    assert.ok(
      !tenantWorkspaces(state).some(
        (w) => w.slug === "houzzat" || w.slug === "tenant-canary",
      ),
    );
    assertProtectedUnchanged(state, before);
    console.log("[8] Houzzat + tenant-canary unchanged... PASS");
  }

  console.log("\nSTAGE 6.9 SELFTEST PASSED\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
