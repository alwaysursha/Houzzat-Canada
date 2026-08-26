/**
 * Stage 3K.5.4 — Next.js / OpenNext cache policy for hostname-aware tenancy.
 *
 * Marketing surfaces must not statically bake one tenant's HTML at build time.
 * Layout routes must export `export const dynamic = "force-dynamic"` as a
 * string literal — Next.js 16 rejects imported/member-expression segment config.
 */
export const MARKETING_TENANCY_CACHE_POLICY = {
  segmentConfig: "force-dynamic" as const,
  rationale:
    "Hostname → workspace → brand must be resolved per HTTP request; static generation would freeze Houzzat HTML and risk cross-tenant cache bleed on shared Workers.",
  hostResolutionCacheKey: "scopeMode:normalizedHostname",
  brandCacheKey: "workspaceId:version",
  forbiddenGlobalKeys: ["currentWorkspace", "currentBrand", "currentOrigin"],
} as const;
