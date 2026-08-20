/**
 * Pure helpers for consumer location policy (no Capacitor).
 * Auth/server never trust these coordinates as identity.
 */

export const NORMAL_LOCATION_MAX_AGE_MS = 5 * 60 * 1000;
export const NORMAL_LOCATION_TIMEOUT_MS = 12_000;

export type LocationPermissionGate = "granted" | "denied" | "prompt" | "unknown";

/**
 * Passive Home / background effects must never trigger an OS permission dialog.
 * Only explicit user actions may set requestPermission: true.
 */
export function shouldRequestLocationPermission(input: {
  /** Caller opts into prompting the OS. */
  requestPermission: boolean;
  permission: LocationPermissionGate;
}): boolean {
  if (!input.requestPermission) return false;
  return input.permission === "prompt" || input.permission === "unknown";
}

/**
 * Whether a passive Home effect may call the native GPS stack at all.
 * Granted → yes (no prompt). Prompt/unknown/denied → no (wait for CTA).
 */
export function mayResolveLocationPassively(
  permission: LocationPermissionGate,
): boolean {
  return permission === "granted";
}

/**
 * Dedupe Home rails geo upgrades by resolved region id.
 * Returns true when this region should trigger a fetch.
 */
export function shouldUpgradeHomeRailsRegion(input: {
  currentRegionId: string;
  nextRegionId: string;
  /** Regions already upgraded/fetched for this geo cycle. */
  upgradedRegionIds: ReadonlySet<string>;
}): boolean {
  if (input.nextRegionId === input.currentRegionId) return false;
  if (input.upgradedRegionIds.has(input.nextRegionId)) return false;
  return true;
}
