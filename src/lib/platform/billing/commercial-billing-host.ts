/**
 * Hosts that may render a commercial offer, accept it, or start Checkout.
 * Production roots stay allowed. One configured staging hostname is added only
 * when HOUZZATPRO_STAGING_ORIGIN is a valid https origin.
 */

import { readHouzzatProStagingOrigin } from "@/lib/platform/billing/staging-origin";
import { normalizeWorkspaceHostname } from "@/lib/tenancy/normalize-workspace-hostname";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/platform-hostname";

export function isHouzzatProCommercialBillingHost(
  rawHostname: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isHouzzatProPlatformRoot(rawHostname)) return true;
  const staging = readHouzzatProStagingOrigin(env);
  switch (staging.status) {
    case "absent":
    case "invalid":
      return false;
    case "configured": {
      const normalized = normalizeWorkspaceHostname(rawHostname);
      if (!normalized.ok) return false;
      return normalized.hostname === staging.hostname;
    }
    default: {
      const _exhaustive: never = staging;
      void _exhaustive;
      return false;
    }
  }
}
