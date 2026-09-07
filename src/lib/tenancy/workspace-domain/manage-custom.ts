/**
 * Stage 6.11F.1 — OWNER custom website-domain claim (PENDING only).
 *
 * Creates CUSTOM PENDING WorkspaceDomain rows + DNS ownership instructions.
 * Does NOT activate, verify DNS, call Cloudflare, or bind Workers.
 *
 * Authority: hostname → ACTIVE WorkspaceDomain → ACTIVE Workspace → OWNER.
 * Neon HTTP-safe: no Prisma interactive transactions, no updateMany.
 */

import { randomBytes } from "node:crypto";
import type {
  PrismaClient,
  WorkspaceDomainKind,
  WorkspaceDomainRole,
  WorkspaceDomainStatus,
} from "@prisma/client";
import {
  OwnerActivationError,
  requireHostBoundOwnerOnboardingContext,
  type HostBoundOwnerOnboardingContext,
} from "@/lib/platform/activation";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { normalizeWorkspaceHostname } from "@/lib/tenancy/normalize-workspace-hostname";
import { assertHostnameClaimable } from "@/lib/tenancy/reserved-domains";
import { assertSafeCustomWebsiteClaimHostname } from "@/lib/tenancy/workspace-domain/claim-hostname-safety";
import {
  buildWebsiteDomainDnsInstructions,
  type WebsiteDomainDnsInstructions,
} from "@/lib/tenancy/workspace-domain/dns-instructions";

type AuthInput = {
  request: Request;
  clientWorkspaceId?: string | null;
  prisma?: PrismaClient;
  hostDeps?: Parameters<
    typeof requireHostBoundOwnerOnboardingContext
  >[0]["hostDeps"];
  userId?: string;
};

export type WebsiteDomainDto = {
  id: string;
  hostname: string;
  kind: WorkspaceDomainKind;
  role: WorkspaceDomainRole;
  status: WorkspaceDomainStatus;
  verifiedAt: string | null;
  /**
   * Ownership TXT instructions — only for CUSTOM PENDING owned by this
   * workspace. Never present for PLATFORM / ACTIVE / DISABLED.
   */
  dnsInstructions: WebsiteDomainDnsInstructions | null;
};

type DomainRow = {
  id: string;
  workspaceId: string;
  hostname: string;
  kind: WorkspaceDomainKind;
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

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function newVerificationToken(): string {
  return randomBytes(32).toString("base64url");
}

function toDto(row: DomainRow): WebsiteDomainDto {
  const showDns =
    row.kind === "CUSTOM" &&
    row.status === "PENDING" &&
    typeof row.verificationToken === "string" &&
    row.verificationToken.length > 0;

  return {
    id: row.id,
    hostname: row.hostname,
    kind: row.kind,
    role: row.role,
    status: row.status,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    dnsInstructions: showDns
      ? buildWebsiteDomainDnsInstructions({
          hostname: row.hostname,
          verificationToken: row.verificationToken!,
        })
      : null,
  };
}

async function auth(input: AuthInput): Promise<{
  ctx: HostBoundOwnerOnboardingContext;
  db: PrismaClient;
}> {
  const db = input.prisma ?? defaultPrisma;
  const ctx = await requireHostBoundOwnerOnboardingContext({
    request: input.request,
    prisma: db,
    hostDeps: input.hostDeps,
    userId: input.userId,
    clientWorkspaceId: input.clientWorkspaceId,
  });
  return { ctx, db };
}

/**
 * F.1 product rule: at most one CUSTOM PENDING claim per workspace.
 * Role: PRIMARY when no CUSTOM PRIMARY exists; otherwise ALIAS.
 */
function resolveCustomClaimRole(
  rows: readonly Pick<DomainRow, "kind" | "role" | "status">[],
): WorkspaceDomainRole {
  const hasCustomPrimary = rows.some(
    (r) => r.kind === "CUSTOM" && r.role === "PRIMARY",
  );
  return hasCustomPrimary ? "ALIAS" : "PRIMARY";
}

function assertNoPendingCustomClaim(
  rows: readonly Pick<DomainRow, "kind" | "status" | "hostname">[],
  claimingHostname: string,
): void {
  const pending = rows.find(
    (r) =>
      r.kind === "CUSTOM" &&
      r.status === "PENDING" &&
      r.hostname !== claimingHostname,
  );
  if (pending) {
    throw new OwnerActivationError(
      "A pending custom website domain claim already exists. Remove it before claiming another hostname.",
      "PENDING_CLAIM_EXISTS",
      409,
    );
  }
}

/** GET — list domains for the host-bound OWNER workspace. */
export async function listOwnerWebsiteDomains(
  input: AuthInput,
): Promise<{ domains: WebsiteDomainDto[] }> {
  const { ctx, db } = await auth(input);
  const rows = await db.workspaceDomain.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: [{ kind: "asc" }, { role: "asc" }, { hostname: "asc" }],
    select: DOMAIN_SELECT,
  });
  return { domains: rows.map(toDto) };
}

export type ClaimOwnerWebsiteDomainResult = {
  domain: WebsiteDomainDto;
  /** True when an existing same-workspace PENDING claim was returned. */
  idempotent: boolean;
};

/** POST — claim CUSTOM PENDING website domain (idempotent for same host). */
export async function claimOwnerWebsiteDomain(
  input: AuthInput & { hostname: unknown },
): Promise<ClaimOwnerWebsiteDomainResult> {
  const { ctx, db } = await auth(input);

  if (typeof input.hostname !== "string" || !input.hostname.trim()) {
    throw new OwnerActivationError(
      "hostname required",
      "HOSTNAME_REQUIRED",
      400,
    );
  }

  const normalized = normalizeWorkspaceHostname(input.hostname);
  if (!normalized.ok) {
    throw new OwnerActivationError(
      normalized.error,
      "INVALID_HOSTNAME",
      400,
    );
  }
  const hostname = normalized.hostname;

  const safety = assertSafeCustomWebsiteClaimHostname(hostname);
  if (!safety.ok) {
    throw new OwnerActivationError(safety.error, "INVALID_HOSTNAME", 400);
  }

  const claimError = assertHostnameClaimable({
    hostname,
    kind: "CUSTOM",
  });
  if (claimError) {
    throw new OwnerActivationError(claimError, "HOSTNAME_RESERVED", 400);
  }

  const existing = await db.workspaceDomain.findUnique({
    where: { hostname },
    select: DOMAIN_SELECT,
  });

  if (existing) {
    if (existing.workspaceId !== ctx.workspaceId) {
      throw new OwnerActivationError(
        "Hostname is already claimed by another workspace",
        "HOSTNAME_TAKEN",
        409,
      );
    }
    if (existing.kind === "PLATFORM") {
      throw new OwnerActivationError(
        "Platform hostnames cannot be claimed as custom website domains",
        "PLATFORM_DOMAIN_PROTECTED",
        409,
      );
    }
    if (existing.status === "PENDING" && existing.kind === "CUSTOM") {
      return { domain: toDto(existing), idempotent: true };
    }
    if (existing.status === "ACTIVE") {
      throw new OwnerActivationError(
        "Hostname is already active for this workspace",
        "HOSTNAME_ALREADY_ACTIVE",
        409,
      );
    }
    throw new OwnerActivationError(
      "Hostname exists in a non-claimable state",
      "HOSTNAME_CONFLICT",
      409,
    );
  }

  const workspaceRows = await db.workspaceDomain.findMany({
    where: { workspaceId: ctx.workspaceId },
    select: {
      kind: true,
      role: true,
      status: true,
      hostname: true,
    },
  });

  assertNoPendingCustomClaim(workspaceRows, hostname);
  const role = resolveCustomClaimRole(workspaceRows);
  const verificationToken = newVerificationToken();

  try {
    const created = await db.workspaceDomain.create({
      data: {
        workspaceId: ctx.workspaceId,
        hostname,
        kind: "CUSTOM",
        role,
        status: "PENDING",
        verificationToken,
        verifiedAt: null,
      },
      select: DOMAIN_SELECT,
    });
    return { domain: toDto(created), idempotent: false };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    // Race: another writer claimed the hostname first.
    const raced = await db.workspaceDomain.findUnique({
      where: { hostname },
      select: DOMAIN_SELECT,
    });
    if (
      raced &&
      raced.workspaceId === ctx.workspaceId &&
      raced.kind === "CUSTOM" &&
      raced.status === "PENDING"
    ) {
      return { domain: toDto(raced), idempotent: true };
    }
    if (raced && raced.workspaceId !== ctx.workspaceId) {
      throw new OwnerActivationError(
        "Hostname is already claimed by another workspace",
        "HOSTNAME_TAKEN",
        409,
      );
    }
    throw new OwnerActivationError(
      "Hostname conflict during claim",
      "HOSTNAME_CONFLICT",
      409,
    );
  }
}

/** DELETE — remove CUSTOM PENDING claim only. */
export async function deleteOwnerPendingWebsiteDomain(
  input: AuthInput & { domainId: string },
): Promise<{ deleted: true; domainId: string }> {
  const { ctx, db } = await auth(input);
  const domainId = input.domainId?.trim();
  if (!domainId) {
    throw new OwnerActivationError("domainId required", "DOMAIN_ID_REQUIRED", 400);
  }

  const row = await db.workspaceDomain.findFirst({
    where: { id: domainId, workspaceId: ctx.workspaceId },
    select: DOMAIN_SELECT,
  });

  if (!row) {
    throw new OwnerActivationError(
      "Website domain claim not found",
      "DOMAIN_NOT_FOUND",
      404,
    );
  }
  if (row.kind !== "CUSTOM") {
    throw new OwnerActivationError(
      "Only custom website domain claims can be removed",
      "PLATFORM_DOMAIN_PROTECTED",
      403,
    );
  }
  if (row.status !== "PENDING") {
    throw new OwnerActivationError(
      "Only pending custom website domain claims can be removed",
      "DOMAIN_NOT_PENDING",
      403,
    );
  }

  await db.workspaceDomain.delete({ where: { id: row.id } });
  return { deleted: true, domainId: row.id };
}
