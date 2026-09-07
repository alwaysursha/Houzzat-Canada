/**
 * Stage 6.11E.5 — Team member photo keys, acceptance, upload helpers.
 *
 * Canonical object key:
 * workspaces/{workspaceId}/team-members/{memberId}/{uniqueId}.{jpg|png|webp}
 *
 * Storage reuses branding R2 / local filesystem (putBrandingAssetObject).
 * Arbitrary public URLs are never authoritative.
 */

import { randomBytes } from "node:crypto";
import {
  BrandingStorageNotConfiguredError,
  deleteBrandingAssetObject,
  putBrandingAssetObject,
} from "@/lib/tenancy/branding-assets/storage";
import {
  BRANDING_ASSET_MAX_BYTES,
  validateBrandingImageBytes,
  type BrandingImageValidationError,
  type ValidatedBrandingImage,
} from "@/lib/tenancy/branding-assets/validate";

const TEAM_MEMBER_PHOTO_KEY_RE =
  /^workspaces\/([a-zA-Z0-9_-]+)\/team-members\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\.(jpg|png|webp)$/;

/** Same 5MB cap as branding assets. */
export const TEAM_MEMBER_PHOTO_MAX_BYTES = BRANDING_ASSET_MAX_BYTES;

export type TeamMemberPhotoExt = "jpg" | "png" | "webp";

function pathFromUrl(url: string): string | null {
  const trimmed = url.trim();
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

/**
 * Build workspace + member scoped object key.
 * uniqueId must be caller-generated (unpredictable); ext from magic-byte validation.
 */
export function buildTeamMemberPhotoObjectKey(input: {
  workspaceId: string;
  memberId: string;
  uniqueId: string;
  ext: TeamMemberPhotoExt;
}): string {
  const workspaceId = input.workspaceId.trim();
  const memberId = input.memberId.trim();
  const uniqueId = input.uniqueId.trim();
  if (!workspaceId || !memberId || !uniqueId) {
    throw new Error("workspaceId, memberId, and uniqueId are required");
  }
  if (
    workspaceId.includes("..") ||
    memberId.includes("..") ||
    uniqueId.includes("..") ||
    workspaceId.includes("/") ||
    memberId.includes("/") ||
    uniqueId.includes("/")
  ) {
    throw new Error("Invalid path segment for Team member photo key");
  }
  return `workspaces/${workspaceId}/team-members/${memberId}/${uniqueId}.${input.ext}`;
}

export function newTeamMemberPhotoAssetId(): string {
  return randomBytes(12).toString("hex");
}

/**
 * True when URL maps to a workspace-bound Team member photo object key.
 * Optional memberId must match the key segment when provided.
 */
export function isAcceptedTeamMemberPhotoUrl(
  url: string | null | undefined,
  workspaceId: string,
  memberId?: string,
): boolean {
  if (!url?.trim() || !workspaceId.trim()) return false;
  const path = pathFromUrl(url);
  if (!path) return false;
  const match = TEAM_MEMBER_PHOTO_KEY_RE.exec(path);
  if (!match) return false;
  if (match[1] !== workspaceId) return false;
  if (memberId && match[2] !== memberId) return false;
  return true;
}

export function extractTeamMemberPhotoObjectKeyFromUrl(
  url: string | null | undefined,
  workspaceId: string,
): string | null {
  if (!isAcceptedTeamMemberPhotoUrl(url, workspaceId)) return null;
  const path = pathFromUrl(url!);
  if (!path) return null;
  const match = TEAM_MEMBER_PHOTO_KEY_RE.exec(path);
  return match ? match[0] : null;
}

/**
 * Extract object key only when URL is a managed photo for this workspace AND member.
 * Used for safe replace/delete — never deletes branding or cross-member assets.
 */
export function extractManagedTeamMemberPhotoObjectKey(input: {
  url: string | null | undefined;
  workspaceId: string;
  memberId: string;
}): string | null {
  if (
    !isAcceptedTeamMemberPhotoUrl(
      input.url,
      input.workspaceId,
      input.memberId,
    )
  ) {
    return null;
  }
  const path = pathFromUrl(input.url!);
  if (!path) return null;
  const match = TEAM_MEMBER_PHOTO_KEY_RE.exec(path);
  return match ? match[0] : null;
}

/**
 * Validate Team member portrait bytes (JPEG/PNG/WebP).
 * Reuses branding magic-byte validation with agent-profile dimension floor (400×500).
 */
export function validateTeamMemberPhotoBytes(
  raw: ArrayBuffer | Uint8Array,
): ValidatedBrandingImage | BrandingImageValidationError {
  return validateBrandingImageBytes(raw, "agent-profile");
}

export async function putTeamMemberPhotoObject(input: {
  objectKey: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<{ objectKey: string; publicUrl: string }> {
  return putBrandingAssetObject(input);
}

/** Best-effort delete of a managed Team member photo object. */
export async function deleteManagedTeamMemberPhotoObject(
  objectKey: string,
): Promise<void> {
  await deleteBrandingAssetObject(objectKey);
}

/**
 * Best-effort delete previous managed photo for the same workspace+member.
 * External / unrecognized / cross-member URLs are never deleted.
 */
export async function deletePreviousManagedTeamMemberPhoto(input: {
  url: string | null | undefined;
  workspaceId: string;
  memberId: string;
}): Promise<void> {
  const key = extractManagedTeamMemberPhotoObjectKey(input);
  if (!key) return;
  await deleteManagedTeamMemberPhotoObject(key);
}

export { BrandingStorageNotConfiguredError };
