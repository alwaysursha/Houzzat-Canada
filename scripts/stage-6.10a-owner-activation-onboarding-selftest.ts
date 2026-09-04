/**
 * Stage 6.10A — owner activation + onboarding foundation selftest.
 * Run: pnpm stage-6.10a-owner-activation-onboarding:selftest
 *
 * No real DB. No Stripe. No Resend. In-memory Fake Prisma + send stub only.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import type { SendEmailResult } from "../src/lib/email/send";
import type { RenderedEmail } from "../src/lib/email/templates";
import {
  OWNER_ACTIVATION_AUDIT,
  OWNER_ACTIVATION_MIN_PASSWORD_LENGTH,
  OWNER_ACTIVATION_PATH_PREFIX,
  OwnerActivationError,
  completeOwnerActivation,
  createOwnerActivationRawToken,
  evaluateOwnerActivationEligibility,
  hashOwnerActivationToken,
  resolvePublicOwnerActivation,
  sendOwnerActivationEmail,
} from "../src/lib/platform/activation";

const root = process.cwd();
const MIGRATION_REL =
  "prisma/migrations/20260904180000_stage_610a_owner_activation_onboarding/migration.sql";

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

type FakeUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  password: string | null;
  disabledAt: Date | null;
  emailVerified: Date | null;
  platformOperatorId: string | null;
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
};

type FakeActivation = {
  id: string;
  workspaceId: string;
  userId: string;
  tokenHash: string;
  status: string;
  expiresAt: Date;
  sentAt: Date | null;
  usedAt: Date | null;
  revokedAt: Date | null;
  createdByType: string;
  createdByOperatorId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type FakeOnboarding = {
  workspaceId: string;
  accountActivatedAt: Date | null;
  businessProfileStatus: string;
  brandingStatus: string;
  templateThemeStatus: string;
  emailIdentityStatus: string;
  completedAt: Date | null;
  updatedAt: Date;
};

type FakeState = {
  users: Map<string, FakeUser>;
  workspaces: Map<string, FakeWorkspace>;
  members: FakeMember[];
  subscriptions: Map<string, Record<string, unknown>>;
  provisioningRuns: Map<string, FakeRun>;
  workspaceOwnerActivation: Map<string, FakeActivation>;
  workspaceOnboardingState: Map<string, FakeOnboarding>;
  workspaceBranding: Map<string, Record<string, unknown>>;
  workspaceEmailIdentity: Map<string, Record<string, unknown>>;
  platformAuditEvent: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    actorOperatorId: string | null;
    actorType: string;
    summary: string;
    metadata: unknown;
  }>;
  nextId: number;
};

function emptyState(): FakeState {
  return {
    users: new Map(),
    workspaces: new Map(),
    members: [],
    subscriptions: new Map(),
    provisioningRuns: new Map(),
    workspaceOwnerActivation: new Map(),
    workspaceOnboardingState: new Map(),
    workspaceBranding: new Map(),
    workspaceEmailIdentity: new Map(),
    platformAuditEvent: [],
    nextId: 1,
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

type SeedProvisionedOpts = {
  ownerPassword?: string | null;
  ownerRole?: string;
  provisioningStatus?: string | null;
  workspaceStatus?: string;
  withSubscription?: boolean;
};

function seedProvisionedWorkspace(state: FakeState, opts?: SeedProvisionedOpts) {
  const ownerId = `user_owner_${state.nextId++}`;
  const operatorUserId = `user_op_${state.nextId++}`;
  const operatorId = `op_${state.nextId++}`;
  const workspaceId = `ws_tenant_${state.nextId++}`;
  const subscriptionId = `sub_${state.nextId++}`;
  const memberId = `mem_${state.nextId++}`;
  const runId = `run_${state.nextId++}`;

  const owner: FakeUser = {
    id: ownerId,
    email: `owner${state.nextId}@brokerage.test`,
    name: "Alex Owner",
    role: opts?.ownerRole ?? "AGENT",
    password: opts?.ownerPassword === undefined ? null : opts.ownerPassword,
    disabledAt: null,
    emailVerified: null,
    platformOperatorId: null,
  };
  state.users.set(owner.id, owner);

  const operatorUser: FakeUser = {
    id: operatorUserId,
    email: `operator${state.nextId}@houzzatpro.test`,
    name: "Master Admin",
    role: "ADMIN",
    password: "hashed-op",
    disabledAt: null,
    emailVerified: new Date(),
    platformOperatorId: operatorId,
  };
  state.users.set(operatorUser.id, operatorUser);

  const withSubscription = opts?.withSubscription !== false;
  if (withSubscription) {
    state.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      workspaceId,
      status: "ACTIVE",
      planCode: "TEAM",
    });
  }

  const workspace: FakeWorkspace = {
    id: workspaceId,
    slug: `rivera-${state.nextId}`,
    name: "Rivera Realty",
    status: opts?.workspaceStatus ?? "ACTIVE",
    currentSubscriptionId: withSubscription ? subscriptionId : null,
    billingOwnerUserId: ownerId,
  };
  state.workspaces.set(workspace.id, workspace);

  state.members.push({
    id: memberId,
    workspaceId,
    userId: ownerId,
    role: "OWNER",
    status: "ACTIVE",
    joinedAt: new Date(),
  });

  if (opts?.provisioningStatus !== null) {
    const status = opts?.provisioningStatus ?? "SUCCEEDED";
    state.provisioningRuns.set(runId, {
      id: runId,
      offerId: `off_${state.nextId++}`,
      subscriptionId,
      workspaceId,
      status,
      idempotencyKey: `idem_${runId}`,
    });
  }

  state.workspaceBranding.set(workspaceId, {
    workspaceId,
    displayName: "Rivera Realty",
    contactEmail: owner.email,
    contactPhone: null,
  });
  state.workspaceEmailIdentity.set(workspaceId, {
    workspaceId,
    contactEmail: owner.email,
    replyToEmail: owner.email,
    senderDisplayName: "Rivera Realty",
    domainStatus: "NONE",
  });

  return {
    workspaceId,
    ownerId,
    ownerEmail: owner.email,
    operatorId,
    operatorUserId,
    subscriptionId,
    memberId,
    runId,
  };
}

function projectSelect(
  row: Record<string, unknown>,
  select: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(select)) {
    if (spec === true) {
      out[key] = row[key];
    } else if (spec && typeof spec === "object") {
      // Nested relation handled by caller.
      out[key] = undefined;
    }
  }
  return out;
}

function createFakePrisma(state: FakeState): PrismaClient {
  const id = (prefix: string) => `${prefix}_${state.nextId++}`;

  const rejectUnsafe = (name: string) => {
    throw new Error(`${name} must not be used in Stage 6.10A activation`);
  };

  const findActivationByTokenHash = (tokenHash: string) => {
    for (const row of state.workspaceOwnerActivation.values()) {
      if (row.tokenHash === tokenHash) return row;
    }
    return null;
  };

  return {
    $transaction: async () => rejectUnsafe("$transaction"),
    workspace: {
      async findUnique({
        where,
        select,
      }: {
        where: { id?: string; slug?: string };
        select?: Record<string, unknown>;
      }) {
        let w: FakeWorkspace | undefined;
        if (where.id) w = state.workspaces.get(where.id);
        else if (where.slug) {
          w = [...state.workspaces.values()].find((x) => x.slug === where.slug);
        }
        if (!w) return null;

        if (!select) return { ...w };

        const out: Record<string, unknown> = {};
        for (const [key, spec] of Object.entries(select)) {
          if (key === "members" && spec && typeof spec === "object") {
            const memberSpec = spec as {
              where?: { role?: string; status?: string };
              select?: Record<string, unknown>;
              take?: number;
            };
            let members = state.members.filter(
              (m) => m.workspaceId === w!.id,
            );
            if (memberSpec.where?.role) {
              members = members.filter((m) => m.role === memberSpec.where!.role);
            }
            if (memberSpec.where?.status) {
              members = members.filter(
                (m) => m.status === memberSpec.where!.status,
              );
            }
            if (typeof memberSpec.take === "number") {
              members = members.slice(0, memberSpec.take);
            }
            out.members = members.map((m) => {
              if (!memberSpec.select) return { ...m };
              const mo: Record<string, unknown> = {};
              for (const [mk, ms] of Object.entries(memberSpec.select)) {
                if (mk === "user" && ms && typeof ms === "object") {
                  const user = state.users.get(m.userId);
                  const userSelect = (ms as { select?: Record<string, boolean> })
                    .select;
                  if (!user) {
                    mo.user = null;
                  } else if (!userSelect) {
                    mo.user = { ...user };
                  } else {
                    const uo: Record<string, unknown> = {};
                    for (const [uk, uv] of Object.entries(userSelect)) {
                      if (uv) uo[uk] = (user as Record<string, unknown>)[uk];
                    }
                    mo.user = uo;
                  }
                } else if (ms === true) {
                  mo[mk] = (m as Record<string, unknown>)[mk];
                }
              }
              return mo;
            });
          } else if (
            key === "provisioningRuns" &&
            spec &&
            typeof spec === "object"
          ) {
            const runSpec = spec as {
              where?: { status?: string };
              select?: Record<string, boolean>;
              take?: number;
            };
            let runs = [...state.provisioningRuns.values()].filter(
              (r) => r.workspaceId === w!.id,
            );
            if (runSpec.where?.status) {
              runs = runs.filter((r) => r.status === runSpec.where!.status);
            }
            if (typeof runSpec.take === "number") {
              runs = runs.slice(0, runSpec.take);
            }
            out.provisioningRuns = runs.map((r) => {
              if (!runSpec.select) return { ...r };
              const ro: Record<string, unknown> = {};
              for (const [rk, rv] of Object.entries(runSpec.select)) {
                if (rv) ro[rk] = (r as Record<string, unknown>)[rk];
              }
              return ro;
            });
          } else if (spec === true) {
            out[key] = (w as Record<string, unknown>)[key];
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
      async findMany({
        where,
      }: {
        where?: {
          userId?: string;
          role?: string;
          status?: string;
          workspace?: { status?: { in?: string[] } };
        };
      }) {
        let members = [...state.members];
        if (where?.userId) {
          members = members.filter((m) => m.userId === where.userId);
        }
        if (where?.role) {
          members = members.filter((m) => m.role === where.role);
        }
        if (where?.status) {
          members = members.filter((m) => m.status === where.status);
        }
        return members.map((m) => ({ ...m }));
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
      async updateMany() {
        rejectUnsafe("updateMany");
      },
    },
    user: {
      async findUnique({
        where,
        select,
      }: {
        where: { id?: string; email?: string };
        select?: Record<string, unknown>;
      }) {
        let user: FakeUser | undefined;
        if (where.id) user = state.users.get(where.id);
        else if (where.email) {
          const email = where.email.trim().toLowerCase();
          user = [...state.users.values()].find((u) => u.email === email);
        }
        if (!user) return null;
        return projectSelect(user as unknown as Record<string, unknown>, select);
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
      async updateMany() {
        rejectUnsafe("updateMany");
      },
    },
    workspaceOwnerActivation: {
      async findMany({
        where,
        select,
      }: {
        where?: {
          workspaceId?: string;
          userId?: string;
          status?: { in?: string[] } | string;
        };
        select?: Record<string, boolean>;
      }) {
        let rows = [...state.workspaceOwnerActivation.values()];
        if (where?.workspaceId) {
          rows = rows.filter((r) => r.workspaceId === where.workspaceId);
        }
        if (where?.userId) {
          rows = rows.filter((r) => r.userId === where.userId);
        }
        if (where?.status) {
          if (typeof where.status === "string") {
            rows = rows.filter((r) => r.status === where.status);
          } else if (where.status.in) {
            const allowed = new Set(where.status.in);
            rows = rows.filter((r) => allowed.has(r.status));
          }
        }
        return rows.map((r) => {
          if (!select) return { ...r };
          const out: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(select)) {
            if (v) out[k] = (r as Record<string, unknown>)[k];
          }
          return out;
        });
      },
      async findUnique({
        where,
        select,
      }: {
        where: { id?: string; tokenHash?: string };
        select?: Record<string, unknown>;
      }) {
        let row: FakeActivation | null = null;
        if (where.id) {
          row = state.workspaceOwnerActivation.get(where.id) ?? null;
        } else if (where.tokenHash) {
          row = findActivationByTokenHash(where.tokenHash);
        }
        if (!row) return null;

        if (!select) return { ...row };

        const out: Record<string, unknown> = {};
        for (const [key, spec] of Object.entries(select)) {
          if (key === "workspace" && spec && typeof spec === "object") {
            const ws = state.workspaces.get(row.workspaceId);
            const wsSelect = (spec as { select?: Record<string, boolean> })
              .select;
            if (!ws) {
              out.workspace = null;
            } else if (!wsSelect) {
              out.workspace = { ...ws };
            } else {
              const wo: Record<string, unknown> = {};
              for (const [wk, wv] of Object.entries(wsSelect)) {
                if (wv) wo[wk] = (ws as Record<string, unknown>)[wk];
              }
              out.workspace = wo;
            }
          } else if (key === "user" && spec && typeof spec === "object") {
            const user = state.users.get(row.userId);
            const userSelect = (spec as { select?: Record<string, boolean> })
              .select;
            if (!user) {
              out.user = null;
            } else if (!userSelect) {
              out.user = { ...user };
            } else {
              const uo: Record<string, unknown> = {};
              for (const [uk, uv] of Object.entries(userSelect)) {
                if (uv) uo[uk] = (user as Record<string, unknown>)[uk];
              }
              out.user = uo;
            }
          } else if (spec === true) {
            out[key] = (row as Record<string, unknown>)[key];
          }
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
        const tokenHash = String(data.tokenHash);
        if (findActivationByTokenHash(tokenHash)) {
          const err = new Error("Unique") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const now = new Date();
        const row: FakeActivation = {
          id: id("act"),
          workspaceId: String(data.workspaceId),
          userId: String(data.userId),
          tokenHash,
          status: String(data.status ?? "PENDING"),
          expiresAt: data.expiresAt as Date,
          sentAt: (data.sentAt as Date | null) ?? null,
          usedAt: (data.usedAt as Date | null) ?? null,
          revokedAt: (data.revokedAt as Date | null) ?? null,
          createdByType: String(data.createdByType ?? "OPERATOR"),
          createdByOperatorId:
            (data.createdByOperatorId as string | null) ?? null,
          createdAt: now,
          updatedAt: now,
        };
        state.workspaceOwnerActivation.set(row.id, row);
        if (!select) return { ...row };
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(select)) {
          if (v) out[k] = (row as Record<string, unknown>)[k];
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
        const row = state.workspaceOwnerActivation.get(where.id);
        if (!row) throw new Error("activation missing");
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      },
      async updateMany() {
        rejectUnsafe("updateMany");
      },
    },
    workspaceOnboardingState: {
      async findUnique({
        where,
        select,
      }: {
        where: { workspaceId: string };
        select?: Record<string, boolean>;
      }) {
        const row = state.workspaceOnboardingState.get(where.workspaceId);
        if (!row) return null;
        if (!select) return { ...row };
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(select)) {
          if (v) out[k] = (row as Record<string, unknown>)[k];
        }
        return out;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const workspaceId = String(data.workspaceId);
        if (state.workspaceOnboardingState.has(workspaceId)) {
          const err = new Error("Unique") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const row: FakeOnboarding = {
          workspaceId,
          accountActivatedAt:
            (data.accountActivatedAt as Date | null) ?? null,
          businessProfileStatus: String(
            data.businessProfileStatus ?? "NOT_STARTED",
          ),
          brandingStatus: String(data.brandingStatus ?? "NOT_STARTED"),
          templateThemeStatus: String(
            data.templateThemeStatus ?? "NOT_STARTED",
          ),
          emailIdentityStatus: String(
            data.emailIdentityStatus ?? "NOT_STARTED",
          ),
          completedAt: (data.completedAt as Date | null) ?? null,
          updatedAt: new Date(),
        };
        state.workspaceOnboardingState.set(workspaceId, row);
        return { ...row };
      },
      async update({
        where,
        data,
      }: {
        where: { workspaceId: string };
        data: Record<string, unknown>;
      }) {
        const row = state.workspaceOnboardingState.get(where.workspaceId);
        if (!row) throw new Error("onboarding missing");
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      },
      async updateMany() {
        rejectUnsafe("updateMany");
      },
    },
    workspaceBranding: {
      async findUnique({
        where,
      }: {
        where: { workspaceId: string };
      }) {
        const row = state.workspaceBranding.get(where.workspaceId);
        return row ? { ...row } : null;
      },
      async update({
        where,
        data,
      }: {
        where: { workspaceId: string };
        data: Record<string, unknown>;
      }) {
        const row = state.workspaceBranding.get(where.workspaceId);
        if (!row) throw new Error("branding missing");
        Object.assign(row, data);
        return { ...row };
      },
    },
    workspaceEmailIdentity: {
      async findUnique({
        where,
      }: {
        where: { workspaceId: string };
      }) {
        const row = state.workspaceEmailIdentity.get(where.workspaceId);
        return row ? { ...row } : null;
      },
      async update({
        where,
        data,
      }: {
        where: { workspaceId: string };
        data: Record<string, unknown>;
      }) {
        const row = state.workspaceEmailIdentity.get(where.workspaceId);
        if (!row) throw new Error("email identity missing");
        Object.assign(row, data);
        return { ...row };
      },
    },
    platformAuditEvent: {
      async create({
        data,
        select,
      }: {
        data: {
          actorOperatorId?: string | null;
          actorType: string;
          action: string;
          entityType: string;
          entityId: string;
          summary: string;
          metadata?: unknown;
        };
        select?: Record<string, boolean>;
      }) {
        const row = {
          id: id("aud"),
          actorOperatorId: data.actorOperatorId ?? null,
          actorType: data.actorType,
          action: data.action,
          entityType: data.entityType,
          entityId: data.entityId,
          summary: data.summary,
          metadata: data.metadata ?? null,
        };
        state.platformAuditEvent.push(row);
        if (select?.id) return { id: row.id };
        return { ...row };
      },
    },
  } as unknown as PrismaClient;
}

function extractRawTokenFromEmail(rendered: RenderedEmail): string {
  const haystack = `${rendered.text}\n${rendered.html}`;
  const re = new RegExp(
    `${OWNER_ACTIVATION_PATH_PREFIX.replace("/", "\\/")}\\/([A-Za-z0-9_-]+)`,
  );
  const match = re.exec(haystack);
  assert.ok(match?.[1], "activation email must contain /activate/<token>");
  return match[1];
}

function createSendStub() {
  const sent: Array<{
    to: string;
    rendered: RenderedEmail;
    rawToken: string;
  }> = [];

  const send = async (input: {
    to: string;
    rendered: RenderedEmail;
    stream?: string;
    from?: string | null;
  }): Promise<SendEmailResult> => {
    const rawToken = extractRawTokenFromEmail(input.rendered);
    sent.push({
      to: input.to,
      rendered: input.rendered,
      rawToken,
    });
    return { ok: true, status: "sent" };
  };

  return { send, sent };
}

function assertNoRawTokenInDb(state: FakeState, rawToken: string) {
  const expectedHash = hashOwnerActivationToken(rawToken);
  const serialized = JSON.stringify([
    [...state.workspaceOwnerActivation.values()],
    [...state.workspaceOnboardingState.values()],
    state.platformAuditEvent,
  ]);
  assert.ok(
    !serialized.includes(rawToken),
    "raw activation token must never appear in DB rows / audit metadata",
  );
  for (const row of state.workspaceOwnerActivation.values()) {
    assert.notEqual(row.tokenHash, rawToken);
    // Matching row stores hash only; other rotations keep their own hashes.
    if (row.tokenHash === expectedHash) {
      assert.equal(row.tokenHash.length, 64);
    }
  }
  assert.ok(
    [...state.workspaceOwnerActivation.values()].some(
      (r) => r.tokenHash === expectedHash,
    ),
    "hashed form of raw token must exist in activation rows",
  );
}

async function expectOwnerActivationError(
  fn: () => Promise<unknown>,
  code: string,
) {
  try {
    await fn();
    assert.fail(`expected OwnerActivationError ${code}`);
  } catch (error) {
    assert.ok(error instanceof OwnerActivationError, String(error));
    assert.equal(error.code, code);
  }
}

async function main() {
  console.log("\n=== STAGE 6.10A — OWNER ACTIVATION + ONBOARDING ===\n");

  // 0. Source guards
  {
    const activationFiles = listTsFiles("src/lib/platform/activation");
    const activationSrc = activationFiles.map(read).join("\n");

    assert.ok(
      !/\.\$transaction\s*\(/.test(activationSrc),
      "activation must not use $transaction",
    );
    assert.ok(
      !/\.updateMany\s*\(/.test(activationSrc),
      "activation must not use updateMany",
    );
    assert.ok(
      activationSrc.includes('templateThemeStatus: "NOT_STARTED"') ||
        activationSrc.includes("templateThemeStatus: \"NOT_STARTED\""),
      "templateThemeStatus must stay NOT_STARTED",
    );
    assert.ok(
      !/themeId\s*:|templateCard|tenantTemplate|homepageLayout|themePreview|OWNER TENANT TEMPLATE DESIGN/i.test(
        activationSrc,
      ),
      "no template/theme design invention in activation",
    );

    assert.ok(
      existsSync(join(root, MIGRATION_REL)),
      `migration missing: ${MIGRATION_REL}`,
    );
    const migrationSql = read(MIGRATION_REL);
    assert.ok(
      /CREATE TYPE/i.test(migrationSql) && /CREATE TABLE/i.test(migrationSql),
      "migration must be additive (CREATE TYPE/TABLE)",
    );
    assert.ok(
      !/\bDROP\b/i.test(migrationSql),
      "migration must not DROP anything",
    );
    assert.ok(migrationSql.includes("WorkspaceOwnerActivation"));
    assert.ok(migrationSql.includes("WorkspaceOnboardingState"));
    assert.ok(migrationSql.includes("NOT_STARTED"));

    // Token helpers sanity
    const raw = createOwnerActivationRawToken();
    assert.ok(raw.length >= 32);
    assert.equal(
      hashOwnerActivationToken(raw),
      hashOwnerActivationToken(raw),
    );
    assert.notEqual(hashOwnerActivationToken(raw), raw);

    console.log("[0] Source guards (activation + migration)... PASS");
  }

  // 1. Eligibility: password-null OWNER eligible; password-set ineligible
  {
    const state = emptyState();
    seedProtectedWorkspaces(state);
    const before = snapshotProtected(state);
    const seeded = seedProvisionedWorkspace(state);
    const db = createFakePrisma(state);

    const eligible = await evaluateOwnerActivationEligibility({
      prisma: db,
      workspaceId: seeded.workspaceId,
    });
    assert.equal(eligible.eligible, true);
    assert.equal(eligible.reason, "ELIGIBLE");
    assert.equal(eligible.userId, seeded.ownerId);
    assert.equal(eligible.passwordSet, false);

    const statePwd = emptyState();
    seedProtectedWorkspaces(statePwd);
    const seededPwd = seedProvisionedWorkspace(statePwd, {
      ownerPassword: "already-set",
    });
    const dbPwd = createFakePrisma(statePwd);
    const ineligible = await evaluateOwnerActivationEligibility({
      prisma: dbPwd,
      workspaceId: seededPwd.workspaceId,
    });
    assert.equal(ineligible.eligible, false);
    assert.equal(ineligible.reason, "OWNER_PASSWORD_SET");
    assert.equal(ineligible.passwordSet, true);

    await expectOwnerActivationError(
      () =>
        sendOwnerActivationEmail({
          workspaceId: seededPwd.workspaceId,
          operatorId: seededPwd.operatorId,
          prisma: dbPwd,
          send: async () => ({ ok: true, status: "sent" }),
        }),
      "OWNER_PASSWORD_SET",
    );

    assertProtectedUnchanged(state, before);
    console.log("[1] Eligibility password-null / OWNER_PASSWORD_SET... PASS");
  }

  // 2. Failed / missing provisioning denied
  {
    const stateFail = emptyState();
    seedProtectedWorkspaces(stateFail);
    const before = snapshotProtected(stateFail);
    const failed = seedProvisionedWorkspace(stateFail, {
      provisioningStatus: "FAILED",
    });
    const dbFail = createFakePrisma(stateFail);
    const r1 = await evaluateOwnerActivationEligibility({
      prisma: dbFail,
      workspaceId: failed.workspaceId,
    });
    assert.equal(r1.eligible, false);
    assert.equal(r1.reason, "PROVISIONING_NOT_SUCCEEDED");

    const stateMissing = emptyState();
    seedProtectedWorkspaces(stateMissing);
    const missing = seedProvisionedWorkspace(stateMissing, {
      provisioningStatus: null,
    });
    const dbMissing = createFakePrisma(stateMissing);
    const r2 = await evaluateOwnerActivationEligibility({
      prisma: dbMissing,
      workspaceId: missing.workspaceId,
    });
    assert.equal(r2.eligible, false);
    assert.equal(r2.reason, "PROVISIONING_NOT_SUCCEEDED");

    await expectOwnerActivationError(
      () =>
        sendOwnerActivationEmail({
          workspaceId: failed.workspaceId,
          operatorId: failed.operatorId,
          prisma: dbFail,
          send: async () => ({ ok: true, status: "sent" }),
        }),
      "NOT_ELIGIBLE",
    );

    assertProtectedUnchanged(stateFail, before);
    console.log("[2] Failed/missing provisioning denied... PASS");
  }

  // 3. Send creates hashed token only (no raw token in DB)
  {
    const state = emptyState();
    seedProtectedWorkspaces(state);
    const before = snapshotProtected(state);
    const seeded = seedProvisionedWorkspace(state);
    const db = createFakePrisma(state);
    const stub = createSendStub();

    const result = await sendOwnerActivationEmail({
      workspaceId: seeded.workspaceId,
      operatorId: seeded.operatorId,
      prisma: db,
      send: stub.send,
    });

    assert.equal(result.outcome, "sent");
    assert.equal(result.emailStatus, "sent");
    assert.equal(result.workspaceId, seeded.workspaceId);
    assert.equal(result.userId, seeded.ownerId);
    assert.equal(stub.sent.length, 1);
    assert.equal(stub.sent[0].to, seeded.ownerEmail);

    const rawToken = stub.sent[0].rawToken;
    const activations = [...state.workspaceOwnerActivation.values()];
    assert.equal(activations.length, 1);
    assert.equal(activations[0].status, "SENT");
    assert.equal(activations[0].tokenHash, hashOwnerActivationToken(rawToken));
    assert.ok(activations[0].sentAt);
    assertNoRawTokenInDb(state, rawToken);

    const onboarding = state.workspaceOnboardingState.get(seeded.workspaceId);
    assert.ok(onboarding);
    assert.equal(onboarding.templateThemeStatus, "NOT_STARTED");
    assert.equal(onboarding.accountActivatedAt, null);

    const actions = state.platformAuditEvent.map((a) => a.action);
    assert.ok(actions.includes(OWNER_ACTIVATION_AUDIT.CREATED));
    assert.ok(actions.includes(OWNER_ACTIVATION_AUDIT.EMAIL_SENT));

    const view = await resolvePublicOwnerActivation({
      rawToken,
      prisma: db,
    });
    assert.equal(view.workspaceName, "Rivera Realty");
    assert.ok(view.ownerEmailMasked.includes("***@"));

    assertProtectedUnchanged(state, before);
    console.log("[3] Send hashed token only + resolve public... PASS");
  }

  // 4. Resend revokes previous PENDING/SENT; old raw rejected; new works
  {
    const state = emptyState();
    seedProtectedWorkspaces(state);
    const before = snapshotProtected(state);
    const seeded = seedProvisionedWorkspace(state);
    const db = createFakePrisma(state);
    const stub = createSendStub();

    await sendOwnerActivationEmail({
      workspaceId: seeded.workspaceId,
      operatorId: seeded.operatorId,
      prisma: db,
      send: stub.send,
    });
    const oldRaw = stub.sent[0].rawToken;
    const oldId = [...state.workspaceOwnerActivation.values()][0].id;

    await sendOwnerActivationEmail({
      workspaceId: seeded.workspaceId,
      operatorId: seeded.operatorId,
      prisma: db,
      send: stub.send,
    });
    const newRaw = stub.sent[1].rawToken;
    assert.notEqual(oldRaw, newRaw);

    const oldRow = state.workspaceOwnerActivation.get(oldId)!;
    assert.equal(oldRow.status, "REVOKED");
    assert.ok(oldRow.revokedAt);

    const usable = [...state.workspaceOwnerActivation.values()].filter(
      (r) => r.status === "SENT" || r.status === "PENDING",
    );
    assert.equal(usable.length, 1);
    assert.equal(usable[0].tokenHash, hashOwnerActivationToken(newRaw));

    await expectOwnerActivationError(
      () => resolvePublicOwnerActivation({ rawToken: oldRaw, prisma: db }),
      "INVALID_TOKEN",
    );

    const view = await resolvePublicOwnerActivation({
      rawToken: newRaw,
      prisma: db,
    });
    assert.equal(view.workspaceName, "Rivera Realty");

    assertNoRawTokenInDb(state, oldRaw);
    assertNoRawTokenInDb(state, newRaw);
    assertProtectedUnchanged(state, before);
    console.log("[4] Resend revoke + rotate tokens... PASS");
  }

  // 5. Expiry rejected
  {
    const state = emptyState();
    seedProtectedWorkspaces(state);
    const before = snapshotProtected(state);
    const seeded = seedProvisionedWorkspace(state);
    const db = createFakePrisma(state);
    const stub = createSendStub();

    await sendOwnerActivationEmail({
      workspaceId: seeded.workspaceId,
      operatorId: seeded.operatorId,
      prisma: db,
      send: stub.send,
    });
    const rawToken = stub.sent[0].rawToken;
    const row = [...state.workspaceOwnerActivation.values()][0];
    row.expiresAt = new Date(Date.now() - 1000);

    await expectOwnerActivationError(
      () => resolvePublicOwnerActivation({ rawToken, prisma: db }),
      "INVALID_TOKEN",
    );
    assert.equal(
      state.workspaceOwnerActivation.get(row.id)!.status,
      "EXPIRED",
    );

    await expectOwnerActivationError(
      () =>
        completeOwnerActivation({
          rawToken,
          password: "password123",
          confirmPassword: "password123",
          prisma: db,
        }),
      "INVALID_TOKEN",
    );

    assertProtectedUnchanged(state, before);
    console.log("[5] Expiry rejected... PASS");
  }

  // 6. Used token / replay rejected; password mismatch; successful complete
  {
    const state = emptyState();
    seedProtectedWorkspaces(state);
    const before = snapshotProtected(state);
    const seeded = seedProvisionedWorkspace(state, { ownerRole: "AGENT" });
    const db = createFakePrisma(state);
    const stub = createSendStub();
    const membersBefore = state.members.length;

    await sendOwnerActivationEmail({
      workspaceId: seeded.workspaceId,
      operatorId: seeded.operatorId,
      prisma: db,
      send: stub.send,
    });
    const rawToken = stub.sent[0].rawToken;

    await expectOwnerActivationError(
      () =>
        completeOwnerActivation({
          rawToken,
          password: "password123",
          confirmPassword: "different!",
          prisma: db,
        }),
      "PASSWORD_MISMATCH",
    );

    await expectOwnerActivationError(
      () =>
        completeOwnerActivation({
          rawToken,
          password: "short",
          confirmPassword: "short",
          prisma: db,
        }),
      "WEAK_PASSWORD",
    );
    assert.ok(
      OWNER_ACTIVATION_MIN_PASSWORD_LENGTH >= 8,
      "min password length must stay >= 8",
    );

    const ownerBefore = state.users.get(seeded.ownerId)!;
    assert.equal(ownerBefore.role, "AGENT");
    assert.equal(ownerBefore.password, null);

    const completed = await completeOwnerActivation({
      rawToken,
      password: "password123",
      confirmPassword: "password123",
      prisma: db,
    });
    assert.equal(completed.workspaceId, seeded.workspaceId);
    assert.equal(completed.userId, seeded.ownerId);

    const owner = state.users.get(seeded.ownerId)!;
    assert.equal(owner.role, "AGENT", "User.role must stay AGENT (not ADMIN)");
    assert.ok(owner.password);
    assert.ok(await bcrypt.compare("password123", owner.password));
    assert.ok(owner.emailVerified);

    const member = state.members.find((m) => m.id === seeded.memberId)!;
    assert.equal(member.role, "OWNER");
    assert.equal(member.status, "ACTIVE");
    assert.equal(member.userId, seeded.ownerId);

    // PlatformOperator must not be added as WorkspaceMember
    assert.equal(state.members.length, membersBefore);
    assert.ok(
      !state.members.some((m) => m.userId === seeded.operatorUserId),
      "PlatformOperator must not become WorkspaceMember",
    );

    const activation = [...state.workspaceOwnerActivation.values()][0];
    assert.equal(activation.status, "USED");
    assert.ok(activation.usedAt);

    const onboarding = state.workspaceOnboardingState.get(seeded.workspaceId)!;
    assert.ok(onboarding.accountActivatedAt);
    assert.equal(onboarding.templateThemeStatus, "NOT_STARTED");

    const auditActions = state.platformAuditEvent.map((a) => a.action);
    assert.ok(auditActions.includes(OWNER_ACTIVATION_AUDIT.ACCOUNT_ACTIVATED));

    // Replay rejected
    await expectOwnerActivationError(
      () => resolvePublicOwnerActivation({ rawToken, prisma: db }),
      "INVALID_TOKEN",
    );
    await expectOwnerActivationError(
      () =>
        completeOwnerActivation({
          rawToken,
          password: "password123",
          confirmPassword: "password123",
          prisma: db,
        }),
      "INVALID_TOKEN",
    );

    // After password set, send is ineligible
    await expectOwnerActivationError(
      () =>
        sendOwnerActivationEmail({
          workspaceId: seeded.workspaceId,
          operatorId: seeded.operatorId,
          prisma: db,
          send: stub.send,
        }),
      "OWNER_PASSWORD_SET",
    );

    assertProtectedUnchanged(state, before);
    console.log(
      "[6] Mismatch / bcrypt complete / replay / OPERATOR not member... PASS",
    );
  }

  // 7. Houzzat + tenant-canary snapshots unchanged after full happy path
  {
    const state = emptyState();
    seedProtectedWorkspaces(state);
    const before = snapshotProtected(state);
    const seeded = seedProvisionedWorkspace(state);
    const db = createFakePrisma(state);
    const stub = createSendStub();

    await sendOwnerActivationEmail({
      workspaceId: seeded.workspaceId,
      operatorId: seeded.operatorId,
      prisma: db,
      send: stub.send,
    });
    await completeOwnerActivation({
      rawToken: stub.sent[0].rawToken,
      password: "securepass",
      confirmPassword: "securepass",
      prisma: db,
    });

    assertProtectedUnchanged(state, before);
    assert.equal(
      state.workspaceOnboardingState.get(seeded.workspaceId)!.templateThemeStatus,
      "NOT_STARTED",
    );
    console.log("[7] Protected workspace snapshots unchanged... PASS");
  }

  console.log("\nSTAGE 6.10A SELFTEST PASSED\n");
}

main().catch((error) => {
  console.error("\nSTAGE 6.10A SELFTEST FAILED\n");
  console.error(error);
  process.exitCode = 1;
});
