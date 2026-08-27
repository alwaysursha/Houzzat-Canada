/**
 * Stage 3K.5.8C — canary lead cutover wrangler flag bundle (selftests only).
 */
import assert from "node:assert/strict";

export const CANARY_LEAD_CUTOVER_FLAG_EXPECTATIONS = {
  TENANT_DOMAIN_SCOPE: "workspace",
  TENANT_BRANDING_SCOPE: "workspace",
  TENANT_PUBLIC_LEAD_SCOPE: "workspace",
  WORKSPACE_ROUTING_SCOPE: "workspace",
  WORKSPACE_NOTIFICATION_SCOPE: "workspace",
  WORKSPACE_READ_SCOPE: "workspace",
  WORKSPACE_TEAM_SCOPE: "workspace",
} as const;

export function parseJsoncVar(configText: string, key: string): string | null {
  const re = new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`);
  const match = configText.match(re);
  return match ? match[1]! : null;
}

export function configHasKey(configText: string, key: string): boolean {
  return new RegExp(`"${key}"\\s*:`).test(configText);
}

export function missingCanaryLeadCutoverFlags(configText: string): string[] {
  const missing: string[] = [];
  for (const [key, expected] of Object.entries(
    CANARY_LEAD_CUTOVER_FLAG_EXPECTATIONS,
  )) {
    const actual = parseJsoncVar(configText, key);
    if (actual !== expected) {
      missing.push(`${key}=${actual ?? "unset"} (expected ${expected})`);
    }
  }
  return missing;
}

export function isCanaryLeadCutoverBundleComplete(configText: string): boolean {
  return missingCanaryLeadCutoverFlags(configText).length === 0;
}

/** Lead scope workspace without routing+notification workspace is unsafe partial cutover. */
export function isUnsafePartialCanaryLeadCutover(configText: string): boolean {
  const leadScope = parseJsoncVar(configText, "TENANT_PUBLIC_LEAD_SCOPE");
  const routingScope = parseJsoncVar(configText, "WORKSPACE_ROUTING_SCOPE");
  const notificationScope = parseJsoncVar(
    configText,
    "WORKSPACE_NOTIFICATION_SCOPE",
  );
  const readScope = parseJsoncVar(configText, "WORKSPACE_READ_SCOPE");
  const teamScope = parseJsoncVar(configText, "WORKSPACE_TEAM_SCOPE");
  return (
    (leadScope === "workspace" &&
      (routingScope !== "workspace" || notificationScope !== "workspace")) ||
    (readScope === "workspace" && teamScope !== "workspace")
  );
}

export function assertCanaryLeadCutoverBundle(configText: string): void {
  const missing = missingCanaryLeadCutoverFlags(configText);
  assert.equal(
    missing.length,
    0,
    `incomplete canary lead cutover bundle: ${missing.join(", ")}`,
  );
  assert.equal(
    isUnsafePartialCanaryLeadCutover(configText),
    false,
    "partial lead cutover without routing+notification workspace scope",
  );
}

export function assertProductionIsolatedFromCanaryLeadCutover(
  productionConfigText: string,
): void {
  assert.ok(!configHasKey(productionConfigText, "TENANT_DOMAIN_SCOPE"));
  assert.ok(!configHasKey(productionConfigText, "TENANT_BRANDING_SCOPE"));
  assert.ok(!configHasKey(productionConfigText, "TENANT_PUBLIC_LEAD_SCOPE"));
  assert.ok(!configHasKey(productionConfigText, "WORKSPACE_ROUTING_SCOPE"));
  assert.ok(!configHasKey(productionConfigText, "WORKSPACE_NOTIFICATION_SCOPE"));
  assert.ok(!configHasKey(productionConfigText, "WORKSPACE_READ_SCOPE"));
  assert.ok(!configHasKey(productionConfigText, "WORKSPACE_TEAM_SCOPE"));
}
