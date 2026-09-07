/**
 * Stage 6.11F.2A — OWNER TXT ownership verification for CUSTOM PENDING claims.
 *
 * On success: verifiedAt = now. status remains PENDING.
 * Does NOT activate, call Cloudflare Custom Hostnames, or mutate DNS.
 */

import type { PrismaClient } from "@prisma/client";
import {
  OwnerActivationError,
  requireHostBoundOwnerOnboardingContext,
} from "@/lib/platform/activation";
import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  buildWebsiteDomainDnsInstructions,
  buildWebsiteDomainTxtOwnershipHost,
  type WebsiteDomainDnsInstructions,
} from "@/lib/tenancy/workspace-domain/dns-instructions";
import {
  createCloudflareDohTxtLookup,
  type DnsTxtLookup,
} from "@/lib/tenancy/workspace-domain/dns-txt-lookup";
import { txtAnswersMatchOwnershipToken } from "@/lib/tenancy/workspace-domain/txt-match";
import type { WebsiteDomainDto } from "@/lib/tenancy/workspace-domain/manage-custom";

type AuthInput = {
  request: Request;
  clientWorkspaceId?: string | null;
  prisma?: PrismaClient;
  hostDeps?: Parameters<
    typeof requireHostBoundOwnerOnboardingContext
  >[0]["hostDeps"];
  userId?: string;
  /** Injectable DNS TXT lookup — defaults to Cloudflare DoH. */
  dnsTxtLookup?: DnsTxtLookup;
  now?: Date;
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

type DomainRow = {
  id: string;
  workspaceId: string;
  hostname: string;
  kind: "PLATFORM" | "CUSTOM";
  role: "PRIMARY" | "ALIAS";
  status: "PENDING" | "ACTIVE" | "DISABLED";
  verificationToken: string | null;
  verifiedAt: Date | null;
};

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

export type OwnershipVerifyResult =
  | {
      outcome: "VERIFIED";
      domain: WebsiteDomainDto;
    }
  | {
      outcome: "ALREADY_VERIFIED";
      domain: WebsiteDomainDto;
    }
  | {
      outcome: "NOT_VERIFIED";
      domain: WebsiteDomainDto;
      reason: "TXT_NOT_FOUND" | "TXT_MISMATCH";
      dnsHost: string;
    }
  | {
      outcome: "DNS_RETRYABLE_ERROR";
      domain: WebsiteDomainDto;
      reason: "DNS_TIMEOUT" | "DNS_RESOLVER_ERROR";
      dnsHost: string;
    };

/**
 * Verify CUSTOM PENDING ownership via TXT challenge.
 * Never sets status ACTIVE. Never trusts claimed hostname as authority.
 */
export async function verifyOwnerWebsiteDomainOwnership(
  input: AuthInput & { domainId: string },
): Promise<OwnershipVerifyResult> {
  const db = input.prisma ?? defaultPrisma;
  const ctx = await requireHostBoundOwnerOnboardingContext({
    request: input.request,
    prisma: db,
    hostDeps: input.hostDeps,
    userId: input.userId,
    clientWorkspaceId: input.clientWorkspaceId,
  });

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
      "Only custom website domain claims can be verified",
      "PLATFORM_DOMAIN_PROTECTED",
      403,
    );
  }
  if (row.status !== "PENDING") {
    throw new OwnerActivationError(
      "Only pending custom website domain claims can be verified",
      "DOMAIN_NOT_PENDING",
      403,
    );
  }
  if (!row.verificationToken) {
    throw new OwnerActivationError(
      "Verification token missing for this claim",
      "VERIFICATION_TOKEN_MISSING",
      400,
    );
  }

  const dnsHost = buildWebsiteDomainTxtOwnershipHost(row.hostname);

  if (row.verifiedAt != null) {
    return {
      outcome: "ALREADY_VERIFIED",
      domain: toDto(row),
    };
  }

  const lookup = input.dnsTxtLookup ?? createCloudflareDohTxtLookup();
  const dns = await lookup({ name: dnsHost });

  if (!dns.ok) {
    const reason =
      dns.reason === "timeout" ? "DNS_TIMEOUT" : "DNS_RESOLVER_ERROR";
    return {
      outcome: "DNS_RETRYABLE_ERROR",
      domain: toDto(row),
      reason,
      dnsHost,
    };
  }

  if (dns.empty || dns.answers.length === 0) {
    return {
      outcome: "NOT_VERIFIED",
      domain: toDto(row),
      reason: "TXT_NOT_FOUND",
      dnsHost,
    };
  }

  const matched = txtAnswersMatchOwnershipToken(
    dns.answers,
    row.verificationToken,
  );
  if (!matched) {
    return {
      outcome: "NOT_VERIFIED",
      domain: toDto(row),
      reason: "TXT_MISMATCH",
      dnsHost,
    };
  }

  const now = input.now ?? new Date();
  const updated = await db.workspaceDomain.update({
    where: { id: row.id },
    data: {
      verifiedAt: now,
      // Explicitly preserve PENDING — never activate in F.2A.
      status: "PENDING",
    },
    select: DOMAIN_SELECT,
  });

  if (updated.status !== "PENDING") {
    throw new OwnerActivationError(
      "Unexpected domain status after ownership verification",
      "INTERNAL_ERROR",
      500,
    );
  }

  return {
    outcome: "VERIFIED",
    domain: toDto(updated),
  };
}

export type { WebsiteDomainDnsInstructions };
