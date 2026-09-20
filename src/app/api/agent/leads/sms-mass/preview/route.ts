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
import { prisma } from "@/lib/prisma";
import { previewMassSms, prismaMassSmsDb } from "@/lib/sms/mass";

const ROUTE = "/api/agent/leads/sms-mass/preview";

const schema = z
  .object({
    leadIds: z.array(z.string().min(1)).max(200),
    body: z.string(),
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

    const preview = await previewMassSms(prismaMassSmsDb(prisma), ctx, parsed.data);
    return reply(200, { ok: true, preview });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return reply(503, { error: "Service unavailable" }, error);
    }
    return reply(500, { error: "Internal error" }, error);
  }
}
