/**
 * Workspace statuses that allow staff CRM / Pro onboarding after paid provision.
 * TRIAL is set when Subscription is TRIALING — still a paid acceptance path.
 */
import type { WorkspaceStatus } from "@prisma/client";

export function isOperationalWorkspaceStatus(
  status: WorkspaceStatus | string | null | undefined,
): boolean {
  return status === "ACTIVE" || status === "TRIAL";
}
