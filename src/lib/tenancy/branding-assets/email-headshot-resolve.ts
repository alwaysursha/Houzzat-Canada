/**
 * Phase 3D.4.2 — verified agent email headshot selection for signatures.
 *
 * Prefer the persisted AgentEmailHeadshot thumbnail only when association,
 * membership, key ownership, and sourceUniqueId all match the current
 * User.image. Never derive a thumb URL and assume it exists without a row.
 *
 * Read-path only. No R2 HEAD/GET. No DB writes.
 */

import {
  isVerifiedActiveMembershipFor,
  resolvePersonalAgentPhoto,
  sanitizePublicHttpsImageUrl,
  type VerifiedActiveMembership,
} from "@/lib/tenancy/agent-photo";
import {
  buildAgentEmailHeadshotPublicUrl,
  parseAgentEmailHeadshotObjectKey,
} from "@/lib/tenancy/branding-assets/email-headshot-storage";
import {
  extractAgentUserProfileObjectKeyFromUrl,
  parseAgentUserProfileObjectKey,
} from "@/lib/tenancy/branding-assets/keys";

export type AgentEmailHeadshotAssociationView = {
  workspaceId: string;
  userId: string;
  sourceUniqueId: string;
  emailHeadshotObjectKey: string;
};

export type ResolvedAgentEmailSignaturePhoto = {
  url: string;
  /**
   * `email-headshot` — verified association thumbnail (pre-cropped circular PNG).
   * `canonical` — sanitized User.image with CSS circular fallback.
   */
  kind: "email-headshot" | "canonical";
};

function trim(value: string | null | undefined): string | null {
  const next = value?.trim() || null;
  return next || null;
}

/**
 * Try to prefer a verified email-headshot URL for this workspace agent.
 * Returns null when the association is absent or cannot be trusted.
 */
export function tryResolveVerifiedEmailHeadshotUrl(input: {
  workspaceId: string;
  userId: string;
  membership: VerifiedActiveMembership | null;
  userImage: string | null | undefined;
  association: AgentEmailHeadshotAssociationView | null | undefined;
}): string | null {
  const workspaceId = trim(input.workspaceId);
  const userId = trim(input.userId);
  if (!workspaceId || !userId) return null;

  if (
    !isVerifiedActiveMembershipFor(input.membership, { workspaceId, userId })
  ) {
    return null;
  }

  const association = input.association;
  if (!association) return null;

  const assocWs = trim(association.workspaceId);
  const assocUser = trim(association.userId);
  const sourceUniqueId = trim(association.sourceUniqueId);
  const objectKey = trim(association.emailHeadshotObjectKey);
  if (!assocWs || !assocUser || !sourceUniqueId || !objectKey) return null;

  // Never resolve by userId alone — association must match request scope.
  if (assocWs !== workspaceId || assocUser !== userId) return null;

  const parsedKey = parseAgentEmailHeadshotObjectKey(objectKey);
  if (!parsedKey) return null;
  if (parsedKey.workspaceId !== workspaceId || parsedKey.userId !== userId) {
    return null;
  }
  if (parsedKey.uniqueId !== sourceUniqueId) return null;

  // Association must correspond to the current canonical User.image uniqueId.
  const profileKey = extractAgentUserProfileObjectKeyFromUrl(
    input.userImage,
    workspaceId,
    userId,
  );
  if (!profileKey) return null;
  const profileParsed = parseAgentUserProfileObjectKey(profileKey);
  if (!profileParsed || profileParsed.uniqueId !== sourceUniqueId) {
    return null;
  }

  const built = buildAgentEmailHeadshotPublicUrl({
    emailHeadshotObjectKey: parsedKey.objectKey,
    workspaceId,
    userId,
  });
  if (!built) return null;

  // Emails require absolute public HTTPS (reject local /uploads fallback).
  return sanitizePublicHttpsImageUrl(built);
}

/**
 * Signature photo selection: verified thumb when association proves existence
 * and matches current User.image; otherwise sanitized canonical User.image;
 * otherwise no photo.
 */
export function resolveVerifiedAgentEmailSignaturePhoto(input: {
  workspaceId: string;
  userId: string;
  membership: VerifiedActiveMembership | null;
  userImage: string | null | undefined;
  association: AgentEmailHeadshotAssociationView | null | undefined;
}): ResolvedAgentEmailSignaturePhoto | null {
  const thumb = tryResolveVerifiedEmailHeadshotUrl(input);
  if (thumb) {
    return { url: thumb, kind: "email-headshot" };
  }

  const canonical = resolvePersonalAgentPhoto({
    workspaceId: input.workspaceId,
    userId: input.userId,
    userImage: input.userImage,
    membership: input.membership,
  });
  if (!canonical) return null;
  return { url: canonical, kind: "canonical" };
}
