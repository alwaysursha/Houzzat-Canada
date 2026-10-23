/**
 * Staging-only permission for the Royal Collection property concept.
 * The workspace slug comes from hostname resolution. A query parameter cannot open this path.
 */
import { evaluateHighOctaneStagingEnvironment } from "@/lib/tenancy/templates/high-octane-staging";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";

export function highOctaneStagingPropertyConceptAllowed(input: {
  workspaceSlug: string | null | undefined;
  hostname?: string | null;
  env?: NodeJS.ProcessEnv;
  branchId?: string | null;
}): boolean {
  if (input.workspaceSlug !== HIGH_OCTANE_STAGING_WORKSPACE_SLUG) return false;
  return evaluateHighOctaneStagingEnvironment(input.env, {
    hostname: input.hostname,
    branchId: input.branchId,
  }).ready;
}
