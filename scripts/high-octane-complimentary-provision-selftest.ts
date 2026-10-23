/**
 * Complimentary Master Admin provisioning and unpublished theme assignment.
 * Run: pnpm exec tsx scripts/high-octane-complimentary-provision-selftest.ts
 */
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { evaluateOwnerActivationEligibility } from "../src/lib/platform/activation/eligibility";
import { evaluatePaidSubscriptionProvisioningEligibility } from "../src/lib/platform/provisioning/eligibility";
import {
  COMPLIMENTARY_WORKSPACE_AUTHORIZATION,
  provisionComplimentaryWorkspace,
} from "../src/lib/platform/provisioning/complimentary";
import { assignUnpublishedWorkspaceTheme } from "../src/lib/platform/templates/assign-unpublished-theme";
import { ProvisioningActionError } from "../src/lib/platform/provisioning/errors";
import {
  clearHostResolutionCacheForTests,
  createFixtureHostResolutionDeps,
  resolveWorkspaceFromHostname,
} from "../src/lib/tenancy/resolve-workspace-host";
import {
  listSelectableTemplates,
  requireMasterAdminAssignableThemeId,
  requireValidSelectableThemeId,
} from "../src/lib/tenancy/templates";
import { buildHighOctaneProductionProvisionPlan } from "../src/lib/tenancy/templates/high-octane-production-plan";

type Row = Record<string, unknown> & { id?: string };

function matches(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [key, value] of Object.entries(where)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const compound = value as Record<string, unknown>;
      if ("in" in compound && Array.isArray(compound.in)) {
        if (!compound.in.includes(row[key])) return false;
        continue;
      }
      if (!Object.entries(compound).every(([field, expected]) => row[field] === expected)) {
        return false;
      }
      continue;
    }
    if (row[key] !== value) return false;
  }
  return true;
}

function project(row: Row, select?: Record<string, unknown>): Row {
  if (!select) return { ...row };
  const out: Row = {};
  for (const [key, spec] of Object.entries(select)) {
    if (spec === true) out[key] = row[key];
  }
  return out;
}

function createMemoryPrisma() {
  const tables = new Map<string, Row[]>();
  let nextId = 1;
  const id = (prefix: string) => `${prefix}_${nextId++}`;
  const table = (name: string) => {
    const rows = tables.get(name) ?? [];
    tables.set(name, rows);
    return rows;
  };
  const insert = (name: string, data: Row) => {
    const row = { ...data, id: typeof data.id === "string" ? data.id : id(name) };
    table(name).push(row);
    return row;
  };

  const api = {
    platformOperator: {
      async findUnique(args: { where: { id: string }; select?: Record<string, unknown> }) {
        const row = table("operator").find((item) => item.id === args.where.id) ?? null;
        return row ? project(row, args.select) : null;
      },
    },
    workspace: {
      async findUnique(args: {
        where: { id?: string; slug?: string };
        select?: Record<string, unknown>;
      }) {
        const row =
          table("workspace").find((item) =>
            args.where.id ? item.id === args.where.id : item.slug === args.where.slug,
          ) ?? null;
        if (!row || !args.select) return row ? { ...row } : null;
        const out: Row = {};
        for (const [key, spec] of Object.entries(args.select)) {
          if (spec === true) out[key] = row[key];
          else if (key === "currentSubscription" && spec && typeof spec === "object") {
            const subscription =
              table("subscription").find((item) => item.id === row.currentSubscriptionId) ?? null;
            const select = (spec as { select?: Record<string, unknown> }).select;
            out.currentSubscription = subscription ? project(subscription, select) : null;
          } else if (key === "members" && spec && typeof spec === "object") {
            const memberSpec = spec as { select?: { user?: { select?: Record<string, unknown> } } };
            out.members = table("member")
              .filter((member) => member.workspaceId === row.id && member.role === "OWNER")
              .map((member) => {
                const user = table("user").find((item) => item.id === member.userId) ?? null;
                return {
                  user: user ? project(user, memberSpec.select?.user?.select) : null,
                };
              });
          } else if (key === "provisioningRuns") {
            out.provisioningRuns = [];
          }
        }
        return out;
      },
      async create(args: { data: Row; select?: Record<string, unknown> }) {
        return project(insert("workspace", { status: "ACTIVE", ...args.data }), args.select);
      },
      async update(args: { where: { id: string }; data: Row }) {
        const row = table("workspace").find((item) => item.id === args.where.id);
        if (!row) throw new Error("workspace missing");
        Object.assign(row, args.data);
        return { ...row };
      },
    },
    user: {
      async findFirst(args: { where: { email: string }; select?: Record<string, unknown> }) {
        const row = table("user").find((item) => item.email === args.where.email) ?? null;
        return row ? project(row, args.select) : null;
      },
      async findUnique(args: { where: { id: string }; select?: Record<string, unknown> }) {
        const row = table("user").find((item) => item.id === args.where.id) ?? null;
        return row ? project(row, args.select) : null;
      },
      async create(args: { data: Row; select?: Record<string, unknown> }) {
        return project(insert("user", { password: null, ...args.data }), args.select);
      },
    },
    workspaceMember: {
      async findUnique(args: {
        where: { workspaceId_userId: { workspaceId: string; userId: string } };
        select?: Record<string, unknown>;
      }) {
        const key = args.where.workspaceId_userId;
        const row =
          table("member").find(
            (item) => item.workspaceId === key.workspaceId && item.userId === key.userId,
          ) ?? null;
        return row ? project(row, args.select) : null;
      },
      async create(args: { data: Row }) {
        return insert("member", args.data);
      },
    },
    workspaceBranding: {
      async findUnique(args: { where: { workspaceId: string }; select?: Record<string, unknown> }) {
        const row =
          table("branding").find((item) => item.workspaceId === args.where.workspaceId) ?? null;
        return row ? project(row, args.select) : null;
      },
      async create(args: { data: Row }) {
        return insert("branding", args.data);
      },
      async update(args: { where: { workspaceId: string }; data: Row }) {
        const row = table("branding").find((item) => item.workspaceId === args.where.workspaceId);
        if (!row) throw new Error("branding missing");
        Object.assign(row, args.data);
        return { ...row };
      },
    },
    workspaceProfessionalIdentity: {
      async findUnique(args: { where: { workspaceId: string }; select?: Record<string, unknown> }) {
        const row =
          table("identity").find((item) => item.workspaceId === args.where.workspaceId) ?? null;
        return row ? project(row, args.select) : null;
      },
      async create(args: { data: Row }) {
        return insert("identity", args.data);
      },
      async update(args: { where: { workspaceId: string }; data: Row }) {
        const row = table("identity").find((item) => item.workspaceId === args.where.workspaceId);
        if (!row) throw new Error("identity missing");
        Object.assign(row, args.data);
        return { ...row };
      },
    },
    workspaceOnboardingState: {
      async findUnique(args: { where: { workspaceId: string }; select?: Record<string, unknown> }) {
        const row =
          table("onboarding").find((item) => item.workspaceId === args.where.workspaceId) ?? null;
        return row ? project(row, args.select) : null;
      },
      async create(args: { data: Row }) {
        return insert("onboarding", args.data);
      },
      async update(args: { where: { workspaceId: string }; data: Row }) {
        const row = table("onboarding").find((item) => item.workspaceId === args.where.workspaceId);
        if (!row) throw new Error("onboarding missing");
        Object.assign(row, args.data);
        return { ...row };
      },
    },
    billingCustomer: {
      async findUnique(args: { where: { workspaceId: string }; select?: Record<string, unknown> }) {
        const row =
          table("billing").find((item) => item.workspaceId === args.where.workspaceId) ?? null;
        return row ? project(row, args.select) : null;
      },
      async create(args: { data: Row; select?: Record<string, unknown> }) {
        return project(insert("billing", args.data), args.select);
      },
    },
    subscription: {
      async findFirst(args: { where: Row; select?: Record<string, unknown> }) {
        const row = table("subscription").find((item) => matches(item, args.where)) ?? null;
        return row ? project(row, args.select) : null;
      },
      async findUnique(args: { where: { id: string }; include?: unknown }) {
        return table("subscription").find((item) => item.id === args.where.id) ?? null;
      },
      async create(args: { data: Row; select?: Record<string, unknown> }) {
        return project(insert("subscription", args.data), args.select);
      },
    },
    workspaceEntitlement: {
      async upsert(args: {
        where: { workspaceId_featureCode: { workspaceId: string; featureCode: string } };
        create: Row;
        update: Row;
      }) {
        const key = args.where.workspaceId_featureCode;
        const existing = table("entitlement").find(
          (item) => item.workspaceId === key.workspaceId && item.featureCode === key.featureCode,
        );
        if (existing) {
          Object.assign(existing, args.update);
          return { ...existing };
        }
        return insert("entitlement", args.create);
      },
    },
    workspaceSeatQuota: {
      async findUnique(args: { where: { workspaceId: string }; select?: Record<string, unknown> }) {
        const row =
          table("quota").find((item) => item.workspaceId === args.where.workspaceId) ?? null;
        return row ? project(row, args.select) : null;
      },
      async upsert(args: { where: { workspaceId: string }; create: Row; update: Row }) {
        const existing = table("quota").find((item) => item.workspaceId === args.where.workspaceId);
        if (existing) {
          Object.assign(existing, args.update);
          return { ...existing };
        }
        return insert("quota", args.create);
      },
    },
    crmRoutingSettings: {
      async findFirst(args: { where: { workspaceId: string }; select?: Record<string, unknown> }) {
        const row =
          table("crm").find((item) => item.workspaceId === args.where.workspaceId) ?? null;
        return row ? project(row, args.select) : null;
      },
      async create(args: { data: Row; select?: Record<string, unknown> }) {
        return project(insert("crm", args.data), args.select);
      },
    },
    crmRoutingWeight: {
      async create(args: { data: Row }) {
        return insert("weight", args.data);
      },
    },
    workspaceDomain: {
      async findUnique(args: { where: { hostname: string }; select?: Record<string, unknown> }) {
        const row = table("domain").find((item) => item.hostname === args.where.hostname) ?? null;
        return row ? project(row, args.select) : null;
      },
      async findFirst(args: { where: Row; select?: Record<string, unknown> }) {
        const row = table("domain").find((item) => matches(item, args.where)) ?? null;
        return row ? project(row, args.select) : null;
      },
      async create(args: { data: Row; select?: Record<string, unknown> }) {
        return project(insert("domain", args.data), args.select);
      },
    },
    workspaceEmailIdentity: {
      async findUnique(args: { where: { workspaceId: string }; select?: Record<string, unknown> }) {
        const row =
          table("emailIdentity").find((item) => item.workspaceId === args.where.workspaceId) ??
          null;
        return row ? project(row, args.select) : null;
      },
      async create(args: { data: Row }) {
        return insert("emailIdentity", args.data);
      },
    },
    workspaceStatusEvent: {
      async create(args: { data: Row }) {
        return insert("statusEvent", args.data);
      },
    },
    platformAuditEvent: {
      async create(args: { data: Row; select?: Record<string, unknown> }) {
        return project(insert("audit", args.data), args.select);
      },
    },
    counts() {
      return {
        workspaces: table("workspace").length,
        users: table("user").length,
        members: table("member").length,
        domains: table("domain").length,
        subscriptions: table("subscription").length,
        billing: table("billing").length,
      };
    },
    rows(name: string) {
      return table(name);
    },
  };
  return api;
}

function launchInput(db: ReturnType<typeof createMemoryPrisma>) {
  const plan = buildHighOctaneProductionProvisionPlan();
  return {
    prisma: db as unknown as PrismaClient,
    operatorId: "op_admin",
    authorization: COMPLIMENTARY_WORKSPACE_AUTHORIZATION,
    slug: plan.workspaceSlug,
    displayName: plan.displayName,
    ownerName: plan.ownerName,
    ownerEmail: plan.ownerEmail,
    ownerPhone: plan.ownerPhone,
    brokerageName: plan.brokerageName,
    planCode: plan.planCode,
    themeId: plan.themeId,
  };
}

function seedOperator(db: ReturnType<typeof createMemoryPrisma>, role = "MASTER_ADMIN", status = "ACTIVE") {
  db.rows("operator").push({ id: "op_admin", role, status });
}

function seedHouzzat(db: ReturnType<typeof createMemoryPrisma>) {
  db.rows("workspace").push({
    id: "ws_houzzat",
    slug: "houzzat",
    name: "Houzzat",
    status: "ACTIVE",
    currentSubscriptionId: "sub_houzzat",
  });
  db.rows("subscription").push({
    id: "sub_houzzat",
    workspaceId: "ws_houzzat",
    source: "GRANDFATHERED",
    status: "ACTIVE",
    stripeSubscriptionId: null,
  });
  db.rows("user").push({
    id: "user_houzzat",
    email: "hello@houzzat.com",
    workspaceId: "ws_houzzat",
    password: "hash",
  });
  db.rows("member").push({
    id: "member_houzzat",
    workspaceId: "ws_houzzat",
    userId: "user_houzzat",
    role: "OWNER",
    status: "ACTIVE",
  });
  db.rows("branding").push({
    workspaceId: "ws_houzzat",
    themeId: "default-signature:mint",
    displayName: "Houzzat",
  });
}

async function main() {
const db = createMemoryPrisma();
seedOperator(db);
seedHouzzat(db);
const houzzatBefore = JSON.stringify(db.rows("workspace").find((row) => row.slug === "houzzat"));

await assert.rejects(
  () =>
    provisionComplimentaryWorkspace({
      ...launchInput(db),
      operatorId: "missing",
    }),
  (error: unknown) => error instanceof ProvisioningActionError && error.code === "MASTER_ADMIN_REQUIRED",
);

db.rows("operator")[0]!.role = "SALES";
await assert.rejects(
  () => provisionComplimentaryWorkspace(launchInput(db)),
  (error: unknown) => error instanceof ProvisioningActionError && error.code === "MASTER_ADMIN_REQUIRED",
);
db.rows("operator")[0]!.role = "MASTER_ADMIN";

await assert.rejects(
  () => provisionComplimentaryWorkspace({ ...launchInput(db), authorization: "no" }),
  (error: unknown) => error instanceof ProvisioningActionError && error.code === "AUTHORIZATION_REQUIRED",
);
assert.equal(db.counts().workspaces, 1);

const created = await provisionComplimentaryWorkspace(launchInput(db));
assert.equal(created.outcome, "created");
assert.equal(created.slug, "high-octane-real-estate");
assert.equal(created.hostname, "high-octane-real-estate.houzzatpro.com");
assert.equal(created.subscriptionSource, "INTERNAL");
assert.equal(created.themeId, "royal-collection-one:signature");
assert.equal(created.emailSent, false);
assert.equal(created.passwordCopied, false);

const subscription = db.rows("subscription").find((row) => row.id === created.subscriptionId);
assert.equal(subscription?.source, "INTERNAL");
assert.equal(subscription?.status, "ACTIVE");
assert.equal(subscription?.stripeSubscriptionId, null);
assert.equal(subscription?.stripeCheckoutSessionId, null);
assert.equal(subscription?.stripePriceId, null);
assert.equal(subscription?.offerId, null);
assert.equal((subscription?.commercialSnapshotJson as { kind?: string }).kind, "COMPLIMENTARY");

const owner = db.rows("user").find((row) => row.email === "saad@highoctaneniagara.ca");
assert.equal(owner?.password, null);
assert.equal(owner?.workspaceId, created.workspaceId);
assert.equal(db.rows("member").filter((row) => row.workspaceId === created.workspaceId).length, 1);
assert.equal(db.rows("domain").filter((row) => row.workspaceId === created.workspaceId).length, 1);
assert.equal(db.rows("identity").find((row) => row.workspaceId === created.workspaceId)?.agentRegisteredName, "Saad Qureshi");
assert.equal(db.rows("branding").find((row) => row.workspaceId === created.workspaceId)?.themeId, "royal-collection-one:signature");

const again = await provisionComplimentaryWorkspace(launchInput(db));
assert.equal(again.outcome, "already_present");
assert.equal(again.workspaceId, created.workspaceId);
assert.equal(db.counts().users, 2);
assert.equal(db.counts().members, 2);
assert.equal(db.counts().subscriptions, 2);
assert.equal(db.counts().domains, 1);
assert.equal(JSON.stringify(db.rows("workspace").find((row) => row.slug === "houzzat")), houzzatBefore);

await assert.rejects(
  () =>
    provisionComplimentaryWorkspace({
      ...launchInput(db),
      slug: "houzzat",
      displayName: "Houzzat",
      ownerEmail: "other@example.com",
    }),
  (error: unknown) => error instanceof ProvisioningActionError && error.code === "RESERVED_SLUG",
);

const activation = await evaluateOwnerActivationEligibility({
  prisma: db as unknown as PrismaClient,
  workspaceId: created.workspaceId,
});
assert.equal(activation.eligible, true);
assert.equal(activation.reason, "ELIGIBLE");
assert.equal(activation.passwordSet, false);

const internalPaid = await evaluatePaidSubscriptionProvisioningEligibility({
  prisma: {
    subscription: {
      findUnique: async () => ({
        id: created.subscriptionId,
        source: "INTERNAL",
        status: "ACTIVE",
        offerId: null,
        workspaceId: created.workspaceId,
        planCode: "TEAM",
        includedSeats: 4,
        commercialSnapshotJson: { kind: "COMPLIMENTARY" },
        billingCustomer: { id: "bc" },
        offer: null,
        provisioningRun: null,
      }),
    },
  } as unknown as PrismaClient,
  subscriptionId: created.subscriptionId,
});
assert.equal(internalPaid.eligible, false);
assert.equal(internalPaid.reason, "NOT_STRIPE");

const stripePaid = await evaluatePaidSubscriptionProvisioningEligibility({
  prisma: {
    subscription: {
      findUnique: async () => ({
        id: "sub_paid",
        source: "STRIPE",
        status: "ACTIVE",
        offerId: "offer_1",
        workspaceId: null,
        planCode: "TEAM",
        includedSeats: 4,
        commercialSnapshotJson: { planCode: "TEAM" },
        billingCustomer: { id: "bc_paid" },
        offer: { id: "offer_1", status: "ACCEPTED", acceptance: { id: "acc_1" } },
        provisioningRun: null,
      }),
    },
  } as unknown as PrismaClient,
  subscriptionId: "sub_paid",
});
assert.equal(stripePaid.eligible, true);
assert.equal(stripePaid.reason, "ELIGIBLE");

assert.throws(() => requireValidSelectableThemeId("royal-collection-one:signature"));
assert.equal(
  requireMasterAdminAssignableThemeId("royal-collection-one:signature"),
  "royal-collection-one:signature",
);
assert.throws(() => requireMasterAdminAssignableThemeId("default-signature:mint"));
assert.equal(
  listSelectableTemplates().some((template) => template.id === "royal-collection-one"),
  false,
);

db.rows("workspace").push({
  id: "ws_harbour",
  slug: "harbour-and-co",
  name: "Harbour & Co.",
  status: "ACTIVE",
  currentSubscriptionId: null,
});
const assigned = await assignUnpublishedWorkspaceTheme({
  prisma: db as unknown as PrismaClient,
  operatorId: "op_admin",
  workspaceId: "ws_harbour",
  themeId: "royal-collection-one:signature",
});
assert.equal(assigned.outcome, "assigned");
assert.equal(
  db.rows("branding").find((row) => row.workspaceId === "ws_harbour")?.themeId,
  "royal-collection-one:signature",
);
assert.equal(
  db.rows("branding").find((row) => row.workspaceId === created.workspaceId)?.themeId,
  "royal-collection-one:signature",
);
assert.equal(
  db.rows("branding").find((row) => row.workspaceId === "ws_houzzat")?.themeId,
  "default-signature:mint",
);
const assignedAgain = await assignUnpublishedWorkspaceTheme({
  prisma: db as unknown as PrismaClient,
  operatorId: "op_admin",
  workspaceId: "ws_harbour",
  themeId: "royal-collection-one:signature",
});
assert.equal(assignedAgain.outcome, "already_assigned");
await assert.rejects(
  () =>
    assignUnpublishedWorkspaceTheme({
      prisma: db as unknown as PrismaClient,
      operatorId: "op_admin",
      workspaceId: "ws_houzzat",
      themeId: "royal-collection-one:signature",
    }),
  (error: unknown) => error instanceof ProvisioningActionError && error.code === "RESERVED_SLUG",
);

const previousScope = process.env.TENANT_DOMAIN_SCOPE;
process.env.TENANT_DOMAIN_SCOPE = "workspace";
clearHostResolutionCacheForTests();
const activeHost = await resolveWorkspaceFromHostname(
  "high-octane-real-estate.houzzatpro.com",
  createFixtureHostResolutionDeps([
    {
      hostname: "high-octane-real-estate.houzzatpro.com",
      kind: "PLATFORM",
      role: "PRIMARY",
      workspaceId: created.workspaceId,
      workspaceSlug: "high-octane-real-estate",
      domainStatus: "ACTIVE",
      workspaceStatus: "ACTIVE",
    },
  ]),
);
assert.equal(activeHost.ok, true);
if (activeHost.ok) assert.equal(activeHost.workspaceSlug, "high-octane-real-estate");
clearHostResolutionCacheForTests();
const trialHost = await resolveWorkspaceFromHostname(
  "high-octane-real-estate.houzzatpro.com",
  createFixtureHostResolutionDeps([
    {
      hostname: "high-octane-real-estate.houzzatpro.com",
      kind: "PLATFORM",
      role: "PRIMARY",
      workspaceId: created.workspaceId,
      workspaceSlug: "high-octane-real-estate",
      domainStatus: "ACTIVE",
      workspaceStatus: "TRIAL",
    },
  ]),
);
assert.equal(trialHost.ok, false);
if (previousScope === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
else process.env.TENANT_DOMAIN_SCOPE = previousScope;
clearHostResolutionCacheForTests();

console.log("high-octane-complimentary-provision-selftest: ok");
}

main();
