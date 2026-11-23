/**
 * Master Admin custom website domains for an existing tenant.
 * Prepare, TXT check, Vercel attach, and activation are separate.
 * None of them edit DNS, nameservers, email, invitations, or TRREB.
 * The platform hostname stays in place. Pending claims do not route.
 */
import { randomBytes } from "node:crypto";
import type { PrismaClient, WorkspaceDomainRole, WorkspaceDomainStatus } from "@prisma/client";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import { ProvisioningActionError } from "@/lib/platform/provisioning/errors";
import { normalizeWorkspaceHostname } from "@/lib/tenancy/normalize-workspace-hostname";
import { assertHostnameClaimable } from "@/lib/tenancy/reserved-domains";
import {
  clearHostResolutionCacheForTests,
  resolveWorkspaceFromHostname,
  type HostResolutionDeps,
} from "@/lib/tenancy/resolve-workspace-host";
import { assertSafeCustomWebsiteClaimHostname } from "@/lib/tenancy/workspace-domain/claim-hostname-safety";
import {
  ACTIVATE_CUSTOM_DOMAIN_CONFIRMATION,
  ATTACH_CUSTOM_DOMAIN_CONFIRMATION,
  buildCustomDomainDnsPlan,
  customDomainClaimHostnames,
  type DnsRecordInstruction,
} from "@/lib/tenancy/workspace-domain/custom-domain-dns-plan";
import { buildWebsiteDomainTxtOwnershipHost } from "@/lib/tenancy/workspace-domain/dns-instructions";
import {
  createCloudflareDohTxtLookup,
  type DnsTxtLookup,
} from "@/lib/tenancy/workspace-domain/dns-txt-lookup";
import {
  normalizeDnsTxtAnswer,
  txtAnswersMatchOwnershipToken,
} from "@/lib/tenancy/workspace-domain/txt-match";
import {
  createVercelProjectDomainClient,
  type VercelDomainReadiness,
  type VercelProjectDomainClient,
} from "@/lib/tenancy/workspace-domain/vercel-project-domain";

export const PREPARE_CUSTOM_DOMAIN_AUTHORIZATION = "PREPARE_CUSTOM_DOMAIN" as const;
export const VERIFY_CUSTOM_DOMAIN_AUTHORIZATION = "VERIFY_CUSTOM_DOMAIN" as const;
export const ATTACH_CUSTOM_DOMAIN_AUTHORIZATION = "ATTACH_CUSTOM_DOMAIN" as const;
export const ACTIVATE_CUSTOM_DOMAIN_AUTHORIZATION = "ACTIVATE_CUSTOM_DOMAIN" as const;

type DomainRow = {
  id: string;
  workspaceId: string;
  hostname: string;
  kind: "PLATFORM" | "CUSTOM";
  role: WorkspaceDomainRole;
  status: WorkspaceDomainStatus;
  verificationToken: string | null;
  verifiedAt: Date | null;
};

const DOMAIN_SELECT = {
  id: true,
  workspaceId: true,
  hostname: true,
  kind: true,
  role: true,
  status: true,
  verificationToken: true,
  verifiedAt: true,
} as const;

export type MasterCustomDomainDto = {
  id: string;
  hostname: string;
  role: WorkspaceDomainRole;
  status: WorkspaceDomainStatus;
  verifiedAt: string | null;
  ownershipHost: string | null;
  ownershipValue: string | null;
};

export type MasterCustomDomainPlan = {
  domains: MasterCustomDomainDto[];
  records: DnsRecordInstruction[];
  constraints: readonly string[];
  platformHostname: string | null;
};

export type HostnameRoutingCheck = {
  isolated: boolean;
  live: boolean;
  workspaceId: string | null;
  reason: string | null;
};

type ActivationBlockReason =
  | "OWNERSHIP_NOT_VERIFIED"
  | "TXT_NOT_FOUND"
  | "TXT_MISMATCH"
  | "DNS_UNAVAILABLE"
  | "VERCEL_NOT_CONFIGURED"
  | "VERCEL_NOT_ATTACHED"
  | "VERCEL_UNVERIFIED"
  | "VERCEL_MISCONFIGURED"
  | "TLS_NOT_READY"
  | "VERCEL_API_ERROR"
  | "HOSTNAME_ROUTING_MISMATCH"
  | "WORKSPACE_NOT_ACTIVE"
  | "PLATFORM_HOSTNAME_MISSING"
  | "DOMAIN_NOT_PENDING";

function activationBlockMessage(reason: ActivationBlockReason): string {
  switch (reason) {
    case "OWNERSHIP_NOT_VERIFIED":
      return "Ownership TXT is not verified yet.";
    case "TXT_NOT_FOUND":
      return "Ownership TXT record was not found.";
    case "TXT_MISMATCH":
      return "Ownership TXT record does not match this workspace.";
    case "DNS_UNAVAILABLE":
      return "Ownership DNS lookup could not be completed.";
    case "VERCEL_NOT_CONFIGURED":
      return "Vercel API credentials are not configured for this deployment.";
    case "VERCEL_NOT_ATTACHED":
      return "Domain is not attached to the shared Vercel project.";
    case "VERCEL_UNVERIFIED":
      return "Vercel has not verified this domain yet.";
    case "VERCEL_MISCONFIGURED":
      return "Vercel still reports the domain DNS as misconfigured.";
    case "TLS_NOT_READY":
      return "HTTPS certificate is not ready yet.";
    case "VERCEL_API_ERROR":
      return "Vercel could not be checked.";
    case "HOSTNAME_ROUTING_MISMATCH":
      return "Hostname does not route exclusively to this workspace.";
    case "WORKSPACE_NOT_ACTIVE":
      return "Workspace must be active before a custom domain can go live.";
    case "PLATFORM_HOSTNAME_MISSING":
      return "The existing platform hostname must stay active.";
    case "DOMAIN_NOT_PENDING":
      return "Only a pending custom domain can be activated.";
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

function vercelBlockReason(readiness: VercelDomainReadiness): ActivationBlockReason | null {
  switch (readiness.reason) {
    case "READY":
    case null:
      return readiness.tlsReady ? null : "TLS_NOT_READY";
    case "VERCEL_NOT_CONFIGURED":
    case "VERCEL_NOT_ATTACHED":
    case "VERCEL_UNVERIFIED":
    case "VERCEL_MISCONFIGURED":
    case "TLS_NOT_READY":
    case "VERCEL_API_ERROR":
      return readiness.reason;
    default: {
      const exhaustive: never = readiness.reason;
      return exhaustive;
    }
  }
}

async function requireMasterAdmin(db: PrismaClient, operatorId: string): Promise<void> {
  const operator = await db.platformOperator.findUnique({
    where: { id: operatorId },
    select: { role: true, status: true },
  });
  if (!operator || operator.status !== "ACTIVE" || operator.role !== "MASTER_ADMIN") {
    throw new ProvisioningActionError(
      "Master Admin authorization required.",
      "MASTER_ADMIN_REQUIRED",
      403,
    );
  }
}

function assertAuthorization(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new ProvisioningActionError(
      "This custom-domain action was not authorized.",
      "AUTHORIZATION_MISMATCH",
      403,
    );
  }
}

function newVerificationToken(): string {
  return randomBytes(32).toString("base64url");
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function toDto(row: DomainRow): MasterCustomDomainDto {
  const pending = row.kind === "CUSTOM" && row.status === "PENDING" && row.verificationToken;
  return {
    id: row.id,
    hostname: row.hostname,
    role: row.role,
    status: row.status,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    ownershipHost: pending ? buildWebsiteDomainTxtOwnershipHost(row.hostname) : null,
    ownershipValue: pending ? row.verificationToken : null,
  };
}

function planFrom(rows: DomainRow[], platformHostname: string | null): MasterCustomDomainPlan {
  const custom = rows.filter((row) => row.kind === "CUSTOM");
  const claims = custom
    .filter((row) => row.status === "PENDING" && row.verificationToken)
    .map((row) => ({ hostname: row.hostname, verificationToken: row.verificationToken! }));
  const dns = buildCustomDomainDnsPlan({ claims });
  return {
    domains: custom.map(toDto),
    records: dns.records,
    constraints: dns.constraints,
    platformHostname,
  };
}

async function loadWorkspace(db: PrismaClient, workspaceId: string) {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, slug: true, status: true },
  });
  if (!workspace) {
    throw new ProvisioningActionError("Workspace not found.", "WORKSPACE_NOT_FOUND", 404);
  }
  return workspace;
}

function normalizeClaimHostname(hostname: string): string {
  const normalized = normalizeWorkspaceHostname(hostname);
  if (!normalized.ok) {
    throw new ProvisioningActionError(normalized.error, "INVALID_HOSTNAME", 400);
  }
  const safety = assertSafeCustomWebsiteClaimHostname(normalized.hostname);
  if (!safety.ok) {
    throw new ProvisioningActionError(safety.error, "INVALID_HOSTNAME", 400);
  }
  const reserved = assertHostnameClaimable({ hostname: normalized.hostname, kind: "CUSTOM" });
  if (reserved) {
    throw new ProvisioningActionError(reserved, "HOSTNAME_RESERVED", 400);
  }
  return normalized.hostname;
}

export async function checkHostnameTenantRouting(input: {
  hostname: string;
  expectedWorkspaceId: string;
  deps?: HostResolutionDeps;
}): Promise<HostnameRoutingCheck> {
  clearHostResolutionCacheForTests();
  const resolved = await resolveWorkspaceFromHostname(input.hostname, input.deps);
  if (!resolved.ok) {
    return { isolated: true, live: false, workspaceId: null, reason: resolved.reason };
  }
  if (resolved.workspaceId !== input.expectedWorkspaceId) {
    return {
      isolated: false,
      live: true,
      workspaceId: resolved.workspaceId,
      reason: "other_workspace",
    };
  }
  return { isolated: true, live: true, workspaceId: resolved.workspaceId, reason: null };
}

export async function listMasterCustomDomains(input: {
  prisma: PrismaClient;
  operatorId: string;
  workspaceId: string;
}): Promise<MasterCustomDomainPlan> {
  await requireMasterAdmin(input.prisma, input.operatorId);
  await loadWorkspace(input.prisma, input.workspaceId);
  const rows = await input.prisma.workspaceDomain.findMany({
    where: { workspaceId: input.workspaceId },
    select: DOMAIN_SELECT,
  });
  const platform = rows.find((row) => row.kind === "PLATFORM" && row.status === "ACTIVE");
  return planFrom(rows, platform?.hostname ?? null);
}

export async function prepareMasterCustomDomain(input: {
  prisma: PrismaClient;
  operatorId: string;
  authorization: string;
  workspaceId: string;
  hostname: string;
}): Promise<MasterCustomDomainPlan & { idempotent: boolean }> {
  assertAuthorization(input.authorization, PREPARE_CUSTOM_DOMAIN_AUTHORIZATION);
  await requireMasterAdmin(input.prisma, input.operatorId);
  const workspace = await loadWorkspace(input.prisma, input.workspaceId);
  if (typeof input.hostname !== "string" || !input.hostname.trim()) {
    throw new ProvisioningActionError("hostname required", "HOSTNAME_REQUIRED", 400);
  }
  const entered = normalizeClaimHostname(input.hostname);
  const hostnames = customDomainClaimHostnames(entered).map(normalizeClaimHostname);
  const uniqueHostnames = [...new Set(hostnames)];

  const workspaceRows = await input.prisma.workspaceDomain.findMany({
    where: { workspaceId: workspace.id },
    select: DOMAIN_SELECT,
  });
  const unrelatedPending = workspaceRows.find(
    (row) =>
      row.kind === "CUSTOM" &&
      row.status === "PENDING" &&
      !uniqueHostnames.includes(row.hostname),
  );
  if (unrelatedPending) {
    throw new ProvisioningActionError(
      "A pending custom domain claim already exists. Remove it before claiming another hostname.",
      "PENDING_CLAIM_EXISTS",
      409,
    );
  }

  let idempotent = true;
  for (const hostname of uniqueHostnames) {
    const existing = await input.prisma.workspaceDomain.findUnique({
      where: { hostname },
      select: DOMAIN_SELECT,
    });
    if (existing && existing.workspaceId !== workspace.id) {
      throw new ProvisioningActionError(
        "Hostname is already claimed by another workspace.",
        "HOSTNAME_TAKEN",
        409,
      );
    }
    if (existing?.kind === "PLATFORM") {
      throw new ProvisioningActionError(
        "Platform hostnames cannot be claimed as custom domains.",
        "PLATFORM_DOMAIN_PROTECTED",
        409,
      );
    }
    if (existing && existing.status !== "PENDING" && existing.status !== "ACTIVE") {
      throw new ProvisioningActionError(
        "Hostname exists in a non-claimable state.",
        "HOSTNAME_CONFLICT",
        409,
      );
    }
    if (!existing) idempotent = false;
  }

  let hasCustomPrimary = workspaceRows.some(
    (row) => row.kind === "CUSTOM" && row.role === "PRIMARY",
  );
  for (const hostname of uniqueHostnames) {
    const existing = workspaceRows.find((row) => row.hostname === hostname);
    if (existing) continue;
    const role: WorkspaceDomainRole =
      !hasCustomPrimary && !hostname.startsWith("www.") ? "PRIMARY" : "ALIAS";
    if (role === "PRIMARY") hasCustomPrimary = true;
    try {
      const created = await input.prisma.workspaceDomain.create({
        data: {
          workspaceId: workspace.id,
          hostname,
          kind: "CUSTOM",
          role,
          status: "PENDING",
          verificationToken: newVerificationToken(),
          verifiedAt: null,
        },
        select: DOMAIN_SELECT,
      });
      workspaceRows.push(created);
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const raced = await input.prisma.workspaceDomain.findUnique({
        where: { hostname },
        select: DOMAIN_SELECT,
      });
      if (!raced || raced.workspaceId !== workspace.id) {
        throw new ProvisioningActionError(
          "Hostname is already claimed by another workspace.",
          "HOSTNAME_TAKEN",
          409,
        );
      }
      if (!workspaceRows.some((row) => row.id === raced.id)) workspaceRows.push(raced);
    }
  }

  await writePlatformAuditEvent(
    {
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: "PREPARE_CUSTOM_DOMAIN",
      entityType: "Workspace",
      entityId: workspace.id,
      summary: "Prepared a pending custom domain without activating it.",
      metadata: { hostnames: uniqueHostnames },
    },
    input.prisma,
  );

  const platform = workspaceRows.find((row) => row.kind === "PLATFORM" && row.status === "ACTIVE");
  return { ...planFrom(workspaceRows, platform?.hostname ?? null), idempotent };
}

async function loadOwnedCustomDomain(
  db: PrismaClient,
  workspaceId: string,
  domainId: string,
): Promise<DomainRow> {
  const row = await db.workspaceDomain.findFirst({
    where: { id: domainId, workspaceId },
    select: DOMAIN_SELECT,
  });
  if (!row) {
    throw new ProvisioningActionError("Custom domain claim not found.", "DOMAIN_NOT_FOUND", 404);
  }
  if (row.kind !== "CUSTOM") {
    throw new ProvisioningActionError(
      "Platform hostnames stay unchanged.",
      "PLATFORM_DOMAIN_PROTECTED",
      403,
    );
  }
  return row;
}

export async function verifyMasterCustomDomainOwnership(input: {
  prisma: PrismaClient;
  operatorId: string;
  authorization: string;
  workspaceId: string;
  domainId: string;
  dnsTxtLookup?: DnsTxtLookup;
  now?: Date;
}): Promise<{
  outcome: "VERIFIED" | "ALREADY_VERIFIED" | "NOT_VERIFIED" | "DNS_RETRYABLE_ERROR";
  reason: "TXT_NOT_FOUND" | "TXT_MISMATCH" | "DNS_TIMEOUT" | "DNS_RESOLVER_ERROR" | null;
  domain: MasterCustomDomainDto;
  /** Normalized TXT strings the resolver returned. Null unless the check found a non-matching record. */
  observedTxt: string[] | null;
}> {
  assertAuthorization(input.authorization, VERIFY_CUSTOM_DOMAIN_AUTHORIZATION);
  await requireMasterAdmin(input.prisma, input.operatorId);
  const row = await loadOwnedCustomDomain(input.prisma, input.workspaceId, input.domainId);
  if (row.status !== "PENDING") {
    throw new ProvisioningActionError(
      "Only a pending custom domain can be checked.",
      "DOMAIN_NOT_PENDING",
      409,
    );
  }
  if (!row.verificationToken) {
    throw new ProvisioningActionError(
      "Verification token missing for this claim.",
      "VERIFICATION_TOKEN_MISSING",
      400,
    );
  }
  if (row.verifiedAt) {
    return { outcome: "ALREADY_VERIFIED", reason: null, domain: toDto(row), observedTxt: null };
  }

  const lookup = input.dnsTxtLookup ?? createCloudflareDohTxtLookup();
  const dns = await lookup({ name: buildWebsiteDomainTxtOwnershipHost(row.hostname) });
  if (!dns.ok) {
    return {
      outcome: "DNS_RETRYABLE_ERROR",
      reason: dns.reason === "timeout" ? "DNS_TIMEOUT" : "DNS_RESOLVER_ERROR",
      domain: toDto(row),
      observedTxt: null,
    };
  }
  if (dns.empty || dns.answers.length === 0) {
    return { outcome: "NOT_VERIFIED", reason: "TXT_NOT_FOUND", domain: toDto(row), observedTxt: null };
  }
  const observedTxt = dns.answers
    .map((answer) => normalizeDnsTxtAnswer(answer))
    .filter((answer) => answer.length > 0);
  if (!txtAnswersMatchOwnershipToken(dns.answers, row.verificationToken)) {
    return { outcome: "NOT_VERIFIED", reason: "TXT_MISMATCH", domain: toDto(row), observedTxt };
  }

  const updated = await input.prisma.workspaceDomain.update({
    where: { id: row.id },
    data: { verifiedAt: input.now ?? new Date(), status: "PENDING" },
    select: DOMAIN_SELECT,
  });
  if (updated.status !== "PENDING") {
    throw new ProvisioningActionError(
      "Ownership verification must leave the domain pending.",
      "DOMAIN_NOT_PENDING",
      500,
    );
  }
  return { outcome: "VERIFIED", reason: null, domain: toDto(updated), observedTxt: null };
}

async function assertPlatformHostnamePreserved(db: PrismaClient, workspaceId: string): Promise<string> {
  const rows = await db.workspaceDomain.findMany({
    where: { workspaceId },
    select: DOMAIN_SELECT,
  });
  const platform = rows.find((row) => row.kind === "PLATFORM" && row.status === "ACTIVE");
  if (!platform) {
    throw new ProvisioningActionError(
      activationBlockMessage("PLATFORM_HOSTNAME_MISSING"),
      "PLATFORM_HOSTNAME_MISSING",
      409,
    );
  }
  return platform.hostname;
}

export async function inspectMasterCustomDomainReadiness(input: {
  prisma: PrismaClient;
  operatorId: string;
  workspaceId: string;
  domainId: string;
  vercel?: VercelProjectDomainClient;
  hostDeps?: HostResolutionDeps;
}): Promise<{
  domain: MasterCustomDomainDto;
  vercel: VercelDomainReadiness;
  routing: HostnameRoutingCheck;
  platformHostname: string;
}> {
  await requireMasterAdmin(input.prisma, input.operatorId);
  const workspace = await loadWorkspace(input.prisma, input.workspaceId);
  const row = await loadOwnedCustomDomain(input.prisma, workspace.id, input.domainId);
  const platformHostname = await assertPlatformHostnamePreserved(input.prisma, workspace.id);
  const vercel = input.vercel ?? createVercelProjectDomainClient();
  const readiness = await vercel.inspect(row.hostname);
  const routing = await checkHostnameTenantRouting({
    hostname: row.hostname,
    expectedWorkspaceId: workspace.id,
    deps: input.hostDeps,
  });
  return { domain: toDto(row), vercel: readiness, routing, platformHostname };
}

export async function attachMasterCustomDomain(input: {
  prisma: PrismaClient;
  operatorId: string;
  authorization: string;
  confirmation: unknown;
  workspaceId: string;
  domainId: string;
  vercel?: VercelProjectDomainClient;
}): Promise<{ domain: MasterCustomDomainDto; vercel: VercelDomainReadiness; status: "PENDING" }> {
  assertAuthorization(input.authorization, ATTACH_CUSTOM_DOMAIN_AUTHORIZATION);
  if (input.confirmation !== ATTACH_CUSTOM_DOMAIN_CONFIRMATION) {
    throw new ProvisioningActionError(
      "Attach requires an explicit confirmation.",
      "CONFIRMATION_REQUIRED",
      400,
    );
  }
  await requireMasterAdmin(input.prisma, input.operatorId);
  const row = await loadOwnedCustomDomain(input.prisma, input.workspaceId, input.domainId);
  if (row.status !== "PENDING") {
    throw new ProvisioningActionError(
      "Only a pending custom domain can be attached.",
      "DOMAIN_NOT_PENDING",
      409,
    );
  }
  if (!row.verifiedAt) {
    throw new ProvisioningActionError(
      activationBlockMessage("OWNERSHIP_NOT_VERIFIED"),
      "OWNERSHIP_NOT_VERIFIED",
      409,
    );
  }
  await assertPlatformHostnamePreserved(input.prisma, input.workspaceId);
  const vercel = input.vercel ?? createVercelProjectDomainClient();
  const readiness = await vercel.attach(row.hostname);
  const current = await input.prisma.workspaceDomain.findFirst({
    where: { id: row.id, workspaceId: input.workspaceId },
    select: DOMAIN_SELECT,
  });
  if (!current || current.status !== "PENDING") {
    throw new ProvisioningActionError(
      "Attaching to Vercel must leave the domain pending.",
      "DOMAIN_NOT_PENDING",
      500,
    );
  }
  await writePlatformAuditEvent(
    {
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: "ATTACH_CUSTOM_DOMAIN",
      entityType: "WorkspaceDomain",
      entityId: row.id,
      summary: "Attached a custom domain to the shared Vercel project without activating it.",
      metadata: { hostname: row.hostname, tlsReady: readiness.tlsReady, reason: readiness.reason },
    },
    input.prisma,
  );
  return { domain: toDto(current), vercel: readiness, status: "PENDING" };
}

export async function activateMasterCustomDomain(input: {
  prisma: PrismaClient;
  operatorId: string;
  authorization: string;
  confirmation: unknown;
  workspaceId: string;
  domainId: string;
  dnsTxtLookup?: DnsTxtLookup;
  vercel?: VercelProjectDomainClient;
  hostDeps?: HostResolutionDeps;
}): Promise<
  | { outcome: "ACTIVATED"; domain: MasterCustomDomainDto; platformHostname: string }
  | {
      outcome: "NOT_READY";
      reason: ActivationBlockReason;
      message: string;
      domain: MasterCustomDomainDto;
    }
> {
  assertAuthorization(input.authorization, ACTIVATE_CUSTOM_DOMAIN_AUTHORIZATION);
  if (input.confirmation !== ACTIVATE_CUSTOM_DOMAIN_CONFIRMATION) {
    throw new ProvisioningActionError(
      "Activation requires an explicit confirmation.",
      "CONFIRMATION_REQUIRED",
      400,
    );
  }
  await requireMasterAdmin(input.prisma, input.operatorId);
  const workspace = await loadWorkspace(input.prisma, input.workspaceId);
  const row = await loadOwnedCustomDomain(input.prisma, workspace.id, input.domainId);
  const refuse = async (reason: ActivationBlockReason) => ({
    outcome: "NOT_READY" as const,
    reason,
    message: activationBlockMessage(reason),
    domain: toDto(
      (await input.prisma.workspaceDomain.findFirst({
        where: { id: row.id, workspaceId: workspace.id },
        select: DOMAIN_SELECT,
      })) ?? row,
    ),
  });

  if (row.status !== "PENDING") return refuse("DOMAIN_NOT_PENDING");
  if (workspace.status !== "ACTIVE") return refuse("WORKSPACE_NOT_ACTIVE");
  let platformHostname: string;
  try {
    platformHostname = await assertPlatformHostnamePreserved(input.prisma, workspace.id);
  } catch (error) {
    if (
      error instanceof ProvisioningActionError &&
      error.code === "PLATFORM_HOSTNAME_MISSING"
    ) {
      return refuse("PLATFORM_HOSTNAME_MISSING");
    }
    throw error;
  }
  if (!row.verifiedAt || !row.verificationToken) return refuse("OWNERSHIP_NOT_VERIFIED");

  const lookup = input.dnsTxtLookup ?? createCloudflareDohTxtLookup();
  const dns = await lookup({ name: buildWebsiteDomainTxtOwnershipHost(row.hostname) });
  if (!dns.ok) return refuse("DNS_UNAVAILABLE");
  if (dns.empty || dns.answers.length === 0) return refuse("TXT_NOT_FOUND");
  if (!txtAnswersMatchOwnershipToken(dns.answers, row.verificationToken)) return refuse("TXT_MISMATCH");

  const vercel = input.vercel ?? createVercelProjectDomainClient();
  const readiness = await vercel.inspect(row.hostname);
  const blocked = vercelBlockReason(readiness);
  if (blocked) return refuse(blocked);

  await input.prisma.workspaceDomain.update({
    where: { id: row.id },
    data: { status: "ACTIVE", verifiedAt: row.verifiedAt },
    select: DOMAIN_SELECT,
  });
  const routing = await checkHostnameTenantRouting({
    hostname: row.hostname,
    expectedWorkspaceId: workspace.id,
    deps: input.hostDeps,
  });
  if (!routing.isolated || !routing.live || routing.workspaceId !== workspace.id) {
    await input.prisma.workspaceDomain.update({
      where: { id: row.id },
      data: { status: "PENDING" },
      select: DOMAIN_SELECT,
    });
    return refuse("HOSTNAME_ROUTING_MISMATCH");
  }

  const platformAfter = await input.prisma.workspaceDomain.findMany({
    where: { workspaceId: workspace.id },
    select: DOMAIN_SELECT,
  });
  const platform = platformAfter.find((item) => item.hostname === platformHostname);
  if (!platform || platform.kind !== "PLATFORM" || platform.status !== "ACTIVE") {
    await input.prisma.workspaceDomain.update({
      where: { id: row.id },
      data: { status: "PENDING" },
      select: DOMAIN_SELECT,
    });
    return refuse("PLATFORM_HOSTNAME_MISSING");
  }

  const activated = platformAfter.find((item) => item.id === row.id);
  await writePlatformAuditEvent(
    {
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: "ACTIVATE_CUSTOM_DOMAIN",
      entityType: "WorkspaceDomain",
      entityId: row.id,
      summary: "Activated a verified custom domain for this workspace only.",
      metadata: { hostname: row.hostname },
    },
    input.prisma,
  );
  return {
    outcome: "ACTIVATED",
    domain: toDto(activated ?? { ...row, status: "ACTIVE" }),
    platformHostname,
  };
}
