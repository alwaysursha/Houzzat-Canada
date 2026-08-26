/**
 * Stage 3K.3 — hostname resolution cache (keyed by scope + normalized hostname).
 */
import type { ResolvedWorkspaceHost } from "@/lib/tenancy/host-resolution-types";

const POSITIVE_TTL_MS = 60_000;
const NEGATIVE_TTL_MS = 15_000;

type CacheEntry = {
  result: ResolvedWorkspaceHost;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

export function hostResolutionCacheKey(
  scopeMode: "legacy" | "workspace",
  normalizedHostname: string,
): string {
  return `${scopeMode}:${normalizedHostname}`;
}

export function readHostResolutionCache(
  scopeMode: "legacy" | "workspace",
  normalizedHostname: string,
): ResolvedWorkspaceHost | undefined {
  const key = hostResolutionCacheKey(scopeMode, normalizedHostname);
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.result;
}

export function writeHostResolutionCache(
  scopeMode: "legacy" | "workspace",
  normalizedHostname: string,
  result: ResolvedWorkspaceHost,
): void {
  const ttl = result.ok ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
  cache.set(hostResolutionCacheKey(scopeMode, normalizedHostname), {
    result,
    expiresAt: Date.now() + ttl,
  });
}

/** Test-only */
export function clearHostResolutionCacheForTests(): void {
  cache.clear();
}
