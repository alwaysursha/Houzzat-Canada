/**
 * Phase 3D.2 — tenant-safe email headshot storage primitives.
 *
 * Derives immutable, versioned sibling R2 keys for 240×240 email PNGs next to
 * managed agent profile originals.
 *
 * Lifecycle (Phase 3D):
 * - New thumbnails use `{uniqueId}-email-240.png` (versioned with the original).
 * - Upload paths must NOT delete previous thumbnails or originals via this module.
 * - Orphaned thumbnails may remain until a separately designed GC job.
 * - Deriving a URL does NOT prove the object exists — do not prefer derived
 *   URLs in email signatures until existence is established elsewhere.
 * - Do not add per-email R2 HEAD requests.
 *
 * Key layout:
 *   workspaces/{workspaceId}/agents/{userId}/profile/{uniqueId}.{jpg|png|webp}
 *   workspaces/{workspaceId}/agents/{userId}/profile/{uniqueId}-email-240.png
 *
 * This module does not mutate User.image, does not upload bytes, and does not
 * expose original-photo deletion.
 */

import {
  extractAgentUserProfileObjectKeyFromUrl,
  parseAgentUserProfileObjectKey,
} from "@/lib/tenancy/branding-assets/keys";
import {
  isManagedAgentProfileUrlReferenced,
  type ManagedProfileCdnDeleteResult,
} from "@/lib/tenancy/branding-assets/managed-profile-cdn";
import { deleteBrandingAssetObject } from "@/lib/tenancy/branding-assets/storage";
import type { PrismaClient } from "@prisma/client";

export const AGENT_EMAIL_HEADSHOT_SUFFIX = "-email-240";
export const AGENT_EMAIL_HEADSHOT_EXT = "png" as const;
export const AGENT_EMAIL_HEADSHOT_FILENAME_SUFFIX = `${AGENT_EMAIL_HEADSHOT_SUFFIX}.${AGENT_EMAIL_HEADSHOT_EXT}`;

const AGENT_EMAIL_HEADSHOT_KEY_RE =
  /^workspaces\/([a-zA-Z0-9_-]+)\/agents\/([a-zA-Z0-9_-]+)\/profile\/([a-zA-Z0-9_-]+)-email-240\.png$/;

export type ParsedAgentEmailHeadshotObjectKey = {
  workspaceId: string;
  userId: string;
  /** Original profile uniqueId (without -email-240). */
  uniqueId: string;
  objectKey: string;
};

export type AgentEmailHeadshotDeleteResult = ManagedProfileCdnDeleteResult;

export type EmailHeadshotStorageTestDeps = {
  /**
   * Override trusted public base (same role as BRANDING_ASSETS_PUBLIC_BASE_URL).
   * Pass `null` to simulate unset configuration.
   */
  trustedPublicBase?: string | null;
  isProduction?: () => boolean;
  isReferenced?: typeof isManagedAgentProfileUrlReferenced;
  deleteObject?: (objectKey: string) => Promise<void>;
};

let testDeps: EmailHeadshotStorageTestDeps | null = null;

/** Selftest-only — never call from production request paths. */
export function setEmailHeadshotStorageTestDeps(
  deps: EmailHeadshotStorageTestDeps | null,
): void {
  testDeps = deps;
}

function trimSeg(value: string | null | undefined): string | null {
  const trimmed = value?.trim() || null;
  return trimmed || null;
}

function hasTraversal(value: string): boolean {
  return value.includes("..") || value.includes("//") || value.startsWith("/");
}

function isProductionRuntime(): boolean {
  if (testDeps?.isProduction) return testDeps.isProduction();
  return process.env.NODE_ENV === "production";
}

/**
 * Resolve the trusted branding-assets public base from configuration.
 * Never accepts an arbitrary caller hostname — only env / test-deps override.
 */
function readConfiguredPublicBaseRaw(): string | null {
  if (testDeps && "trustedPublicBase" in testDeps) {
    const override = testDeps.trustedPublicBase;
    if (override === null) return null;
    if (typeof override === "string") {
      const trimmed = override.trim();
      return trimmed || null;
    }
  }
  return process.env.BRANDING_ASSETS_PUBLIC_BASE_URL?.trim() || null;
}

type TrustedBase =
  | { kind: "absolute"; originBase: string }
  | { kind: "local" };

/**
 * Validate and normalize the configured branding public base.
 * Production: HTTPS only, no credentials/query/fragment, no `..` in path.
 * Non-production: HTTPS or HTTP absolute base, or local `/uploads/branding/` fallback.
 */
export function resolveTrustedBrandingAssetsPublicBase(): TrustedBase | null {
  const raw = readConfiguredPublicBaseRaw();
  const production = isProductionRuntime();

  if (!raw) {
    if (production) return null;
    return { kind: "local" };
  }

  if (raw.includes("..")) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.username || parsed.password) return null;
  if (parsed.search || parsed.hash) return null;

  if (production) {
    if (parsed.protocol !== "https:") return null;
  } else if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }

  if (!parsed.hostname) return null;
  if (parsed.pathname.includes("..")) return null;

  // Rebuild from URL parts so credentials/query/hash cannot sneak back in.
  const path =
    parsed.pathname === "/"
      ? ""
      : parsed.pathname.replace(/\/+$/, "");
  const originBase = `${parsed.protocol}//${parsed.host}${path}`;
  return { kind: "absolute", originBase };
}

async function checkReferenced(input: {
  url: string;
  prisma?: PrismaClient;
  excludeUserIds?: string[];
  excludeBrandingWorkspaceIds?: string[];
}): Promise<boolean> {
  const fn = testDeps?.isReferenced ?? isManagedAgentProfileUrlReferenced;
  return fn(input);
}

async function deleteObject(objectKey: string): Promise<void> {
  const fn = testDeps?.deleteObject ?? deleteBrandingAssetObject;
  await fn(objectKey);
}

/**
 * Parse a full email-headshot object key (exact match).
 */
export function parseAgentEmailHeadshotObjectKey(
  objectKey: string | null | undefined,
): ParsedAgentEmailHeadshotObjectKey | null {
  if (typeof objectKey !== "string") return null;
  const trimmed = objectKey.trim();
  if (!trimmed || hasTraversal(trimmed)) return null;

  const match = AGENT_EMAIL_HEADSHOT_KEY_RE.exec(trimmed);
  if (!match || match[0] !== trimmed) return null;

  return {
    workspaceId: match[1]!,
    userId: match[2]!,
    uniqueId: match[3]!,
    objectKey: match[0],
  };
}

export function isAgentEmailHeadshotObjectKey(
  objectKey: string | null | undefined,
): boolean {
  return parseAgentEmailHeadshotObjectKey(objectKey) !== null;
}

/**
 * Build an email-headshot key from validated workspace/user/uniqueId segments.
 * Never accepts a full client-supplied object key as authoritative.
 */
export function buildAgentEmailHeadshotObjectKey(input: {
  workspaceId: string;
  userId: string;
  uniqueId: string;
}): string | null {
  const workspaceId = trimSeg(input.workspaceId);
  const userId = trimSeg(input.userId);
  const uniqueId = trimSeg(input.uniqueId);
  if (!workspaceId || !userId || !uniqueId) return null;
  if (
    hasTraversal(workspaceId) ||
    hasTraversal(userId) ||
    hasTraversal(uniqueId)
  ) {
    return null;
  }
  if (
    !/^[a-zA-Z0-9_-]+$/.test(workspaceId) ||
    !/^[a-zA-Z0-9_-]+$/.test(userId) ||
    !/^[a-zA-Z0-9_-]+$/.test(uniqueId)
  ) {
    return null;
  }
  if (uniqueId.endsWith(AGENT_EMAIL_HEADSHOT_SUFFIX)) return null;

  return `workspaces/${workspaceId}/agents/${userId}/profile/${uniqueId}${AGENT_EMAIL_HEADSHOT_FILENAME_SUFFIX}`;
}

/**
 * Derive the email-headshot sibling key from a validated managed profile key.
 * Requires workspaceId + userId to match the key segments (authenticated context).
 *
 * Rejects: malformed keys, traversal, foreign workspace/user, branding keys,
 * unsupported layouts, and keys that are already email-headshot objects.
 *
 * Existence: a derived key/URL does not prove the object exists in R2.
 */
export function deriveAgentEmailHeadshotObjectKey(input: {
  profileObjectKey: string;
  workspaceId: string;
  userId: string;
}): string | null {
  const workspaceId = trimSeg(input.workspaceId);
  const userId = trimSeg(input.userId);
  if (!workspaceId || !userId) return null;

  // Never treat an already-derived thumb as a profile original.
  if (isAgentEmailHeadshotObjectKey(input.profileObjectKey)) return null;

  const parsed = parseAgentUserProfileObjectKey(input.profileObjectKey);
  if (!parsed) return null;
  if (parsed.workspaceId !== workspaceId) return null;
  if (parsed.userId !== userId) return null;
  if (parsed.uniqueId.endsWith(AGENT_EMAIL_HEADSHOT_SUFFIX)) return null;

  return buildAgentEmailHeadshotObjectKey({
    workspaceId: parsed.workspaceId,
    userId: parsed.userId,
    uniqueId: parsed.uniqueId,
  });
}

/**
 * Derive from a persisted original profile URL after workspace/user key extraction.
 * Arbitrary client keys are ignored — only extractable managed profile URLs work.
 *
 * Existence: derivation does not prove the thumbnail object exists.
 */
export function deriveAgentEmailHeadshotObjectKeyFromUrl(input: {
  profileUrl: string | null | undefined;
  workspaceId: string;
  userId: string;
}): string | null {
  const workspaceId = trimSeg(input.workspaceId);
  const userId = trimSeg(input.userId);
  if (!workspaceId || !userId) return null;

  const profileKey = extractAgentUserProfileObjectKeyFromUrl(
    input.profileUrl,
    workspaceId,
    userId,
  );
  if (!profileKey) return null;

  return deriveAgentEmailHeadshotObjectKey({
    profileObjectKey: profileKey,
    workspaceId,
    userId,
  });
}

/**
 * Extract an email-headshot object key from a persisted URL when it matches
 * layout and the authoritative workspace + user.
 */
export function extractAgentEmailHeadshotObjectKeyFromUrl(
  url: string | null | undefined,
  workspaceId: string,
  userId: string,
): string | null {
  const ws = trimSeg(workspaceId);
  const user = trimSeg(userId);
  if (!ws || !user || !url?.trim()) return null;

  let path: string | null = null;
  const trimmed = url.trim();
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      path = new URL(trimmed).pathname.replace(/^\/+/, "");
    } else if (trimmed.startsWith("/uploads/branding/")) {
      path = trimmed.slice("/uploads/branding/".length);
    } else if (trimmed.startsWith("/")) {
      path = trimmed.replace(/^\/+/, "");
    } else {
      path = trimmed;
    }
  } catch {
    return null;
  }
  if (!path || hasTraversal(path)) return null;

  const parsed = parseAgentEmailHeadshotObjectKey(path);
  if (!parsed) return null;
  if (parsed.workspaceId !== ws) return null;
  if (parsed.userId !== user) return null;
  return parsed.objectKey;
}

/**
 * Build a public URL for a managed object key using ONLY the configured trusted
 * branding-assets base (BRANDING_ASSETS_PUBLIC_BASE_URL / test override).
 *
 * Callers cannot supply an arbitrary hostname. Production requires HTTPS.
 * Non-production may fall back to `/uploads/branding/{objectKey}` when unset.
 */
export function buildTrustedBrandingAssetPublicUrl(
  objectKey: string,
): string | null {
  const key = objectKey.trim();
  if (!key || hasTraversal(key)) return null;
  if (key.includes("://") || key.includes("?") || key.includes("#")) return null;
  // Object keys must stay under workspaces/… — reject absolute/scheme smuggling.
  if (!key.startsWith("workspaces/")) return null;

  const trusted = resolveTrustedBrandingAssetsPublicBase();
  if (!trusted) return null;

  if (trusted.kind === "local") {
    return `/uploads/branding/${key}`;
  }

  return `${trusted.originBase}/${key}`;
}

/**
 * Public URL for a derived email headshot key under the trusted branding base.
 *
 * Does not prove the object exists. Do not prefer this URL in email signatures
 * until a later phase establishes existence without per-send R2 HEAD.
 */
export function buildAgentEmailHeadshotPublicUrl(input: {
  emailHeadshotObjectKey: string;
  workspaceId: string;
  userId: string;
}): string | null {
  const ws = trimSeg(input.workspaceId);
  const userId = trimSeg(input.userId);
  if (!ws || !userId) return null;

  const parsed = parseAgentEmailHeadshotObjectKey(input.emailHeadshotObjectKey);
  if (!parsed) return null;
  if (parsed.workspaceId !== ws || parsed.userId !== userId) return null;

  return buildTrustedBrandingAssetPublicUrl(parsed.objectKey);
}

/**
 * MAINTENANCE / FUTURE GC ONLY — not for agent photo upload/replace paths.
 *
 * Deletes the derived email-headshot sibling for a managed original profile URL
 * only when that original URL appears unreferenced. Never deletes the original.
 *
 * Limitations (non-atomic):
 * - Uses check-then-delete with a second reference check; a concurrent
 *   re-reference can still race after the final check.
 * - Prefer leaving orphan thumbnails during Phase 3D uploads; schedule GC later.
 */
export async function deleteAgentEmailHeadshotSiblingIfUnreferenced(input: {
  originalUrl: string | null | undefined;
  workspaceId: string;
  userId: string;
  prisma?: PrismaClient;
  excludeUserIds?: string[];
  excludeBrandingWorkspaceIds?: string[];
}): Promise<AgentEmailHeadshotDeleteResult> {
  const workspaceId = trimSeg(input.workspaceId);
  const userId = trimSeg(input.userId);
  const originalUrl = trimSeg(input.originalUrl);
  if (!workspaceId || !userId || !originalUrl) return "skipped";

  const emailKey = deriveAgentEmailHeadshotObjectKeyFromUrl({
    profileUrl: originalUrl,
    workspaceId,
    userId,
  });
  if (!emailKey) return "skipped";

  const refInput = {
    url: originalUrl,
    prisma: input.prisma,
    excludeUserIds: input.excludeUserIds,
    excludeBrandingWorkspaceIds: input.excludeBrandingWorkspaceIds,
  };

  if (await checkReferenced(refInput)) return "retained_referenced";
  if (await checkReferenced(refInput)) return "retained_referenced";

  await deleteObject(emailKey);
  return "deleted";
}
