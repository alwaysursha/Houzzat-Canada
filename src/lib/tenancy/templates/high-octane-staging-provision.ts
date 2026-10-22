/**
 * Staging-only plan for a genuine HIGH OCTANE workspace.
 * Dry-run inspection may read the verified staging branch. Writes stay behind
 * an explicit confirmation and are not invoked by the dry-run script.
 * This module does not call paid provisioning, Stripe, email, or MLS sync.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  HIGH_OCTANE_STAGING_BRANCH_ID,
  HIGH_OCTANE_STAGING_DIRECT_HOST,
  HIGH_OCTANE_STAGING_HOSTNAME,
  HIGH_OCTANE_STAGING_POOLED_HOST,
} from "@/lib/tenancy/templates/high-octane-staging-launch";
import {
  planHighOctaneStagingWorkspace,
  resolveHighOctaneStagingTemplateId,
} from "@/lib/tenancy/templates/high-octane-staging";
import { HIGH_OCTANE_PREVIEW_FIXTURE } from "@/lib/tenancy/templates/high-octane-preview-fixture";
import {
  DEFAULT_TEMPLATE_ID,
  getTemplate,
  resolveTemplateIdFromThemeId,
  buildThemeId,
} from "@/lib/tenancy/templates";
import { assertHostnameClaimable } from "@/lib/tenancy/reserved-domains";
import { normalizeWorkspaceHostname } from "@/lib/tenancy/normalize-workspace-hostname";
import { HIGH_OCTANE_STAGING_OWNER_EMAIL } from "@/lib/tenancy/templates/high-octane-staging-slug";
import { ROYAL_COLLECTION_ONE_TEMPLATE_ID } from "@/lib/tenancy/templates/types";

export { HIGH_OCTANE_STAGING_OWNER_EMAIL };

export const HIGH_OCTANE_STAGING_PROVISION_CONFIRMATION =
  "APPLY_HIGH_OCTANE_STAGING_PROVISION" as const;

export const HIGH_OCTANE_STAGING_OWNER_NAME = "HIGH OCTANE Staging Owner" as const;

const PRODUCTION_HOSTS = new Set([
  "ep-snowy-river-axfgwomo.c-4.us-east-2.aws.neon.tech",
  "ep-snowy-river-axfgwomo-pooler.c-4.us-east-2.aws.neon.tech",
]);

const fixture = HIGH_OCTANE_PREVIEW_FIXTURE;
const brandPlan = planHighOctaneStagingWorkspace();

export const HIGH_OCTANE_STAGING_THEME_ID = buildThemeId(
  ROYAL_COLLECTION_ONE_TEMPLATE_ID,
  "signature",
);

export const HIGH_OCTANE_STAGING_PROVISION_MODELS = [
  "Workspace",
  "User",
  "WorkspaceMember",
  "WorkspaceBranding",
  "WorkspaceProfessionalIdentity",
  "WorkspaceDomain",
] as const;

export type QueryRows = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export type ProvisionSnapshot = {
  workspaceCount: number;
  userCount: number;
  leadCount: number;
  listingCount: number;
  dataConnectionCount: number;
  otherWorkspaceSlugs: string[];
  publicContactUserCount: number;
  workspace: { slug: string; name: string; status: string; hasBillingOwner: boolean } | null;
  domain: {
    hostname: string;
    kind: string;
    role: string;
    status: string;
    workspaceSlug: string;
  } | null;
  owner: {
    email: string;
    hasPassword: boolean;
    role: string;
    workspaceSlug: string | null;
  } | null;
  branding: {
    displayName: string;
    themeId: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  } | null;
  identity: {
    agentRegisteredName: string | null;
    agentCellPhone: string | null;
    brokerageRegisteredName: string | null;
  } | null;
  member: { role: string; status: string } | null;
};

export type ProvisionPlan = {
  models: readonly string[];
  workspaceSlug: string;
  workspaceName: string;
  workspaceStatus: "ACTIVE";
  domain: {
    hostname: string;
    kind: "CUSTOM";
    role: "PRIMARY";
    status: "ACTIVE";
  };
  themeId: string;
  templateId: typeof ROYAL_COLLECTION_ONE_TEMPLATE_ID;
  catalogSelectable: false;
  catalogPresentationReady: false;
  publicTemplateWithoutStagingGate: typeof DEFAULT_TEMPLATE_ID;
  stagingGateTemplateId: typeof ROYAL_COLLECTION_ONE_TEMPLATE_ID | null;
  productionNodeTemplateId: null;
  ordinaryTenantTemplateId: null;
  owner: {
    email: typeof HIGH_OCTANE_STAGING_OWNER_EMAIL;
    name: typeof HIGH_OCTANE_STAGING_OWNER_NAME;
    role: "AGENT";
    password: null;
    membershipRole: "OWNER";
    membershipStatus: "ACTIVE";
    activationEmail: false;
  };
  branding: {
    displayName: string;
    tagline: string;
    contactEmail: string;
    contactPhone: string;
    tier: "SEMI_BRANDED";
    poweredByHouzzatPro: true;
  };
  identity: {
    agentRegisteredName: string;
    agentCellPhone: string;
    brokerageRegisteredName: string;
  };
  billingOwner: null;
  listingConnection: false;
  atomic: true;
};

export type ProvisionOutcome = "would_create" | "already_present" | "blocked";

export type ProvisionAssessment = {
  ok: boolean;
  outcome: ProvisionOutcome;
  blockers: string[];
  plan: ProvisionPlan;
  writesExecuted: false;
};

type UrlFacts = {
  directUrl: string;
  applicationDatabaseUrl: string;
  applicationDirectUrl: string;
  pooledUrl: string;
  branchId: string | null;
  transactionReadOnly: boolean;
  nodeEnv: string | undefined;
};

function databaseHost(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function stagingLauncherEnv(pooledUrl: string, directUrl: string): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "development",
    HIGH_OCTANE_STAGING: "1",
    HIGH_OCTANE_STAGING_ACCESS: "authenticated",
    STAGING_DATABASE_URL: pooledUrl,
    DATABASE_URL: directUrl,
  };
}

function emptySnapshot(): ProvisionSnapshot {
  return {
    workspaceCount: 0,
    userCount: 0,
    leadCount: 0,
    listingCount: 0,
    dataConnectionCount: 0,
    otherWorkspaceSlugs: [],
    publicContactUserCount: 0,
    workspace: null,
    domain: null,
    owner: null,
    branding: null,
    identity: null,
    member: null,
  };
}

function countOf(row: Record<string, unknown> | undefined, key: string): number {
  const value = row?.[key];
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function buildHighOctaneStagingProvisionPlan(pooledUrl: string, directUrl: string): ProvisionPlan {
  const hostname = normalizeWorkspaceHostname(HIGH_OCTANE_STAGING_HOSTNAME);
  if (!hostname.ok || hostname.hostname !== "localhost") {
    throw new Error("staging hostname did not normalize to localhost");
  }
  const claimError = assertHostnameClaimable({
    hostname: hostname.hostname,
    kind: "CUSTOM",
    workspaceSlug: brandPlan.slug,
  });
  if (claimError) {
    throw new Error("localhost is not claimable for the staging domain");
  }
  const catalog = getTemplate(ROYAL_COLLECTION_ONE_TEMPLATE_ID);
  if (!catalog || catalog.selectable || catalog.presentationReady) {
    throw new Error("Royal Collection catalog flags changed");
  }
  const publicTemplate = resolveTemplateIdFromThemeId(HIGH_OCTANE_STAGING_THEME_ID);
  if (publicTemplate !== DEFAULT_TEMPLATE_ID) {
    throw new Error("Royal Collection theme resolved without the staging gate");
  }
  const hostsReady =
    databaseHost(pooledUrl) === HIGH_OCTANE_STAGING_POOLED_HOST &&
    databaseHost(directUrl) === HIGH_OCTANE_STAGING_DIRECT_HOST;
  const gateEnv = hostsReady ? stagingLauncherEnv(pooledUrl, directUrl) : null;
  const stagingGateTemplateId = gateEnv
    ? resolveHighOctaneStagingTemplateId({ workspaceSlug: brandPlan.slug, env: gateEnv })
    : null;
  const productionNodeTemplateId = gateEnv
    ? resolveHighOctaneStagingTemplateId({
        workspaceSlug: brandPlan.slug,
        env: { ...gateEnv, NODE_ENV: "production" },
      })
    : null;
  const ordinaryTenantTemplateId = gateEnv
    ? resolveHighOctaneStagingTemplateId({ workspaceSlug: "houzzat", env: gateEnv })
    : null;
  if (hostsReady && stagingGateTemplateId !== ROYAL_COLLECTION_ONE_TEMPLATE_ID) {
    throw new Error("staging template gate did not select Royal Collection");
  }
  if (productionNodeTemplateId !== null || ordinaryTenantTemplateId !== null) {
    throw new Error("Royal Collection gate opened outside the staging workspace");
  }
  return {
    models: HIGH_OCTANE_STAGING_PROVISION_MODELS,
    workspaceSlug: brandPlan.slug,
    workspaceName: brandPlan.displayName,
    workspaceStatus: "ACTIVE",
    domain: {
      hostname: hostname.hostname,
      kind: "CUSTOM",
      role: "PRIMARY",
      status: "ACTIVE",
    },
    themeId: HIGH_OCTANE_STAGING_THEME_ID,
    templateId: ROYAL_COLLECTION_ONE_TEMPLATE_ID,
    catalogSelectable: false,
    catalogPresentationReady: false,
    publicTemplateWithoutStagingGate: publicTemplate,
    stagingGateTemplateId,
    productionNodeTemplateId,
    ordinaryTenantTemplateId,
    owner: {
      email: HIGH_OCTANE_STAGING_OWNER_EMAIL,
      name: HIGH_OCTANE_STAGING_OWNER_NAME,
      role: "AGENT",
      password: null,
      membershipRole: "OWNER",
      membershipStatus: "ACTIVE",
      activationEmail: false,
    },
    branding: {
      displayName: brandPlan.displayName,
      tagline: fixture.tagline,
      contactEmail: brandPlan.email,
      contactPhone: brandPlan.phone,
      tier: "SEMI_BRANDED",
      poweredByHouzzatPro: true,
    },
    identity: {
      agentRegisteredName: brandPlan.agentName,
      agentCellPhone: brandPlan.phone,
      brokerageRegisteredName: brandPlan.brokerageName,
    },
    billingOwner: null,
    listingConnection: false,
    atomic: true,
  };
}

export async function loadProvisionSnapshot(query: QueryRows): Promise<ProvisionSnapshot> {
  const slug = brandPlan.slug;
  const counts = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM "Workspace") AS "workspaceCount",
      (SELECT COUNT(*)::int FROM "User") AS "userCount",
      (SELECT COUNT(*)::int FROM "Lead") AS "leadCount",
      (SELECT COUNT(*)::int FROM "Listing") AS "listingCount",
      (SELECT COUNT(*)::int FROM "WorkspaceDataConnection") AS "dataConnectionCount"
  `);
  const others = await query(`SELECT slug FROM "Workspace" WHERE slug <> $1`, [slug]);
  const workspaces = await query(
    `
      SELECT slug, name, status::text AS status,
        ("billingOwnerUserId" IS NOT NULL) AS "hasBillingOwner"
      FROM "Workspace"
      WHERE slug = $1
    `,
    [slug],
  );
  const domains = await query(
    `
      SELECT d.hostname, d.kind::text AS kind, d.role::text AS role, d.status::text AS status,
        w.slug AS "workspaceSlug"
      FROM "WorkspaceDomain" d
      JOIN "Workspace" w ON w.id = d."workspaceId"
      WHERE d.hostname = $1
    `,
    ["localhost"],
  );
  const owners = await query(
    `
      SELECT u.email, (u.password IS NOT NULL) AS "hasPassword", u.role::text AS role,
        w.slug AS "workspaceSlug"
      FROM "User" u
      LEFT JOIN "Workspace" w ON w.id = u."workspaceId"
      WHERE lower(u.email) = lower($1)
    `,
    [HIGH_OCTANE_STAGING_OWNER_EMAIL],
  );
  const publicUsers = await query(
    `SELECT COUNT(*)::int AS count FROM "User" WHERE lower(email) = lower($1)`,
    [brandPlan.email],
  );
  const branding = await query(
    `
      SELECT b."displayName", b."themeId", b."contactEmail", b."contactPhone"
      FROM "WorkspaceBranding" b
      JOIN "Workspace" w ON w.id = b."workspaceId"
      WHERE w.slug = $1
    `,
    [slug],
  );
  const identity = await query(
    `
      SELECT i."agentRegisteredName", i."agentCellPhone", i."brokerageRegisteredName"
      FROM "WorkspaceProfessionalIdentity" i
      JOIN "Workspace" w ON w.id = i."workspaceId"
      WHERE w.slug = $1
    `,
    [slug],
  );
  const members = await query(
    `
      SELECT m.role::text AS role, m.status::text AS status
      FROM "WorkspaceMember" m
      JOIN "Workspace" w ON w.id = m."workspaceId"
      JOIN "User" u ON u.id = m."userId"
      WHERE w.slug = $1 AND lower(u.email) = lower($2)
    `,
    [slug, HIGH_OCTANE_STAGING_OWNER_EMAIL],
  );
  const countRow = counts[0];
  const workspace = workspaces[0];
  const domain = domains[0];
  const owner = owners[0];
  const brand = branding[0];
  const person = identity[0];
  const member = members[0];
  return {
    workspaceCount: countOf(countRow, "workspaceCount"),
    userCount: countOf(countRow, "userCount"),
    leadCount: countOf(countRow, "leadCount"),
    listingCount: countOf(countRow, "listingCount"),
    dataConnectionCount: countOf(countRow, "dataConnectionCount"),
    otherWorkspaceSlugs: others.map((row) => text(row.slug)).filter((slugValue): slugValue is string => Boolean(slugValue)),
    publicContactUserCount: countOf(publicUsers[0], "count"),
    workspace: workspace
      ? {
          slug: text(workspace.slug) ?? "",
          name: text(workspace.name) ?? "",
          status: text(workspace.status) ?? "",
          hasBillingOwner: workspace.hasBillingOwner === true,
        }
      : null,
    domain: domain
      ? {
          hostname: text(domain.hostname) ?? "",
          kind: text(domain.kind) ?? "",
          role: text(domain.role) ?? "",
          status: text(domain.status) ?? "",
          workspaceSlug: text(domain.workspaceSlug) ?? "",
        }
      : null,
    owner: owner
      ? {
          email: text(owner.email) ?? "",
          hasPassword: owner.hasPassword === true,
          role: text(owner.role) ?? "",
          workspaceSlug: text(owner.workspaceSlug),
        }
      : null,
    branding: brand
      ? {
          displayName: text(brand.displayName) ?? "",
          themeId: text(brand.themeId),
          contactEmail: text(brand.contactEmail),
          contactPhone: text(brand.contactPhone),
        }
      : null,
    identity: person
      ? {
          agentRegisteredName: text(person.agentRegisteredName),
          agentCellPhone: text(person.agentCellPhone),
          brokerageRegisteredName: text(person.brokerageRegisteredName),
        }
      : null,
    member: member
      ? { role: text(member.role) ?? "", status: text(member.status) ?? "" }
      : null,
  };
}

function snapshotIsEmpty(snapshot: ProvisionSnapshot): boolean {
  return (
    snapshot.workspaceCount === 0 &&
    snapshot.userCount === 0 &&
    snapshot.leadCount === 0 &&
    snapshot.listingCount === 0 &&
    snapshot.dataConnectionCount === 0 &&
    snapshot.otherWorkspaceSlugs.length === 0 &&
    snapshot.publicContactUserCount === 0 &&
    snapshot.workspace === null &&
    snapshot.domain === null &&
    snapshot.owner === null &&
    snapshot.branding === null &&
    snapshot.identity === null &&
    snapshot.member === null
  );
}

function snapshotMatchesPlan(snapshot: ProvisionSnapshot, plan: ProvisionPlan): boolean {
  return (
    snapshot.workspaceCount === 1 &&
    snapshot.userCount === 1 &&
    snapshot.leadCount === 0 &&
    snapshot.listingCount === 0 &&
    snapshot.dataConnectionCount === 0 &&
    snapshot.otherWorkspaceSlugs.length === 0 &&
    snapshot.publicContactUserCount === 0 &&
    snapshot.workspace?.slug === plan.workspaceSlug &&
    snapshot.workspace.name === plan.workspaceName &&
    snapshot.workspace.status === plan.workspaceStatus &&
    snapshot.workspace.hasBillingOwner === false &&
    snapshot.domain?.hostname === plan.domain.hostname &&
    snapshot.domain.kind === plan.domain.kind &&
    snapshot.domain.role === plan.domain.role &&
    snapshot.domain.status === plan.domain.status &&
    snapshot.domain.workspaceSlug === plan.workspaceSlug &&
    snapshot.owner?.email === plan.owner.email &&
    snapshot.owner.hasPassword === false &&
    snapshot.owner.role === plan.owner.role &&
    snapshot.owner.workspaceSlug === plan.workspaceSlug &&
    snapshot.member?.role === plan.owner.membershipRole &&
    snapshot.member.status === plan.owner.membershipStatus &&
    snapshot.branding?.displayName === plan.branding.displayName &&
    snapshot.branding.themeId === plan.themeId &&
    snapshot.branding.contactEmail === plan.branding.contactEmail &&
    snapshot.branding.contactPhone === plan.branding.contactPhone &&
    snapshot.identity?.agentRegisteredName === plan.identity.agentRegisteredName &&
    snapshot.identity.agentCellPhone === plan.identity.agentCellPhone &&
    snapshot.identity.brokerageRegisteredName === plan.identity.brokerageRegisteredName
  );
}

function environmentBlockers(facts: UrlFacts): string[] {
  const blockers: string[] = [];
  if (facts.nodeEnv === "production") blockers.push("production_node");
  const directHost = databaseHost(facts.directUrl);
  const applicationHost = databaseHost(facts.applicationDatabaseUrl);
  const applicationDirectHost = databaseHost(facts.applicationDirectUrl);
  const pooledHost = databaseHost(facts.pooledUrl);
  if (!facts.directUrl.trim() || !directHost) blockers.push("staging_direct_missing");
  if (directHost && PRODUCTION_HOSTS.has(directHost)) blockers.push("staging_direct_is_production");
  if (directHost && directHost !== HIGH_OCTANE_STAGING_DIRECT_HOST) blockers.push("staging_direct_host_mismatch");
  if (directHost?.includes("pooler")) blockers.push("staging_direct_is_pooler");
  if (!facts.applicationDatabaseUrl.trim() || !facts.applicationDirectUrl.trim()) {
    blockers.push("application_database_unverified");
  }
  if (
    facts.directUrl.trim() &&
    (facts.directUrl.trim() === facts.applicationDatabaseUrl.trim() ||
      facts.directUrl.trim() === facts.applicationDirectUrl.trim())
  ) {
    blockers.push("staging_direct_matches_application_url");
  }
  if (applicationHost && PRODUCTION_HOSTS.has(applicationHost) === false && applicationHost === directHost) {
    blockers.push("application_database_host_matches_staging_direct");
  }
  if (applicationDirectHost && applicationDirectHost === HIGH_OCTANE_STAGING_DIRECT_HOST) {
    blockers.push("application_direct_is_staging");
  }
  if (!facts.pooledUrl.trim() || pooledHost !== HIGH_OCTANE_STAGING_POOLED_HOST) {
    blockers.push("staging_pooled_unverified");
  }
  if (facts.branchId !== HIGH_OCTANE_STAGING_BRANCH_ID) blockers.push("staging_branch_unverified");
  if (!facts.transactionReadOnly) blockers.push("inspection_not_read_only");
  return blockers;
}

function dataBlockers(snapshot: ProvisionSnapshot, plan: ProvisionPlan): string[] {
  if (snapshotIsEmpty(snapshot) || snapshotMatchesPlan(snapshot, plan)) return [];
  const blockers: string[] = [];
  if (snapshot.leadCount > 0 || snapshot.listingCount > 0) blockers.push("application_data_present");
  if (snapshot.dataConnectionCount > 0) blockers.push("data_connection_present");
  if (snapshot.otherWorkspaceSlugs.length > 0 || snapshot.workspaceCount > 1) blockers.push("other_workspace_present");
  if (snapshot.publicContactUserCount > 0) blockers.push("public_contact_login_exists");
  if (snapshot.owner?.hasPassword) blockers.push("owner_has_password");
  const present = [
    snapshot.workspace,
    snapshot.domain,
    snapshot.owner,
    snapshot.branding,
    snapshot.identity,
    snapshot.member,
  ].filter(Boolean).length;
  if (present > 0 && present < 6) blockers.push("partial_tenant");
  if (!blockers.includes("partial_tenant")) blockers.push("conflicting_tenant_records");
  return blockers;
}

export function assessHighOctaneStagingProvision(input: UrlFacts & { snapshot: ProvisionSnapshot }): ProvisionAssessment {
  const plan = buildHighOctaneStagingProvisionPlan(input.pooledUrl, input.directUrl);
  const blockers = [...environmentBlockers(input), ...dataBlockers(input.snapshot, plan)];
  if (blockers.length > 0) {
    return { ok: false, outcome: "blocked", blockers, plan, writesExecuted: false };
  }
  if (snapshotMatchesPlan(input.snapshot, plan)) {
    return { ok: true, outcome: "already_present", blockers: [], plan, writesExecuted: false };
  }
  return { ok: true, outcome: "would_create", blockers: [], plan, writesExecuted: false };
}

export type ProvisionWriteClient = {
  readBranchId(): Promise<string | null>;
  query: QueryRows;
  createWorkspace(data: Prisma.WorkspaceCreateInput): Promise<{ id: string }>;
  createUser(data: Prisma.UserCreateInput): Promise<{ id: string }>;
  setPrimaryAgent(workspaceId: string, userId: string): Promise<void>;
  createMember(data: Prisma.WorkspaceMemberCreateInput): Promise<void>;
  createBranding(data: Prisma.WorkspaceBrandingCreateInput): Promise<void>;
  createIdentity(data: Prisma.WorkspaceProfessionalIdentityCreateInput): Promise<void>;
  createDomain(data: Prisma.WorkspaceDomainCreateInput): Promise<void>;
};

export type ProvisionWriter = {
  transaction<T>(fn: (tx: ProvisionWriteClient) => Promise<T>): Promise<T>;
};

/**
 * Future authorized write. Refuses unless the confirmation token matches and
 * the same dry-run assessment says the staging branch is empty and safe.
 */
export async function applyHighOctaneStagingProvision(input: UrlFacts & {
  confirmation: string;
  snapshot: ProvisionSnapshot;
  writer: ProvisionWriter;
}): Promise<{ applied: boolean }> {
  if (input.confirmation !== HIGH_OCTANE_STAGING_PROVISION_CONFIRMATION) {
    throw new Error("staging provision write refused");
  }
  const assessment = assessHighOctaneStagingProvision(input);
  if (!assessment.ok || assessment.outcome !== "would_create") {
    throw new Error("staging provision write refused");
  }
  let applied = false;
  await input.writer.transaction(async (tx) => {
    const branchId = await tx.readBranchId();
    if (branchId !== HIGH_OCTANE_STAGING_BRANCH_ID) {
      throw new Error("staging branch mismatch");
    }
    const snapshot = await loadProvisionSnapshot(tx.query);
    const again = assessHighOctaneStagingProvision({ ...input, snapshot, branchId, transactionReadOnly: true });
    if (again.outcome === "already_present") return;
    if (again.outcome !== "would_create") {
      throw new Error("conflicting tenant records");
    }
    const plan = again.plan;
    const workspace = await tx.createWorkspace({
      slug: plan.workspaceSlug,
      name: plan.workspaceName,
      status: plan.workspaceStatus,
    });
    const user = await tx.createUser({
      email: plan.owner.email,
      name: plan.owner.name,
      workspace: { connect: { id: workspace.id } },
      role: plan.owner.role,
      password: null,
      isBuyer: false,
      isSeller: false,
    });
    await tx.setPrimaryAgent(workspace.id, user.id);
    await tx.createMember({
      workspace: { connect: { id: workspace.id } },
      user: { connect: { id: user.id } },
      role: plan.owner.membershipRole,
      status: plan.owner.membershipStatus,
      joinedAt: new Date(),
    });
    await tx.createBranding({
      workspace: { connect: { id: workspace.id } },
      tier: plan.branding.tier,
      displayName: plan.branding.displayName,
      tagline: plan.branding.tagline,
      themeId: plan.themeId,
      contactEmail: plan.branding.contactEmail,
      contactPhone: plan.branding.contactPhone,
      poweredByHouzzatPro: plan.branding.poweredByHouzzatPro,
    });
    await tx.createIdentity({
      workspace: { connect: { id: workspace.id } },
      agentRegisteredName: plan.identity.agentRegisteredName,
      agentCellPhone: plan.identity.agentCellPhone,
      brokerageRegisteredName: plan.identity.brokerageRegisteredName,
    });
    await tx.createDomain({
      workspace: { connect: { id: workspace.id } },
      hostname: plan.domain.hostname,
      kind: plan.domain.kind,
      role: plan.domain.role,
      status: plan.domain.status,
      verifiedAt: new Date(),
    });
    applied = true;
  });
  return { applied };
}

export function createHighOctaneStagingProvisionWriter(directUrl: string): ProvisionWriter {
  const host = databaseHost(directUrl);
  if (host !== HIGH_OCTANE_STAGING_DIRECT_HOST || PRODUCTION_HOSTS.has(host ?? "")) {
    throw new Error("refusing provision writer");
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: directUrl, max: 1 }),
  });
  return {
    async transaction(fn) {
      try {
        return await prisma.$transaction(
          async (tx) => {
          const client: ProvisionWriteClient = {
            async readBranchId() {
              const rows = await tx.$queryRaw<{ branch_id: string | null }[]>`
                SELECT current_setting('neon.branch_id', true) AS branch_id
              `;
              return rows[0]?.branch_id ?? null;
            },
            query(sql, params = []) {
              return tx.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...params);
            },
            createWorkspace: (data) => tx.workspace.create({ data, select: { id: true } }),
            createUser: (data) => tx.user.create({ data, select: { id: true } }),
            async setPrimaryAgent(workspaceId, userId) {
              await tx.workspace.update({
                where: { id: workspaceId },
                data: { primaryAgentId: userId },
              });
            },
            createMember: (data) => tx.workspaceMember.create({ data }).then(() => undefined),
            createBranding: (data) => tx.workspaceBranding.create({ data }).then(() => undefined),
            createIdentity: (data) => tx.workspaceProfessionalIdentity.create({ data }).then(() => undefined),
            createDomain: (data) => tx.workspaceDomain.create({ data }).then(() => undefined),
          };
          return fn(client);
        },
        { maxWait: 10000, timeout: 20000 },
        );
      } finally {
        await prisma.$disconnect();
      }
    },
  };
}

export function emptyProvisionSnapshot(): ProvisionSnapshot {
  return emptySnapshot();
}
