/**
 * Phase 2C — tenant published email template cutover.
 * Feature flag TENANT_EMAIL_TEMPLATES=on (default off).
 * When off: live senders keep existing renderer copy unchanged.
 */

/** Feature flag — default OFF. Set TENANT_EMAIL_TEMPLATES=on to activate. */
export function isTenantEmailTemplatesEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.TENANT_EMAIL_TEMPLATES?.trim().toLowerCase() === "on";
}
