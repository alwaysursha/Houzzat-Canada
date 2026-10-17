/**
 * Stage 6.11C.1 — tenant-isolated branding object keys.
 * Phase 1 — per-agent User.image keys under workspaces/{ws}/agents/{userId}/profile/.
 */

import {
  brandingAssetFolder,
  type BrandingAssetKind,
} from "@/lib/tenancy/branding-assets/kinds";

const KEY_RE =
  /^workspaces\/([a-zA-Z0-9_-]+)\/branding\/(agent-profile|logo|brokerage-logo|favicon)\/([a-zA-Z0-9_-]+)\.(jpg|png|webp)$/;

const AGENT_USER_KEY_RE =
  /^workspaces\/([a-zA-Z0-9_-]+)\/agents\/([a-zA-Z0-9_-]+)\/profile\/([a-zA-Z0-9_-]+)\.(jpg|png|webp)$/;

export type AgentUserProfileObjectKeyExt = "jpg" | "png" | "webp";

export type ParsedAgentUserProfileObjectKey = {
  workspaceId: string;
  userId: string;
  uniqueId: string;
  ext: AgentUserProfileObjectKeyExt;
  objectKey: string;
};

/**
 * Parse a full agent profile object key (exact match). Rejects traversal,
 * partial paths, and non-profile layouts.
 */
export function parseAgentUserProfileObjectKey(
  objectKey: string | null | undefined,
): ParsedAgentUserProfileObjectKey | null {
  if (typeof objectKey !== "string") return null;
  const trimmed = objectKey.trim();
  if (!trimmed) return null;
  if (trimmed.includes("..") || trimmed.includes("//") || trimmed.startsWith("/")) {
    return null;
  }

  const match = AGENT_USER_KEY_RE.exec(trimmed);
  if (!match || match[0] !== trimmed) return null;

  const ext = match[4];
  if (ext !== "jpg" && ext !== "png" && ext !== "webp") return null;

  return {
    workspaceId: match[1]!,
    userId: match[2]!,
    uniqueId: match[3]!,
    ext,
    objectKey: match[0],
  };
}

function pathFromPersistedUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return new URL(trimmed).pathname.replace(/^\/+/, "");
    }
    if (trimmed.startsWith("/uploads/branding/")) {
      return trimmed.slice("/uploads/branding/".length);
    }
    if (trimmed.startsWith("/")) {
      return trimmed.replace(/^\/+/, "");
    }
    return trimmed;
  } catch {
    return null;
  }
}

export function buildBrandingObjectKey(input: {
  workspaceId: string;
  kind: BrandingAssetKind;
  uniqueId: string;
  ext: string;
}): string {
  const folder = brandingAssetFolder(input.kind);
  return `workspaces/${input.workspaceId}/branding/${folder}/${input.uniqueId}.${input.ext}`;
}

/**
 * Extract object key from a persisted URL when it matches our key layout
 * AND belongs to the authoritative workspaceId.
 */
export function extractBrandingObjectKeyFromUrl(
  url: string | null | undefined,
  workspaceId: string,
): string | null {
  if (!url?.trim()) return null;
  const path = pathFromPersistedUrl(url);
  if (!path) return null;

  const match = KEY_RE.exec(path);
  if (!match) return null;
  if (match[1] !== workspaceId) return null;
  return match[0];
}

/** Per-agent profile photo object key (User.image). */
export function buildAgentUserProfileObjectKey(input: {
  workspaceId: string;
  userId: string;
  uniqueId: string;
  ext: string;
}): string {
  return `workspaces/${input.workspaceId}/agents/${input.userId}/profile/${input.uniqueId}.${input.ext}`;
}

/**
 * Extract per-agent profile object key when URL matches layout and workspace.
 * Optionally require the path userId segment to match.
 */
export function extractAgentUserProfileObjectKeyFromUrl(
  url: string | null | undefined,
  workspaceId: string,
  userId?: string | null,
): string | null {
  if (!url?.trim()) return null;
  const path = pathFromPersistedUrl(url);
  if (!path) return null;

  const match = AGENT_USER_KEY_RE.exec(path);
  if (!match) return null;
  if (match[1] !== workspaceId) return null;
  if (userId?.trim() && match[2] !== userId.trim()) return null;
  return match[0];
}

/**
 * Resolve a deletable object key for a persisted profile/branding URL in this workspace.
 */
export function extractManagedProfileObjectKeyFromUrl(
  url: string | null | undefined,
  workspaceId: string,
): string | null {
  return (
    extractBrandingObjectKeyFromUrl(url, workspaceId) ??
    extractAgentUserProfileObjectKeyFromUrl(url, workspaceId)
  );
}
