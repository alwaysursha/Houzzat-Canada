/**
 * Vercel Preview gate for the HIGH OCTANE staging tenant.
 * This module does not connect to a database, create a domain, or enable an integration.
 */
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";

export const HIGH_OCTANE_STAGING_DIRECT_HOST =
  "ep-red-credit-axp65p8a.c-4.us-east-2.aws.neon.tech";
export const HIGH_OCTANE_STAGING_POOLED_HOST =
  "ep-red-credit-axp65p8a-pooler.c-4.us-east-2.aws.neon.tech";
export const HIGH_OCTANE_STAGING_BRANCH_ID = "br-dark-surf-axbepvr1";

/**
 * Stable Git-branch Preview hostname for project `high-octane-staging`,
 * branch `feature/high-octane-royal-collection`, team `houzzat`.
 * The untruncated label is 68 characters, so the documented Vercel truncation
 * keeps a six-character hash and the team slug inside the 63-character DNS limit.
 */
export const HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME =
  "high-octane-staging-git-feature-high-octane-roy-f9a2c5-houzzat.vercel.app";

const APPROVED_STAGING_HOSTS = new Set([
  HIGH_OCTANE_STAGING_DIRECT_HOST,
  HIGH_OCTANE_STAGING_POOLED_HOST,
]);

const PRODUCTION_HOSTS = new Set([
  "ep-snowy-river-axfgwomo.c-4.us-east-2.aws.neon.tech",
  "ep-snowy-river-axfgwomo-pooler.c-4.us-east-2.aws.neon.tech",
]);

export type HighOctanePreviewGate = {
  ready: boolean;
  prerequisite: string | null;
};

export type HighOctanePreviewGateOptions = {
  hostname?: string | null;
  /** Live branch id when a caller already has one. Absent means it was not available. */
  branchId?: string | null;
};

function closed(prerequisite: string): HighOctanePreviewGate {
  return { ready: false, prerequisite };
}

function databaseHost(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

export function isApprovedHighOctanePreviewHostname(
  hostname: string | null | undefined,
): boolean {
  if (!hostname) return false;
  const host = hostname.trim().toLowerCase().replace(/\.$/, "").split(":")[0] ?? "";
  return host === HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME;
}

export function isApprovedHighOctaneStagingDatabaseHost(host: string | null | undefined): boolean {
  return Boolean(host && APPROVED_STAGING_HOSTS.has(host));
}

export function isProductionNeonHost(host: string | null | undefined): boolean {
  return Boolean(host && PRODUCTION_HOSTS.has(host));
}

/** A missing branch id is not available. A present id must be the staging branch. */
export function highOctaneStagingBranchIdentityAllowed(
  branchId: string | null | undefined,
): boolean {
  if (branchId == null) return true;
  const trimmed = branchId.trim();
  if (!trimmed) return true;
  return trimmed === HIGH_OCTANE_STAGING_BRANCH_ID;
}

/**
 * Preview process checks that do not know the request hostname.
 * Ready here does not select Royal Collection.
 */
export function evaluateHighOctanePreviewProcess(
  env: NodeJS.ProcessEnv = process.env,
): HighOctanePreviewGate {
  if (env.VERCEL_ENV === "production") {
    return closed("Refusing HIGH OCTANE staging on a production Vercel deployment.");
  }
  if (env.VERCEL_ENV !== "preview") {
    return closed("HIGH OCTANE cloud preview requires VERCEL_ENV=preview.");
  }
  if (env.HIGH_OCTANE_STAGING !== "1" || env.HIGH_OCTANE_STAGING_ACCESS !== "authenticated") {
    return closed(
      "HIGH OCTANE cloud preview requires HIGH_OCTANE_STAGING=1 and HIGH_OCTANE_STAGING_ACCESS=authenticated.",
    );
  }

  const applicationHost = databaseHost(env.DATABASE_URL);
  if (
    !isApprovedHighOctaneStagingDatabaseHost(applicationHost) ||
    isProductionNeonHost(applicationHost)
  ) {
    return closed("HIGH OCTANE cloud preview requires the approved staging Neon host.");
  }
  if (env.DIRECT_URL?.trim()) {
    const directHost = databaseHost(env.DIRECT_URL);
    if (!isApprovedHighOctaneStagingDatabaseHost(directHost) || isProductionNeonHost(directHost)) {
      return closed("HIGH OCTANE cloud preview rejected a database host that is not the staging branch.");
    }
  }

  if (!highOctaneStagingBranchIdentityAllowed(env.HIGH_OCTANE_STAGING_BRANCH_ID)) {
    return closed("HIGH OCTANE cloud preview rejected a branch id that is not the staging branch.");
  }

  const branchUrl = env.VERCEL_BRANCH_URL?.trim().toLowerCase() ?? "";
  if (branchUrl && branchUrl !== HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME) {
    return closed("HIGH OCTANE cloud preview rejected a Vercel branch URL that is not approved.");
  }

  return { ready: true, prerequisite: null };
}

export function highOctanePreviewProcessReady(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return evaluateHighOctanePreviewProcess(env).ready;
}

/** Royal Collection cloud preview. Hostname is required. */
export function evaluateHighOctanePreviewEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  options: HighOctanePreviewGateOptions = {},
): HighOctanePreviewGate {
  const processGate = evaluateHighOctanePreviewProcess(env);
  if (!processGate.ready) return processGate;
  if (!highOctaneStagingBranchIdentityAllowed(options.branchId)) {
    return closed("HIGH OCTANE cloud preview rejected a branch id that is not the staging branch.");
  }
  if (!isApprovedHighOctanePreviewHostname(options.hostname)) {
    return closed("HIGH OCTANE cloud preview requires the approved preview hostname.");
  }
  return { ready: true, prerequisite: null };
}

export function shouldUseHighOctanePreviewWorkspaceBrand(input: {
  workspaceSlug: string | null | undefined;
  hostname: string | null | undefined;
  env?: NodeJS.ProcessEnv;
}): boolean {
  if (input.workspaceSlug !== HIGH_OCTANE_STAGING_WORKSPACE_SLUG) return false;
  if (!isApprovedHighOctanePreviewHostname(input.hostname)) return false;
  return highOctanePreviewProcessReady(input.env);
}
