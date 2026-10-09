/**
 * Server apply helpers for CustomerBrowseState.
 * Ownership is always taken from the authenticated CustomerUser — never body.
 *
 * Concurrency: revision is checked and incremented in the same conditional
 * UPDATE (or unique create) so two writers cannot both commit the same revision.
 */

import type { Prisma } from "@prisma/client";
import type { CustomerUser } from "@/lib/account";
import {
  browseStateEquals,
  canonicalizeBrowseSearchHref,
  computeBrowseStateNext,
  normalizeBrowseRecentList,
  parseStoredRecentJson,
  type BrowseRecentEntry,
  type BrowseStatePayload,
} from "@/lib/listings/browse-state";
import { prisma } from "@/lib/prisma";

export { clampBrowseClientTime, computeBrowseStateNext } from "@/lib/listings/browse-state";

export type BrowseStatePutBody = {
  activeSearchHref?: string | null;
  activeUpdatedAt?: number | null;
  recentSearches?: unknown;
  /** Client revision; when provided and stale, return conflict without write. */
  expectedRevision?: number;
  /** When true, merge incoming recent/active with account (guest → account). */
  merge?: boolean;
};

export function toBrowseStatePayload(row: {
  activeSearchHref: string | null;
  activeUpdatedAt: Date | null;
  recentSearches: unknown;
  revision: number;
}): BrowseStatePayload {
  return {
    activeSearchHref: canonicalizeBrowseSearchHref(row.activeSearchHref),
    activeUpdatedAt: row.activeUpdatedAt
      ? row.activeUpdatedAt.getTime()
      : null,
    recentSearches: parseStoredRecentJson(row.recentSearches),
    revision: row.revision,
  };
}

function isBrowseStateTableMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  if (e.code === "P2021" || e.code === "P2010") return true;
  const msg = typeof e.message === "string" ? e.message : "";
  return /CustomerBrowseState/i.test(msg) && /does not exist|not find|no such table/i.test(msg);
}

const emptyState = (): BrowseStatePayload => ({
  activeSearchHref: null,
  activeUpdatedAt: null,
  recentSearches: [],
  revision: 0,
});

export async function loadBrowseStateForUser(
  user: CustomerUser,
): Promise<BrowseStatePayload | null> {
  if (!user.workspaceId) return null;
  try {
    const row = await prisma.customerBrowseState.findUnique({
      where: { userId: user.id },
    });
    if (!row || row.workspaceId !== user.workspaceId) {
      return emptyState();
    }
    return toBrowseStatePayload(row);
  } catch (error) {
    if (isBrowseStateTableMissing(error)) return emptyState();
    throw error;
  }
}

export type ApplyBrowseStateResult =
  | { ok: true; state: BrowseStatePayload; wrote: boolean }
  | {
      ok: false;
      error: "no_workspace" | "conflict" | "invalid" | "unavailable";
      message: string;
      state?: BrowseStatePayload;
    };

export async function applyBrowseStatePut(
  user: CustomerUser,
  body: BrowseStatePutBody,
): Promise<ApplyBrowseStateResult> {
  if (!user.workspaceId) {
    return {
      ok: false,
      error: "no_workspace",
      message: "Workspace required for browse sync.",
    };
  }

  const workspaceId = user.workspaceId;
  const merge = body.merge === true;
  const serverNow = Date.now();

  const incomingActiveHref =
    body.activeSearchHref === undefined
      ? undefined
      : canonicalizeBrowseSearchHref(body.activeSearchHref);
  if (
    body.activeSearchHref !== undefined &&
    body.activeSearchHref != null &&
    String(body.activeSearchHref).trim() !== "" &&
    incomingActiveHref == null
  ) {
    return {
      ok: false,
      error: "invalid",
      message: "Invalid active search URL.",
    };
  }

  const incomingActiveAt =
    body.activeUpdatedAt === undefined || body.activeUpdatedAt == null
      ? null
      : Number.isFinite(body.activeUpdatedAt)
        ? Math.trunc(body.activeUpdatedAt)
        : null;

  let incomingRecent: BrowseRecentEntry[] | undefined;
  if (body.recentSearches !== undefined) {
    if (!Array.isArray(body.recentSearches)) {
      return {
        ok: false,
        error: "invalid",
        message: "Invalid recent searches payload.",
      };
    }
    if (body.recentSearches.length > 40) {
      return {
        ok: false,
        error: "invalid",
        message: "Recent searches payload too large.",
      };
    }
    incomingRecent = normalizeBrowseRecentList(body.recentSearches);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.customerBrowseState.findUnique({
        where: { userId: user.id },
      });

      if (existing && existing.workspaceId !== workspaceId) {
        return {
          ok: false as const,
          error: "invalid" as const,
          message: "Browse state workspace mismatch.",
        };
      }

      const expectedRevision =
        body.expectedRevision != null && Number.isFinite(body.expectedRevision)
          ? Math.trunc(body.expectedRevision)
          : null;

      if (
        expectedRevision != null &&
        existing &&
        existing.revision !== expectedRevision
      ) {
        return {
          ok: false as const,
          error: "conflict" as const,
          message: "Stale browse-state revision.",
          state: toBrowseStatePayload(existing),
        };
      }

      // Bootstrap/merge without expectedRevision still races via conditional UPDATE.
      const raceRevision = existing?.revision ?? null;

      const accountPayload = existing
        ? toBrowseStatePayload(existing)
        : emptyState();

      const { nextActiveHref, nextActiveAt, nextRecent } = computeBrowseStateNext({
        account: accountPayload,
        incomingActiveHref,
        incomingActiveAt,
        incomingRecent,
        merge,
        serverNow,
      });

      const nextPayload: BrowseStatePayload = {
        activeSearchHref: nextActiveHref,
        activeUpdatedAt: nextActiveAt,
        recentSearches: nextRecent,
        revision: accountPayload.revision,
      };

      if (
        existing &&
        browseStateEquals(accountPayload, nextPayload) &&
        accountPayload.activeSearchHref === nextActiveHref &&
        accountPayload.activeUpdatedAt === nextActiveAt
      ) {
        return {
          ok: true as const,
          state: accountPayload,
          wrote: false,
        };
      }

      const nextRevision = (existing?.revision ?? 0) + 1;
      const data = {
        workspaceId,
        activeSearchHref: nextActiveHref,
        activeUpdatedAt: nextActiveAt ? new Date(nextActiveAt) : null,
        recentSearches: nextRecent as unknown as Prisma.InputJsonValue,
        revision: nextRevision,
      };

      if (!existing) {
        try {
          const row = await tx.customerBrowseState.create({
            data: {
              userId: user.id,
              ...data,
            },
          });
          return {
            ok: true as const,
            state: toBrowseStatePayload(row),
            wrote: true,
          };
        } catch (error) {
          // Concurrent first create — unique(userId) lost the race.
          const code =
            error && typeof error === "object"
              ? (error as { code?: string }).code
              : undefined;
          if (code === "P2002") {
            const again = await tx.customerBrowseState.findUnique({
              where: { userId: user.id },
            });
            return {
              ok: false as const,
              error: "conflict" as const,
              message: "Stale browse-state revision.",
              state: again ? toBrowseStatePayload(again) : emptyState(),
            };
          }
          throw error;
        }
      }

      const where =
        expectedRevision != null
          ? { userId: user.id, workspaceId, revision: expectedRevision }
          : raceRevision != null
            ? { userId: user.id, workspaceId, revision: raceRevision }
            : { userId: user.id, workspaceId };

      const updated = await tx.customerBrowseState.updateMany({
        where,
        data,
      });

      if (updated.count === 0) {
        const again = await tx.customerBrowseState.findUnique({
          where: { userId: user.id },
        });
        return {
          ok: false as const,
          error: "conflict" as const,
          message: "Stale browse-state revision.",
          state: again ? toBrowseStatePayload(again) : emptyState(),
        };
      }

      const row = await tx.customerBrowseState.findUnique({
        where: { userId: user.id },
      });
      if (!row || row.workspaceId !== workspaceId) {
        return {
          ok: false as const,
          error: "invalid" as const,
          message: "Browse state workspace mismatch.",
        };
      }
      return {
        ok: true as const,
        state: toBrowseStatePayload(row),
        wrote: true,
      };
    });
  } catch (error) {
    if (isBrowseStateTableMissing(error)) {
      return {
        ok: false,
        error: "unavailable",
        message: "Browse sync unavailable.",
        state: emptyState(),
      };
    }
    throw error;
  }
}
