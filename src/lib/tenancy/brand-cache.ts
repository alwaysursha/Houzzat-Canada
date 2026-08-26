/**
 * Stage 3K.2 — in-memory brand cache keyed by workspaceId + version.
 * Never use a zero-arg global "current brand" cache.
 */
import type { WorkspaceBrandInternal } from "@/lib/tenancy/brand-dto";

const brandCache = new Map<string, WorkspaceBrandInternal>();

export function brandCacheKey(workspaceId: string, version: number): string {
  return `${workspaceId}:${version}`;
}

export function readBrandCache(
  workspaceId: string,
  version: number,
): WorkspaceBrandInternal | undefined {
  return brandCache.get(brandCacheKey(workspaceId, version));
}

export function writeBrandCache(brand: WorkspaceBrandInternal): void {
  brandCache.set(brandCacheKey(brand.workspaceId, brand.version), brand);
}

/** Test-only — clears module cache between selftest cases. */
export function clearBrandCacheForTests(): void {
  brandCache.clear();
}
