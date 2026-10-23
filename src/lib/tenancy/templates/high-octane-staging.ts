/**
 * Staging plan for a genuine HIGH OCTANE workspace.
 *
 * Reuses paid-provisioning name and slug rules. Does not create a workspace,
 * subscription, domain, or listing connection. The caller must already be on
 * an isolated staging database that is not the application DATABASE_URL.
 */
import { deriveWorkspaceDisplayName, slugifyWorkspaceName } from "@/lib/platform/provisioning/slug";
import { HIGH_OCTANE_PREVIEW_FIXTURE } from "@/lib/tenancy/templates/high-octane-preview-fixture";
import {
  evaluateHighOctanePreviewEnvironment,
  type HighOctanePreviewGateOptions,
} from "@/lib/tenancy/templates/high-octane-staging-preview";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG as BROWSER_SAFE_STAGING_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";
import { ROYAL_COLLECTION_ONE_TEMPLATE_ID } from "@/lib/tenancy/templates/types";

const fixture = HIGH_OCTANE_PREVIEW_FIXTURE;

const derivedStagingSlug = slugifyWorkspaceName(
  deriveWorkspaceDisplayName({
    planCode: "TEAM",
    businessName: fixture.brandName,
    contactName: fixture.agentName,
  }),
);

if (derivedStagingSlug !== BROWSER_SAFE_STAGING_SLUG) {
  throw new Error(
    "HIGH OCTANE staging slug drifted from the browser-safe constant. Refusing to continue.",
  );
}

export const HIGH_OCTANE_STAGING_WORKSPACE_SLUG = BROWSER_SAFE_STAGING_SLUG;

export type HighOctaneStagingWorkspacePlan = {
  displayName: string;
  slug: string;
  agentName: string;
  brokerageName: string;
  phone: string;
  email: string;
  marketLabel: string;
  templateId: typeof ROYAL_COLLECTION_ONE_TEMPLATE_ID;
  /** Catalog flags stay false. This plan does not make the template selectable. */
  selectable: false;
  presentationReady: false;
  billing: "not_activated";
  listingSource: "none";
  provisioned: false;
};

export function planHighOctaneStagingWorkspace(): HighOctaneStagingWorkspacePlan {
  return {
    displayName: fixture.brandName,
    slug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    agentName: fixture.agentName,
    brokerageName: fixture.brokerageName,
    phone: fixture.phone,
    email: fixture.email,
    marketLabel: fixture.marketLabel,
    templateId: ROYAL_COLLECTION_ONE_TEMPLATE_ID,
    selectable: false,
    presentationReady: false,
    billing: "not_activated",
    listingSource: "none",
    provisioned: false,
  };
}

export type HighOctaneStagingEnvironment = {
  /** True only when the process is pointed at a separate staging database and access gate. */
  ready: boolean;
  /** Set when ready is false. Never contains a connection string. */
  prerequisite: string | null;
};

function databaseHost(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname || null;
  } catch {
    return null;
  }
}

/**
 * Fail closed. Localhost staging keeps its current rules.
 * Vercel Preview opens only through the separate preview gate.
 * A ready environment still does not create a workspace.
 */
export function evaluateHighOctaneStagingEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  options?: HighOctanePreviewGateOptions,
): HighOctaneStagingEnvironment {
  if (env.VERCEL_ENV === "production") {
    return {
      ready: false,
      prerequisite: "Refusing HIGH OCTANE staging on a production Vercel deployment.",
    };
  }
  if (env.VERCEL_ENV === "preview") {
    return evaluateHighOctanePreviewEnvironment(env, options);
  }
  return evaluateLocalhostStagingEnvironment(env);
}

function evaluateLocalhostStagingEnvironment(
  env: NodeJS.ProcessEnv,
): HighOctaneStagingEnvironment {
  if (env.NODE_ENV === "production") {
    return {
      ready: false,
      prerequisite:
        "Run staging with NODE_ENV other than production. Do not provision HIGH OCTANE on the production deployment.",
    };
  }
  const stagingHost = databaseHost(env.STAGING_DATABASE_URL);
  if (!env.STAGING_DATABASE_URL?.trim() || !stagingHost) {
    return {
      ready: false,
      prerequisite:
        "Create a dedicated Neon staging branch and set STAGING_DATABASE_URL to that branch. The application DATABASE_URL is the production branch, and no staging URL is configured.",
    };
  }
  const applicationHost = databaseHost(env.DATABASE_URL);
  if (!applicationHost || stagingHost === applicationHost) {
    return {
      ready: false,
      prerequisite:
        "STAGING_DATABASE_URL must use a different database host from DATABASE_URL. Refusing to provision against the production branch.",
    };
  }
  if (env.HIGH_OCTANE_STAGING !== "1") {
    return {
      ready: false,
      prerequisite:
        "Set HIGH_OCTANE_STAGING=1 only in the staging environment. A previewTemplate query does not select this workspace.",
    };
  }
  if (env.HIGH_OCTANE_STAGING_ACCESS !== "authenticated") {
    return {
      ready: false,
      prerequisite:
        "Set HIGH_OCTANE_STAGING_ACCESS=authenticated and protect the staging hostname at deployment. An unconnected custom domain is not private.",
    };
  }
  return { ready: true, prerequisite: null };
}

/** Royal Collection for the staging workspace only, and only after the gate passes. */
export function resolveHighOctaneStagingTemplateId(input: {
  workspaceSlug: string | null | undefined;
  env?: NodeJS.ProcessEnv;
  hostname?: string | null;
  branchId?: string | null;
}): typeof ROYAL_COLLECTION_ONE_TEMPLATE_ID | null {
  if (input.workspaceSlug !== HIGH_OCTANE_STAGING_WORKSPACE_SLUG) return null;
  if (
    !evaluateHighOctaneStagingEnvironment(input.env ?? process.env, {
      hostname: input.hostname,
      branchId: input.branchId,
    }).ready
  ) {
    return null;
  }
  return ROYAL_COLLECTION_ONE_TEMPLATE_ID;
}
