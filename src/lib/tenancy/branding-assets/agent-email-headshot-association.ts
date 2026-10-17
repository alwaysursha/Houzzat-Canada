/**
 * Phase 3D.4.1 — durable workspace-scoped email-headshot associations.
 *
 * Write path only for now (resolver/signature wiring is a later phase).
 * Object keys are always server-derived; never trust client URLs/keys.
 *
 * Concurrency: persist runs in a short DB transaction that locks the User row
 * (SELECT … FOR UPDATE), re-checks User.image, then upserts the association
 * while that lock is held. Canonical upload/remove also update the same User
 * row, so PostgreSQL serializes conflicting writers and a stale INSERT cannot
 * land after a newer photo commit.
 *
 * Deployment: apply migration
 * `20261017170000_agent_email_headshot_association` before deploying code that
 * calls `clearAgentEmailHeadshotAssociation` inside the canonical photo TX.
 * Do not hide missing-table errors on that clear path.
 */

import {
  buildAgentEmailHeadshotObjectKey,
  parseAgentEmailHeadshotObjectKey,
} from "@/lib/tenancy/branding-assets/email-headshot-storage";
import {
  extractAgentUserProfileObjectKeyFromUrl,
  parseAgentUserProfileObjectKey,
} from "@/lib/tenancy/branding-assets/keys";
import type { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

type AssociationTx = {
  $queryRaw: PrismaClient["$queryRaw"];
  agentEmailHeadshot: {
    upsert: PrismaClient["agentEmailHeadshot"]["upsert"];
  };
};

type AssociationDb = {
  $transaction: <T>(
    fn: (tx: AssociationTx) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ) => Promise<T>;
};

function trim(value: string | null | undefined): string | null {
  const next = value?.trim() || null;
  return next || null;
}

/** Invalidate any association for this workspace agent (replace/remove). */
export async function clearAgentEmailHeadshotAssociation(
  db: {
    agentEmailHeadshot: {
      deleteMany: PrismaClient["agentEmailHeadshot"]["deleteMany"];
    };
  },
  input: { workspaceId: string; userId: string },
): Promise<void> {
  const workspaceId = trim(input.workspaceId);
  const userId = trim(input.userId);
  if (!workspaceId || !userId) return;

  await db.agentEmailHeadshot.deleteMany({
    where: { workspaceId, userId },
  });
}

type LockedUserRow = {
  id: string;
  image: string | null;
};

/**
 * Persist association only when:
 * - object key is the derived sibling for this workspace/user/uniqueId
 * - User.image still equals the expected canonical URL for this upload
 *
 * Algorithm (short TX, no R2 / validation inside):
 * 1. SELECT User … FOR UPDATE
 * 2. If missing or image ≠ expected → return false (no write)
 * 3. Upsert AgentEmailHeadshot while the User row lock is held
 *
 * Returns true only when a row was inserted or updated.
 */
export async function persistAgentEmailHeadshotAssociationIfCurrent(input: {
  workspaceId: string;
  userId: string;
  sourceUniqueId: string;
  emailHeadshotObjectKey: string;
  /** Canonical User.image public URL written for this upload. */
  expectedCanonicalImageUrl: string;
  prisma: AssociationDb;
}): Promise<boolean> {
  const workspaceId = trim(input.workspaceId);
  const userId = trim(input.userId);
  const sourceUniqueId = trim(input.sourceUniqueId);
  const emailHeadshotObjectKey = trim(input.emailHeadshotObjectKey);
  const expectedUrl = trim(input.expectedCanonicalImageUrl);
  if (
    !workspaceId ||
    !userId ||
    !sourceUniqueId ||
    !emailHeadshotObjectKey ||
    !expectedUrl
  ) {
    return false;
  }

  // Reject key that does not belong to this authenticated context / uniqueId.
  const expectedKey = buildAgentEmailHeadshotObjectKey({
    workspaceId,
    userId,
    uniqueId: sourceUniqueId,
  });
  if (!expectedKey || expectedKey !== emailHeadshotObjectKey) {
    return false;
  }
  const parsed = parseAgentEmailHeadshotObjectKey(emailHeadshotObjectKey);
  if (
    !parsed ||
    parsed.workspaceId !== workspaceId ||
    parsed.userId !== userId ||
    parsed.uniqueId !== sourceUniqueId
  ) {
    return false;
  }

  // Cross-check expected URL still describes this workspace/user/uniqueId.
  const profileKey = extractAgentUserProfileObjectKeyFromUrl(
    expectedUrl,
    workspaceId,
    userId,
  );
  if (!profileKey) return false;
  const profileParsed = parseAgentUserProfileObjectKey(profileKey);
  if (!profileParsed || profileParsed.uniqueId !== sourceUniqueId) {
    return false;
  }

  const id = `aeh_${randomBytes(12).toString("hex")}`;

  try {
    return await input.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<LockedUserRow[]>`
        SELECT u.id, u.image
        FROM "User" AS u
        WHERE u.id = ${userId}
        FOR UPDATE
      `;
      const row = locked[0];
      if (!row || row.image !== expectedUrl) {
        return false;
      }

      await tx.agentEmailHeadshot.upsert({
        where: {
          workspaceId_userId: { workspaceId, userId },
        },
        create: {
          id,
          workspaceId,
          userId,
          sourceUniqueId,
          emailHeadshotObjectKey,
        },
        update: {
          sourceUniqueId,
          emailHeadshotObjectKey,
        },
      });
      return true;
    });
  } catch (error) {
    console.error("[agent-email-headshot] association persist failed", {
      workspaceId,
      userId,
      sourceUniqueId,
      error,
    });
    return false;
  }
}
