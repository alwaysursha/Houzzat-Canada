/**
 * Phase 2C — tenant published email template cutover.
 *
 * Global: TENANT_EMAIL_TEMPLATES=on (default off).
 * Allowlist: TENANT_EMAIL_TEMPLATES_WORKSPACE_IDS (comma/whitespace-separated).
 *
 * Activation for a workspace requires:
 * 1) global flag ON, and
 * 2) a non-empty allowlist that includes that workspaceId.
 * Global ON with unset/empty allowlist fails closed (no tenants).
 * When off: live senders keep existing renderer copy unchanged (no DB).
 */

import { isWorkspaceIdAllowlisted } from "@/lib/email/workspace-id-allowlist";

/** Global feature flag — default OFF. Set TENANT_EMAIL_TEMPLATES=on to activate. */
export function isTenantEmailTemplatesEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.TENANT_EMAIL_TEMPLATES?.trim().toLowerCase() === "on";
}

/**
 * Workspace-scoped activation. Prefer this in live loaders.
 * Denied / malformed / missing allowlist → false (no template DB reads).
 */
export function isTenantEmailTemplatesEnabledForWorkspace(
  workspaceId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isTenantEmailTemplatesEnabled(env)) return false;
  return isWorkspaceIdAllowlisted(
    workspaceId,
    env.TENANT_EMAIL_TEMPLATES_WORKSPACE_IDS,
  );
}
