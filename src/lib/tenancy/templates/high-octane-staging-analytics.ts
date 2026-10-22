/**
 * Server-authoritative analytics exclusion for the verified HIGH OCTANE
 * staging process. A client flag or query parameter cannot open this path.
 * Production tenants, including Houzzat, stay on the normal writers.
 */
import { evaluateHighOctaneStagingEnvironment } from "@/lib/tenancy/templates/high-octane-staging";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";

/**
 * True only when the staging gate is ready and the request is not a different tenant.
 * An omitted slug on a ready staging process still suppresses, so an unresolved
 * host cannot fall through into visitor, session, activity, or funnel writes.
 */
export function isHighOctaneStagingAnalyticsSuppressed(input?: {
  workspaceSlug?: string | null;
  env?: NodeJS.ProcessEnv;
}): boolean {
  const env = input?.env ?? process.env;
  if (!evaluateHighOctaneStagingEnvironment(env).ready) return false;
  const slug = input?.workspaceSlug?.trim();
  if (slug && slug !== HIGH_OCTANE_STAGING_WORKSPACE_SLUG) return false;
  return true;
}
