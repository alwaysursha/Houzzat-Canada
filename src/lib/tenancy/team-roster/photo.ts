/**
 * Stage 6.11E.4 / E.5-ready — Team member photo URL acceptance.
 * Arbitrary public URLs are never authoritative. E.5 owns R2 upload.
 *
 * Canonical object key:
 * workspaces/{workspaceId}/team-members/{memberId}/{uniqueId}.{jpg|png|webp}
 */

const TEAM_MEMBER_PHOTO_KEY_RE =
  /^workspaces\/([a-zA-Z0-9_-]+)\/team-members\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\.(jpg|png|webp)$/;

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
