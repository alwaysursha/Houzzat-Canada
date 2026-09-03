/** Stage 6.2A — billing module exports (no Stripe checkout). */

export const PLATFORM_BILLING_MODULE = "platform/billing" as const;

export {
  HOUZZAT_WORKSPACE_SLUG,
  grandfatherHouzzatWorkspace,
  grandfatherWorkspaceWithProfile,
  assertSubscriptionIsGrandfathered,
  type GrandfatherHouzzatInput,
  type GrandfatherWorkspaceInput,
  type GrandfatherWorkspaceResult,
} from "./grandfather-houzzat";
