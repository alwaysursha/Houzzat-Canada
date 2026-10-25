/**
 * Staging-only staff login for Saad on the existing HIGH OCTANE workspace.
 * Dry-run inspection may read the verified staging branch. Writes stay behind
 * an explicit confirmation and are not invoked by the dry-run script.
 *
 * Two ACTIVE OWNER memberships with no billing owner make later owner-activation
 * selection unordered. This module does not set billingOwnerUserId. Point that
 * field at Saad before any future subscription activation.
 *
 * The initial password is supplied by the caller at apply time. It is hashed
 * with the staff bcrypt cost and is never stored in the plan or logs.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { OWNER_ACTIVATION_MIN_PASSWORD_LENGTH } from "@/lib/platform/activation/constants";
import { normalizeServiceAreas } from "@/lib/agent/service-areas";
import { parsePhoneColumnsForWrite } from "@/lib/sms/e164";
import { normalizeIdentityEmail } from "@/lib/auth/workspace-identity";
import { buildThemeId, ROYAL_COLLECTION_ONE_TEMPLATE_ID } from "@/lib/tenancy/templates/types";
import { planHighOctaneStagingWorkspace } from "@/lib/tenancy/templates/high-octane-staging";
import { HIGH_OCTANE_PREVIEW_FIXTURE } from "@/lib/tenancy/templates/high-octane-preview-fixture";
import {
  HIGH_OCTANE_STAGING_BRANCH_ID,
  HIGH_OCTANE_STAGING_DIRECT_HOST,
  HIGH_OCTANE_STAGING_POOLED_HOST,
} from "@/lib/tenancy/templates/high-octane-staging-launch";
import {
  HIGH_OCTANE_STAGING_FEATURED_CITIES,
  HIGH_OCTANE_STAGING_MARKET_LABEL,
  HIGH_OCTANE_STAGING_OWNER_EMAIL,
} from "@/lib/tenancy/templates/high-octane-staging-slug";

export const HIGH_OCTANE_STAGING_SAAD_ACCESS_CONFIRMATION =
  "APPLY_HIGH_OCTANE_STAGING_SAAD_ACCESS" as const;

export const HIGH_OCTANE_STAGING_SAAD_ACTIVATION_RISK =
  "Two ACTIVE OWNER memberships and a null billing owner make owner-activation selection unordered. This operation leaves billingOwnerUserId unset." as const;

const PRODUCTION_HOSTS = new Set([
  "ep-snowy-river-axfgwomo.c-4.us-east-2.aws.neon.tech",
  "ep-snowy-river-axfgwomo-pooler.c-4.us-east-2.aws.neon.tech",
]);

const STAFF_BCRYPT_COST = 10;
const STAGING_THEME_ID = buildThemeId(ROYAL_COLLECTION_ONE_TEMPLATE_ID, "signature");
const brandPlan = planHighOctaneStagingWorkspace();
const fixture = HIGH_OCTANE_PREVIEW_FIXTURE;

export const HIGH_OCTANE_STAGING_SAAD_ACCESS_MODELS = [
  "User",
  "AgentProfile",
  "WorkspaceMember",
  "Workspace.primaryAgentId",
] as const;

export type QueryRows = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export type SaadAccessAccount = {
  email: string;
  name: string | null;
  role: string;
  hasPassword: boolean;
  workspaceSlug: string | null;
  membershipRole: string | null;
  membershipStatus: string | null;
  phoneE164: string | null;
  firstName: string | null;
  lastName: string | null;
  profilePhone: string | null;
  markets: string[];
  isPrimaryAgent: boolean;
};

export type SaadAccessSnapshot = {
  workspace: {
    id: string;
    slug: string;
    status: string;
    hasBillingOwner: boolean;
    hasCurrentSubscription: boolean;
    themeId: string | null;
    contactEmail: string | null;
    domainHostname: string | null;
    primaryAgentEmail: string | null;
    memberCount: number;
  } | null;
  placeholder: {
    hasPassword: boolean;
    role: string;
    membershipRole: string | null;
    membershipStatus: string | null;
  } | null;
  saadCount: number;
  saad: SaadAccessAccount | null;
};

export type SaadAccessPlan = {
  models: readonly string[];
  workspaceSlug: string;
  user: {
    name: string;
    email: string;
    role: "AGENT";
    isBuyer: false;
    isSeller: false;
    password: "caller_supplied";
    passwordCredentialKind: "LEGACY";
    emailVerified: true;
    phone: string;
    phoneE164: string;
  };
  profile: {
    firstName: string;
    lastName: string;
    phone: string;
    markets: readonly string[];
    active: true;
    recoLicenseNumber: null;
  };
  membership: { role: "OWNER"; status: "ACTIVE" };
  primaryAgent: "saad";
  placeholderEmail: typeof HIGH_OCTANE_STAGING_OWNER_EMAIL;
  placeholderKeepsPassword: false;
  billingOwnerUserId: null;
  subscription: "not_created";
  branding: "unchanged";
  domain: "unchanged";
  theme: "unchanged";
  professionalIdentity: "unchanged";
  activationEmail: false;
  sms: false;
  activationRisk: typeof HIGH_OCTANE_STAGING_SAAD_ACTIVATION_RISK;
};

export type SaadAccessOutcome = "would_create" | "already_present" | "blocked";

export type SaadAccessAssessment = {
  ok: boolean;
  outcome: SaadAccessOutcome;
  blockers: string[];
  plan: SaadAccessPlan;
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

/** Host gate for the staging direct writer. Does not open a connection. */
export function stagingDirectConnectionDecision(
  directUrl: string,
): "ok" | "missing" | "production" | "pooled" | "mismatch" {
  const host = databaseHost(directUrl);
  if (!host) return "missing";
  if (PRODUCTION_HOSTS.has(host)) return "production";
  if (host === HIGH_OCTANE_STAGING_POOLED_HOST || host.includes("pooler")) return "pooled";
  if (host !== HIGH_OCTANE_STAGING_DIRECT_HOST) return "mismatch";
  return "ok";
}

function verifiedPhone(): { phone: string; phoneE164: string } {
  const parsed = parsePhoneColumnsForWrite(brandPlan.phone);
  if (!parsed.ok || !parsed.columns.phone || !parsed.columns.phoneE164) {
    throw new Error("staging staff phone did not parse");
  }
  return { phone: parsed.columns.phone, phoneE164: parsed.columns.phoneE164 };
}

function verifiedMarkets(): string[] {
  const markets = normalizeServiceAreas([
    HIGH_OCTANE_STAGING_MARKET_LABEL,
    ...HIGH_OCTANE_STAGING_FEATURED_CITIES,
  ]);
  if (markets.length === 0 || markets.length > 12) {
    throw new Error("staging service areas did not resolve");
  }
  return markets;
}

function verifiedName(): { name: string; firstName: string; lastName: string } {
  const name = fixture.agentName.trim();
  const firstName = fixture.firstName.trim();
  if (!name.startsWith(`${firstName} `)) {
    throw new Error("staging agent name did not match");
  }
  const lastName = name.slice(firstName.length).trim();
  if (!lastName) throw new Error("staging agent name did not match");
  return { name, firstName, lastName };
}

export function buildHighOctaneStagingSaadAccessPlan(): SaadAccessPlan {
  const email = normalizeIdentityEmail(brandPlan.email);
  const placeholder = normalizeIdentityEmail(HIGH_OCTANE_STAGING_OWNER_EMAIL);
  if (!email || email === placeholder) {
    throw new Error("staging staff email collided with the placeholder owner");
  }
  const phone = verifiedPhone();
  const person = verifiedName();
  return {
    models: HIGH_OCTANE_STAGING_SAAD_ACCESS_MODELS,
    workspaceSlug: brandPlan.slug,
    user: {
      name: person.name,
      email,
      role: "AGENT",
      isBuyer: false,
      isSeller: false,
      password: "caller_supplied",
      passwordCredentialKind: "LEGACY",
      emailVerified: true,
      phone: phone.phone,
      phoneE164: phone.phoneE164,
    },
    profile: {
      firstName: person.firstName,
      lastName: person.lastName,
      phone: phone.phone,
      markets: verifiedMarkets(),
      active: true,
      recoLicenseNumber: null,
    },
    membership: { role: "OWNER", status: "ACTIVE" },
    primaryAgent: "saad",
    placeholderEmail: HIGH_OCTANE_STAGING_OWNER_EMAIL,
    placeholderKeepsPassword: false,
    billingOwnerUserId: null,
    subscription: "not_created",
    branding: "unchanged",
    domain: "unchanged",
    theme: "unchanged",
    professionalIdentity: "unchanged",
    activationEmail: false,
    sms: false,
    activationRisk: HIGH_OCTANE_STAGING_SAAD_ACTIVATION_RISK,
  };
}

function emptySnapshot(): SaadAccessSnapshot {
  return { workspace: null, placeholder: null, saadCount: 0, saad: null };
}

export function emptySaadAccessSnapshot(): SaadAccessSnapshot {
  return emptySnapshot();
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function flag(value: unknown): boolean {
  return value === true;
}

function count(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function accountFrom(value: unknown): SaadAccessAccount | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const email = text(row.email);
  if (!email) return null;
  return {
    email,
    name: text(row.name),
    role: text(row.role) ?? "",
    hasPassword: flag(row.hasPassword),
    workspaceSlug: text(row.workspaceSlug),
    membershipRole: text(row.membershipRole),
    membershipStatus: text(row.membershipStatus),
    phoneE164: text(row.phoneE164),
    firstName: text(row.firstName),
    lastName: text(row.lastName),
    profilePhone: text(row.profilePhone),
    markets: stringList(row.markets),
    isPrimaryAgent: flag(row.isPrimaryAgent),
  };
}

export function snapshotFromInspectionRow(row: Record<string, unknown> | undefined): SaadAccessSnapshot {
  const report = row?.report;
  if (!report || typeof report !== "object") return emptySnapshot();
  const body = report as Record<string, unknown>;
  const workspace = body.workspace;
  const placeholder = body.placeholder;
  const workspaceRow =
    workspace && typeof workspace === "object"
      ? (workspace as Record<string, unknown>)
      : null;
  const placeholderRow =
    placeholder && typeof placeholder === "object"
      ? (placeholder as Record<string, unknown>)
      : null;
  const id = text(workspaceRow?.id);
  const slug = text(workspaceRow?.slug);
  return {
    workspace:
      workspaceRow && id && slug
        ? {
            id,
            slug,
            status: text(workspaceRow.status) ?? "",
            hasBillingOwner: flag(workspaceRow.hasBillingOwner),
            hasCurrentSubscription: flag(workspaceRow.hasCurrentSubscription),
            themeId: text(workspaceRow.themeId),
            contactEmail: text(workspaceRow.contactEmail),
            domainHostname: text(workspaceRow.domainHostname),
            primaryAgentEmail: text(workspaceRow.primaryAgentEmail),
            memberCount: count(workspaceRow.memberCount),
          }
        : null,
    placeholder: placeholderRow
      ? {
          hasPassword: flag(placeholderRow.hasPassword),
          role: text(placeholderRow.role) ?? "",
          membershipRole: text(placeholderRow.membershipRole),
          membershipStatus: text(placeholderRow.membershipStatus),
        }
      : null,
    saadCount: count(body.saadCount),
    saad: accountFrom(body.saad),
  };
}

const INSPECTION_SQL = `
  SELECT json_build_object(
    'workspace', (
      SELECT json_build_object(
        'id', w.id,
        'slug', w.slug,
        'status', w.status::text,
        'hasBillingOwner', w."billingOwnerUserId" IS NOT NULL,
        'hasCurrentSubscription', w."currentSubscriptionId" IS NOT NULL,
        'themeId', b."themeId",
        'contactEmail', b."contactEmail",
        'domainHostname', (
          SELECT d.hostname FROM "WorkspaceDomain" d
          WHERE d."workspaceId" = w.id AND d.role = 'PRIMARY'
          ORDER BY d.hostname
          LIMIT 1
        ),
        'primaryAgentEmail', (
          SELECT pu.email FROM "User" pu WHERE pu.id = w."primaryAgentId"
        ),
        'memberCount', (
          SELECT COUNT(*)::int FROM "WorkspaceMember" m WHERE m."workspaceId" = w.id
        )
      )
      FROM "Workspace" w
      LEFT JOIN "WorkspaceBranding" b ON b."workspaceId" = w.id
      WHERE w.slug = $1
    ),
    'placeholder', (
      SELECT json_build_object(
        'hasPassword', u.password IS NOT NULL,
        'role', u.role::text,
        'membershipRole', m.role::text,
        'membershipStatus', m.status::text
      )
      FROM "User" u
      JOIN "Workspace" w ON w.id = u."workspaceId" AND w.slug = $1
      LEFT JOIN "WorkspaceMember" m ON m."userId" = u.id AND m."workspaceId" = w.id
      WHERE lower(u.email) = lower($2)
    ),
    'saadCount', (
      SELECT COUNT(*)::int FROM "User" u WHERE lower(u.email) = lower($3)
    ),
    'saad', (
      SELECT json_build_object(
        'email', u.email,
        'name', u.name,
        'role', u.role::text,
        'hasPassword', u.password IS NOT NULL,
        'workspaceSlug', home.slug,
        'membershipRole', m.role::text,
        'membershipStatus', m.status::text,
        'phoneE164', u."phoneE164",
        'firstName', p."firstName",
        'lastName', p."lastName",
        'profilePhone', p.phone,
        'markets', COALESCE(p.markets, ARRAY[]::text[]),
        'isPrimaryAgent', target."primaryAgentId" = u.id
      )
      FROM "User" u
      LEFT JOIN "Workspace" home ON home.id = u."workspaceId"
      LEFT JOIN "Workspace" target ON target.slug = $1
      LEFT JOIN "WorkspaceMember" m
        ON m."userId" = u.id AND m."workspaceId" = target.id
      LEFT JOIN "AgentProfile" p ON p."userId" = u.id
      WHERE lower(u.email) = lower($3)
      ORDER BY u.id
      LIMIT 1
    )
  ) AS report
`;

export async function loadSaadAccessSnapshot(query: QueryRows): Promise<SaadAccessSnapshot> {
  const plan = buildHighOctaneStagingSaadAccessPlan();
  const rows = await query(INSPECTION_SQL, [
    plan.workspaceSlug,
    plan.placeholderEmail,
    plan.user.email,
  ]);
  return snapshotFromInspectionRow(rows[0]);
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

function sameMarkets(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function saadMatches(plan: SaadAccessPlan, saad: SaadAccessAccount): boolean {
  return (
    normalizeIdentityEmail(saad.email) === plan.user.email &&
    saad.name === plan.user.name &&
    saad.role === plan.user.role &&
    saad.hasPassword &&
    saad.workspaceSlug === plan.workspaceSlug &&
    saad.membershipRole === plan.membership.role &&
    saad.membershipStatus === plan.membership.status &&
    saad.phoneE164 === plan.user.phoneE164 &&
    saad.firstName === plan.profile.firstName &&
    saad.lastName === plan.profile.lastName &&
    saad.profilePhone === plan.profile.phone &&
    sameMarkets(saad.markets, plan.profile.markets) &&
    saad.isPrimaryAgent
  );
}

function workspaceReady(snapshot: SaadAccessSnapshot, plan: SaadAccessPlan): string[] {
  const blockers: string[] = [];
  const workspace = snapshot.workspace;
  if (!workspace) return ["workspace_missing"];
  if (workspace.slug !== plan.workspaceSlug) blockers.push("workspace_slug_mismatch");
  if (workspace.status !== "ACTIVE") blockers.push("workspace_not_active");
  if (workspace.hasBillingOwner) blockers.push("billing_owner_set");
  if (workspace.hasCurrentSubscription) blockers.push("subscription_present");
  if (workspace.themeId !== STAGING_THEME_ID) blockers.push("theme_mismatch");
  if (normalizeIdentityEmail(workspace.contactEmail ?? "") !== plan.user.email) {
    blockers.push("public_contact_mismatch");
  }
  if (workspace.domainHostname !== "localhost") blockers.push("domain_mismatch");
  return blockers;
}

function dataBlockers(snapshot: SaadAccessSnapshot, plan: SaadAccessPlan): string[] {
  const blockers = workspaceReady(snapshot, plan);
  const placeholder = snapshot.placeholder;
  if (!placeholder) blockers.push("placeholder_missing");
  else {
    if (placeholder.hasPassword) blockers.push("placeholder_has_password");
    if (placeholder.role !== "AGENT") blockers.push("placeholder_role_mismatch");
    if (placeholder.membershipRole !== "OWNER" || placeholder.membershipStatus !== "ACTIVE") {
      blockers.push("placeholder_membership_mismatch");
    }
  }
  if (snapshot.saadCount > 1) blockers.push("saad_email_ambiguous");
  const saad = snapshot.saad;
  if (snapshot.saadCount === 1 && (!saad || saad.workspaceSlug !== plan.workspaceSlug)) {
    blockers.push(saad ? "saad_email_other_workspace" : "saad_conflict");
  }
  if (blockers.length > 0) return blockers;

  const present = snapshot.saadCount === 1 && saad && saad.workspaceSlug === plan.workspaceSlug;
  if (!present) {
    if (snapshot.workspace?.memberCount !== 1) blockers.push("extra_member");
    if (snapshot.workspace?.primaryAgentEmail !== plan.placeholderEmail) {
      blockers.push("primary_agent_mismatch");
    }
    return blockers;
  }
  if (!saadMatches(plan, saad)) blockers.push("saad_conflict");
  if (snapshot.workspace?.memberCount !== 2) blockers.push("member_count_mismatch");
  if (normalizeIdentityEmail(snapshot.workspace?.primaryAgentEmail ?? "") !== plan.user.email) {
    blockers.push("primary_agent_mismatch");
  }
  return blockers;
}

export function assessHighOctaneStagingSaadAccess(
  input: UrlFacts & { snapshot: SaadAccessSnapshot },
): SaadAccessAssessment {
  const plan = buildHighOctaneStagingSaadAccessPlan();
  const blockers = [...environmentBlockers(input), ...dataBlockers(input.snapshot, plan)];
  if (blockers.length > 0) {
    return { ok: false, outcome: "blocked", blockers, plan, writesExecuted: false };
  }
  const present =
    input.snapshot.saadCount === 1 &&
    input.snapshot.saad !== null &&
    saadMatches(plan, input.snapshot.saad);
  if (present) {
    return { ok: true, outcome: "already_present", blockers: [], plan, writesExecuted: false };
  }
  return { ok: true, outcome: "would_create", blockers: [], plan, writesExecuted: false };
}

export type SaadAccessWriteClient = {
  readBranchId(): Promise<string | null>;
  query: QueryRows;
  createUser(data: Prisma.UserCreateInput): Promise<{ id: string }>;
  createProfile(data: Prisma.AgentProfileCreateInput): Promise<void>;
  createMember(data: Prisma.WorkspaceMemberCreateInput): Promise<void>;
  setPrimaryAgent(workspaceId: string, userId: string): Promise<void>;
};

export type SaadAccessWriter = {
  transaction<T>(fn: (tx: SaadAccessWriteClient) => Promise<T>): Promise<T>;
};

async function hashStaffPassword(password: string): Promise<string> {
  return bcrypt.hash(password, STAFF_BCRYPT_COST);
}

function refuse(): never {
  throw new Error("staging saad access refused");
}

/**
 * Future authorized write. Refuses unless the confirmation token matches and
 * the dry-run assessment says this staging branch can accept Saad's login.
 * Caller supplies the password. Nothing in this function sends mail or SMS.
 */
export async function applyHighOctaneStagingSaadAccess(input: UrlFacts & {
  confirmation: string;
  snapshot: SaadAccessSnapshot;
  password: string;
  writer: SaadAccessWriter;
  hashPassword?: (password: string) => Promise<string>;
}): Promise<{ applied: boolean }> {
  if (input.confirmation !== HIGH_OCTANE_STAGING_SAAD_ACCESS_CONFIRMATION) refuse();
  if (input.password.length < OWNER_ACTIVATION_MIN_PASSWORD_LENGTH) refuse();
  const assessment = assessHighOctaneStagingSaadAccess(input);
  switch (assessment.outcome) {
    case "already_present":
      return { applied: false };
    case "blocked":
      refuse();
    case "would_create":
      break;
    default: {
      const neverOutcome: never = assessment.outcome;
      return neverOutcome;
    }
  }

  const hashPassword = input.hashPassword ?? hashStaffPassword;
  let applied = false;
  await input.writer.transaction(async (tx) => {
    const branchId = await tx.readBranchId();
    if (branchId !== HIGH_OCTANE_STAGING_BRANCH_ID) refuse();
    const snapshot = await loadSaadAccessSnapshot(tx.query);
    const again = assessHighOctaneStagingSaadAccess({
      ...input,
      snapshot,
      branchId,
      transactionReadOnly: true,
    });
    switch (again.outcome) {
      case "already_present":
        return;
      case "blocked":
        refuse();
      case "would_create":
        break;
      default: {
        const neverOutcome: never = again.outcome;
        return neverOutcome;
      }
    }
    const workspaceId = snapshot.workspace?.id;
    if (!workspaceId) refuse();
    const hashed = await hashPassword(input.password);
    if (!hashed || hashed === input.password) refuse();
    const plan = again.plan;
    const now = new Date();
    const user = await tx.createUser({
      email: plan.user.email,
      name: plan.user.name,
      role: plan.user.role,
      password: hashed,
      passwordCredentialKind: plan.user.passwordCredentialKind,
      emailVerified: now,
      isBuyer: false,
      isSeller: false,
      phone: plan.user.phone,
      phoneE164: plan.user.phoneE164,
      workspace: { connect: { id: workspaceId } },
    });
    await tx.createProfile({
      user: { connect: { id: user.id } },
      firstName: plan.profile.firstName,
      lastName: plan.profile.lastName,
      phone: plan.profile.phone,
      markets: [...plan.profile.markets],
      active: true,
    });
    await tx.createMember({
      workspace: { connect: { id: workspaceId } },
      user: { connect: { id: user.id } },
      role: plan.membership.role,
      status: plan.membership.status,
      joinedAt: now,
    });
    await tx.setPrimaryAgent(workspaceId, user.id);
    applied = true;
  });
  return { applied };
}

export function createHighOctaneStagingSaadAccessWriter(directUrl: string): SaadAccessWriter {
  if (stagingDirectConnectionDecision(directUrl) !== "ok") {
    throw new Error("refusing saad access writer");
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: directUrl, max: 1 }),
  });
  return {
    async transaction(fn) {
      try {
        return await prisma.$transaction(
          async (tx) => {
            const client: SaadAccessWriteClient = {
              async readBranchId() {
                const rows = await tx.$queryRaw<{ branch_id: string | null }[]>`
                  SELECT current_setting('neon.branch_id', true) AS branch_id
                `;
                return rows[0]?.branch_id ?? null;
              },
              query(sql, params = []) {
                return tx.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...params);
              },
              createUser: (data) => tx.user.create({ data, select: { id: true } }),
              createProfile: (data) => tx.agentProfile.create({ data }).then(() => undefined),
              createMember: (data) => tx.workspaceMember.create({ data }).then(() => undefined),
              async setPrimaryAgent(workspaceId, userId) {
                const updated = await tx.workspace.updateMany({
                  where: {
                    id: workspaceId,
                    slug: brandPlan.slug,
                    billingOwnerUserId: null,
                    currentSubscriptionId: null,
                  },
                  data: { primaryAgentId: userId },
                });
                if (updated.count !== 1) refuse();
              },
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
