import { z } from "zod";
import { requireAgentContextFromRequest } from "@/lib/agent";
import { isDatabaseUnavailableError } from "@/lib/errors";
import {
  createRequestId,
  exceptionLogFields,
  jsonApiResponse,
  logJsonApi,
} from "@/lib/http/json-api-response";
import { jsonByteLength, parseJsonText } from "@/lib/http/json-body";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import {
  confirmMassSms,
  drainSmsMassBatch,
  prismaMassSmsDb,
  SMS_MASS_V1_MAX_RECIPIENTS,
} from "@/lib/sms/mass";

const ROUTE = "/api/agent/leads/sms-mass";

const schema = z
  .object({
    clientKey: z.string().min(8).max(80),
    leadIds: z.array(z.string().min(1)).max(SMS_MASS_V1_MAX_RECIPIENTS),
    body: z.string(),
    confirm: z.literal(true),
  })
  .strict();

export async function POST(request: Request) {
  const requestId = createRequestId();
  const startedAt = Date.now();

  const reply = (status: number, body: unknown, error?: unknown) => {
    let jsonBytes: number | undefined;
    if (status !== 200) {
      try {
        jsonBytes = jsonByteLength(body);
      } catch {
        jsonBytes = undefined;
      }
    }
    try {
      logJsonApi({
        requestId,
        route: ROUTE,
        method: "POST",
        status,
        durationMs: Date.now() - startedAt,
        jsonBytes,
        ...exceptionLogFields(error),
      });
    } catch {
      // Logging must never replace a JSON response.
    }
    return jsonApiResponse(body, { status, requestId });
  };

  try {
    const ctx = await requireAgentContextFromRequest(request);
    if (!ctx) return reply(401, { error: "Unauthorized" });

    const parsedJson = parseJsonText(await request.text());
    if (parsedJson.parse !== "ok") {
      return reply(400, { error: "Invalid payload" });
    }
    const parsed = schema.safeParse(parsedJson.data);
    if (!parsed.success) {
      return reply(400, { error: "Invalid payload" });
    }

    const db = prismaMassSmsDb(prisma);
    const result = await confirmMassSms(db, ctx, {
      clientKey: parsed.data.clientKey,
      leadIds: parsed.data.leadIds,
      body: parsed.data.body,
    });
    if (!result.ok) {
      const status =
        result.error === "BATCH_LIMIT" ||
        result.error === "INVALID_BODY" ||
        result.error === "INVALID_CLIENT_KEY" ||
        result.error === "NO_RECIPIENTS"
          ? 400
          : 403;
      return reply(status, {
        error: result.error,
        preview: result.preview ?? null,
      });
    }

    if (result.continue) {
      scheduleWorkerSideEffect(
        drainSmsMassBatch(db, ctx, result.summary.id).catch(() => null),
      );
    }

    return reply(200, { ok: true, batch: result.summary });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return reply(503, { error: "Service unavailable" }, error);
    }
    return reply(500, { error: "Internal error" }, error);
  }
}
