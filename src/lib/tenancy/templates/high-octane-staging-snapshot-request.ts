/**
 * Server-only snapshot visibility. Callers pass the hostname resolution
 * they already computed. This module does not query a Neon branch id.
 */
import {
  resolveListingEntitlementContextForServerPage,
  type ListingEntitlementForHostnameResult,
} from "@/lib/tenancy/listing-entitlement";
import { isHighOctaneStagingSnapshotVisible } from "@/lib/tenancy/templates/high-octane-staging-snapshot";

export function stagingSnapshotVisibleFromResolution(
  resolution: ListingEntitlementForHostnameResult,
  env?: NodeJS.ProcessEnv,
): boolean {
  return isHighOctaneStagingSnapshotVisible({
    workspaceSlug: resolution.ok ? resolution.host.workspaceSlug : null,
    env,
  });
}

export async function stagingSnapshotVisibleForServerPage(): Promise<boolean> {
  const context = await resolveListingEntitlementContextForServerPage();
  return stagingSnapshotVisibleFromResolution(context.resolution);
}
