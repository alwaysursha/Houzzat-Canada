/**
 * Stage 3K.5.4.1 — gate ActivityBeacon for low-side-effect canary deploys.
 *
 * Set ACTIVITY_BEACON_DISABLED=1 on houzzat-tenant-canary only.
 * Production houzzat Worker must not set this flag.
 */
export function isActivityBeaconEnabled(): boolean {
  const flag = process.env.ACTIVITY_BEACON_DISABLED?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "on") {
    return false;
  }
  return true;
}
