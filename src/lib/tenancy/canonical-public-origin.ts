/**
 * Stage 3K.5.5 — canonical public website origin per workspace.
 *
 * Policy: verified CUSTOM PRIMARY wins over PLATFORM PRIMARY.
 * When neither exists, fall back to the trusted request hostname.
 */
import type {
  WorkspaceDomainKind,
  WorkspaceDomainRole,
  WorkspaceDomainStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Interim legacy hosts — prefer PLATFORM PRIMARY while cutover is in progress. */
const INTERIM_CUSTOM_CANONICAL_HOSTNAMES = new Set(["canary.houzzat.com"]);

export type WorkspaceDomainCanonicalRow = {
  hostname: string;
  kind: WorkspaceDomainKind;
  role: WorkspaceDomainRole;
  status: WorkspaceDomainStatus;
};

export function selectCanonicalHostname(
  domains: readonly WorkspaceDomainCanonicalRow[],
  requestHostname: string,
): string {
  const activePrimary = domains.filter(
    (row) => row.status === "ACTIVE" && row.role === "PRIMARY",
  );
  const customPrimary = activePrimary.find((row) => row.kind === "CUSTOM");
  const platformPrimary = activePrimary.find((row) => row.kind === "PLATFORM");

  if (
    customPrimary &&
    platformPrimary &&
    INTERIM_CUSTOM_CANONICAL_HOSTNAMES.has(customPrimary.hostname)
  ) {
    return platformPrimary.hostname;
  }

  if (customPrimary) return customPrimary.hostname;
  if (platformPrimary) return platformPrimary.hostname;
  return requestHostname;
}

export function canonicalOriginForHostname(
  hostname: string,
  protocol: "http:" | "https:" = "https:",
): string {
  return `${protocol}//${hostname}`;
}

/** Resolve canonical HTTPS origin for SEO/metadata (CUSTOM PRIMARY > PLATFORM > request host). */
export async function resolveCanonicalPublicOrigin(
  workspaceId: string,
  requestHostname: string,
  protocol: "http:" | "https:" = "https:",
): Promise<string> {
  const rows = await prisma.workspaceDomain.findMany({
    where: { workspaceId, status: "ACTIVE" },
    select: { hostname: true, kind: true, role: true, status: true },
  });
  const hostname = selectCanonicalHostname(rows, requestHostname);
  return canonicalOriginForHostname(hostname, protocol);
}
