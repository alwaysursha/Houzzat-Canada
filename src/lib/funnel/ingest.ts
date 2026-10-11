import type { FunnelEventName as PrismaFunnelEventName, Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  isFunnelEventsEnabled,
  type FunnelEventName,
} from "@/lib/funnel/constants";
import { buildRegistrationCompletedDedupeKey } from "@/lib/funnel/dedupe";
import {
  cleanMlsNumber,
  cleanOpaqueKey,
  FunnelSanitizeError,
  parseClientFunnelPayload,
  sanitizeFunnelMeta,
} from "@/lib/funnel/sanitize";

export type FunnelIngestResult =
  | { ok: true; status: "written" | "duplicate" | "disabled"; id: string | null }
  | { ok: false; code: string; message: string; httpStatus: number };

export type FunnelWriteInput = {
  workspaceId: string;
  eventName: FunnelEventName;
  occurredAt: Date;
  visitorKey?: string | null;
  sessionKey?: string | null;
  userId?: string | null;
  mlsNumber?: string | null;
  dedupeKey: string;
  meta?: Record<string, string> | null;
};

type Db = {
  funnelEvent: {
    create: (args: {
      data: {
        workspaceId: string;
        eventName: PrismaFunnelEventName;
        occurredAt: Date;
        visitorKey?: string | null;
        sessionKey?: string | null;
        userId?: string | null;
        mlsNumber?: string | null;
        dedupeKey: string;
        meta?: Prisma.InputJsonValue;
      };
      select: { id: true };
    }) => Promise<{ id: string }>;
  };
};

/**
 * Low-level idempotent write. No-ops when feature flag disabled.
 * Duplicate unique violations return status=duplicate.
 */
export async function writeFunnelEvent(
  input: FunnelWriteInput,
  db: Db = defaultPrisma,
  env: NodeJS.ProcessEnv = process.env,
): Promise<FunnelIngestResult> {
  if (!isFunnelEventsEnabled(env)) {
    return { ok: true, status: "disabled", id: null };
  }

  const workspaceId = input.workspaceId?.trim();
  if (!workspaceId) {
    return {
      ok: false,
      code: "WORKSPACE_REQUIRED",
      message: "workspaceId is required",
      httpStatus: 400,
    };
  }

  try {
    const row = await db.funnelEvent.create({
      data: {
        workspaceId,
        eventName: input.eventName as PrismaFunnelEventName,
        occurredAt: input.occurredAt,
        visitorKey: input.visitorKey ?? null,
        sessionKey: input.sessionKey ?? null,
        userId: input.userId ?? null,
        mlsNumber: input.mlsNumber ?? null,
        dedupeKey: input.dedupeKey,
        meta: (input.meta ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      select: { id: true },
    });
    return { ok: true, status: "written", id: row.id };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return { ok: true, status: "duplicate", id: null };
    }
    console.error("[funnel] write failed", error);
    return {
      ok: false,
      code: "WRITE_FAILED",
      message: "Funnel event write failed",
      httpStatus: 500,
    };
  }
}

/**
 * Public client ingest after tenancy is resolved server-side.
 * Never trusts body.workspaceId / body.userId.
 */
export async function ingestClientFunnelEvent(input: {
  workspaceId: string;
  body: unknown;
  now?: Date;
  env?: NodeJS.ProcessEnv;
  db?: Db;
}): Promise<FunnelIngestResult> {
  try {
    const parsed = parseClientFunnelPayload(input.body, input.now ?? new Date());
    return writeFunnelEvent(
      {
        workspaceId: input.workspaceId,
        eventName: parsed.eventName,
        occurredAt: parsed.occurredAt,
        visitorKey: parsed.visitorKey,
        sessionKey: parsed.sessionKey,
        userId: null,
        mlsNumber: parsed.mlsNumber,
        dedupeKey: parsed.dedupeKey,
        meta: parsed.meta,
      },
      input.db ?? defaultPrisma,
      input.env ?? process.env,
    );
  } catch (error) {
    if (error instanceof FunnelSanitizeError) {
      const httpStatus =
        error.code === "SERVER_ONLY_EVENT" ||
        error.code === "CLIENT_USER_ID_FORBIDDEN" ||
        error.code === "CLIENT_WORKSPACE_ID_FORBIDDEN"
          ? 403
          : 400;
      return {
        ok: false,
        code: error.code,
        message: error.message,
        httpStatus,
      };
    }
    throw error;
  }
}

/**
 * Server-authoritative registration_completed. Fail-soft for callers.
 * visitorKey/sessionKey optional. Once per workspace+user via dedupeKey.
 */
export async function recordRegistrationCompletedEvent(input: {
  workspaceId: string;
  userId: string;
  visitorKey?: string | null;
  sessionKey?: string | null;
  mlsNumber?: string | null;
  intentType?: string | null;
  occurredAt?: Date;
  env?: NodeJS.ProcessEnv;
  db?: Db;
}): Promise<FunnelIngestResult> {
  const workspaceId = input.workspaceId?.trim();
  const userId = input.userId?.trim();
  if (!workspaceId || !userId) {
    return {
      ok: false,
      code: "WORKSPACE_USER_REQUIRED",
      message: "workspaceId and userId are required",
      httpStatus: 400,
    };
  }

  let meta: Record<string, string> | null = null;
  try {
    meta = sanitizeFunnelMeta(
      input.intentType ? { intentType: String(input.intentType), source: "sign_up" } : { source: "sign_up" },
    );
  } catch {
    meta = { source: "sign_up" };
  }

  return writeFunnelEvent(
    {
      workspaceId,
      eventName: "registration_completed",
      occurredAt: input.occurredAt ?? new Date(),
      visitorKey: cleanOpaqueKey(input.visitorKey),
      sessionKey: cleanOpaqueKey(input.sessionKey),
      userId,
      mlsNumber: cleanMlsNumber(input.mlsNumber),
      dedupeKey: buildRegistrationCompletedDedupeKey(userId),
      meta,
    },
    input.db ?? defaultPrisma,
    input.env ?? process.env,
  );
}

/** Never throw from signup — swallow write failures. */
export async function recordRegistrationCompletedEventSafe(
  input: Parameters<typeof recordRegistrationCompletedEvent>[0],
): Promise<void> {
  try {
    await recordRegistrationCompletedEvent(input);
  } catch (error) {
    console.error("[funnel] registration_completed failed softly", error);
  }
}
