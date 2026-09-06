/**
 * Stage 6.11C.1 — tenant-isolated branding object keys.
 */

import {
  brandingAssetFolder,
  type BrandingAssetKind,
} from "@/lib/tenancy/branding-assets/kinds";

const KEY_RE =
  /^workspaces\/([a-zA-Z0-9_-]+)\/branding\/(agent-profile|logo|brokerage-logo|favicon)\/([a-zA-Z0-9_-]+)\.(jpg|png|webp)$/;

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
  const trimmed = url.trim();
  let path: string;
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

  const match = KEY_RE.exec(path);
  if (!match) return null;
  if (match[1] !== workspaceId) return null;
  return match[0];
}
